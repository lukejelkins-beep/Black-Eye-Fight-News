import test from "node:test";
import assert from "node:assert/strict";
import {auditConflicts} from "../scripts/audit-ufc-v4-source-conflicts.mjs";
test("quarantines source-conflicted UFC core metrics while identifying secondary-only disputes",()=>{
 const diagnostic={scope:"ufc-v4-exception-diagnostics",cases:[
  {boutId:"61",band:"last5",cause:"archived_metric_source_conflict"},
  {boutId:"62",band:"last5",cause:"archived_metric_source_conflict"}
 ]};
 const progress={bouts:{
  "61":{id:"61",event:"UFC Test Event",eventDate:"2026-10-02",a:{name:"Alpha"},b:{name:"Beta"}},
  "62":{id:"62",event:"UFC Test Event",eventDate:"2026-10-03",a:{name:"Gamma"},b:{name:"Delta"}}
 }};
 const archive={fights:{
  "a":{date:"2026-10-02",promotion:"UFC",fighterA:"Alpha",fighterB:"Beta",
   conflicts:[{round:1,metric:"headLanded",corner:"a",source:"ufcalendar"}]},
  "b":{date:"2026-10-03",promotion:"UFC",fighterA:"Gamma",fighterB:"Delta",
   conflicts:[{round:1,metric:"sigLanded",corner:"b",source:"cito"},
    {round:1,metric:"bodyLanded",corner:"b",source:"ufcalendar"}]}
 }};
 const out=auditConflicts(diagnostic,progress,archive);
 assert.equal(out.summary.cases,2);
 assert.equal(out.summary.coreAffected,1);
 assert.equal(out.summary.secondaryOnly,1);
 assert.deepEqual(out.cases[1].disputedCoreFields,["sigLanded"]);
 assert.equal(out.summary.conflictEntriesByMetric.headLanded,1);
 assert.equal(out.summary.byEvent["UFC Test Event"].fights,2);
 assert.match(out.cases[0].recommendation,/secondary/);
});
test("cannot treat an ambiguous archive match as verified",()=>{
 const d={scope:"ufc-v4-exception-diagnostics",cases:[{
  boutId:"61",band:"last5",cause:"archived_metric_source_conflict"}]};
 const p={bouts:{"61":{event:"UFC Test",eventDate:"2026-10-02",
  a:{name:"Alpha"},b:{name:"Beta"}}}};
 const f={date:"2026-10-02",promotion:"UFC",fighterA:"Alpha",fighterB:"Beta",conflicts:[]};
 const a={fights:{"a":f,"b":f}};
 const out=auditConflicts(d,p,a);
 assert.equal(out.summary.cases,0);
 assert.equal(out.summary.sourceArchiveNotUniquelyMatched,1);
});
