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
 assert.equal(p.measuredCount,5);
 assert.equal(p.needsStats,false);
 assert.equal(p.needsHistoryCheck,false);
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
 const valid=auditUfcLastFive({bouts},{profiles:{}},{
  fighters:{fighter:{name:"Fighter",scope:"ufc-only",
   recentBouts:[{boutId:"1",metrics:{sigLanded:0,controlSec:null}}]}}
 },{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(valid.fighters.find(x=>x.slug==="fighter").measuredCount,1);
});
