import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCertificationAttempts} from '../scripts/ufc-certification-attempt-router.mjs';

function setup(){
 const slugs=Array.from({length:783},(_,i)=>'approved-fighter-'+i);
 const approval={schema:1,status:'approved',rosterAsOf:'2026-11-14',approvedFighters:slugs};
 const audit={scope:'ufc-36-month-stage3-progress',summary:{approvedFighters:783},
   careerVerificationDecisions:slugs.map(slug=>({slug,
     knownOfficialUfcFightCount:2,allKnownFightsIndexed:true,allKnownFightsMeasured:true,
     independentlyVerifiedFullCareer:false,minimumConfirmedMissingHistoricalUfcBouts:0}))};
 const registry={scope:'ufc-independent-full-career-verification',
   rosterAsOf:'2026-11-14',fighters:{}};
 const progress={lastRun:'2026-11-14T04:31:00+00:00',ufcApprovedFullFightSearchChecks:{},
   ufcFullCareerHistoryChecks:{}};
 return {approval,audit,registry,progress,slugs};
}
test('attempts the entire frozen cohort while keeping source research out of exception queue',()=>{
 const s=setup();
 const r=routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress);
 assert.equal(r.summary.attempted,783);
 assert.equal(r.summary.certified,0);
 assert.equal(r.summary.exceptions,0);
 assert.equal(r.summary.awaitingIndependentSourceResearch,783);
 assert.equal(r.sourceResearchNextBatch.length,25);
 assert.equal(r.exceptionResearchNextBatch.length,0);
});
test('certifies only evidence passed by the existing independent full-career gate',()=>{
 const s=setup(),slug=s.slugs[5],d=s.audit.careerVerificationDecisions[5];
 d.independentlyVerifiedFullCareer=true;
 s.registry.fighters[slug]={sourceCoverageAttested:true,
   verificationMethod:'full_official_ufc_fight_listing_crosscheck',
   bouts:[{date:'2026-01-01',fightUrl:'https://ufcstats.com/fight-details/abc123'}]};
 const r=routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress);
 assert.equal(r.summary.certified,1);
 assert.deepEqual(r.certified.map(x=>x.slug),[slug]);
 s.registry.fighters[slug].sourceCoverageAttested=false;
 const r2=routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress);
 assert.equal(r2.summary.certified,0);
});
test('routes identity, official gaps and failed source attestations to specific exception reasons',()=>{
 const s=setup();
 s.audit.profilesWithAmbiguousNumericIdentity=[{slug:s.slugs[4]}];
 s.audit.officialSourceInventory={cases:[{slug:s.slugs[2]}]};
 s.audit.careerVerificationDecisions[3].independentlyVerifiedFullCareer=false;
 s.registry.fighters[s.slugs[3]]={sourceCoverageAttested:true,
   verificationMethod:'full_official_ufc_fight_listing_crosscheck'};
 s.progress.ufcApprovedFullFightSearchChecks[s.slugs[8]]={status:'manual_review'};
 const r=routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress);
 assert.equal(r.summary.exceptions,4);
 assert.equal(r.summary.awaitingIndependentSourceResearch,779);
 assert.equal(r.exceptionResearchNextBatch[0].slug,s.slugs[2]);
 assert.ok(r.exceptions.find(x=>x.slug===s.slugs[4]).issues.includes('numeric_fighter_identity_ambiguous'));
 assert.ok(r.exceptions.find(x=>x.slug===s.slugs[3]).issues.includes('attested_career_failed_independent_gate'));
 assert.ok(r.exceptions.find(x=>x.slug===s.slugs[8]).issues.includes('numeric_fight_index_manual_review'));
});
test('fails closed if approval or audit decisions are modified or duplicates exist',()=>{
 const s=setup();
 s.audit.careerVerificationDecisions.pop();
 assert.throws(()=>routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress),/Invalid/);
 const a=setup();
 a.audit.careerVerificationDecisions[0].slug=a.slugs[1];
 assert.throws(()=>routeCertificationAttempts(a.approval,a.audit,a.registry,a.progress),/Missing or duplicate/);
});
test('collector-recoverable cached omissions stay in the exception queue, never auto-certified',()=>{
 const s=setup();
 s.audit.cachedCareerHistoryCandidates=[{slug:s.slugs[10],
   missingIndexedOfficialUfcFights:[{id:'12345'}],
   historicalIdentityConflicts:[{id:'98765'}]}];
 const r=routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress);
 const row=r.exceptions.find(x=>x.slug===s.slugs[10]);
 assert.deepEqual(row.issues,
   ['existing_cached_ufc_fights_not_linked','duplicate_or_conflicting_native_bout_identity']);
 assert.equal(r.summary.certified,0);
});

test('a passed independent career gate is not falsely demoted by a legacy numeric identity ambiguity',()=>{
 const s=setup(),slug=s.slugs[7];
 s.audit.careerVerificationDecisions[7].independentlyVerifiedFullCareer=true;
 s.audit.profilesWithAmbiguousNumericIdentity=[{slug,reason:'legacy identity alias'}];
 s.progress.ufcApprovedFullFightSearchChecks[slug]={status:'manual_review'};
 s.registry.fighters[slug]={sourceCoverageAttested:true,
   verificationMethod:'full_official_ufc_fight_listing_crosscheck',bouts:[{nativeBoutId:'999'}]};
 const r=routeCertificationAttempts(s.approval,s.audit,s.registry,s.progress);
 assert.equal(r.summary.certified,1);
 assert.equal(r.summary.exceptions,0);
});
