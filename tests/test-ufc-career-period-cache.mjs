import test from "node:test";
import assert from "node:assert/strict";
import {buildOfflineUfcCareerPeriods} from "../scripts/audit-ufc-career-period-cache.mjs";
const asOf="2026-11-13";
const progress={bouts:{}};
for(let i=0;i<12;i++){
  const x=i+1,month=String(x).padStart(2,"0");
  progress.bouts[String(x)]={
    id:String(x),org:"ufc",event:"UFC Fight Night: Audit",
    eventDate:"2025-"+month+"-12",status:"completed",
    a:{id:"1",name:"Alpha",slug:"alpha"},
    b:{id:"2",name:"Beta",slug:"beta"},
    result:{winnerId:"1",method:i%3===0?"KO/TKO":"Decision"}
  };
}
const roster={
 schema:1,scope:"ufc",asOf,activityCutoff:"2023-11-13",
 fighters:[
 {name:"Alpha",slug:"alpha",eligibilityStatus:"latest_observed_mma_ufc",lastUfcFight:"2025-12-12",recent:[]},
 {name:"Needs Review",slug:"review",eligibilityStatus:"review_required",lastUfcFight:"2026-01-01",recent:[]}
]};
function data(p=progress,r=roster,measure={}){
 return buildOfflineUfcCareerPeriods(p,r,{asOf,measuredFighters:measure});
}
test("36-month roster gate is only provisional until membership evidence verified",()=>{
 const d=data();
 assert.equal(d.summary.rosterGateReady,true);
 assert.equal(d.summary.provisionalOnly,true);
 assert.equal(d.summary.eligibleCandidateRowsPrepared,1);
 assert.equal(d.summary.reviewOrUnresolvedCandidatesSkipped,1);
 assert.equal(d.fighters.review,undefined);
});
test("all indexed UFC career results are used, not truncated to five",()=>{
 const d=data(),f=d.fighters.alpha;
 assert.equal(f.indexedUfcBouts,12);
 assert.equal(f.options.find(x=>x.id==="10").enabled,true);
 assert.equal(f.periods["5"].record.wins,5);
 assert.equal(f.periods["10"].record.wins,10);
 assert.equal(f.periods.career.record.wins,12);
 assert.equal(f.measuredUfcBouts,0);
 assert.equal(f.periods.career.metrics.slpm,null);
 assert.equal(f.earliestIndexedUfcFight,"2025-01-12");
});
test("stats join requires matching opponent and date as well as bout ID",()=>{
 const measured={alpha:{scope:"ufc-only",name:"Alpha",careerBouts:[
  {boutId:"12",date:"2025-12-12",opponent:"Beta",cageSec:300,
   metrics:{sigLanded:10,sigAbsorbed:8,controlSec:90}},
  {boutId:"11",date:"2025-11-12",opponent:"Other",cageSec:300,
   metrics:{sigLanded:100,sigAbsorbed:2,controlSec:90}},
  {boutId:"10",date:"2025-10-11",opponent:"Beta",cageSec:300,
   metrics:{sigLanded:100,sigAbsorbed:2,controlSec:90}},
 ]}};
 const f=data(progress,roster,measured).fighters.alpha;
 assert.equal(f.measuredUfcBouts,1);
 assert.equal(f.periods["5"].metrics.slpm.measuredBouts,1);
 assert.equal(f.periods["5"].metrics.slpm.value,2);
 assert.equal(f.periods.career.metrics.slpm.measuredBouts,1);
});
test("old 18-month roster cannot be described as the new verified roster",()=>{
 const old=structuredClone(roster);
 old.activityCutoff="2025-05-13";
 const d=data(progress,old);
 assert.equal(d.summary.rosterGateReady,false);
 assert.equal(d.summary.expectedCutoff,"2023-11-13");
});
test("any reused source slug with contradictory numeric fighter IDs is review-only",()=>{
 const p=structuredClone(progress);
 p.bouts["13"]={...p.bouts["1"],id:"13",a:{id:"9",slug:"alpha",name:"Alpha"}};
 const d=data(p);
 assert.equal(d.fighters.alpha,undefined);
 assert.equal(d.summary.numericFighterIdCollisionsSkipped,1);
});
