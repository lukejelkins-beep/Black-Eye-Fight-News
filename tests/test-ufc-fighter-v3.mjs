import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildV3, finishType } from '../scripts/build-ufc-fighter-v3.mjs';

const load = name => JSON.parse(fs.readFileSync(new URL('../data/' + name + '.json', import.meta.url)));
const asOf = '2026-11-13';
const profiles = ['champion', 'contender', 'prospect', 'roster'].flatMap(cohort =>
  Object.values(load('ufc-' + cohort + '-profiles').fighters));
const input = { asOf, progress: load('ufcalendar-rich-progress'), research: load('ufcalendar-fighter-research'),
  postfight: load('ufc-postfight-metrics'), profiles };
const data = buildV3(input);

test('reviewed champions, ranked contenders, specialists and unranked fighters', () => {
  const f = data.fighters;
  assert.equal(Object.keys(f).length, profiles.length);
  assert.equal(Object.values(f).filter(x => x.category === 'Champion').length, 11);
  assert(f.islammakhachev.power >= 90 && f.islammakhachev.opponentEvidence >= 2);
  assert.equal(f.biamesquita.officialRank, 11);
  assert.equal(f.gabrielbonfim.category, 'Contender');
  assert.equal(f.gabrielbonfim.officialRank, 5);
  assert(f.biamesquita.technical.grappling.score > f.biamesquita.technical.striking.score);
  assert(f.joshuavan.technical.striking.score > f.joshuavan.technical.grappling.score);
  assert.equal(f.austinbashi.category, 'Prospect');
  assert.equal(f.austinbashi.officialRank, null);
  assert.equal(f.jonnyparsons.category, 'Roster');
  assert.equal(f.jonnyparsons.power, null);
  for (const row of Object.values(f)) {
    assert(row.recent.length <= 5);
    assert(row.recent.every((bout, i) => !i || bout.date <= row.recent[i-1].date));
    assert.equal(Object.keys(row.technical).length, 5);
    for (const score of [row.power, row.trajectory, ...Object.values(row.technical).map(x => x.score)])
      assert(score === null || (Number.isInteger(score) && score >= 0 && score <= 100));
  }
});

test('18-month activity, qualifying denominators, separate win methods and correct sort direction', () => {
  assert.equal(data.cutoff, '2025-05-13');
  assert(data.population > 800);
  assert.equal(data.boards.length, 12);
  for (const board of data.boards) {
    assert(board.eligible >= board.leaders.length);
    for (const [i, row] of board.leaders.entries()) {
      assert(row.bouts >= 2);
      if (board.type === 'rate') assert(row.seconds >= 600);
      if (board.type === 'count') assert(Number.isInteger(row.value) && row.value > 0 && row.value <= row.bouts);
      if (i) assert(board.id === 'sapm' ? row.value >= board.leaders[i-1].value : row.value <= board.leaders[i-1].value);
    }
  }
  assert.equal(data.fighters.biamesquita.metrics.ko.value, 0);
  assert.equal(data.fighters.biamesquita.metrics.submission.value, 3);
  assert.equal(finishType('technical_submission'), 'submission');
  assert.equal(finishType('TKO R2 1:27'), 'ko');
  assert.equal(finishType(''), null);
});

test('missing fight metrics and historical opposition stay unknown', () => {
  const recent = buildV3({ ...input, progress: {}, research: {}, postfight: {} });
  const islam = recent.fighters.islammakhachev;
  assert.equal(islam.power, null);
  assert.equal(islam.opponentEvidence, 0);
  assert(islam.recent.every(x => !x.hasStats));
  assert(!Object.hasOwn(islam.metrics, 'slpm'));
  assert(!Object.hasOwn(islam.metrics, 'tdDef'));
  const v3 = buildV3({ ...input, asOf: '2026-11-30' });
  assert.equal(v3.cutoff, '2025-05-30');
  const august = buildV3({ ...input, asOf: '2026-08-31' });
  assert.equal(august.cutoff, '2025-02-28');
});
