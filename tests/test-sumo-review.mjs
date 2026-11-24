import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildReview, asDetails, upsets, techniques, records } from '../assets/sumo-review-data.mjs';
import { renderReview } from '../assets/sumo-review.mjs';
import { position, rows } from '../assets/sumo-home-data.mjs';

const DIR = new URL('../data/sumo/basho-archive/', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const ids = readdirSync(DIR).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
const ch = JSON.parse(readFileSync(new URL('../data/sumo/career-history.json', import.meta.url), 'utf8'));
const h = { e: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), head: () => '', cutout: () => '', known: () => true, index: { basho: ids.map(bashoId => ({ bashoId })) } };

test('every saved tournament builds a review with its Makuuchi champion', () => {
  ids.forEach((id, i) => {
    const file = read(id + '.json'), prev = i ? read(ids[i - 1] + '.json') : null;
    const r = buildReview(file, prev, ch);
    const yusho = file.yusho.find(y => y.type === 'Makuuchi');
    assert.equal(r.headline.champion.id, yusho.rikishiId, id);
    assert.equal(r.kadobanKnown, !!prev);
    if (!prev) assert.ok(r.sanyaku.every(s => s.flag === null), 'no kadoban guesses without the tournament before');
    const html = renderReview(r, file, h);
    assert.equal((html.match(/<h1>/g) || []).length, 1, id);
  });
});

test('July 2025: Kotoshoho won from Maegashira 15 and topped the upsets', () => {
  const r = buildReview(read('202507.json'), read('202505.json'), ch);
  assert.equal(r.headline.champion.name, 'Kotoshoho');
  assert.equal(r.headline.champion.rank, 'Maegashira 15 East');
  assert.equal(r.upsets[0].winner.name, 'Kotoshoho');
});

test('upsets: the winner is always ranked lower than the loser, and fusen wins are left out', () => {
  for (const id of ids) {
    const u = upsets(asDetails(read(id + '.json')), { limit: 50 });
    for (const x of u) assert.ok(position(x.winner.rank) > position(x.loser.rank), id);
  }
  const fake = { bashoId: '202501', yusho: [], banzuke: { Makuuchi: { rows: [
    { rikishiID: 1, shikonaEn: 'Y', rank: 'Yokozuna 1 East', record: [] },
    { rikishiID: 2, shikonaEn: 'M', rank: 'Maegashira 9 East', record: [{ result: 'fusen win', opponentID: 1, kimarite: 'fusen' }] }] } } };
  assert.equal(upsets(asDetails(fake)).length, 0);
});

test('techniques count each fought bout once and leave out fusen', () => {
  const file = read('202611.json');
  const t = techniques(asDetails(file));
  let wins = 0;
  for (const r of rows(asDetails(file).banzuke)) for (const b of r.record || []) if (b && b.result === 'win' && b.kimarite && b.kimarite !== 'fusen') wins++;
  assert.equal(t.total, wins);
  assert.equal(t.top.reduce((a, x) => a + x.count, 0) <= t.total, true);
  assert.ok(t.once.every(k => typeof k === 'string'));
});

test('best and worst records only include wrestlers who fought every day', () => {
  const r = records(asDetails(read('202507.json')));
  for (const x of [...r.best, ...r.worst]) assert.equal(x.absences, 0);
  assert.ok(r.absent.every(x => x.absences > 0));
});

test('names are escaped in the review', () => {
  const file = structuredClone(read('202611.json'));
  file.banzuke.Makuuchi.rows[0].shikonaEn = '<script>x</script>';
  const html = renderReview(buildReview(file, read('202609.json'), ch), file, h);
  assert.doesNotMatch(html, /<script>x/);
});
