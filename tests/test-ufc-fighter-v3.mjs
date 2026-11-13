import test from "node:test";
import assert from "node:assert/strict";
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
  recent:recent("A One",["W","W","W"])}
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
 assert.equal(d.population,3);
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
 assert.equal(d.fighters.btwo.category,"Roster");
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
test("source mismatch and inconsistent snapshot dates stop publication",()=>{
 assert.throws(()=>buildSnapshot({},postfight),/Required saved/);
 assert.throws(()=>buildSnapshot(coverage,{schema:1,scope:"all"}),/Required saved/);
 assert.throws(()=>buildSnapshot(coverage,postfight,cohorts,{asOf:"2026-11-14"}),/date must match/);
});
