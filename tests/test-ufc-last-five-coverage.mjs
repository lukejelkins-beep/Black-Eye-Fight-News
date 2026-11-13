import test from "node:test";
import assert from "node:assert/strict";
import {auditUfcLastFive} from "../scripts/build-ufc-last-five-coverage.mjs";
test("18-month eligibility and older UFC history are separate",()=>{
 const progress={bouts:{
  "10":{id:"10",org:"ufc",eventDate:"2026-06-01",status:"completed",
   a:{id:"1",slug:"alpha",name:"Alpha"},b:{id:"2",slug:"beta",name:"Beta"},
   result:{winnerId:"1",method:"decision"}},
  "11":{id:"11",org:"ufc",eventDate:"2024-04-15",status:"completed",
   a:{id:"1",slug:"alpha",name:"Alpha"},b:{id:"3",slug:"gamma",name:"Gamma"},
   result:{winnerId:"3",method:"ko_tko"}},
  "12":{id:"12",org:"pfl",eventDate:"2026-07-10",status:"completed",
   a:{id:"9",slug:"pfl-fighter",name:"PFL Fighter"},b:{id:"3",slug:"gamma",name:"Gamma"}}
 }};
 const research={profiles:{alpha:{recentHistory:[
  {date:"2024-04-15",opponent:"Gamma",result:"loss",promotion:"ufc",method:"ko_tko"},
  {date:"2023-09-10",opponent:"Zeta",result:"win",promotion:"ufc",method:"submission"},
  {date:"2023-02-10",opponent:"X",result:"win",promotion:"pfl"}]}}};
 const postfight={fighters:{alpha:{name:"Alpha",scope:"ufc-only",recentBouts:[{boutId:"10",metrics:{sigLanded:10}}]}}};
 const d=auditUfcLastFive(progress,research,postfight,{divisions:[{name:"Alpha"}]},{asOf:"2026-11-13"});
 assert.equal(d.activityCutoff,"2025-05-13");
 assert.equal(d.summary.activeFighters,2);
 assert.equal(d.summary.uniqueKnownBoutIds,2);
 const a=d.fighters.find(f=>f.slug==="alpha");
 assert.equal(a.champion,true);
 assert.deepEqual(a.recent.map(r=>r.date),["2026-06-01","2024-04-15","2023-09-10"]);
 assert.equal(a.measuredCount,1);
 assert.equal(a.needsHistoryCheck,true);
 assert.equal(a.evidenceStage,"shortUnlinked");
 assert.ok(a.recent.every(x=>x.origin==="ufc-bout-index"||x.origin==="ufc-history"));
 assert.equal(d.fighters.some(f=>f.slug==="gamma"||f.slug==="pfl-fighter"),false);
});
test("five measured UFC bouts qualify for later leaderboard computation",()=>{
 const bouts={},recentBouts=[];
 for(let i=1;i<=5;i++){
  const id=String(i);bouts[id]={id,org:"ufc",eventDate:"2026-0"+i+"-02",status:"completed",
   a:{id:"1",slug:"fighter",name:"Fighter"},b:{id:String(i+1),slug:"opponent-"+i,name:"Opponent "+i},
   result:{winnerId:"1",method:"decision"}};
  recentBouts.push({boutId:id,metrics:{sigLanded:i}});
 }
 const d=auditUfcLastFive({bouts},{profiles:{}},
  {fighters:{fighter:{name:"Fighter",scope:"ufc-only",recentBouts}}},
  {divisions:[]},{asOf:"2026-11-13"});
 const p=d.fighters.find(x=>x.slug==="fighter");
 assert.equal(p.recentCount,5);
 assert.equal(d.summary.withFiveLinkedIds,1);
 assert.equal(p.measuredCount,5);
 assert.equal(p.needsStats,false);
 assert.equal(p.needsHistoryCheck,false);
 assert.equal(p.evidenceStage,"fiveLinkedMeasured");
 assert.equal(d.summary.evidenceStages.fiveLinkedMeasured,1);
 assert.equal(d.summary.withThreeMeasured,1);
 assert.equal(d.summary.uniqueKnownBoutIds,5);
});

test("backfill queue prioritises champions, booked athletes and verified ranked athletes",()=>{
 const bouts={};
 for(const [id,name] of [["1","Roster Athlete"],["2","Booked Athlete"],
  ["3","Ranked Athlete"],["4","Champion Athlete"]]){
  bouts[id]={id,org:"ufc",eventDate:"2026-06-01",status:"completed",
   a:{id,slug:name.toLowerCase().replaceAll(" ","-"),name},
   b:{id:"99",slug:"common-opponent",name:"Common Opponent"},
   result:{winnerId:id,method:"decision"}};
 }
 const results=auditUfcLastFive({bouts},{profiles:{}},{fighters:{}},
  {divisions:[{name:"Champion Athlete"}]},{
   asOf:"2026-11-13",
   upcoming:{events:[{date:"2026-11-14",promotion:"UFC",
    bouts:[{fighters:["Booked Athlete","Other"],status:"confirmed"}]}]},
   ranked:[{fighters:{ranked:{name:"Ranked Athlete",
    ranking:{rank:6,source:"https://www.ufc.com/rankings",checkedAt:"2026-11-12"}}}}]
  });
 const chosen=results.fighters.filter(f=>f.slug!=="common-opponent");
 assert.deepEqual(chosen.map(f=>f.name),[
  "Champion Athlete","Booked Athlete","Ranked Athlete","Roster Athlete"]);
 assert.equal(chosen[0].champion,true);
 assert.equal(chosen[1].upcoming,true);
 assert.equal(chosen[2].ranked,true);
 assert.equal(chosen[3].upcoming,false);
});

test("a metrics object containing only unavailable values is not measured",()=>{
 const bouts={"1":{id:"1",org:"ufc",eventDate:"2026-06-01",status:"completed",
  a:{id:"11",slug:"fighter",name:"Fighter"},
  b:{id:"12",slug:"opponent",name:"Opponent"},
  result:{winnerId:"11",method:"decision"}}};
 const d=auditUfcLastFive({bouts},{profiles:{}},{
  fighters:{fighter:{name:"Fighter",scope:"ufc-only",
   recentBouts:[{boutId:"1",metrics:{sigLanded:null,controlSec:null,knockdowns:null}}]}}
 },{divisions:[]},{asOf:"2026-11-13"});
 const f=d.fighters.find(x=>x.slug==="fighter");
 assert.equal(f.measuredCount,0);
 assert.equal(f.needsStats,true);
 assert.equal(f.evidenceStage,"shortLinkedStatsGap");
 const valid=auditUfcLastFive({bouts},{profiles:{}},{
  fighters:{fighter:{name:"Fighter",scope:"ufc-only",
   recentBouts:[{boutId:"1",metrics:{sigLanded:0,controlSec:null}}]}}
 },{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(valid.fighters.find(x=>x.slug==="fighter").measuredCount,1);
});

test("UTC/local one-day shift links a text-only UFC history row to its confirmed bout ID",()=>{
 const bout={id:"501",org:"ufc",eventDate:"2026-06-08",status:"completed",
  a:{id:"1",slug:"alpha",name:"Alpha"},b:{id:"2",slug:"beta",name:"Beta"},
  result:{winnerId:"1",method:"decision"}};
 const research={profiles:{alpha:{recentHistory:[
  {date:"2026-06-09",opponent:"Beta",result:"win",promotion:"ufc",method:"decision"}]}}};
 const d=auditUfcLastFive({bouts:{"501":bout}},research,
  {fighters:{alpha:{name:"Alpha",scope:"ufc-only",recentBouts:[
   {boutId:"501",metrics:{sigLanded:10}}]}}},
  {divisions:[]},{asOf:"2026-11-13"});
 const a=d.fighters.find(f=>f.slug==="alpha");
 assert.equal(a.recentCount,1,"the one fight must not appear twice");
 assert.equal(a.recent[0].boutId,"501");
 assert.equal(a.measuredCount,1);
 assert.equal(a.evidenceStage,"shortLinkedMeasuredDepthUnconfirmed");
 assert.equal(d.summary.shiftedDateAliasesJoined,1);
 assert.equal(d.summary.withFiveLinkedIds,0);
});
test("distinct confirmed IDs are never merged across one-day date shifts",()=>{
 const bout=(id,date)=>({id,org:"ufc",eventDate:date,status:"completed",
  a:{id:"1",slug:"alpha",name:"Alpha"},b:{id:"2",slug:"beta",name:"Beta"},
  result:{winnerId:"1",method:"decision"}});
 const d=auditUfcLastFive({bouts:{
  "501":bout("501","2026-06-08"),
  "502":bout("502","2026-06-10")}},
  {profiles:{alpha:{recentHistory:[
   {date:"2026-06-09",opponent:"Beta",result:"win",promotion:"ufc",method:"decision"}]}}},
  {fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 const a=d.fighters.find(f=>f.slug==="alpha");
 assert.equal(a.recentCount,3,"ambiguous neighbouring fights stay separate");
 assert.deepEqual(new Set(a.recent.map(x=>x.boutId).filter(Boolean)),new Set(["501","502"]));
 assert.equal(d.summary.shiftedDateAliasesJoined,0);
});
test("one-day date alias is not enough without a confirmed UFC bout ID",()=>{
 const progress={bouts:{"501":{id:"501",org:"ufc",eventDate:"2026-06-08",
  status:"completed",a:{id:"1",slug:"alpha",name:"Alpha"},
  b:{id:"2",slug:"beta",name:"Beta"},result:{winnerId:"1"}}}};
 const d=auditUfcLastFive(progress,{profiles:{alpha:{recentHistory:[
  {date:"2026-06-09",opponent:"Different Athlete",result:"win",promotion:"ufc"}]}}},
  {fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(d.fighters.find(x=>x.slug==="alpha").recentCount,2);
 assert.equal(d.summary.shiftedDateAliasesJoined,0);
});

test("the six evidence stages partition every active fighter without asserting short-career completion",()=>{
 const bouts={},measured=[];
 for(let i=1;i<=5;i++){
  const id=String(i);
  bouts[id]={id,org:"ufc",eventDate:"2026-0"+i+"-02",status:"completed",
   a:{id:"20",slug:"five-stats-gap",name:"Five Stats Gap"},
   b:{id:String(40+i),slug:"opponent-"+i,name:"Opponent "+i},
   result:{winnerId:"20",method:"decision"}};
  if(i<5)measured.push({boutId:id,metrics:{sigLanded:i}});
 }
 bouts["100"]={id:"100",org:"ufc",eventDate:"2026-07-01",status:"completed",
  a:{id:"22",slug:"short-measured",name:"Short Measured"},
  b:{id:"90",slug:"another-opponent",name:"Another Opponent"},
  result:{winnerId:"22",method:"decision"}};
 bouts["200"]={id:"200",org:"ufc",eventDate:"2026-08-01",status:"completed",
  a:{id:"23",slug:"five-unlinked",name:"Five Unlinked"},
  b:{id:"91",slug:"third-opponent",name:"Third Opponent"},
  result:{winnerId:"23",method:"decision"}};
 const research={profiles:{"five-unlinked":{recentHistory:[
  {date:"2026-07-01",opponent:"Older One",promotion:"ufc",result:"win"},
  {date:"2026-06-01",opponent:"Older Two",promotion:"ufc",result:"win"},
  {date:"2026-05-01",opponent:"Older Three",promotion:"ufc",result:"loss"},
  {date:"2026-04-01",opponent:"Older Four",promotion:"ufc",result:"win"}]}}};
 const postfight={fighters:{
  first:{name:"Five Stats Gap",scope:"ufc-only",recentBouts:measured},
  second:{name:"Short Measured",scope:"ufc-only",recentBouts:[
   {boutId:"100",metrics:{sigLanded:0}}]}
 }};
 const d=auditUfcLastFive({bouts},research,postfight,{divisions:[]},
  {asOf:"2026-11-13"});
 assert.equal(d.fighters.find(f=>f.slug==="five-stats-gap").evidenceStage,
  "fiveLinkedStatsGap");
 assert.equal(d.fighters.find(f=>f.slug==="short-measured").evidenceStage,
  "shortLinkedMeasuredDepthUnconfirmed");
 assert.equal(d.fighters.find(f=>f.slug==="five-unlinked").evidenceStage,
  "fiveUnlinked");
 assert.equal(Object.values(d.summary.evidenceStages).reduce((a,b)=>a+b,0),
  d.summary.activeFighters);
 assert.equal(d.summary.evidenceStages.fiveLinkedStatsGap,1);
 assert.equal(d.summary.evidenceStages.fiveUnlinked,1);
 assert.equal(d.summary.evidenceStages.shortLinkedMeasuredDepthUnconfirmed,1);
 assert.equal(d.fighters.find(f=>f.slug==="short-measured").needsHistoryCheck,true,
  "one fully measured known fight cannot prove the fighter only has one UFC fight");
});

test("native career history fight ID links older UFC fights without an indexed card",()=>{
 const progress={bouts:{"501":{id:"501",org:"ufc",eventDate:"2026-06-08",status:"completed",
  a:{id:"1",slug:"alpha",name:"Alpha"},b:{id:"2",slug:"beta",name:"Beta"},
  result:{winnerId:"1",round:3,time:"5:00"}}}};
 const research={profiles:{alpha:{recentHistory:[
  {source:"native",boutId:"501",date:"2026-06-09",opponent:"Beta",
   result:"win",promotion:"ufc"},
  {source:"native",boutId:"499",date:"2024-06-01",opponent:"Old Opponent",
   result:"loss",promotion:"ufc"},
  {source:"history",boutId:"777",date:"2023-02-01",opponent:"Other",
   result:"win",promotion:"ufc"}]}}};
 const postfight={fighters:{alpha:{name:"Alpha",scope:"ufc-only",
  recentBouts:[{boutId:"501",metrics:{sigLanded:22}}]}}};
 const d=auditUfcLastFive(progress,research,postfight,{divisions:[]},
  {asOf:"2026-11-13"});
 const f=d.fighters.find(x=>x.slug==="alpha");
 assert.equal(f.recentCount,3,"the UTC/local native fight ID must deduplicate");
 assert.deepEqual(f.recent.map(x=>x.boutId),["501","499",null]);
 assert.equal(f.measuredCount,1);
 assert.equal(d.summary.shiftedDateAliasesJoined,1);
 assert.equal(f.evidenceStage,"shortUnlinked",
  "unverified public-record ID cannot be promoted into confirmed UFC stats");
});

test("native history ID on a local-date alias cannot duplicate an indexed UFC fight",()=>{
 const progress={bouts:{"30":{id:"30",org:"ufc",eventDate:"2026-06-08",status:"completed",
  a:{id:"1",slug:"athlete",name:"Athlete"},b:{id:"2",slug:"challenger",name:"Challenger"},
  result:{winnerId:"1"}}}};
 const history={profiles:{athlete:{recentHistory:[
  {date:"2026-06-07",opponent:"Challenger",promotion:"ufc",result:"win",
   boutId:"30",source:"native"}]}}};
 const d=auditUfcLastFive(progress,history,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 const f=d.fighters.find(x=>x.slug==="athlete");
 assert.equal(f.recentCount,1);
 assert.equal(f.recent[0].boutId,"30");
 assert.equal(d.summary.shiftedDateAliasesJoined,1);
});
