import test from "node:test";
import assert from "node:assert/strict";
import {auditUfcLastFive} from "../scripts/build-ufc-last-five-coverage.mjs";
test("36-month eligibility and older UFC history are separate",()=>{
 const progress={bouts:{
  "10":{id:"10",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-01",status:"completed",
   a:{id:"1",slug:"alpha",name:"Alpha"},b:{id:"2",slug:"beta",name:"Beta"},
   result:{winnerId:"1",method:"decision"}},
  "11":{id:"11",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2024-04-15",status:"completed",
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
 assert.equal(d.activityCutoff,"2023-11-13");
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
  const id=String(i);bouts[id]={id,org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-0"+i+"-02",status:"completed",
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
  bouts[id]={id,org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-01",status:"completed",
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
 const bouts={"1":{id:"1",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-01",status:"completed",
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
 const bout={id:"501",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-08",status:"completed",
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
 const bout=(id,date)=>({id,org:"ufc",event:"UFC Fight Night: Fixture",eventDate:date,status:"completed",
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
 const progress={bouts:{"501":{id:"501",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-08",
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
  bouts[id]={id,org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-0"+i+"-02",status:"completed",
   a:{id:"20",slug:"five-stats-gap",name:"Five Stats Gap"},
   b:{id:String(40+i),slug:"opponent-"+i,name:"Opponent "+i},
   result:{winnerId:"20",method:"decision"}};
  if(i<5)measured.push({boutId:id,metrics:{sigLanded:i}});
 }
 bouts["100"]={id:"100",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-07-01",status:"completed",
  a:{id:"22",slug:"short-measured",name:"Short Measured"},
  b:{id:"90",slug:"another-opponent",name:"Another Opponent"},
  result:{winnerId:"22",method:"decision"}};
 bouts["200"]={id:"200",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-08-01",status:"completed",
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
 const progress={bouts:{"501":{id:"501",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-08",status:"completed",
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
 const progress={bouts:{"30":{id:"30",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-06-08",status:"completed",
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

test("an untruncated, reconciled UFC timeline certifies an actual short career",()=>{
 const progress={bouts:{"100":{id:"100",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-10-01",status:"completed",
  a:{id:"71",slug:"athlete",name:"Athlete"},
  b:{id:"72",slug:"challenger",name:"Challenger"},
  result:{winnerId:"71",round:3,time:"5:00"}}}};
 const research={profiles:{athlete:{
  ufcTimeline:{complete:true,settledCount:1,observedOn:"2026-11-13"},
  recentHistory:[{source:"native",boutId:"100",date:"2026-10-01",
   opponent:"Challenger",promotion:"ufc",result:"win"}]}}};
 const postfight={fighters:{athlete:{name:"Athlete",scope:"ufc-only",
  recentBouts:[{boutId:"100",metrics:{sigLanded:0}}]}}};
 const audit=auditUfcLastFive(progress,research,postfight,{divisions:[]},
  {asOf:"2026-11-13"});
 const a=audit.fighters.find(f=>f.slug==="athlete");
 assert.equal(a.recentCount,1);
 assert.equal(a.ufcTimelineDepthConfirmed,true);
 assert.equal(a.needsHistoryCheck,false);
 assert.equal(a.evidenceStage,"shortLinkedMeasuredDepthConfirmed");
 assert.equal(audit.summary.withShortUfcTimelineReconciled,1);
 assert.equal(audit.summary.withUfcHistoryLinkedAndMeasured,1);
 assert.equal(Object.values(audit.summary.evidenceStages).reduce((a,b)=>a+b,0),
  audit.summary.activeFighters);
});

test("truncation, stale observations, unlinked IDs and inconsistent timeline counts cannot certify a short UFC career",()=>{
 const progress={bouts:{"100":{id:"100",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2026-10-01",status:"completed",
  a:{id:"71",slug:"athlete",name:"Athlete"},
  b:{id:"72",slug:"challenger",name:"Challenger"},
  result:{winnerId:"71"}}}};
 const timeline={complete:true,settledCount:1,observedOn:"2026-11-13"};
 const research={profiles:{athlete:{ufcTimeline:timeline,
  recentHistory:[{source:"native",boutId:"100",date:"2026-10-01",
   opponent:"Challenger",promotion:"ufc",result:"win"}]}}};
 const audit=(payload)=>auditUfcLastFive(progress,payload,{fighters:{}},
  {divisions:[]},{asOf:"2026-11-13"}).fighters.find(f=>f.slug==="athlete");
 const inconsistent=structuredClone(research);
 inconsistent.profiles.athlete.ufcTimeline.settledCount=2;
 assert.equal(audit(inconsistent).ufcTimelineDepthConfirmed,false);
 const truncated=structuredClone(research);
 truncated.profiles.athlete.ufcTimeline.complete=false;
 assert.equal(audit(truncated).needsHistoryCheck,true);
 const stale=structuredClone(research);
 stale.profiles.athlete.ufcTimeline.observedOn="2026-09-01";
 assert.equal(audit(stale).ufcTimelineDepthConfirmed,false);
 const unlinked=structuredClone(research);
 unlinked.profiles.athlete.recentHistory[0].source="history";
 delete unlinked.profiles.athlete.recentHistory[0].boutId;
 // The indexed fight remains linked, so add a second UFC history row.
 unlinked.profiles.athlete.recentHistory.push({date:"2024-02-01",
  opponent:"Earlier Challenger",promotion:"ufc",result:"loss",source:"history"});
 unlinked.profiles.athlete.ufcTimeline.settledCount=2;
 assert.equal(audit(unlinked).ufcTimelineDepthConfirmed,false);
});

test("DWCS and Road-to-UFC are separate MMA feeders, not UFC roster bouts",()=>{
 const mk=(id,slug,name,date,event,opponent)=>({
  id,org:"ufc",status:"completed",eventDate:date,event,
  a:{id,slug,name},b:{id:"9"+id,slug:"opponent-"+id,name:opponent},
  result:{winnerId:id,method:"decision"}});
 const bouts={
  "10":mk("10","active","Active","2026-07-12","UFC Fight Night: Test","First"),
  "11":mk("11","active","Active","2025-06-01","Dana White's Contender Series 88","Second"),
  "20":mk("20","dwcs-only","DWCS Only","2026-10-20","Dana White's Contender Series 96","Third"),
  "30":mk("30","road-only","Road Only","2026-09-01","Road To UFC: Test","Fourth"),
  "40":mk("40","returning","Returning","2026-02-12","UFC Fight Night: Test","Fifth"),
  "41":mk("41","returning","Returning","2026-09-03","Road to UFC: Test","Sixth")
 };
 const out=auditUfcLastFive({bouts},{profiles:{}},{fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(out.summary.recentUfcLabeledCandidates,10);
 assert.equal(out.summary.activeFighters,3,"Active, their opponent and Returning’s old official opponent qualify");
 assert.equal(out.summary.excludedWithoutRecentOfficialUfc,6);
 assert.equal(out.summary.excludedLaterNonUfcProfessionalMma,1);
 assert.equal(out.fighters.find(f=>f.slug==="active").recentCount,1,
  "a pre-UFC DWCS fight must not become one of their latest five UFC fights");
 assert.equal(out.fighters.some(f=>f.slug==="returning"),false);
 assert.equal(out.excluded.find(f=>f.slug==="returning").latestOtherMma.promotion,"road-to-ufc");
});

test("a newer recorded PFL professional MMA result overrides recent UFC activity",()=>{
 const bout=(id,org,event,date)=>({id,org,event,eventDate:date,status:"completed",
  a:{id:"1",slug:"athlete",name:"Athlete"},
  b:{id:"2",slug:org==="pfl"?"pfl-rival":"opponent",
   name:org==="pfl"?"PFL Rival":"Opponent"},result:{winnerId:"1"}});
 const out=auditUfcLastFive({bouts:{
  "10":bout("10","ufc","UFC Fight Night: Test","2026-05-01"),
  "20":bout("20","pfl","PFL World Championship","2026-09-01")
 }},{profiles:{}},{fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(out.summary.activeFighters,1,
  "UFC opponent remains eligible, but the PFL entrant must be excluded");
 assert.equal(out.summary.excludedLaterNonUfcProfessionalMma,1);
 assert.equal(out.fighters.some(f=>f.slug==="athlete"),false);
 assert.equal(out.excluded.find(f=>f.slug==="athlete").latestOtherMma.promotion,"pfl");
});

test("a more recent MMA-only promotion excludes; bare-knuckle and unknown sports stay for verification",()=>{
 const mk=(slug,name)=>({id:slug,org:"ufc",status:"completed",
  event:"UFC Fight Night: Test",eventDate:"2026-06-01",
  a:{id:slug,slug,name},b:{id:slug+"b",slug:slug+"-opponent",name:name+" Opp"},
  result:{winnerId:slug}});
 const history=(promotion)=>({recentHistory:[
  {date:"2026-08-01",promotion,opponent:"New Opponent",result:"win"}]});
 const out=auditUfcLastFive({bouts:{
  "1":mk("departed","Departed"),"2":mk("boxer","Boxer"),
  "3":mk("uncertain","Uncertain")
 }},{profiles:{departed:history("fnc"),boxer:history("bkfc"),
  uncertain:history("")}},{fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(out.summary.excludedLaterNonUfcProfessionalMma,1);
 assert.equal(out.fighters.some(f=>f.slug==="departed"),false);
 assert.equal(out.fighters.find(f=>f.slug==="boxer").needsLatestMmaVerification,false);
 assert.equal(out.fighters.find(f=>f.slug==="uncertain").needsLatestMmaVerification,true);
 assert.equal(out.summary.needsLatestMmaVerification,1);
});

test("RIZIN and ONE require exact MMA ruleset evidence, not promotion-wide assumptions",()=>{
 const mk=(slug)=>({id:slug,org:"ufc",status:"completed",
  event:"UFC 320: Fixture",eventDate:"2025-10-01",
  a:{id:slug,slug,name:slug},b:{id:slug+"x",slug:slug+"x",name:"Opponent "+slug},
  result:{winnerId:slug}});
 const records={profiles:{
  "mix":{recentHistory:[{date:"2026-08-11",promotion:"rizin",
   opponent:"Shoko Sato",result:"loss"}]},
  "one-fighter":{recentHistory:[{date:"2026-08-11",promotion:"one",
   opponent:"Thai Opponent",result:"loss"}]}}};
 const observed={bouts:{"1":mk("mix"),"2":mk("one-fighter")}};
 const evidence={fighters:{mix:[{date:"2026-08-11",promotion:"rizin",
  opponent:"Shoko Sato",ruleset:"mma",checkedAt:"2026-11-13",
  source:"https://www.fightmatrix.com/fighter-profile/Shoko%20Sato/28830/"}]}};
 const without=auditUfcLastFive(observed,records,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 assert.equal(without.summary.activeFighters,4);
 assert.equal(without.summary.needsLatestMmaVerification,2);
 const withEvidence=auditUfcLastFive(observed,records,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",verifiedMixedMma:evidence});
 assert.equal(withEvidence.summary.excludedLaterNonUfcProfessionalMma,1);
 assert.equal(withEvidence.fighters.some(f=>f.slug==="mix"),false);
 assert.equal(withEvidence.fighters.find(f=>f.slug==="one-fighter").needsLatestMmaVerification,true);
});

test("old legitimate UFC bouts remain in the five-fight window without a 36-month history cutoff",()=>{
 const athlete={id:"71",slug:"veteran",name:"Veteran"};
 const bout=(id,date)=>({id,org:"ufc",event:"UFC Fight Night: Test",eventDate:date,
  status:"completed",a:athlete,b:{id:id+"op",slug:"old-op-"+id,name:"Old Opp "+id},
  result:{winnerId:"71"}});
 const bouts={"1":bout("1","2026-05-01"),"2":bout("2","2021-03-05"),
  "3":bout("3","2020-02-20"),"4":bout("4","2019-01-01")};
 const out=auditUfcLastFive({bouts},{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 const veteran=out.fighters.find(f=>f.slug==="veteran");
 assert.deepEqual(veteran.recent.map(f=>f.date),
  ["2026-05-01","2021-03-05","2020-02-20","2019-01-01"]);
});

test("36-month cutoff includes the 24-to-36-month cohort and retains older UFC bouts",()=>{
 const mk=(id,slug,date)=>({id,org:"ufc",event:"UFC Fight Night: Audit fixture",
  eventDate:date,status:"completed",a:{id:"1",slug,name:slug},
  b:{id:String(Number(id)+100),slug:"opponent-"+id,name:"Opponent "+id},
  result:{winnerId:"1",method:"decision"}});
 const audit=auditUfcLastFive({bouts:{
  "400":mk("400","new-window","2024-02-01"),
  "401":mk("401","boundary","2023-11-13"),
  "402":mk("402","too-old","2023-11-12"),
  "403":mk("403","newer","2026-08-01")
 }},{profiles:{"new-window":{recentHistory:[
  {date:"2020-01-01",promotion:"ufc",opponent:"Earlier Opponent",result:"win"}
 ]}}},{fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 assert.equal(audit.activityCutoff,"2023-11-13");
 const names=new Set(audit.fighters.map(f=>f.slug));
 assert(names.has("new-window"));
 assert(names.has("boundary"));
 assert(names.has("newer"));
 assert(!names.has("too-old"));
 assert(audit.fighters.find(f=>f.slug==="new-window").recent.some(f=>f.date==="2020-01-01"));
});
test("36-month cohort is removed when more recent professional PFL MMA exists",()=>{
 const mk=(id,org,date,event)=>({id,org,event,eventDate:date,status:"completed",
  a:{id:"1",slug:"departed",name:"Departed"},
  b:{id:"2",slug:"other",name:"Other"},result:{winnerId:"1"}});
 const result=auditUfcLastFive({bouts:{
  "400":mk("400","ufc","2025-02-01","UFC Fight Night: Audit fixture"),
  "401":mk("401","pfl","2026-07-10","PFL audit fixture")
 }},{profiles:{}},{fighters:{}},{divisions:[]},{asOf:"2026-11-13"});
 assert(!result.fighters.some(f=>f.slug==="departed"));
 assert.equal(result.excluded.find(f=>f.slug==="departed").reason,"later_professional_mma_outside_ufc");
});

test("documented retirement and UFC departure exclude matching inactive roster snapshots",()=>{
 const mk=(id,slug,date)=>({id,org:"ufc",event:"UFC Fight Night: Scope fixture",eventDate:date,
  status:"completed",a:{id,slug,name:slug},b:{id:"other-"+id,slug:"opponent-"+id,name:"Opponent "+id},
  result:{winnerId:id}});
 const archive={asOf:"2026-11-13",excluded:[
  {slug:"retired",reason:"confirmed_retired",lastUfcFight:"2025-01-11",
   evidence:{source:"https://example.org/verified-retirement"}},
  {slug:"departed",reason:"confirmed_left_ufc",lastUfcFight:"2025-01-11",
   evidence:{source:"https://example.org/verified-departure"}},
  {slug:"returned",reason:"confirmed_retired",lastUfcFight:"2025-01-11",
   evidence:{source:"https://example.org/old-retirement"}},
  {slug:"unverified",reason:"confirmed_retired",lastUfcFight:"2025-01-11",
   evidence:{source:"unverified report"}}
 ]};
 const r=auditUfcLastFive({bouts:{
  "1":mk("1","retired","2025-01-11"),
  "2":mk("2","departed","2025-01-11"),
  "3":mk("3","returned","2025-01-11"),
  "4":mk("4","returned","2026-08-01"),
  "5":mk("5","unverified","2025-01-11")
 }},{profiles:{}},{fighters:{}},{divisions:[]},
 {asOf:"2026-11-13",rosterReview:archive});
 assert.equal(r.summary.excludedConfirmedRetired,1);
 assert.equal(r.summary.excludedConfirmedUfcExit,1);
 assert(r.excluded.some(f=>f.slug==="retired"&&f.reason==="confirmed_retired"));
 assert(r.excluded.some(f=>f.slug==="departed"&&f.reason==="confirmed_left_ufc"));
 assert(r.fighters.some(f=>f.slug==="returned"),"a later UFC return overrides stale exit evidence");
 assert(r.fighters.some(f=>f.slug==="unverified"),"an unsourced retirement cannot delete an athlete");
});
test("dated outside-UFC MMA evidence excludes the historical cohort without recent indexed PFL data",()=>{
 const row={id:"700",org:"ufc",event:"UFC Fight Night: Fixture",eventDate:"2024-05-01",
  status:"completed",a:{id:"1",slug:"outside",name:"Outside"},b:{id:"2",slug:"rival",name:"Rival"}};
 const review={asOf:"2026-11-13",excluded:[{
  slug:"outside",reason:"later_professional_mma_outside_ufc",lastUfcFight:"2024-05-01",
  evidence:{date:"2026-07-01",promotion:"pfl",source:"saved UFCalendar fighter history"}
 }]};
 const r=auditUfcLastFive({bouts:{"700":row}},{profiles:{}},{fighters:{}},{divisions:[]},
 {asOf:"2026-11-13",rosterReview:review});
 assert(!r.fighters.some(f=>f.slug==="outside"));
 assert.equal(r.excluded.find(f=>f.slug==="outside").reason,"later_professional_mma_outside_ufc");
});
