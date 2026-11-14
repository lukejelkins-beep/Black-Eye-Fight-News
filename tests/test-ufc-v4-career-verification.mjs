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
