import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseMissingUfcBouts} from "../scripts/audit-ufc-v4-exception-causes.mjs";

const base=()=>{
 const fights={};
 const bouts={};
 const queue=[];
 for(let i=1;i<=5;i++){
  const id=String(600+i),date="2026-10-0"+i;
  queue.push({boutId:id,band:i<3?"last5":"career",priority:i<3?1:3,
   action:i===2?"manual_review":"inspect_saved_round_or_clock_data",
   references:[{fighterSlug:"alpha",careerPosition:i,date,opponent:"Beta "+i}]});
  bouts[id]={id,org:"ufc",event:"UFC Fight Night "+i,
   eventDate:date,status:"completed",a:{name:"Alpha"},b:{name:"Beta "+i},
   result:{round:1,time:"5:00"}};
 }
 const archives={
  "f2":{promotion:"UFC",date:"2026-10-02",fighterA:"Alpha",fighterB:"Beta 2",
   rounds:[{round:1,a:{sigLanded:5},b:{sigLanded:4}}]},
  "f3":{promotion:"UFC",date:"2026-10-03",fighterA:"Alpha",fighterB:"Beta 3",
   rounds:[]},
  "f4":{promotion:"UFC",date:"2026-10-04",fighterA:"Alpha",fighterB:"Beta 4",
   conflicts:["source conflict"],rounds:[{round:1,a:{sigLanded:5},b:{sigLanded:4}}]},
  "f5":{promotion:"UFC",date:"2026-10-05",fighterA:"Alpha",fighterB:"Beta 5",
   rounds:[{round:1,a:{sigLanded:5},b:{sigLanded:4}}]}
 };
 bouts["602"].result.time="unknown";
 return [{scope:"ufc-only-v4-stat-foundation",asOf:"2026-11-14",
  missingNativeBoutQueue:queue},{bouts}, {fights:archives}];
};
test("classifies five distinct cached causes without provider calls",()=>{
 const [f,p,a]=base();
 const out=diagnoseMissingUfcBouts(f,p,a);
 assert.deepEqual(out.cases.map(c=>c.cause),[
  "matching_round_archive_absent","finish_clock_unverified",
  "missing_or_incomplete_round_rows","archived_metric_source_conflict",
  "unexpected_postfight_join_gap"]);
 assert.equal(out.summary.distinctExceptions,5);
 assert.equal(out.summary.byPriorityBand.last5,2);
 assert.equal(out.summary.bySavedWorkflowAction.manual_review,1);
 assert.equal(out.cases[4].action,"inspect_saved_round_or_clock_data");
});
test("does not silently classify feeder or unindexed bout as measured",()=>{
 const [f,p,a]=base();
 p.bouts["601"].event="Road to UFC";
 delete p.bouts["602"];
 const out=diagnoseMissingUfcBouts(f,p,a);
 assert.equal(out.cases[0].cause,"official_ufc_event_identity_review");
 assert.equal(out.cases[1].cause,"native_fight_not_indexed");
});
test("rejects an input without an authoritative deduplicated V4 queue",()=>{
 assert.throws(()=>diagnoseMissingUfcBouts({}, {}, {}),/foundation/);
});
