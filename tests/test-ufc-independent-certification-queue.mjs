import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCertificationQueue} from '../scripts/build-ufc-independent-certification-queue.mjs';
const roster=Array.from({length:783},(_,i)=>'fighter-'+(i+1));
const approval={schema:1,status:'approved',rosterAsOf:'2026-11-14',approvedFighters:roster};
const registry={scope:'ufc-independent-full-career-verification',rosterAsOf:'2026-11-14',fighters:{}};
const report=()=>({scope:'ufc-36-month-stage3-progress',
 summary:{approvedFighters:783},careerVerificationDecisions:roster.map(slug=>({
   slug,allKnownFightsIndexed:true,allKnownFightsMeasured:true,
   knownOfficialUfcFightCount:3,minimumConfirmedMissingHistoricalUfcBouts:0
 })),profilesWithAmbiguousNumericIdentity:[],cachedCareerHistoryCandidates:[],
 officialSourceInventory:{cases:[]}});
test('all known bouts measured is NOT independent full-career certification',()=>{
 const r=buildCertificationQueue(approval,report(),registry);
 assert.equal(r.summary.certified,0);
 assert.equal(r.summary.pending,783);
 assert.equal(r.nextBatch.length,20);
 assert.equal(r.queue[0].state,'source_listing_review');
});
test('strict completed independent evidence is the only certification path',()=>{
 const r=report();
 r.careerVerificationDecisions[0].independentlyVerifiedFullCareer=true;
 let x=buildCertificationQueue(approval,r,registry);
 assert.equal(x.summary.certified,0);
 const evidence={...registry,fighters:{'fighter-1':{
   sourceCoverageAttested:true,
   verificationMethod:'full_official_ufc_fight_listing_crosscheck'}}};
 x=buildCertificationQueue(approval,r,evidence);
 assert.equal(x.summary.certified,1);
 assert.equal(x.queue.at(-1).slug,'fighter-1');
});
test('priority orders official gaps then ambiguous native identities then cached recovery',()=>{
 const r=report();
 r.careerVerificationDecisions[5].minimumConfirmedMissingHistoricalUfcBouts=5;
 r.profilesWithAmbiguousNumericIdentity=[{slug:'fighter-3'}];
 r.cachedCareerHistoryCandidates=[{slug:'fighter-4',
   missingIndexedOfficialUfcFights:[{id:'20'}]}];
 const q=buildCertificationQueue(approval,r,registry,{batchSize:3}).nextBatch;
 assert.deepEqual(q.map(x=>x.slug),['fighter-6','fighter-3','fighter-4']);
});
test('fails closed on duplicate or absent approvals and unmatched Stage 3 rows',()=>{
 const r=report();r.careerVerificationDecisions.pop();
 assert.throws(()=>buildCertificationQueue(approval,r,registry),/Missing Stage 3/);
 assert.throws(()=>buildCertificationQueue({...approval,approvedFighters:roster.slice(1)},report(),registry));
 assert.throws(()=>buildCertificationQueue(approval,report(),registry,{batchSize:100}));
});

test('Greco history candidates create review work without automatic certification',()=>{
 const snapshot={scope:'ufc-greco-bulk-crosscheck-checkpoint',rosterAsOf:'2026-11-14',
  sourceCommit:'a'.repeat(40),
  candidateAlerts:[{slug:'fighter-25',sourceCandidateNotSaved:4,identityReviewRequired:false}]};
 const q=buildCertificationQueue(approval,report(),registry,{grecoCheckpoint:snapshot});
 const row=q.queue.find(x=>x.slug==='fighter-25');
 assert.equal(row.state,'bulk_source_candidate_review');
 assert.equal(row.unverifiedGrecoCandidates,4);
 assert.equal(q.summary.certified,0);
});
test('Greco checkpoint from an unrelated roster is ignored',()=>{
 const q=buildCertificationQueue(approval,report(),registry,{grecoCheckpoint:{
  scope:'ufc-greco-bulk-crosscheck-checkpoint',rosterAsOf:'2025-01-01',
  sourceCommit:'a'.repeat(40),
  candidateAlerts:[{slug:'fighter-25',sourceCandidateNotSaved:1000}]}});
 assert.equal(q.queue.find(x=>x.slug==='fighter-25').state,'source_listing_review');
});
