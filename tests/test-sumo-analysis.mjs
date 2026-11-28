import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { analysis, standings, raceSeries, picks } from '../assets/sumo-analysis-data.mjs';
import { raceChart, dayBlock, expectationsBlock, renderLiveAnalysis } from '../assets/sumo-analysis.mjs';
import { asDetails, buildReview } from '../assets/sumo-review-data.mjs';
import { renderReview } from '../assets/sumo-review.mjs';
import { asOfDay } from '../assets/sumo-live-data.mjs';
import { predictorView, renderPredictor } from '../assets/sumo-predictor-view.mjs';
import { storylines, powerGaps } from '../assets/sumo-storylines.mjs';

const DIR = new URL('../data/sumo/basho-archive/', import.meta.url);
const ids = readdirSync(DIR).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
const read = id => JSON.parse(readFileSync(new URL(id + '.json', DIR), 'utf8'));
const json = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const model = json('data/sumo/predictor.json'), roster = json('data/sumo/rikishi-index.json'), ch = json('data/sumo/career-history.json');
const h = { e: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), head: () => '', cutout: () => '', known: () => true, index: { basho: ids.map(bashoId => ({ bashoId })) } };

test('November 2026, day 8: the day shows its own bouts, the table after it, and the kinboshi shock', () => {
  const A = analysis(asDetails(read('202611')), model, { day: 8 });
  assert.equal(A.day, 8);
  assert.ok(A.bouts.length >= 18 && A.bouts.every(b => b.day === 8));
  assert.equal(A.dayShock.p, Math.min(...A.bouts.map(b => b.p)), 'the shock is the day’s longest odds overcome');
  assert.ok(A.bouts.some(b => b.kinboshi && b.winner.name === 'Hakunofuji'), 'Hakunofuji’s gold star is in the day');
  assert.equal(A.table[0].w + A.table[0].l, 8, 'standings are through day 8');
  assert.equal(A.soFar.n, A.bouts.length + analysis(asDetails(read('202611')), model, { day: 7 }).soFar.n);
});

test('changing the day changes the results, the table and the scores (not only the highlights)', () => {
  const det = asDetails(read('202611'));
  const a = analysis(det, model, { day: 3 }), b = analysis(det, model, { day: 12 });
  assert.notDeepEqual(a.bouts.map(x => x.winner.id), b.bouts.map(x => x.winner.id));
  assert.notDeepEqual(a.table.map(x => x.w), b.table.map(x => x.w));
  const html = dayBlock(h, b, { start: '2026-11-08T00:00:00Z' });
  assert.match(html, /Day 12/);
  assert.match(html, /data-analysis-day="12" aria-pressed="true"/);
});

test('standings place men on equal records together, fewest losses first', () => {
  const t = standings(asDetails(read('202611')), 15);
  assert.equal(t[0].place, 1); assert.equal(t[1].place, 1);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].l > t[i - 1].l || (t[i].l === t[i - 1].l && t[i].w <= t[i - 1].w));
});

test('race chart: one line per contender, a narrow and a wide drawing, and a table view', () => {
  const A = analysis(asDetails(read('202611')), model, {});
  assert.equal(A.race.length, 4);
  assert.ok(A.race.every(s => s.points.length === 15));
  const html = raceChart(h, A);
  assert.equal((html.match(/<svg/g) || []).length, 2);
  assert.match(html, /Chart as a table/);
});

test('every saved basho renders a review with one h1 and a working day view', () => {
  ids.forEach((id, i) => {
    const f = read(id), det = asDetails(f), A = analysis(det, model, {});
    const html = renderReview(buildReview(f, i ? read(ids[i - 1]) : null, ch), f, { ...h, analysis: raceChart(h, A) + dayBlock(h, A, {}), expectations: expectationsBlock(h, A) });
    assert.equal((html.match(/<h1>/g) || []).length, 1, id);
    assert.match(html, /data-analysis-day/, id);
    assert.match(html, /Who did well, who didn’t/, id);
  });
});

test('live: a replayed day shows only what was known, and picks rate the next day from that morning', () => {
  const full = asDetails(read('202611')), live = asOfDay(full, 9);
  const A = analysis(live, model, {});
  assert.equal(A.completed, 9);
  assert.ok(A.bouts.every(b => b.day === 9));
  const pairs = full.banzuke.Makuuchi.data.east.flatMap(r => { const b = r.record[9]; return b && b.result === 'win' ? [{ rikishiId: r.rikishiID, opponentId: b.opponentID }] : []; });
  const P = picks(live, model, pairs, 10);
  assert.ok(P.length >= 18);
  assert.ok(P.every(m => m.p > 0 && m.p < 1 && m.day === 10));
  const html = renderLiveAnalysis({ bashoId: '202611', preview: true, picks: P, model }, A, h);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /Day 10 picks/);
  assert.match(html, /Preview/);
});

test('over and under performers: expected wins are earned, kyujo men are not called failures', () => {
  const A = analysis(asDetails(read('202611')), model, {});
  assert.ok(A.over.every(x => x.delta > 0.5));
  assert.ok(A.under.every(x => x.delta < -0.5 && x.missed === 0));
  assert.ok(!A.under.some(x => x.name === 'Shishi'), 'Shishi missed bouts');
});

test('predictor page: defaults to the top two, chances add to one, swap mirrors', () => {
  const v = predictorView({ model, roster, details: null, h2h: null });
  assert.equal(v.live, false);
  assert.ok(v.A && v.B && v.A.id !== v.B.id);
  const w = predictorView({ model, roster, details: null, h2h: null, a: v.B.id, b: v.A.id });
  assert.ok(Math.abs(v.p.p + w.p.p - 1) < 1e-12);
  assert.ok(v.table.every((x, i) => !i || x.power <= v.table[i - 1].power));
  assert.ok(Object.keys(v.p.parts).length === 7, 'seven groups explain the chance');
  const html = renderPredictor({ model, roster, details: null, h2h: null }, h);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /Track record/);
});

test('storylines: true to the numbers they quote', () => {
  const cards = storylines(read('202611'), model, roster);
  const tags = cards.map(c => c.tag);
  for (const t of ['Beat the odds', 'Biggest shock', 'Fell short']) assert.ok(tags.includes(t), t);
  const shock = cards.find(c => c.tag === 'Biggest shock');
  assert.equal(shock.metric, Math.round(analysis(asDetails(read('202611')), model, { day: 15 }).bashoShock.p * 100) + '%');
  const g = powerGaps(roster, model);
  assert.ok(g.under.every(x => x.rank - x.power >= 5) && g.over.every(x => x.power - x.rank >= 5));
});
