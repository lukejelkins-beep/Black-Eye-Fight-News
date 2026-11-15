import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCareerEvidence } from '../scripts/ufc-36-month-stage3-progress.mjs';

const read = file => JSON.parse(readFileSync(new URL('../data/' + file, import.meta.url), 'utf8'));
const roster = read('ufc-36-month-roster-approval.json');
const evidence = read('ufc-independent-full-career-verification.json').fighters['jeka-saragih'];
const research = read('ufcalendar-fighter-research.json').profiles['jeka-saragih'];
const cache = read('ufcalendar-rich-progress.json');
const census = read('ufc-36-month-candidates.json');

test('Jeka full UFC career includes official 2023 Road to UFC final and exactly three later Octagon bouts', () => {
  assert.equal(roster.approvedFighters.length, 783);
  assert.ok(roster.approvedFighters.includes('jeka-saragih'));
  assert.equal(evidence.sourceCoverageAttested, true);
  assert.equal(evidence.scope, 'complete_official_ufc_career');
  assert.equal(evidence.verificationMethod, 'full_official_ufc_fight_listing_crosscheck');
  assert.equal(evidence.officialFighterUrl, 'https://www.ufc.com/athlete/jeka-saragih');
  assert.equal(evidence.fighterUrl, 'https://ufcstats.com/fighter-details/57186c150c645200');
  assert.equal(evidence.sourceSnapshot.fightResultsBlobSha, '699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.deepEqual(evidence.verifiedNumericFighterIds, ['2783']);
  assert.deepEqual(evidence.sourceVerifiedExcludedFeederBouts, []);
  const expected = [
    ['59748', '2023-02-05', 'Anshul Jubli', 'loss', 'b1b20c686dfe3204'],
    ['59983', '2023-11-18', 'Lucas Alexander', 'win', 'f0fe73e650b746f2'],
    ['61062', '2024-06-15', 'Westin Wilson', 'loss', 'e47523ac32bfa24c'],
    ['60871', '2025-06-07', 'JooSang Yoo', 'loss', '9f4a0de31375ba04']
  ];
  assert.equal(evidence.officialUfcCareerBoutCount, expected.length);
  assert.equal(evidence.bouts.length, expected.length);
  assert.equal(new Set(evidence.bouts.map(x => x.nativeBoutId)).size, expected.length);
  assert.equal(new Set(evidence.bouts.map(x => x.fightUrl)).size, expected.length);
  const history = research.recentHistory.filter(x => x.promotion === 'ufc' && x.date <= census.asOf);
  assert.equal(history.length, expected.length);
  for (const [nativeBoutId, date, opponent, result, ufcStatsId] of expected) {
    const x = evidence.bouts.find(x => x.nativeBoutId === nativeBoutId);
    assert.deepEqual(x, { date, opponent, result, fightUrl: 'https://ufcstats.com/fight-details/' + ufcStatsId, nativeBoutId, nativeFighterId: '2783' });
    const bout = cache.bouts[nativeBoutId];
    assert.equal(bout.org, 'ufc');
    assert.equal(bout.status, 'completed');
    assert.ok(Math.abs(Date.parse(date) - Date.parse(bout.eventDate)) <= 86400000);
    assert.ok(Number(cache.roundDone[nativeBoutId]) > 0);
    const own = bout.a?.id === '2783' ? bout.a : bout.b?.id === '2783' ? bout.b : null;
    assert.equal(own?.name, 'Jeka Saragih');
    const other = own === bout.a ? bout.b : bout.a;
    assert.equal(other?.name, opponent);
    assert.equal(bout.result.winnerId === own.id ? 'win' : bout.result.winnerId === other.id ? 'loss' : null, result);
    assert.ok(history.some(h => h.boutId === nativeBoutId && h.result === result));
  }
  assert.equal(cache.bouts['59748'].event, 'UFC Fight Night: Lewis vs Spivac');
  assert.equal(cache.bouts['60871'].eventDate, '2025-06-08');
  const last = census.fighters.find(x => x.slug === 'jeka-saragih')?.lastUfcFight;
  assert.equal(evaluateCareerEvidence(research, history, last, roster.rosterAsOf, evidence, cache.bouts).independentlyVerified, true);
});

test('Jeka strict full-career gate rejects omission of the official final or false source outcome', () => {
  const history = research.recentHistory.filter(x => x.promotion === 'ufc' && x.date <= census.asOf);
  const last = census.fighters.find(x => x.slug === 'jeka-saragih')?.lastUfcFight;
  const gate = source => evaluateCareerEvidence(research, history, last, roster.rosterAsOf, source, cache.bouts).independentlyVerified;
  assert.equal(gate({ ...evidence, bouts: evidence.bouts.filter(x => x.nativeBoutId !== '59748') }), false);
  assert.equal(gate({ ...evidence, bouts: evidence.bouts.map(x => x.nativeBoutId === '60871' ? { ...x, result: 'win' } : x) }), false);
  assert.equal(gate({ ...evidence, verifiedNumericFighterIds: ['999999'] }), false);
});
