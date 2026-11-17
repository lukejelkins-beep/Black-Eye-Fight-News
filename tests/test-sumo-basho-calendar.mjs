import test from 'node:test';
import assert from 'node:assert/strict';
import { bashoStart, resolveBasho } from '../scripts/sumo-basho-calendar.mjs';

test('basho start dates are the second Sunday of each odd month', () => {
  assert.equal(bashoStart(2026, 11), '2026-11-08');
  assert.equal(bashoStart(2026, 9), '2026-09-13');
  assert.equal(bashoStart(2027, 1), '2027-01-10');
  assert.equal(bashoStart(2027, 3), '2027-03-14');
  for (const [y, m] of [[2026, 1], [2026, 3], [2026, 5], [2026, 7], [2027, 5], [2027, 7], [2027, 9], [2027, 11]]) {
    assert.equal(new Date(bashoStart(y, m) + 'T00:00:00Z').getUTCDay(), 0);
    const dom = Number(bashoStart(y, m).slice(8));
    assert.ok(dom >= 8 && dom <= 14);
  }
});

test('resolves live, pre and between phases', () => {
  const at = s => resolveBasho(new Date(s));
  assert.deepEqual(['202611', 'live', 10], [at('2026-11-17T05:00:00Z').id, at('2026-11-17T05:00:00Z').phase, at('2026-11-17T05:00:00Z').day]);
  assert.equal(at('2026-11-08T00:30:00Z').day, 1);
  assert.equal(at('2026-11-22T05:00:00Z').day, 15);
  assert.equal(at('2026-11-23T05:00:00Z').phase, 'live');
  assert.equal(at('2026-11-30T05:00:00Z').phase, 'between');
  assert.equal(at('2026-11-30T05:00:00Z').id, '202611');
  assert.equal(at('2026-12-20T05:00:00Z').id, '202611');
  const pre = at('2027-01-01T05:00:00Z');
  assert.deepEqual([pre.id, pre.phase, pre.previousBashoId], ['202701', 'pre', '202611']);
  assert.equal(at('2027-01-10T05:00:00Z').phase, 'live');
  assert.equal(at('2027-02-10T05:00:00Z').phase, 'between');
});

test('Tokyo date, not UTC, decides the day', () => {
  // 2026-11-07 16:00Z is already 2026-11-08 01:00 in Tokyo, so day 1 of the Kyushu basho
  assert.equal(resolveBasho(new Date('2026-11-07T16:00:00Z')).day, 1);
  assert.equal(resolveBasho(new Date('2026-11-07T14:00:00Z')).phase, 'pre');
});
