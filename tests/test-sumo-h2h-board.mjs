import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { recentBashoIds, boardRecord, recordTone, boardTotals } from '../assets/sumo-h2h-board.mjs';

const read = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

test('recent window walks back through the six basho months and across years', () => {
  assert.deepEqual(recentBashoIds('202611', 6), ['202611', '202609', '202607', '202605', '202603', '202601']);
  assert.deepEqual(recentBashoIds('202603', 3), ['202603', '202601', '202511']);
  assert.deepEqual(recentBashoIds('202602', 3), []);
  assert.deepEqual(recentBashoIds('', 3), []);
});

const summary = { activePairs: { '19:8850': { a: 19, b: 8850, winsA: 9, winsB: 2, total: 11,
  latest: [['202601', 15, 19, 'yorikiri', 'Makuuchi', 21, 'regular'], ['202409', 14, 8850, 'oshidashi', 'Makuuchi', 20, 'regular']] } } };
const full = { pairs: { '19:8850': { a: 19, b: 8850, regular: [
  ['202609', 15, 8850, 'yorikiri'], ['202601', 15, 19, 'yorikiri'], ['202409', 14, 8850, 'oshidashi'], ['202405', 11, 19, 'hatakikomi']
], special: [] } } };

test('career record is read from either side of the pair', () => {
  assert.deepEqual(boardRecord(summary, null, 8850, 19).wins, 2);
  assert.deepEqual(boardRecord(summary, null, 8850, 19).losses, 9);
  assert.deepEqual(boardRecord(summary, null, 19, 8850).wins, 9);
  assert.equal(boardRecord(summary, null, 19, 8850).latest[0].bashoId, '202601');
});

test('pairs with no meetings report zero, not unknown', () => {
  assert.deepEqual(boardRecord(summary, null, 1, 2), { wins: 0, losses: 0, total: 0, latest: [] });
  assert.equal(boardRecord(summary, null, 5, 5), null);
});

test('recent window needs the full chronology and counts only bouts inside it', () => {
  const window = recentBashoIds('202611', 6);
  assert.equal(boardRecord(summary, null, 8850, 19, window), null);
  const r = boardRecord(summary, full, 8850, 19, window);
  assert.deepEqual([r.wins, r.losses, r.total], [1, 1, 2]);
});

test('tone shows who leads and depth grows with meetings', () => {
  assert.deepEqual(recordTone({ wins: 0, losses: 0, total: 0 }), { tone: 'none', strength: 0 });
  assert.deepEqual(recordTone({ wins: 1, losses: 0, total: 1 }), { tone: 'win', strength: 1 });
  assert.deepEqual(recordTone({ wins: 2, losses: 2, total: 4 }), { tone: 'even', strength: 2 });
  assert.deepEqual(recordTone({ wins: 2, losses: 5, total: 7 }), { tone: 'loss', strength: 3 });
  assert.deepEqual(recordTone({ wins: 9, losses: 2, total: 11 }), { tone: 'win', strength: 4 });
});

test('totals skip unmet opponents', () => {
  assert.deepEqual(boardTotals([{ wins: 3, losses: 1, total: 4 }, { wins: 0, losses: 0, total: 0 }, { wins: 1, losses: 2, total: 3 }, null]),
    { wins: 4, losses: 3, met: 2, ahead: 1, behind: 1 });
});

test('real cache: summary covers every tracked pair the full chronology has', () => {
  const s = read('data/sumo/research-h2h-summary.json');
  const f = read('data/sumo/research-h2h-history.json');
  const ids = new Set(read('data/sumo/rikishi-index.json').rikishi.map(r => r.sourceId));
  for (const [key, pair] of Object.entries(f.pairs)) {
    const [a, b] = key.split(':').map(Number);
    if (!ids.has(a) || !ids.has(b)) continue;
    const career = boardRecord(s, null, a, b);
    assert.equal(career.total, pair.regular.length, key);
  }
});

test('head crops: one per approved portrait except listed exclusions, tied to the original by hash', () => {
  const heads = read('data/sumo/heads.json');
  const photos = read('data/sumo/approved-photos.json').bySourceId;
  assert.equal(heads.schemaVersion, 1);
  for (const [id, h] of Object.entries(heads.bySourceId)) {
    assert.match(h.path, /^assets\/sumo-photos\/head\/jsa-\d+\.webp$/);
    assert.ok(existsSync(new URL('../' + h.path, import.meta.url)), h.path);
    assert.equal(h.sourceSha256, photos[id]?.sha256, id);
    assert.ok(['transparent', 'feathered'].includes(h.matte));
  }
  const approved = Object.keys(photos).filter(id => photos[id].approved);
  const covered = new Set([...Object.keys(heads.bySourceId), ...Object.keys(heads.excluded || {})]);
  assert.deepEqual(approved.filter(id => !covered.has(id)), []);
});

test('page wiring: H2H is the fifth nav item and the board route renders', () => {
  const html = readFileSync(new URL('../sumo.html', import.meta.url), 'utf8');
  const nav = [...html.matchAll(/data-page="([a-z0-9]+)"/g)].map(m => m[1]);
  assert.deepEqual(nav, ['basho', 'banzuke', 'rikishi', 'h2h', 'kimarite']);
  assert.match(html, /sumo-h2h-board\.css/);
  const js = readFileSync(new URL('../assets/sumo.js', import.meta.url), 'utf8');
  assert.match(js, /case 'h2h': ROOT\.innerHTML=renderBoard\(id\)/);
  assert.match(js, /data\/sumo\/heads\.json/);
});

test('board is its own selector: tap a rikishi to focus, tap a score for meetings, no name box', () => {
  const js = readFileSync(new URL('../assets/sumo.js', import.meta.url), 'utf8');
  assert.match(js, /data-h2h-focus="'\+Number\(entry\.rikishiID\)/);
  assert.match(js, /class="h2h-rec" data-h2h-open=/);
  assert.match(js, /function focusBoard\(id\)/);
  assert.doesNotMatch(js, /id="h2h-pick"/);
  // Moving between boards keeps the reader's place instead of jumping to the top.
  assert.match(js, /Board to board/);
});
