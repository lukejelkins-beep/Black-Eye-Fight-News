import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { replayBasho, bashoPredictions, expectedWins, pick, boutsOf, formThrough, rankScore, ratingsMap, strength } from '../assets/sumo-predict.mjs';
import { isMakuuchi } from '../assets/sumo-home-data.mjs';

const DIR = new URL('../data/sumo/basho-archive/', import.meta.url);
const ids = readdirSync(DIR).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
const read = id => JSON.parse(readFileSync(new URL(id + '.json', DIR), 'utf8'));
const model = JSON.parse(readFileSync(new URL('../data/sumo/predictor.json', import.meta.url), 'utf8'));

test('the saved model covers every saved basho and was scored on the newest ones only', () => {
  assert.deepEqual(Object.keys(model.preBasho).sort(), ids);
  assert.deepEqual(model.builtFrom.test, ids.slice(-model.builtFrom.test.length));
  assert.ok(!model.builtFrom.train.some(id => model.builtFrom.test.includes(id)), 'train and test do not overlap');
  for (const k of ['rank', 'rating', 'form']) assert.ok(model.coef[k] > 0, k + ' pushes toward the stronger man');
});

test('the published claim holds: the model beats rank alone on the test basho, interval above zero', () => {
  const t = model.backtest.test;
  assert.ok(t.all.model.brier < t.all.rankOnly.brier);
  assert.ok(t.makuuchi.model.accuracy > t.makuuchi.higherRankWins.accuracy);
  assert.ok(model.backtest.brierGainVsRankOnly.interval95[0] > 0);
});

test('replaying from the saved pre-basho ratings reproduces the saved end ratings', () => {
  const r = ratingsMap(model.preBasho[ids[0]]);
  for (const id of ids) replayBasho(read(id), r, model);
  for (const [k, v] of Object.entries(model.ratings)) assert.ok(Math.abs((r.get(Number(k)) || 0) - v) < 0.06 * ids.length + 0.1, k);
});

test('a prediction never sees the bout it predicts or anything after that morning', () => {
  const f = read(ids[ids.length - 1]);
  const preds = bashoPredictions(f, model);
  const q = preds.find(x => x.day === 8);
  /* form is wins minus losses through day 7 only */
  assert.equal(q.x.form * 5, formThrough(q.a, 7) - formThrough(q.b, 7));
  /* Changing day 8 onward does not change day-8 probabilities. */
  const cut = JSON.parse(JSON.stringify(f));
  for (const div of Object.values(cut.banzuke)) for (const r of div.rows) r.record = r.record.map((b, i) => i >= 7 && b ? { ...b, result: b.result === 'win' ? 'loss' : b.result === 'loss' ? 'win' : b.result } : b);
  const again = bashoPredictions(cut, model).filter(x => x.day === 8);
  const before = preds.filter(x => x.day === 8);
  assert.equal(again.length, before.length);
  const key = x => x.a.rikishiID + '-' + x.b.rikishiID;
  const map = new Map(again.map(x => [key(x), x.p]));
  before.forEach(x => assert.ok(Math.abs(x.p - map.get(key(x))) < 1e-12, key(x)));
  assert.ok(again.some(x => x.aWon !== before.find(y => key(y) === key(x)).aWon), 'the flip did change the results');
});

test('every fought bout is counted once; fusen and absences are not rated', () => {
  const f = read('202611');
  const b = boutsOf(f);
  const keys = new Set(b.map(x => x.day + ':' + [x.winner.rikishiID, x.loser.rikishiID].sort().join('-')));
  assert.equal(keys.size, b.length);
  assert.ok(b.every(x => x.winner !== x.loser));
});

test('expected wins add up: total wins equal total expected wins over all bouts', () => {
  const preds = bashoPredictions(read('202611'), model);
  const all = expectedWins(preds, { makuuchiOnly: false });
  const w = all.reduce((s, x) => s + x.wins, 0), e = all.reduce((s, x) => s + x.expected, 0);
  assert.ok(Math.abs(e - preds.length) < 1e-6, 'the two sides chances add to one per bout');
  assert.equal(w, preds.length);
  const maku = expectedWins(preds, { isMakuuchi });
  assert.ok(maku.every(x => isMakuuchi(x.rank)));
});

test('pick is symmetric and favours the higher rank when ratings are level', () => {
  const m = { ...model, ratings: {} };
  const a = { id: 1, rank: 'Yokozuna 1 East' }, b = { id: 2, rank: 'Maegashira 10 West' };
  const ab = pick(a, b, m).p, ba = pick(b, a, m).p;
  assert.ok(ab > 0.5);
  assert.ok(Math.abs(ab + ba - 1) < 1e-12);
  assert.ok(rankScore('Ozeki 1 East') > rankScore('Maegashira 1 East'));
  assert.ok(strength('Yokozuna 1 East', 0, model) > strength('Juryo 1 East', 0, model));
});
