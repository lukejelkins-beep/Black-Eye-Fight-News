import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {buildSnapshot} from "../scripts/build-ufc-fighter-v3.mjs";
const date="2026-11-13";
const recent=(other,outcomes)=>["m1","m2","m3"].map((id,i)=>({
 boutId:id,date:"2026-06-"+String(12-i).padStart(2,"0"),
 opponent:other,outcome:outcomes[i],method:outcomes[i]==="W"?(i===2?"submission":"KO"):"decision"
}));
const fighters=[
 {name:"A One",slug:"a-one",lastUfcFight:"2026-06-12",champion:true,
  recent:recent("B Two",["W","W","W"])},
 {name:"B Two",slug:"b-two",lastUfcFight:"2026-06-12",
  recent:recent("A One",["L","L","L"])},
 {name:"C Unknown",slug:"c-unknown",lastUfcFight:"2026-05-21",
  recent:[{boutId:"m4",date:"2026-05-21",opponent:"B Two",outcome:"W",method:null}]},
 {name:"D Inactive",slug:"d-inactive",lastUfcFight:"2024-01-01",
  recent:recent("A One",["W","W","W"])},
 {name:"E Active NoHistory",slug:"e-active",lastUfcFight:"2026-06-03",recent:[]}
];
const coverage={schema:1,scope:"ufc",asOf:date,activityCutoff:"2025-05-13",fighters};
function samples(name,landed,absorbed,takedowns,takedownAttempts){
 return {name,scope:"ufc-only",recentBouts:["m1","m2","m3"].map(id=>({
  boutId:id,cageSec:300,metrics:{sigLanded:landed,sigAttempted:landed+20,
   sigAbsorbed:absorbed,knockdowns:0,takedowns,takedownAttempts,
   controlSec:0,controlDifferentialSec:takedowns?60:-60,
   sigStrikeDifferential:landed-absorbed,subAttempts:0}
 }))};
}
const postfight={schema:1,scope:"ufc-only",fighters:{
 "a-one":samples("A One",30,10,1,3),
 "b-two":samples("B Two",10,30,0,2)
}};
const cohorts=[{schema:1,scope:"ufc-only",fighters:{
 "a-one":{name:"A One",organisation:"UFC",sport:"MMA",division:"Light heavyweight",
  category:"Champion",ranking:{rank:2,checkedAt:date}},
 "b-two":{name:"B Two",organisation:"UFC",sport:"MMA",division:"Light Heavyweight",
  category:"Roster",review:{credentialsChecked:true}}
}}];
const snapshot=()=>buildSnapshot(coverage,postfight,cohorts);
test("recent UFC bout samples are measured only from matching unique bout IDs",()=>{
 const d=snapshot(),a=d.fighters.aone,b=d.fighters.btwo;
 assert.equal(d.schema,4);
 assert.equal(d.population,4);
 assert.equal(Object.hasOwn(d.fighters,"dinactive"),false);
 assert.equal(a.recent.length,3);
 assert.equal(a.metrics.slpm.bouts,3);
 assert.equal(a.metrics.slpm.value,6);
 assert.equal(b.metrics.slpm.value,2);
 assert.equal(a.metrics.kd.value,0);
 assert.equal(a.metrics.control.value,0);
 assert.equal(a.metrics.net.value,180);
 assert.equal(a.metrics.tdDef.value,100);
 assert.equal(b.metrics.tdDef.value,66.666667);
 assert.equal(a.metrics.ko.value,2);
 assert.equal(a.metrics.submission.value,1);
 assert.equal(a.power,null);
 assert.equal(a.technical.grappling.score,null);
 assert.equal(a.officialRank,null,"unverified ranking URL must not be published");
 assert.equal(d.fighters.cunknown.metrics.slpm,undefined);
});
test("minimum three measured bouts governs UFC-wide and divisional rankings",()=>{
 const d=snapshot(),slpm=d.boards.find(x=>x.id==="slpm"),
  sapm=d.boards.find(x=>x.id==="sapm");
 assert.equal(slpm.eligible,2);
 assert.deepEqual(slpm.leaders.map(x=>x.name),["A One","B Two"]);
 assert.equal(d.fighters.aone.metrics.slpm.rank,1);
 assert.equal(d.fighters.btwo.metrics.slpm.rank,2);
 assert.equal(d.fighters.aone.metrics.slpm.divisionRank,1);
 assert.equal(d.fighters.btwo.metrics.slpm.divisionRank,2);
 assert.equal(sapm.leaders[0].name,"A One","lower absorption is better");
 assert.equal(d.fighters.aone.category,"Champion");
 assert.equal(d.fighters.btwo.category,"Unassessed",
  "a roster entry missing a complete UFC career review cannot be classified");
 assert.equal(d.fighters.cunknown.category,"Unassessed");
});
test("partial or zero denominator is not a fabricated rank or 100% accuracy",()=>{
 const modified=structuredClone(postfight);
 modified.fighters["a-one"].recentBouts[2].metrics.sigLanded=null;
 modified.fighters["a-one"].recentBouts[2].metrics.sigAttempted=null;
 modified.fighters["b-two"].recentBouts.forEach(x=>{
  x.metrics.takedownAttempts=0;
  x.metrics.takedowns=0;
 });
 const d=buildSnapshot(coverage,modified,cohorts);
 const a=d.fighters.aone;
 assert.equal(a.metrics.slpm.bouts,2);
 assert.equal(a.metrics.slpm.rank,undefined);
 assert.equal(a.metrics.tdDef,undefined);
 assert.equal(d.boards.find(x=>x.id==="slpm").eligible,1);
});
test("unconfirmed bout IDs cannot qualify knockout or submission leaderboards",()=>{
 const gap=structuredClone(coverage);
 gap.fighters[0].recent[1].boutId=null;
 const d=buildSnapshot(gap,postfight,cohorts);
 assert.equal(d.fighters.aone.metrics.ko.bouts,2);
 assert.equal(d.fighters.aone.metrics.ko.rank,undefined);
 assert.equal(d.fighters.aone.metrics.submission.rank,undefined);
 assert.deepEqual(d.fighters.eactivenohistory.recent,[]);
 assert.equal(d.fighters.eactivenohistory.power,null);
});
test("provider aliases for the same UFC bout are preserved without double-ranked stats",()=>{
 const dup=structuredClone(coverage);
 dup.fighters.push(
  {name:"Carlos Hernandez",slug:"carlos-hernandez",
   lastUfcFight:"2025-05-17",recent:[
    {date:"2025-05-17",opponent:"HyunSung Park",boutId:"60850",
     outcome:"L",method:"submission"}]},
  {name:"Carlos Hernandez",slug:"carlos-hernandez-7",
   lastUfcFight:"2025-05-17",recent:[
    {date:"2025-05-17",opponent:"Park Hyun-sung",boutId:"83242",
     outcome:"L",method:"submission"}]}
 );
 const d=buildSnapshot(dup,postfight,cohorts);
 assert.equal(d.population,5);
 assert.equal(d.identityReviewPending.length,1);
 assert.deepEqual(d.identityReviewPending[0].slugs,[
  "carlos-hernandez","carlos-hernandez-7"]);
 assert.deepEqual(d.fighters.carloshernandez.metrics,{});
 assert.equal(d.fighters.carloshernandez.recent.length,1);
});
test("same display names without overlapping dated opponents fail closed",()=>{
 const dup=structuredClone(coverage);
 dup.fighters.push(
  {name:"Carlos Hernandez",slug:"carlos-hernandez",lastUfcFight:"2025-05-17",
   recent:[{date:"2025-05-17",opponent:"HyunSung Park",boutId:"60850"}]},
  {name:"Carlos Hernandez",slug:"carlos-hernandez-7",lastUfcFight:"2026-08-17",
   recent:[{date:"2026-08-17",opponent:"Another Opponent",boutId:"83242"}]}
 );
 assert.throws(()=>buildSnapshot(dup,postfight,cohorts),/identity collision requires manual source review/);
});
test("no contests and unresolved outcomes cannot qualify measured UFC metrics",()=>{
 const c=structuredClone(coverage);
 c.fighters[0].recent[1].outcome="NC";
 const d=buildSnapshot(c,postfight,cohorts);
 assert.equal(d.fighters.aone.metrics.slpm.bouts,2);
 assert.equal(d.fighters.aone.metrics.slpm.rank,undefined);
 assert.equal(d.fighters.aone.metrics.ko.bouts,2);
 const c2=structuredClone(c);
 c2.fighters[0].recent[1].outcome=null;
 assert.equal(buildSnapshot(c2,postfight,cohorts).fighters.aone.metrics.slpm.bouts,2);
});
test("one UFC bout ID counts at most once even if repeated in imported history",()=>{
 const c=structuredClone(coverage);
 c.fighters[0].recent[1].boutId=c.fighters[0].recent[0].boutId;
 const d=buildSnapshot(c,postfight,cohorts);
 assert.equal(d.fighters.aone.recent.length,2);
 assert.equal(d.fighters.aone.metrics.slpm.bouts,2);
 assert.equal(d.fighters.aone.metrics.slpm.rank,undefined);
});
test("the separately scoped reviewed UFC champions catalogue is authoritative",()=>{
 const champions={schema:1,scope:"ufc-champions",fighters:{
  "a-one":{name:"A One",organisation:"UFC",sport:"MMA",
   category:"Champion",division:"Light heavyweight",
   review:{credentialsChecked:true},
   latest:[
    {date:"2026-06-12",opponent:"B Two",outcome:"L",method:"Submission R2"},
    {date:"2025-05-30",opponent:"UFC veteran",outcome:"W",method:"KO R1"}
   ]}
 }};
 const d=buildSnapshot(coverage,postfight,[champions]);
 assert.equal(d.fighters.aone.category,"Champion");
 assert.deepEqual(d.fighters.aone.recent.map(x=>x.opponent),
  ["B Two","UFC veteran"]);
 assert.equal(d.fighters.aone.recent[0].outcome,"L");
 assert.equal(d.fighters.aone.recent[1].boutId,null);
 assert.equal(d.fighters.aone.metrics.slpm.bouts,1);
});
test("the actual UFC champion source format remains recognised",()=>{
 const champions=JSON.parse(fs.readFileSync("data/ufc-champion-profiles.json","utf8"));
 assert.equal(champions.scope,"ufc-champions");
 assert.equal(champions.schema,1);
 const reviewed=Object.values(champions.fighters||{});
 assert(reviewed.length>=11);
 for(const f of reviewed){
  assert.equal(f.organisation,"UFC");
  assert.equal(f.sport,"MMA");
  assert.equal(f.review?.credentialsChecked,true);
 }
});
test("individually reviewed UFC results override conflicting provisional index results",()=>{
 const trusted={schema:1,scope:"ufc-only",fighters:{
  athlete:{name:"A One",organisation:"UFC",sport:"MMA",division:"Light heavyweight",
   category:"Champion",review:{credentialsChecked:true},
   latest:[
    {date:"2026-06-12",opponent:"B Two",outcome:"L",method:"Submission R2"},
    {date:"2026-06-11",opponent:"Different verified opponent",outcome:"W",method:"Decision R3"}
   ]}
 }};
 const d=buildSnapshot(coverage,postfight,[trusted]);
 const a=d.fighters.aone;
 assert.equal(a.recent.length,2);
 assert.deepEqual(a.recent.map(x=>[x.date,x.opponent,x.outcome,x.method]),[
  ["2026-06-12","B Two","L","Submission R2"],
  ["2026-06-11","Different verified opponent","W","Decision R3"]
 ]);
 assert.equal(a.recent[0].boutId,"m1","matching dated opponent retains observed UFC bout");
 assert.equal(a.recent[1].boutId,null,"unmatched provider result cannot receive another bout's statistics");
 assert.equal(a.metrics.slpm.bouts,1);
 assert.equal(a.metrics.slpm.rank,undefined);
});
test("a uniquely linked UFC bout one calendar day away keeps reviewed results authoritative",()=>{
 const shifted=structuredClone(coverage);
 shifted.fighters[0].recent[0].date="2026-06-13";
 const vetted={schema:1,scope:"ufc-champions",fighters:{
  a:{name:"A One",organisation:"UFC",sport:"MMA",category:"Champion",
   division:"Light Heavyweight",review:{credentialsChecked:true},
   latest:[{date:"2026-06-12",opponent:"B Two",outcome:"L",
    method:"Submission R1"}]}
 }};
 const d=buildSnapshot(shifted,postfight,[vetted]),f=d.fighters.aone;
 assert.equal(f.recent[0].date,"2026-06-12","keep the independently reviewed event-local date");
 assert.equal(f.recent[0].outcome,"L","never infer the outcome from the cached provider");
 assert.equal(f.recent[0].method,"Submission R1");
 assert.equal(f.recent[0].boutId,"m1","join only one unambiguous one-day-shifted bout");
 assert.equal(f.metrics.slpm.value,6);
 assert.equal(f.metrics.slpm.bouts,1);
});
test("two adjacent same-opponent UFC bout IDs cannot be assigned to one verified result",()=>{
 const ambiguous=structuredClone(coverage);
 ambiguous.fighters[0].recent[0].date="2026-06-13";
 ambiguous.fighters[0].recent[1].date="2026-06-11";
 ambiguous.fighters[0].recent[1].opponent="B Two";
 const vetted={schema:1,scope:"ufc-only",fighters:{
  a:{name:"A One",organisation:"UFC",sport:"MMA",category:"Champion",
   division:"Light Heavyweight",review:{credentialsChecked:true},
   latest:[{date:"2026-06-12",opponent:"B Two",outcome:"L",
    method:"Submission R1"}]}
 }};
 const d=buildSnapshot(ambiguous,postfight,[vetted]),f=d.fighters.aone;
 assert.equal(f.recent[0].boutId,null);
 assert.equal(f.metrics.slpm,undefined);
});
test("exact dated UFC result takes priority over a different one-day-offset bout",()=>{
 const ambiguous=structuredClone(coverage);
 ambiguous.fighters[0].recent[1].date="2026-06-13";
 ambiguous.fighters[0].recent[1].opponent="B Two";
 const vetted={schema:1,scope:"ufc-only",fighters:{
  a:{name:"A One",organisation:"UFC",sport:"MMA",category:"Champion",
   division:"Light Heavyweight",review:{credentialsChecked:true},
   latest:[{date:"2026-06-12",opponent:"B Two",outcome:"L",
    method:"Submission R1"}]}
 }};
 const d=buildSnapshot(ambiguous,postfight,[vetted]);
 assert.equal(d.fighters.aone.recent[0].boutId,"m1");
});
test("incomplete reviewed UFC roster stays Unassessed, not an invented contender",()=>{
 const vetted={schema:1,scope:"ufc-only",fighters:{
  c:{name:"C Unknown",organisation:"UFC",sport:"MMA",division:"Flyweight",
   category:"Roster",review:{credentialsChecked:true},
   ufcRecord:{wins:1,losses:0,draws:0,noContests:0,complete:true},
   latest:[{date:"2026-05-21",opponent:"B Two",outcome:"W",method:"Decision R3"}]}
 }};
 const d=buildSnapshot(coverage,postfight,[vetted]);
 assert.equal(d.fighters.cunknown.category,"Unassessed");
 assert.equal(d.fighters.cunknown.recent.length,1);
});
test("schema four cannot overwrite independently reviewed UFC classifications",()=>{
 const js=fs.readFileSync("assets/fighter-insights.js","utf8");
 assert.match(js,/if\(record&&!isReviewedUfc\(f\)\)/);
});
test("source mismatch and inconsistent snapshot dates stop publication",()=>{
 assert.throws(()=>buildSnapshot({},postfight),/Required saved/);
 assert.throws(()=>buildSnapshot(coverage,{schema:1,scope:"all"}),/Required saved/);
 assert.throws(()=>buildSnapshot(coverage,postfight,cohorts,{asOf:"2026-11-14"}),/date must match/);
});
