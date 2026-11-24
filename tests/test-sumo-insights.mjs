import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fromArchive, fromDetails, runs, stables, rivalries, records, OZEKI_BAR } from '../assets/sumo-insights-data.mjs';
import { renderInsights, insightsTeaser } from '../assets/sumo-insights.mjs';
import { tierOf, isMakuuchi, isSanyaku } from '../assets/sumo-home-data.mjs';

const J = f => JSON.parse(readFileSync(new URL('../data/sumo/' + f, import.meta.url), 'utf8'));
const dir = new URL('../data/sumo/basho-archive/', import.meta.url);
const basho = readdirSync(dir).filter(f => /^\d{6}\.json$/.test(f)).sort().map(f => fromArchive(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))));
const roster = J('rikishi-index.json'), ch = J('career-history.json'), h2h = J('research-h2h-summary.json'), details = J('preview-details.json');
const h = { e: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), head: () => '', cutout: () => '', known: () => true };

test('promotion runs: two straight sanyaku basho, winning record now, wins needed to reach the bar', () => {
  const r = runs(basho);
  for (const x of r.ozeki) {
    assert.ok(['Sekiwake', 'Komusubi'].includes(tierOf(x.rank)));
    assert.ok(x.steps.every(s => isSanyaku(s.rank)));
    assert.ok(x.steps[1].wins >= 8, 'winning record in the latest basho');
    assert.equal(x.soFar, x.steps[0].wins + x.steps[1].wins);
    assert.equal(x.needed, Math.max(0, OZEKI_BAR - x.soFar));
  }
  assert.ok(!r.ozeki.some(x => x.name === 'Fujinokawa'), 'a 7-8 Sekiwake is not on a run');
  assert.deepEqual(runs(fromDetails(details)).ozeki.map(x => x.name), r.ozeki.map(x => x.name), 'home teaser and page agree');
});

test('stables: totals add up to the wrestlers counted', () => {
  const s = stables(basho[basho.length - 1], roster);
  const heya = new Map(roster.rikishi.map(w => [w.sourceId, w.heya]));
  const counted = basho[basho.length - 1].rows.filter(r => heya.has(r.rikishiID));
  assert.equal(s.reduce((a, x) => a + x.wrestlers, 0), counted.length);
  assert.equal(s.reduce((a, x) => a + x.wins, 0), counted.reduce((a, r) => a + r.wins, 0));
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].wins >= s[i].wins);
});

test('rivalries: both in Makuuchi now, leader first, totals consistent', () => {
  const list = rivalries(h2h, roster);
  assert.ok(list.length > 0);
  const now = new Map(roster.rikishi.map(w => [w.sourceId, w.currentRank]));
  for (const r of list) {
    assert.ok(isMakuuchi(now.get(r.a.id)) && isMakuuchi(now.get(r.b.id)));
    assert.ok(r.a.wins >= r.b.wins);
    assert.ok(r.a.wins + r.b.wins <= r.total);
  }
});

test('records: titles match the archive; streaks are real runs of wins', () => {
  const R = records(basho, ch, roster);
  const titles = new Map();
  for (const b of basho) for (const y of b.yusho) if (y.type === 'Makuuchi') titles.set(y.rikishiId, (titles.get(y.rikishiId) || 0) + 1);
  for (const t of R.titles) assert.equal(t.n, titles.get(t.id));
  for (const s of R.streaks) {
    const row = basho.find(b => b.bashoId === s.bashoId).rows.find(r => r.rikishiID === s.id);
    let run = 0, best = 0; for (const x of row.record) { if (x && x.result === 'win') best = Math.max(best, ++run); else run = 0; }
    assert.equal(best, s.n);
  }
  assert.ok(R.fastest.some(x => x.name === 'Fujiryoga'), 'a debut-basho history gap does not drop a wrestler');
});

test('page and teaser render with one h1 and escaped names', () => {
  const d = { runs: runs(basho), rivalries: rivalries(h2h, roster), stables: stables(basho[basho.length - 1], roster), records: records(basho, ch, roster), latestId: basho[basho.length - 1].bashoId };
  const html = renderInsights(d, h);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  const t = insightsTeaser(h, { runs: d.runs, rivalries: d.rivalries.slice(0, 1), stables: d.stables });
  assert.match(t, /href="#insights\/runs"|href="#insights\/rivalries"/);
  d.stables[0].heya = '<b>x</b>';
  assert.doesNotMatch(renderInsights(d, h), /<b>x<\/b>/);
});

import { sizeExtremes, weightAt, GIANT_GAP } from '../assets/sumo-insights-data.mjs';
test('size: weights come from a weigh-in at or before the basho, at most four basho old', () => {
  const ch2 = { bySourceId: { 1: { weight: [{ basho: '202501', kg: 150 }, { basho: '202509', kg: 160 }] } } };
  assert.equal(weightAt(ch2, 1, '202507'), 150);
  assert.equal(weightAt(ch2, 1, '202511'), 160);
  assert.equal(weightAt(ch2, 1, '202411'), null, 'no weigh-in before');
  assert.equal(weightAt(ch2, 1, '202611'), null, 'last weigh-in more than four basho old');
});
test('size: gaps and giant-killers are consistent; coverage is reported', () => {
  const S = sizeExtremes(basho, ch, roster);
  assert.ok(S.covered > 0 && S.covered <= S.total);
  for (const f of S.mismatches) { assert.equal(f.gap, Math.abs(f.winner.kg - f.loser.kg)); assert.equal(f.lighterWon, f.winner.kg < f.loser.kg); }
  for (const k of S.giantKillers) assert.ok(k.n >= 1 && k.best.lighterWon && k.best.gap >= GIANT_GAP);
  const maku = roster.rikishi.filter(w => isMakuuchi(w.currentRank));
  assert.equal(S.banzuke.heaviest.kg, Math.max(...maku.map(w => w.weightKg)));
  assert.equal(S.banzuke.shortest.cm, Math.min(...maku.map(w => w.heightCm)));
});
