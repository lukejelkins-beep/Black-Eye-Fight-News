import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL('../data/' + path, import.meta.url), 'utf8'));
const inventory = read('ufc-official-career-bout-inventory.json');
const entry = inventory.fighters['giga-chikadze'];
const native = read('ufcalendar-fighter-research.json').profiles['giga-chikadze'];
const certificate = read('ufc-independent-full-career-verification.json').fighters['giga-chikadze'];
const DAY = 86400000;
const normalized = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

test('wave79 source review retains all 13 official UFC Giga Chikadze bouts, without claiming certification', () => {
  assert.equal(inventory.status, 'source_corroborated_list_not_independent_career_certification');
  assert.equal(entry.sourceUrl, 'https://www.ufc.com/athlete/giga-chikadze');
  assert.equal(entry.bouts.length, 13);
  assert.equal(new Set(entry.bouts.map(x => x.cachedNativeBoutId)).size, 13);
  assert.equal(certificate, undefined, 'source review cannot become a strict certificate');
  for (const bout of entry.bouts) {
    const cached = native.recentHistory.find(x => String(x.boutId) === bout.cachedNativeBoutId);
    assert.ok(cached, 'original native bout missing: ' + bout.cachedNativeBoutId);
    assert.equal(normalized(cached.opponent), normalized(bout.opponent));
    assert.equal(cached.result, bout.result);
    assert.ok(Math.abs(Date.parse(cached.date) - Date.parse(bout.date)) <= DAY, 'date discrepancy for ' + bout.cachedNativeBoutId);
  }
});

test('wave79 independently documented DWCS feeder bout remains excluded from official UFC career', () => {
  assert.equal(entry.feederExclusions.length, 1);
  const excluded = entry.feederExclusions[0];
  assert.equal(excluded.cachedNativeBoutId, '84005');
  assert.equal(excluded.opponent, 'Austin Springer');
  assert.ok(!entry.bouts.some(x => x.cachedNativeBoutId === excluded.cachedNativeBoutId));
  assert.ok(native.recentHistory.some(x => String(x.boutId) === excluded.cachedNativeBoutId));
});
