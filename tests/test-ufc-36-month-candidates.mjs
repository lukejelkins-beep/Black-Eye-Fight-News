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
