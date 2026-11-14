import test from "node:test";
import assert from "node:assert/strict";
import {auditCareerVerification} from "../scripts/audit-ufc-v4-career-verification.mjs";
const cohort=Array.from({length:783},(_,i)=>"fighter-"+String(i).padStart(3,"0"));
function inputs(){
 const approval={schema:1,status:"approved",rosterAsOf:"2026-11-14",approvedFighters:cohort};
 const foundation={scope:"ufc-only-v4-stat-foundation",population:783,asOf:"2026-11-14",
  fighters:Object.fromEntries(cohort.map(slug=>[slug,{
   knownCareerBouts:0,careerCoverageStatus:"historical_completeness_unverified",
   ufcTimelineCertified:false,independentlyCertifiedCareer:false}]))};
 const research={profiles:{}};
 const progress={ufcApprovedFullFightSearchChecks:{},ufcFullCareerHistoryChecks:{}};
 const census={fighters:[]};
 const independent={scope:"ufc-independent-full-career-verification",
  rosterAsOf:"2026-11-14",fighters:{}};
 const inventory={scope:"ufc-official-career-bout-inventory",
  rosterAsOf:"2026-11-14",fighters:{}};
 return [approval,foundation,research,progress,census,independent,inventory,{bouts:[]}];
}
test("prioritizes verified missing official UFC bouts without certifying any history",()=>{
 const v=inputs(),slug="fighter-001";
 v[1].fighters[slug].knownCareerBouts=1;
 v[2].profiles[slug]={name:"Test Fighter",recentHistory:[
  {promotion:"UFC",result:"win",date:"2026-10-01",
   opponent:"Opponent One",boutId:"100",source:"native"}]};
 v[5].fighters[slug]={minimumOfficialUfcBouts:2};
 v[6].fighters[slug]={sourceUrl:"https://www.ufc.com/athlete/test-fighter",
  bouts:[{date:"2026-10-01",opponent:"Opponent One",result:"win"},
   {date:"2026-08-01",opponent:"Opponent Two",result:"loss"}]};
 const out=auditCareerVerification(...v);
 assert.equal(out.summary.priority1,1);
 assert.equal(out.summary.officiallyListedBoutsNotExactlyMatched,1);
 assert.equal(out.priorityQueue[0].slug,slug);
 assert.equal(out.priorityQueue[0].officialInventoryUnmatched,1);
 assert.equal(out.summary.pendingCertification,783);
 assert.equal(out.officialCrosschecks[0].completeCareerCertifiedByInventory,false);
});
test("same-count UFC official evidence does not establish complete career",()=>{
 const v=inputs(),slug="fighter-009";
 v[1].fighters[slug].knownCareerBouts=1;
 v[2].profiles[slug]={recentHistory:[{promotion:"UFC",result:"win",
  date:"2026-10-01",opponent:"Opponent One",boutId:"123",source:"native"}]};
 v[6].fighters[slug]={sourceUrl:"https://www.ufc.com/athlete/test",
  bouts:[{date:"2026-10-01",opponent:"Opponent One",result:"win"}]};
 const out=auditCareerVerification(...v);
 assert.equal(out.summary.priority1,0);
 assert.equal(out.summary.pendingCertification,783);
 assert.equal(out.officialCrosschecks[0].exactUnmatchedBouts.length,0);
});
test("source scope and verified feeder exclusions must not create false gaps",()=>{
 const v=inputs(),slug="fighter-010";
 v[2].profiles[slug]={recentHistory:[
  {promotion:"UFC",result:"win",date:"2020-09-08",opponent:"A",
   boutId:"444",source:"native"},
  {promotion:"UFC",result:"win",date:"2025-05-17",opponent:"B",
   boutId:"445",source:"native"}]};
 v[1].fighters[slug].knownCareerBouts=1;
 v[7]={schema:1,bouts:[{fighterSlug:slug,boutId:"444",date:"2020-09-08",
   opponent:"A",event:"Dana White's Contender Series",
   sourceUrl:"https://www.ufc.com/news/test"}]};
 v[6].fighters[slug]={sourceUrl:"https://www.ufc.com/athlete/test",
  bouts:[{date:"2025-05-17",opponent:"B",result:"win"}]};
 const good=auditCareerVerification(...v);
 assert.equal(good.summary.priority1,0);
 v[7].bouts[0].sourceUrl="https://ufc.com.evil.test/news/test";
 const bad=auditCareerVerification(...v);
 assert.equal(bad.summary.priority1,0,
  "false feeder inclusion does not create a false official omission");
 assert.equal(bad.summary.pendingCertification,783);
});
test("invalid cohort or nonmatching official evidence snapshot cannot certify",()=>{
 const v=inputs();v[0].approvedFighters=cohort.slice(1);
 assert.throws(()=>auditCareerVerification(...v),/783/);
 v[0].approvedFighters=cohort;
 v[6].rosterAsOf="2026-11-13";
 assert.throws(()=>auditCareerVerification(...v),/snapshot/);
});

test("independent certification is reported separately from provider-only claims",()=>{
 const v=inputs();
 v[1].fighters["fighter-001"].ufcTimelineCertified=true;
 v[1].fighters["fighter-002"].independentlyCertifiedCareer=true;
 const r=auditCareerVerification(...v);
 assert.equal(r.summary.verifiedComplete,2);
 assert.equal(r.summary.providerOnlyCertified,1);
 assert.equal(r.summary.independentlyCertified,1);
 assert.equal(r.summary.pendingCertification,781);
});
test("contradictory outcomes for the same UFC bout are flagged, not silently deduplicated",()=>{
 const v=inputs(),slug="fighter-003";
 v[2].profiles[slug]={recentHistory:[
  {promotion:"UFC",date:"2025-01-01",opponent:"Test Opponent",result:"win"},
  {promotion:"UFC",date:"2025-01-01",opponent:"Test Opponent",result:"no_contest"}
 ]};
 v[1].fighters[slug].independentlyCertifiedCareer=true;
 const r=auditCareerVerification(...v);
 assert.equal(r.summary.conflictingSavedOutcomes,1);
 assert.equal(r.summary.independentlyCertified,0);
 assert.equal(r.summary.pendingCertification,783);
 assert.equal(r.priorityQueue[0].slug,slug);
 assert.deepEqual(r.priorityQueue[0].contradictorySavedOutcomes[0].outcomes,["win","no_contest"]);
});

test("a stale certified flag is vetoed by independently listed missing UFC bouts",()=>{
 const v=inputs(),slug="fighter-021";
 v[1].fighters[slug].independentlyCertifiedCareer=true;
 v[1].fighters[slug].knownCareerBouts=1;
 v[2].profiles[slug]={recentHistory:[{promotion:"UFC",date:"2025-01-01",
  opponent:"First Opponent",result:"win"}]};
 v[6].fighters[slug]={sourceUrl:"https://www.ufc.com/athlete/test",
  bouts:[{date:"2025-01-01",opponent:"First Opponent",result:"win"},
   {date:"2024-01-01",opponent:"Second Opponent",result:"no_contest"}]};
 const r=auditCareerVerification(...v);
 assert.equal(r.summary.independentlyCertified,0);
 assert.equal(r.summary.pendingCertification,783);
 assert.equal(r.priorityQueue[0].slug,slug);
 assert.equal(r.priorityQueue[0].officialInventoryUnmatched,1);
});
test("a provider-only certification is vetoed by saved history discrepancy",()=>{
 const v=inputs(),slug="fighter-022";
 v[1].fighters[slug].ufcTimelineCertified=true;
 v[1].fighters[slug].careerCoverageStatus="provider_history_discrepancy";
 const r=auditCareerVerification(...v);
 assert.equal(r.summary.providerOnlyCertified,0);
 assert.equal(r.summary.pendingCertification,783);
});

test("one-day official date offset is surfaced with saved native ID but never auto-certified",()=>{
 const v=inputs(),slug="fighter-025";
 v[1].fighters[slug].knownCareerBouts=1;
 v[2].profiles[slug]={recentHistory:[{promotion:"UFC",date:"2023-02-04",
  opponent:"SeungGuk Choi",result:"win",boutId:"native-123"}]};
 v[6].fighters[slug]={sourceUrl:"https://www.ufc.com/athlete/test",
  bouts:[{date:"2023-02-05",opponent:"SeungGuk Choi",result:"win"}]};
 const r=auditCareerVerification(...v);
 const c=r.officialCrosschecks.find(x=>x.slug===slug);
 assert.equal(c.exactUnmatchedBouts.length,1);
 assert.equal(c.closeCandidates[0].savedCandidates[0].boutId,"native-123");
 assert.equal(c.closeCandidates[0].savedCandidates[0].reason,"one_day_date_offset");
 assert.equal(r.summary.pendingCertification,783);
});
