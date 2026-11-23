import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight } from '../scripts/ufc-certification-consolidation-preflight.mjs';

const approved = Array.from({ length: 783 }, (_, i) => 'fighter-' + i);
const proof = (id = '100', result = 'win') => ({
  sourceCoverageAttested: true,
  scope: 'complete_official_ufc_career',
  fighterName: 'Test Fighter',
  bouts: [{ nativeBoutId: id, nativeFighterId: '5',
    fightUrl: 'https://ufcstats.com/fight-details/1234567890abcdef', result }]
});
const register = x => ({ fighters: x });

test('canonical overlap is a no-op even when research metadata changes', () => {
  const c = register({ 'fighter-0': proof() });
  const p = { ...proof(), note: 'New review notes from separate branch' };
  const out = preflight(c, approved, [{ label: 'research', document: register({ 'fighter-0': p }) }]);
  assert.deepEqual(out.counts, {
    canonical: 1, newCandidates: 0, alreadyCertifiedNoops: 1, repeatedNoops: 0, conflicts: 0
  });
  assert.equal(out.certificationGranted, false);
  assert.equal(out.canonicalModified, false);
});

test('conflicting outcome or native identity blocks consolidation', () => {
  const c = register({ 'fighter-0': proof() });
  const out = preflight(c, approved, [{ label: 'branch', document: register({ 'fighter-0': proof('100', 'loss') }) }]);
  assert.equal(out.safeToReview, false);
  assert.equal(out.counts.conflicts, 1);
  assert.equal(out.counts.newCandidates, 0);
});

test('parallel branches proposing the same new fighter count once and do not certify', () => {
  const p = register({ 'fighter-1': proof('200') });
  const out = preflight(register({ 'fighter-0': proof() }), approved,
    [{ label: 'branch-a', document: p }, { label: 'branch-b', document: p }]);
  assert.equal(out.counts.newCandidates, 1);
  assert.equal(out.counts.repeatedNoops, 1);
  assert.equal(out.sourceOnlyNewCandidates[0].requiresStrictStage3, true);
  assert.equal(out.certificationGranted, false);
});

test('conflicting parallel proposals are held for manual research', () => {
  const out = preflight(register({}), approved, [
    { label: 'a', document: register({ 'fighter-1': proof('200') }) },
    { label: 'b', document: register({ 'fighter-1': proof('201') }) }
  ]);
  assert.equal(out.safeToReview, false);
  assert.equal(out.counts.newCandidates, 1);
  assert.equal(out.counts.conflicts, 1);
});

test('unapproved, unsourced, or duplicate native fights are rejected', () => {
  const base = register({ 'fighter-0': proof() });
  assert.throws(() => preflight(base, approved.slice(1), []), /783 approved/);
  assert.throws(() => preflight(base, approved,
    [{ label: 'unknown', document: register({ outsider: proof() }) }]), /unapproved/);
  assert.throws(() => preflight(base, approved,
    [{ label: 'unsourced', document: register({ 'fighter-1': { ...proof(), sourceCoverageAttested: false } }) }]), /incomplete source/);
  const double = proof();
  double.bouts.push({ ...double.bouts[0] });
  assert.throws(() => preflight(register({ 'fighter-0': double }), approved), /duplicated native bout/);
});

const ufcalendarProof=()=>({
 sourceCoverageAttested:true,scope:'complete_official_ufc_career',
 certificationStandard:'ufcalendar_first',
 verificationMethod:'full_official_ufc_fight_listing_crosscheck',
 verifiedAt:'2026-11-17',fighterName:'Example Athlete',
 officialFighterUrl:'https://www.ufc.com/athlete/example-athlete',
 bouts:[
  {date:'2026-01-10',opponent:'Opponent X',result:'win'},
  {date:'2026-03-10',opponent:'Opponent X',result:'draw'},
  {date:'2026-04-10',opponent:'Opponent Y',result:'no_contest'}
 ]
});
test('explicit official semantic source works without native IDs and keeps rematches',()=>{
 const c=register({'fighter-0':ufcalendarProof()});
 const out=preflight(c,approved,[{label:'other-chat',document:c}]);
 assert.equal(out.safeToReview,true);
 assert.equal(out.counts.alreadyCertifiedNoops,1);
 assert.equal(out.counts.newCandidates,0);
});
test('official semantic proof rejects duplicates, missing identity, and changing fight outcome',()=>{
 const p=ufcalendarProof(),c=register({'fighter-0':p});
 const modified=structuredClone(p);
 modified.bouts[2].result='loss';
 assert.equal(preflight(c,approved,[{label:'other-chat',document:register({'fighter-0':modified})}]).safeToReview,false);
 const dupe=structuredClone(p);dupe.bouts[1].date=dupe.bouts[0].date;
 assert.throws(()=>preflight(register({'fighter-0':dupe}),approved),/duplicated official/);
 for(const corrupt of [
  {...p,officialFighterUrl:'https://untrusted.test/'},
  {...p,verifiedAt:''},
  {...p,bouts:[{date:'2026-01-10',opponent:'',result:'win'}]},
  {...p,bouts:[{date:'2026-01-10',opponent:'Opponent X',result:'invalid'}]}
 ])assert.throws(()=>preflight(register({'fighter-0':corrupt}),approved),/unverified UFCalendar|missing official UFC chronology/);
});

// UFCStats-sourced proofs have no numeric native IDs; they are keyed by fight-details URL.
const ufcstatsProof = (url = 'https://ufcstats.com/fight-details/1234567890abcdef', result = 'win') => ({
  sourceCoverageAttested: true,
  scope: 'complete_official_ufc_career',
  fighterName: 'Test Fighter',
  fighterUrl: 'https://ufcstats.com/fighter-details/1234567890abcdef',
  bouts: [{ date: '2024-01-01', opponent: 'Some Opponent', result, fightUrl: url }]
});

test('UFCStats-sourced proof without native IDs is accepted and conflicts are still detected', () => {
  const c = register({ 'fighter-0': ufcstatsProof() });
  const same = preflight(c, approved, [{ label: 'b', document: register({ 'fighter-0': ufcstatsProof() }) }]);
  assert.equal(same.counts.alreadyCertifiedNoops, 1);
  const diff = preflight(c, approved, [{ label: 'b', document: register({ 'fighter-0': ufcstatsProof(undefined, 'loss') }) }]);
  assert.equal(diff.counts.conflicts, 1);
});

test('UFCStats-sourced proof rejects bad fight URL, missing fields and duplicate bouts', () => {
  const bad = u => register({ 'fighter-0': ufcstatsProof(u) });
  assert.throws(() => preflight(bad('https://example.com/x'), approved), /UFCStats bout identity/);
  assert.throws(() => preflight(bad(''), approved), /UFCStats bout identity/);
  const noDate = ufcstatsProof(); delete noDate.bouts[0].date;
  assert.throws(() => preflight(register({ 'fighter-0': noDate }), approved), /UFCStats bout identity/);
  const dup = ufcstatsProof(); dup.bouts.push({ ...dup.bouts[0] });
  assert.throws(() => preflight(register({ 'fighter-0': dup }), approved), /duplicated UFCStats bout/);
  const noFighterUrl = ufcstatsProof(); delete noFighterUrl.fighterUrl;
  assert.throws(() => preflight(register({ 'fighter-0': noFighterUrl }), approved), /native\/source bout identity/);
});
