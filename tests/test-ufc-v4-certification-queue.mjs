import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildCertificationQueue} from '../scripts/ufc-v4-certification-queue.mjs';
const fixture=()=>({schema:1,scope:'ufc-36-month-stage3-progress',
 summary:{approvedFighters:783,independentlyVerifiedFullCareerTimelines:1,
   asOf:'2026-11-14',approvedSnapshotAsOf:'2026-11-14'},
 careerVerificationDecisions:Array.from({length:783},(_,i)=>({
   slug:'fighter-'+String(i).padStart(3,'0'),knownOfficialUfcFightCount:2,
   allKnownFightsIndexed:true,allKnownFightsMeasured:true,
   independentlyVerifiedFullCareer:i===0,
   status:i===0?'independently_verified_full_career':'all_known_fights_complete_historical_unverified'
 })),
 fullFightIndexSearchReview:[],profilesWithAmbiguousNumericIdentity:[],
 rosterLastBoutSourceGaps:[],officialSourceInventory:{cases:[],conflicts:[]}});
test('attempts 783, never certifies based only on measured known fights',()=>{
 const q=buildCertificationQueue(fixture());
 assert.deepEqual(q.totals,{certified:1,fastLane:782,exceptions:0,approved:783});
 assert.equal(q.lanes.fastLane[0].reason,'needs_independent_exhaustive_source_attestation');
});
test('source attestation that fails the independent gate becomes a bounded exception',()=>{
 const q=buildCertificationQueue(fixture(),{fighters:{'fighter-002':{
   scope:'complete_official_ufc_career',sourceCoverageAttested:true}}});
 assert.equal(q.totals.exceptions,1);
 assert.deepEqual(q.lanes.exceptions[0].reasonCodes,['source_proof_fails_certification_gate']);
});
test('manual review, native identity, missing source and coverage gaps do not block fast lane',()=>{
 const r=fixture();
 r.fullFightIndexSearchReview=[{slug:'fighter-004',status:'manual_review'}];
 r.profilesWithAmbiguousNumericIdentity=[{slug:'fighter-005',knownNumericIds:['7','8']}];
 r.officialSourceInventory.cases=[{slug:'fighter-006'}];
 r.careerVerificationDecisions[7].allKnownFightsMeasured=false;
 const q=buildCertificationQueue(r);
 assert.equal(q.totals.exceptions,4);
 assert.equal(q.totals.fastLane,778);
 assert.equal(q.lanes.exceptions.find(x=>x.slug==='fighter-005').numericIds.length,2);
});
test('incomplete or stale certification audits fail closed',()=>{
 const r=fixture();r.careerVerificationDecisions.pop();
 assert.throws(()=>buildCertificationQueue(r),/783-fighter audit/);
 const q=fixture();q.summary.independentlyVerifiedFullCareerTimelines=2;
 assert.throws(()=>buildCertificationQueue(q),/stale/);
});

test('one-bout career evidence is source linked and excludes DWCS/TUF exhibitions', async()=>{
 const {readFileSync}=await import('node:fs');
 const registry=JSON.parse(readFileSync(new URL('../data/ufc-independent-full-career-verification.json',import.meta.url),'utf8'));
 const expected=[
  ['adrian-luna-martinetti','66079','557','Davey Grant','DWCS'],
  ['alexander-poppeck','83277','3291','Jovan Leka','DWCS'],
  ['anna-melisano','83025','32354','Dione Barbosa','TUF']
 ];
 for(const [slug,nativeId,athleteId,opponent,excluded] of expected){
  const f=registry.fighters[slug];
  assert.equal(f.sourceCoverageAttested,true,slug);
  assert.equal(f.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(f.verifiedOfficialUfcBoutCount,1,slug);
  assert.equal(f.bouts.length,1,slug);
  assert.equal(f.bouts[0].nativeBoutId,nativeId,slug);
  assert.equal(f.bouts[0].nativeFighterId,athleteId,slug);
  assert.equal(f.bouts[0].opponent,opponent,slug);
  assert.equal(f.bouts[0].result,'loss',slug);
  assert.match(f.bouts[0].fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/,slug);
  assert.match(f.fighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]{16}$/,slug);
  assert.match(f.sourceCoverage.excludedNonOfficialBouts,new RegExp(excluded),slug);
 }
});
