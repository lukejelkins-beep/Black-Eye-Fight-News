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
