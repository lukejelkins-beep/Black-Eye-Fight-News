import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FEATURES, GROUPS, vectorize, bashoPredictions, expectedWins, nextMorning, pickWith, power, boutsOf } from '../assets/sumo-predict.mjs';
import { SumoReplay, foreignBorn } from '../assets/sumo-model-features.mjs';
import { isMakuuchi } from '../assets/sumo-home-data.mjs';

const DIR = new URL('../data/sumo/basho-archive/', import.meta.url);
const ids = readdirSync(DIR).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
const read = id => JSON.parse(readFileSync(new URL(id + '.json', DIR), 'utf8'));
const MODEL = new URL('../data/sumo/predictor.json', import.meta.url), STATE = new URL('../data/sumo/predictor-state.json', import.meta.url);
const model = JSON.parse(readFileSync(MODEL, 'utf8'));
const roster = JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json', import.meta.url), 'utf8'));
/* A pretend next basho: the latest saved basho's banzuke and bouts under the next basho's id, so the
   live path (replay from the saved state) runs on real bouts. */
const nextOf = f => { let y = +f.bashoId.slice(0, 4), m = +f.bashoId.slice(4) + 2; if (m > 11) { m = 1; y++; } return { ...JSON.parse(JSON.stringify(f)), bashoId: String(y) + String(m).padStart(2, '0') }; };

test('the saved model: v2 schema, one weight per input, chances for every saved basho, state after the latest', () => {
  assert.equal(model.schemaVersion, 2);
  assert.equal(model.weights.length, FEATURES.length);
  assert.deepEqual(Object.keys(GROUPS).flatMap(g => GROUPS[g]).sort(), FEATURES.slice().sort(), 'every input is in exactly one explanation group');
  for (const id of ids) assert.ok(Object.keys(model.archive[id] || {}).length > 250, id);
  assert.equal(model.state.lastBasho, ids[ids.length - 1]);
  assert.ok(model.temperature > 0 && model.temperature <= 1, 'calibration never sharpens');
});

test('the published claim holds: better than v1 on 2025-2026 in Makuuchi and overall, intervals above zero', () => {
  const t = model.backtest.test, g = model.backtest.gainVsV1;
  assert.ok(t.all.model.brier < t.all.v1.brier && t.makuuchi.model.brier < t.makuuchi.v1.brier);
  assert.ok(t.makuuchi.model.accuracy > t.makuuchi.higherRankWins.accuracy);
  assert.ok(g.all.interval95[0] > 0 && g.makuuchi.interval95[0] > 0);
  assert.equal(model.data.test, '2025-');
});

test('live replay: a bout is rated with only that morning’s knowledge (later results change nothing)', () => {
  const live = nextOf(read(ids[ids.length - 1]));
  const before = bashoPredictions(live, model).filter(x => x.day === 8);
  const flipped = JSON.parse(JSON.stringify(live));
  for (const div of Object.values(flipped.banzuke)) for (const r of div.rows) r.record = r.record.map((b, i) => i >= 7 && b ? { ...b, result: b.result === 'win' ? 'loss' : b.result === 'loss' ? 'win' : b.result } : b);
  const after = new Map(bashoPredictions(flipped, model).filter(x => x.day === 8).map(x => [x.a.rikishiID + '-' + x.b.rikishiID, x.p]));
  assert.ok(before.length > 50);
  for (const x of before) assert.ok(Math.abs(x.p - after.get(x.a.rikishiID + '-' + x.b.rikishiID)) < 1e-12);
});

test('saved basho use the saved chances; every Makuuchi bout of a saved basho has one', () => {
  const f = read('202611');
  const preds = bashoPredictions(f, model);
  const maku = boutsOf(f).filter(b => isMakuuchi(b.winner.rank) && isMakuuchi(b.loser.rank));
  assert.equal(preds.filter(q => isMakuuchi(q.a.rank) && isMakuuchi(q.b.rank)).length, maku.length);
  assert.ok(preds.every(q => q.p > 0.05 && q.p < 0.95));
  const all = expectedWins(preds, { makuuchiOnly: false });
  assert.ok(Math.abs(all.reduce((s, x) => s + x.expected, 0) - preds.length) < 1e-6, 'the two sides’ chances add to one per bout');
});

test('kachi-koshi pressure: 7-7 before day 15 must win, 8-6 is decided; Makushita counts to 4 of 7', () => {
  const R = new SumoReplay();
  const rec = (w, l) => [...Array(w).fill({ result: 'win', opponentID: 9 }), ...Array(l).fill({ result: 'loss', opponentID: 9 })];
  R.startBasho('202611', [{ rikishiID: 1, rank: 'Maegashira 5 East', record: rec(7, 7) }, { rikishiID: 2, rank: 'Maegashira 6 East', record: rec(8, 6) },
    { rikishiID: 3, rank: 'Makushita 2 East', record: [{ result: 'win' }, { result: '' }, { result: 'loss' }, { result: '' }, { result: 'win' }, { result: '' }, { result: 'loss' }, { result: '' }, { result: 'win' }, { result: '' }, { result: 'loss' }] }]);
  const F = R.features(1, 2, 15);
  assert.equal(F.a.must, 1); assert.equal(F.b.decided, 1); assert.equal(F.a.decided, 0);
  assert.equal(vectorize(F).bubbleA, 1);
  const m = R.side(R.rows.get(3), 12);
  assert.equal(m.w, 3); assert.equal(m.l, 3); assert.equal(m.must, 1, 'Makushita 3-3 needs the last bout');
});

test('pairs: either order gives the same chance; the power table is a proper average', () => {
  const ranks = new Map(roster.rikishi.filter(w => isMakuuchi(w.currentRank)).map(w => [Number(w.sourceId), w.currentRank]));
  const M = nextMorning(model, { ranks });
  const [x, y] = [...ranks.keys()];
  const ab = pickWith(M, model, x, y), ba = pickWith(M, model, y, x);
  assert.ok(Math.abs(ab.p + ba.p - 1) < 1e-12);
  for (const k of Object.keys(ab.parts)) assert.ok(Math.abs(ab.parts[k] + ba.parts[k]) < 1e-12, k);
  const pw = power(M, model, [...ranks.keys()]);
  assert.ok(Math.abs(pw.reduce((s, q) => s + q.power, 0) / pw.length - 0.5) < 1e-9, 'average power is exactly 50%');
});

test('birthplace reading: Japanese prefectures v abroad', () => {
  assert.equal(foreignBorn('Hyogo-ken, Ashiya-shi'), 0);
  assert.equal(foreignBorn('Tokyo-to, Edogawa-ku'), 0);
  assert.equal(foreignBorn('Hokkaido, Sapporo-shi'), 0);
  assert.equal(foreignBorn('Mongolia, Ulaanbaatar'), 1);
  assert.equal(foreignBorn(''), null);
});

test('the daily update leaves the files alone when no newer basho is saved', () => {
  const a = readFileSync(MODEL, 'utf8'), b = readFileSync(STATE, 'utf8');
  const out = execFileSync('node', ['scripts/sumo-build-model.mjs', '--update'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(out, /nothing newer/);
  assert.equal(readFileSync(MODEL, 'utf8'), a); assert.equal(readFileSync(STATE, 'utf8'), b);
});
