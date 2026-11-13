import test from "node:test";
import assert from "node:assert/strict";
import {candidateManifest} from "../scripts/build-ufc-36-month-candidates.mjs";
import {auditUfcLastFive} from "../scripts/build-ufc-last-five-coverage.mjs";

const bout=(id,date,a,as,b,bs)=>({
 id:String(id),org:"ufc",event:"UFC Fight Night: Test",eventDate:date,
 status:"completed",a:{name:a,slug:as,id:1},b:{name:b,slug:bs,id:2},
 result:{winnerId:"1",round:3,time:"5:00"}
});
test("36-month candidate scope does not change existing public 18-month rules",()=>{
 const progress={historicalWindowMonthsUfc:36,historicalComplete:{ufc:true},bouts:{
  "42":bout(42,"2024-02-01","Veteran","veteran","Opponent","opponent"),
  "14":bout(14,"2009-01-01","Veteran","veteran","Earlier","earlier")
 }};
 const opts={asOf:"2026-11-13"};
 const x=candidateManifest(progress,{profiles:{}},{fighters:{}},{divisions:[]},opts);
 const existing=auditUfcLastFive(progress,{profiles:{}},{fighters:{}},{divisions:[]},opts);
 assert.equal(x.activityMonths,36);
 assert.equal(x.activityCutoff,"2023-11-13");
 assert.equal(existing.activityMonths,18);
 assert.equal(existing.activityCutoff,"2025-05-13");
 assert.ok(x.fighters.find(f=>f.slug==="veteran"));
 assert.ok(!existing.fighters.some(f=>f.slug==="veteran"));
 assert.equal(x.indexCompleteness,"36_month_event_scan_complete");
 assert.match(x.verification,/pending/);
 assert.equal(x.fighters.find(f=>f.slug==="veteran").recentCount,2);
});
test("an 18-month-only indexed cache must never be certified as a complete 36-month scan",()=>{
 const x=candidateManifest({bouts:{},historicalWindowMonthsUfc:18,
  historicalComplete:{ufc:true}},{profiles:{}},{fighters:{}},
  {divisions:[]},{asOf:"2026-11-13"});
 assert.equal(x.indexCompleteness,"36_month_event_scan_incomplete");
});

test("36-month archived exclusions and stale UFC returns are correctly handled",()=>{
 const progress={historicalWindowMonthsUfc:36,historicalComplete:{ufc:true},bouts:{
  "100":bout(100,"2025-01-11","Retired","retired","First","first"),
  "101":bout(101,"2025-01-11","Returned","returned","Second","second"),
  "102":bout(102,"2026-07-11","Returned","returned","Third","third"),
  "103":bout(103,"2025-01-11","Pending","pending","Fourth","fourth"),
  "104":bout(104,"2024-04-11","Moved","moved","Fifth","fifth"),
  "105":bout(105,"2024-04-11","Unsourced","unsourced","Sixth","sixth")
 }};
 const rosterReview={asOf:"2026-11-13",excluded:[
  {slug:"retired",lastUfcFight:"2025-01-11",reason:"confirmed_retired",
   evidence:{source:"https://www.ufc.com/news/retirement"}},
  {slug:"returned",lastUfcFight:"2025-01-11",reason:"confirmed_left_ufc",
   evidence:{source:"https://www.ufc.com/news/old"}},
  {slug:"moved",lastUfcFight:"2024-04-11",reason:"later_professional_mma_outside_ufc",
   evidence:{date:"2025-04-11",source:"archived fight",promotion:"pfl"}},
  {slug:"unsourced",lastUfcFight:"2024-04-11",reason:"confirmed_retired",
   evidence:{source:"not independently documented"}}
 ],reviewCandidates:[{slug:"pending",lastUfcFight:"2025-01-11"}]};
 const x=candidateManifest(progress,{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",rosterReview});
 assert(!x.fighters.some(f=>f.slug==="retired"));
 assert(!x.fighters.some(f=>f.slug==="moved"));
 assert(x.fighters.some(f=>f.slug==="returned"));
 assert(x.fighters.some(f=>f.slug==="unsourced"));
 assert.equal(x.fighters.find(f=>f.slug==="pending").eligibilityStatus,"review_required");
 assert.equal(x.summary.excludedConfirmedRetired,1);
 assert.equal(x.summary.excludedLaterNonUfcMma,1);
 const existing=auditUfcLastFive(progress,{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",rosterReview});
 assert.equal(existing.activityMonths,18);
 assert.equal(existing.summary.excludedConfirmedRetired,0);
});
