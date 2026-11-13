import test from "node:test";
import assert from "node:assert/strict";
import {auditUfcLastFive} from "../scripts/build-ufc-last-five-coverage.mjs";
test("18-month eligibility and older UFC history are separate",()=>{
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

test("latest completed professional MMA promotion controls activity, not oldest UFC results",()=>{
 const bouts={},profiles={};
 const ufc=(name,slug,id,date)=>{bouts[id]={id,org:"ufc",event:"UFC Fight Night: Fixture",status:"completed",eventDate:date,
  a:{id:"101",slug,name},b:{id:"202",slug:"other-"+slug,name:"Opponent "+slug},
  result:{winnerId:"101",round:3,time:"5:00"}}};
 const hist=(slug,history)=>{profiles[slug]={recentHistory:history}};
 const h=(date,promotion,opponent,sport)=>({date,promotion,opponent,sport,
  result:"win",method:"decision"});
 ufc("Moved To PFL","moved-pfl","11","2026-06-01");
 ufc("Moved To PFL","moved-pfl","12","2020-07-01");
 hist("moved-pfl",[h("2026-10-01","pfl","New Opponent"),
   h("2020-07-01","ufc","Old UFC Opponent")]);
 ufc("Back At UFC","returned-ufc","13","2026-09-01");
 hist("returned-ufc",[h("2026-02-01","pfl","Old PFL Opponent")]);
 ufc("Bareknuckle Later","bkfc-later","14","2026-07-01");
 hist("bkfc-later",[h("2026-09-01","bkfc","Boxing Opponent")]);
 ufc("Unknown Sport","unknown-after","15","2026-06-01");
 hist("unknown-after",[h("2026-08-01","","Unclassified Opponent")]);
 ufc("Same Day Alias","same-day","16","2026-06-01");
 hist("same-day",[h("2026-06-01","","Opponent same-day")]);
 ufc("Mixed Promotion","mixed-sport","17","2026-06-01");
 hist("mixed-sport",[h("2026-08-01","one","ONE Athlete"),
  h("2026-09-01","one","Grappler","grappling")]);
 ufc("ONE MMA","one-mma","18","2026-06-01");
 hist("one-mma",[h("2026-08-01","one","MMA Opponent","mma")]);
 ufc("Indexed PFL","indexed-pfl","19","2026-06-01");
 bouts["20"]={id:"20",org:"pfl",status:"completed",eventDate:"2026-10-01",
  a:{id:"101",slug:"indexed-pfl",name:"Indexed PFL"},
  b:{id:"205",slug:"new-pfl-opponent",name:"New PFL Opponent"}};
 ufc("Outside Window","outside-window","21","2024-05-01");
 const d=auditUfcLastFive({bouts},{profiles},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 const bySlug=slug=>d.fighters.find(x=>x.slug===slug);
 assert.equal(bySlug("moved-pfl"),undefined);
 assert.equal(bySlug("indexed-pfl"),undefined);
 assert.equal(bySlug("one-mma"),undefined);
 assert.equal(bySlug("outside-window"),undefined);
 assert(bySlug("returned-ufc"));
 assert(bySlug("bkfc-later"));
 assert(bySlug("same-day"));
 assert.equal(bySlug("same-day").eligibilityStatus,"latest_observed_mma_ufc");
 assert.equal(bySlug("mixed-sport").eligibilityStatus,"review_required",
  "ONE's unlabelled bout cannot be presumed professional MMA");
 assert.equal(bySlug("unknown-after").eligibilityStatus,"review_required");
 assert.deepEqual(d.eligibilityExcluded.map(x=>x.slug).sort(),
  ["indexed-pfl","moved-pfl","one-mma"]);
 assert.equal(d.summary.excludedLaterNonUfcMma,3);
 assert.equal(d.summary.latestPromotionReviewRequired,2);
 assert.equal(d.summary.recentUfcActivityCandidates,
  d.summary.activeFighters+d.summary.excludedLaterNonUfcMma);
 assert.equal(d.summary.activeFighters,
  d.summary.noKnownLaterMmaOrUnknown+d.summary.latestPromotionReviewRequired);
 const box=d.fighters.find(x=>x.slug==="bkfc-later");
 assert.equal(box.lastUfcFight,"2026-07-01");
 const allKnown=d.fighters.flatMap(f=>f.recent);
 assert(allKnown.every(b=>b.origin==="ufc-bout-index"||b.origin==="ufc-history"),
  "a non-UFC performance must never be substituted into a UFC last-five");
});

test("unconfirmed fight rulesets are held for review, not treated as UFC departures",()=>{
 const bouts={"1":{id:"1",org:"ufc",event:"UFC Fight Night: Fixture",status:"completed",eventDate:"2026-06-01",
  a:{id:"1",slug:"fighter",name:"Fighter"},
  b:{id:"2",slug:"opponent",name:"Opponent"},result:{winnerId:"1"}}};
 const records={profiles:{fighter:{recentHistory:[
  {date:"2026-07-01",promotion:"rizin",opponent:"Mixed-sport contender",result:"win"},
  {date:"2026-08-01",promotion:"ambiguous-fc",opponent:"Unknown ruleset",result:"win"},
  {date:"2026-09-01",promotion:"one",sport:"grappling",
   opponent:"Grappling contender",result:"win"}]}}};
 const d=auditUfcLastFive({bouts},records,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 const f=d.fighters.find(x=>x.slug==="fighter");
 assert(f);
 assert.equal(f.eligibilityStatus,"review_required");
 assert.equal(d.summary.excludedLaterNonUfcMma,0);
 assert.equal(d.eligibilityReview.find(x=>x.slug==="fighter").evidence.promotion,"ambiguous-fc");
});

test("recent DWCS or Road-to-UFC alone does not qualify as an official UFC roster fight",()=>{
 const mk=(id,name,slug,date,event,opp)=>({id,org:"ufc",status:"completed",
  eventDate:date,event,a:{id,slug,name},
  b:{id:"opp"+id,slug:"opponent-"+id,name:opp},result:{winnerId:id}});
 const bouts={
  "10":mk("10","Active","active","2026-07-01","UFC Fight Night: Test","First"),
  "11":mk("11","Active","active","2025-06-01","Dana White's Contender Series 88","Second"),
  "20":mk("20","DWCS Only","dwcs-only","2026-10-20","Dana White's Contender Series 96","Third"),
  "30":mk("30","Road Only","road-only","2026-09-01","Road To UFC: Test","Fourth"),
  "40":mk("40","Returning","returning","2026-02-12","UFC Fight Night: Test","Fifth"),
  "41":mk("41","Returning","returning","2026-09-03","Road to UFC: Test","Sixth")
 };
 const result=auditUfcLastFive({bouts},{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 assert.equal(result.summary.recentUfcActivityCandidates,10);
 assert.equal(result.summary.excludedWithoutRecentOfficialUfc,6);
 assert.equal(result.summary.excludedLaterNonUfcMma,1);
 assert.equal(result.summary.activeFighters,3);
 assert.equal(result.fighters.find(f=>f.slug==="active").recentCount,1,
  "earlier DWCS contest cannot count as a UFC last-five bout");
 assert.equal(result.fighters.some(f=>f.slug==="returning"),false);
 assert.equal(result.eligibilityExcluded.find(f=>f.slug==="returning").evidence.promotion,
  "road-to-ufc");
 assert.equal(result.eligibilityExcluded.length,7);
});

test("RIZIN requires exact verified MMA ruleset evidence before excluding a UFC athlete",()=>{
 const progress={bouts:{"1":{id:"1",org:"ufc",event:"UFC 320: Example",
  eventDate:"2025-10-01",status:"completed",
  a:{id:"1",slug:"fighter",name:"Fighter"},
  b:{id:"2",slug:"opponent",name:"Opponent"},result:{winnerId:"1"}}}};
 const career={profiles:{fighter:{recentHistory:[{date:"2026-08-11",
  promotion:"rizin",opponent:"Shoko Sato",result:"loss"}]}}};
 const without=auditUfcLastFive(progress,career,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 assert.equal(without.summary.activeFighters,2);
 assert.equal(without.fighters.find(f=>f.slug==="fighter").eligibilityStatus,"review_required");
 const evidence={fighters:{fighter:[{date:"2026-08-11",promotion:"rizin",
  opponent:"Shoko Sato",ruleset:"mma",checkedAt:"2026-11-13",
  source:"https://www.fightmatrix.com/fighter-profile/Shoko%20Sato/28830/"}]}};
 const confirmed=auditUfcLastFive(progress,career,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",verifiedMixedMma:evidence});
 assert.equal(confirmed.summary.excludedLaterNonUfcMma,1);
 assert.equal(confirmed.fighters.some(f=>f.slug==="fighter"),false);
});
