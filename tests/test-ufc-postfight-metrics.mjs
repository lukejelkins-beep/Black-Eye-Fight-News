import test from "node:test";
import assert from "node:assert/strict";
import {buildPostfightMetrics} from "../scripts/build-ufc-postfight-metrics.mjs";
const progress={bouts:{
 "100":{id:"100",org:"ufc",status:"completed",eventDate:"2026-11-10",
  event:"UFC Test",a:{id:"2",name:"Fighter Alpha",slug:"fighter-alpha"},
  b:{id:"3",name:"Fighter Beta",slug:"fighter-beta"},
  result:{round:2,time:"1:00",method:"ko_tko",winnerId:"2"}},
 "101":{id:"101",org:"ufc",status:"completed",eventDate:"2026-11-11",
  event:"UFC Test 2",a:{id:"2",name:"Fighter Alpha",slug:"fighter-alpha"},
  b:{id:"4",name:"Fighter Gamma",slug:"fighter-gamma"},
  result:{round:1,time:"5:00",method:"decision_unanimous",winnerId:"4"}},
 "102":{id:"102",org:"pfl",status:"completed",eventDate:"2026-11-10",
  a:{id:"2",name:"Fighter Alpha",slug:"fighter-alpha"},
  b:{id:"4",name:"Fighter Gamma",slug:"fighter-gamma"},
  result:{round:1,time:"5:00",winnerId:"2"}},
 "103":{id:"103",org:"ufc",status:"scheduled",eventDate:"2026-11-11",
  a:{id:"2",name:"Fighter Alpha",slug:"fighter-alpha"},
  b:{id:"4",name:"Fighter Gamma",slug:"fighter-gamma"},
  result:{round:1,time:"5:00",winnerId:"2"}}
}};
const row=(round,a,b)=>({round,a,b});
const archive={fights:{
 a:{promotion:"UFC",date:"2026-11-10",fighterA:"Fighter Alpha",fighterB:"Fighter Beta",
  rounds:[
   row(1,{sigLanded:10,totalLanded:15,controlSec:50,knockdowns:1,takedowns:1,subAttempts:0},
          {sigLanded:4,totalLanded:6,controlSec:10,knockdowns:0,takedowns:0,subAttempts:0}),
   row(2,{sigLanded:7,totalLanded:12,controlSec:20,knockdowns:1,takedowns:0,subAttempts:0},
          {sigLanded:1,totalLanded:3,controlSec:0,knockdowns:0,takedowns:0,subAttempts:0})]},
 b:{promotion:"UFC",date:"2026-11-11",fighterA:"Fighter Gamma",fighterB:"Fighter Alpha",
  rounds:[row(1,{sigLanded:5,totalLanded:11,controlSec:0,knockdowns:0,takedowns:0,subAttempts:0},
    {sigLanded:8,totalLanded:12,controlSec:12,knockdowns:0,takedowns:0,subAttempts:1})]}
}};
test("UFC-only, opponent orientation and idempotent per-bout totals",()=>{
 const m=buildPostfightMetrics(progress,archive,{asOf:"2026-11-12"});
 const a=m.fighters["fighter-alpha"];assert(a);
 assert.equal(a.trackedBouts,2);
 assert.equal(a.totals.totalLanded.value,39);
 assert.equal(a.totals.sigLanded.value,25);
 assert.equal(a.totals.sigStrikeDifferential.value,15);
 assert.equal(a.totals.controlSec.value,82);
 assert.equal(a.totals.controlDifferentialSec.value,72);
 assert.equal(a.totals.knockdowns.value,2);
 assert.equal(a.totals.subAttempts.value,1);
 assert.equal(a.recentBouts[0].opponent,"Fighter Gamma");
 assert.equal(a.recentBouts[0].outcome,"L");
 assert.equal(a.recentBouts[1].cageSec,360);
 assert.equal(m.metricBouts,2);
 assert.equal(m.fighters["fighter-gamma"].totals.sigStrikeDifferential.value,-3);
});
test("no false zeros for missing rounds, source conflicts or absent fields",()=>{
 const partial=structuredClone(archive);
 partial.fights.a.rounds[0].a.totalLanded=null;
 partial.fights.b.conflicts=[{round:1,metric:"sigLanded",chosen:5,alternative:4}];
 const out=buildPostfightMetrics(progress,partial,{asOf:"2026-11-12"});
 assert.equal(out.fighters["fighter-alpha"].totals.totalLanded.value,null);
 assert.equal(out.fighters["fighter-alpha"].totals.totalLanded.coveredBouts,0);
 assert.equal(out.metricBouts,1);
 assert(out.pending.some(x=>x.reason==="cross_source_metric_conflict"));
});
test("one-day UTC and event-local shift joins exactly one verified UFC bout",()=>{
 const shifted=structuredClone(archive);
 shifted.fights.a.date="2026-11-09";
 shifted.fights.a.event="UFC Test";
 const m=buildPostfightMetrics(progress,shifted,{asOf:"2026-11-12"});
 assert.equal(m.metricBouts,2);
 assert.equal(m.fighters["fighter-alpha"].trackedBouts,2);
 assert.equal(m.fighters["fighter-alpha"].totals.sigLanded.value,25);
});
test("ambiguous adjacent-date pairs do not gain statistics",()=>{
 const ambiguous=structuredClone(archive);
 ambiguous.fights.a.date="2026-11-09";
 ambiguous.fights.extra=structuredClone(ambiguous.fights.a);
 ambiguous.fights.extra.date="2026-11-11";
 const m=buildPostfightMetrics(progress,ambiguous,{asOf:"2026-11-12"});
 assert.equal(m.metricBouts,1);
 assert(m.pending.some(x=>x.boutId==="100"&&x.reason==="round_data_not_available"));
});
test("adjacent archived bout with a conflicting event is excluded",()=>{
 const mismatch=structuredClone(archive);
 mismatch.fights.a.date="2026-11-09";
 mismatch.fights.a.event="Different UFC Event";
 const m=buildPostfightMetrics(progress,mismatch,{asOf:"2026-11-12"});
 assert.equal(m.metricBouts,1);
 assert(m.pending.some(x=>x.boutId==="100"&&x.reason==="round_data_not_available"));
});
test("missing complete round rows are excluded instead of guessed",()=>{
 const partial=structuredClone(archive);
 partial.fights.a.rounds.pop();
 const out=buildPostfightMetrics(progress,partial,{asOf:"2026-11-12"});
 assert.equal(out.metricBouts,1);
 assert(out.pending.some(x=>x.reason==="round_coverage_incomplete"));
});

test("Contender Series tracked rounds do not contaminate official UFC-only statistics",()=>{
 const source=structuredClone(progress);
 source.bouts["100"].event="Dana White's Contender Series 91";
 const out=buildPostfightMetrics(source,archive,{asOf:"2026-11-12"});
 assert.equal(out.metricBouts,1);
 assert.equal(out.fighters["fighter-alpha"].trackedBouts,1);
 assert.equal(out.fighters["fighter-alpha"].totals.sigLanded.value,8);
});
