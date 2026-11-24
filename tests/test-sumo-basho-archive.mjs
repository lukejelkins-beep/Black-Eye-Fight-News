import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bashoRange, slimBanzuke, checkBasho, DIVISIONS } from '../scripts/sumo-collect-basho-archive.mjs';

const DIR = new URL('../data/sumo/basho-archive/', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));

test('basho range steps through the six tournament months', () => {
  assert.deepEqual(bashoRange('202409', '202503'), ['202409', '202411', '202501', '202503']);
});

test('wins come from the bout list; differing source totals are kept and noted', () => {
  const raw = { east: [{ rikishiID: 1, shikonaEn: 'A', rank: 'Juryo 1 East', rankValue: 301, wins: 7, losses: 7, absences: 0,
    record: [...Array(8)].map(() => ({ result: 'win', opponentID: 2 })).concat([...Array(7)].map(() => ({ result: 'loss', opponentID: 3 }))) }], west: [] };
  const file = { bashoId: '202507', yusho: [{ type: 'Makuuchi' }], banzuke: Object.fromEntries(DIVISIONS.map(d => [d, slimBanzuke(raw, d)])) };
  const { problems, notes } = checkBasho(file);
  assert.deepEqual(problems, []);
  assert.equal(file.banzuke.Juryo.rows[0].wins, 8);
  assert.equal(file.banzuke.Juryo.rows[0].sourceWins, 7);
  assert.ok(notes.some(n => /source total 7-7, bout list 8-7/.test(n)));
});

test('a row without an ID or a basho without a Makuuchi champion stops the run', () => {
  const file = { bashoId: '202507', yusho: [], banzuke: Object.fromEntries(DIVISIONS.map(d => [d, { rows: [{ rank: 'X', record: [], wins: 0, losses: 0, absences: 0 }] }])) };
  const { problems } = checkBasho(file);
  assert.ok(problems.includes('no Makuuchi yusho'));
  assert.ok(problems.some(p => /row without ID/.test(p)));
});

test('saved archive: two years of tournaments, each consistent and source-labelled', () => {
  const files = readdirSync(DIR).filter(f => /^\d{6}\.json$/.test(f)).sort();
  assert.ok(files.length >= 13, 'at least 13 tournaments saved');
  const index = read('index.json');
  assert.deepEqual(index.basho.map(b => b.bashoId + '.json'), files);
  for (const f of files) {
    const d = read(f);
    assert.equal(d.bashoId + '.json', f);
    assert.match(d.source, /sumo-api\.com/);
    assert.ok(d.sourceUrls.length === 4 && d.collectedAt);
    assert.ok(d.yusho.some(y => y.type === 'Makuuchi' && y.shikonaEn), f + ' has a Makuuchi champion');
    for (const div of DIVISIONS) {
      const rows = d.banzuke[div].rows;
      assert.ok(rows.length >= 20, f + ' ' + div + ' rows');
      for (const r of rows) {
        const res = r.record.filter(Boolean).map(x => x.result);
        assert.equal(res.filter(x => /win/.test(x)).length, r.wins, `${f} ${r.shikonaEn} wins match bouts`);
        assert.equal(res.filter(x => /loss/.test(x)).length, r.losses, `${f} ${r.shikonaEn} losses match bouts`);
      }
    }
  }
});

test('November 2026 in the archive matches the saved live snapshot', () => {
  const a = read('202611.json');
  const p = JSON.parse(readFileSync(new URL('../data/sumo/preview-details.json', import.meta.url), 'utf8'));
  const old = new Map();
  for (const div of Object.values(p.banzuke)) for (const s of ['east', 'west']) for (const r of div.data[s]) old.set(r.rikishiID, r.wins + '-' + r.losses);
  let compared = 0;
  for (const div of DIVISIONS) for (const r of a.banzuke[div].rows) if (old.has(r.rikishiID)) { compared++; assert.equal(r.wins + '-' + r.losses, old.get(r.rikishiID), r.shikonaEn); }
  assert.ok(compared >= 180);
});
