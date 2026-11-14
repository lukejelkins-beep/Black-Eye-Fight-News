import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read = file => JSON.parse(readFileSync(new URL('../data/' + file, import.meta.url), 'utf8'));
const roster = read('ufc-36-month-roster-approval.json');
const independent = read('ufc-independent-full-career-verification.json');
const profiles = read('ufcalendar-fighter-research.json').profiles;
const cache = read('ufcalendar-rich-progress.json');
const candidates = read('ufc-36-month-candidates.json');
const slug = 'daria-zhelezniakova';

test('Daria complete five-fight UFC career keeps exact pinned fight identities and round observations', () => {
  assert.equal(roster.approvedFighters.length, 783);
  assert.ok(roster.approvedFighters.includes(slug));
  const proof = independent.fighters[slug];
  assert.equal(proof?.sourceCoverageAttested, true);
  assert.equal(proof?.scope, 'complete_official_ufc_career');
  assert.equal(proof?.verificationMethod, 'full_official_ufc_fight_listing_crosscheck');
  assert.equal(proof?.fighterName, 'Daria Zhelezniakova');
  assert.equal(proof?.officialFighterUrl, 'https://www.ufc.com/athlete/dariya-zheleznyakova');
  assert.equal(proof?.fighterUrl, 'https://ufcstats.com/fighter-details/07047eb7d17fb0a2');
  assert.equal(proof?.sourceSnapshot?.fightResultsBlobSha, '699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(proof?.sourceSnapshot?.fighterDetailsBlobSha, '7141332f0b319edbc10d006b229050ee947e7336');
  assert.deepEqual(proof?.verifiedNumericFighterIds, ['560']);
  assert.deepEqual(proof?.sourceVerifiedExcludedFeederBouts, []);
  const expected = [
    ['39002', '2024-03-23', 'Montse Rendon', 'win', 'f1c3abce15ef053e'],
    ['38710', '2024-09-28', 'Ailin Perez', 'loss', '7ba432e218edc17d'],
    ['60279', '2025-06-21', 'Melissa Mullins', 'win', 'fff3218758c513b8'],
    ['66097', '2026-04-18', 'Melissa Croden', 'loss', 'bae4de7ef8c0769e'],
    ['93272', '2026-10-10', 'Alice Pereira', 'loss', '335b3ce2b5c0a3cd']
  ];
  assert.equal(proof.bouts.length, expected.length);
  assert.equal(proof.officialUfcCareerBoutCount, expected.length);
  assert.equal(new Set(proof.bouts.map(x => x.nativeBoutId)).size, expected.length);
  assert.equal(new Set(proof.bouts.map(x => x.fightUrl)).size, expected.length);
  for (const [id, date, opponent, outcome, fight] of expected) {
    const item = proof.bouts.find(x => x.nativeBoutId === id);
    assert.deepEqual(item, {
      date, opponent, result: outcome,
      fightUrl: 'https://ufcstats.com/fight-details/' + fight,
      nativeBoutId: id, nativeFighterId: '560'
    });
    const native = cache.bouts[id];
    assert.equal(native?.org, 'ufc');
    assert.equal(native?.status, 'completed');
    assert.equal(native?.eventDate, date);
    assert.ok(!/contender series|road to ufc|\\bdwcs\\b/i.test(native.event));
    assert.ok(Number(cache.roundDone[id]) > 0);
    const own = native.a?.id === '560' ? native.a : native.b?.id === '560' ? native.b : null;
    assert.equal(own?.name, 'Daria Zhelezniakova');
    const other = own === native.a ? native.b : native.a;
    assert.equal(other?.name, opponent);
    assert.equal(native.result?.winnerId === own.id ? 'win' : native.result?.winnerId === other.id ? 'loss' : null, outcome);
  }
  const rows = profiles[slug].recentHistory.filter(x => x.promotion === 'ufc' && x.date <= '2026-11-14');
  const last = candidates.fighters.find(x => x.slug === slug)?.lastUfcFight;
  assert.equal(rows.length, expected.length);
  assert.equal(evaluateCareerEvidence(profiles[slug], rows, last, roster.rosterAsOf, proof, cache.bouts).independentlyVerified, true);
});
