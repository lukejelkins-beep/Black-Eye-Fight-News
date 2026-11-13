import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIT,buildSignedOffManifest} from '../scripts/approve-ufc-36-month-snapshot.mjs';

const make=(n=783)=>({
  schema:1,scope:'ufc-36-month-roster-review',
  summary:{
    asOf:'2026-11-14',activityCutoff:'2023-11-14',eventScanComplete:true,
    indexedOfficialEvents:127,missingOfficialEventDetails:0,
    provisionalIncluded:783,proposedWithoutExceptions:783,
    openExceptions:0,excludedCount:332,integrityIssues:0,
    exclusionsByReason:{
      no_official_ufc_fight_in_36_months:193,
      official_ufc_status_not_fighting:10,
      later_professional_mma_outside_official_ufc:105,
      confirmed_left_ufc:13,confirmed_retired:11
    }},
  proposedRoster:Array.from({length:n},(_,i)=>({slug:'fighter-'+String(i+1)})),
  exclusions:Array.from({length:332},(_,i)=>({slug:'excluded-'+String(i)})),
  exceptions:[],integrityIssues:[]
});
const previous={schema:1,scope:'ufc-36-month-roster',status:'pending_review'};
test('user-approved cohort is exactly 783 immutable slugs with reproducible hash',()=>{
  const r=make();
  const approval=buildSignedOffManifest(r,r,previous);
  assert.equal(approval.status,'approved');
  assert.equal(approval.approvedCount,783);
  assert.equal(approval.approvedFighters.length,783);
  assert.equal(new Set(approval.approvedFighters).size,783);
  assert.match(approval.approvedRosterSha256,/^[a-f0-9]{64}$/);
  assert.equal(approval.auditCommit,AUDIT.commit);
  assert.equal(approval.approvedAt,'2026-11-14');
  assert.deepEqual(buildSignedOffManifest(r,r,approval),approval);
});
test('cannot sign off a changed roster, unreviewed exception or incomplete events',()=>{
  const audit=make(),current=make();
  assert.throws(()=>buildSignedOffManifest(make(782),current,previous),/Exact approved slugs/);
  audit.summary.openExceptions=1;
  assert.throws(()=>buildSignedOffManifest(audit,current,previous),/zero exceptions/);
  current.summary.missingOfficialEventDetails=1;
  assert.throws(()=>buildSignedOffManifest(make(),current,previous),/Current census/);
});
test('later candidate changes never expand the approved allowlist',()=>{
  const audit=make(),current=make();
  current.proposedRoster.push({slug:'new-unapproved-fighter'});
  current.summary.proposedWithoutExceptions+=1;
  const approval=buildSignedOffManifest(audit,current,previous);
  assert.equal(approval.approvedFighters.length,783);
  assert.ok(!approval.approvedFighters.includes('new-unapproved-fighter'));
});
test('approved gate cannot silently replace previously approved fighters',()=>{
  const r=make();
  const approval=buildSignedOffManifest(r,r,previous);
  approval.approvedFighters=approval.approvedFighters.slice(1);
  assert.throws(()=>buildSignedOffManifest(r,r,approval),/may not be replaced/);
});
