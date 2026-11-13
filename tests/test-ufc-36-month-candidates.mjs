import test from "node:test";
import assert from "node:assert/strict";
import {candidateManifest,melbourneResearchDay} from "../scripts/build-ufc-36-month-candidates.mjs";
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

test("36-month archived exclusions and stale UFC returns are correctly handled",()=>{
 const progress={historicalWindowMonthsUfc:36,historicalComplete:{ufc:true},bouts:{
  "100":bout(100,"2025-01-11","Retired","retired","First","first"),
  "101":bout(101,"2025-01-11","Returned","returned","Second","second"),
  "102":bout(102,"2026-07-11","Returned","returned","Third","third"),
  "103":bout(103,"2025-01-11","Pending","pending","Fourth","fourth"),
  "104":bout(104,"2024-04-11","Moved","moved","Fifth","fifth"),
  "105":bout(105,"2024-04-11","Unsourced","unsourced","Sixth","sixth")
 }};
 const rosterReview={asOf:"2026-11-13",excluded:[
  {slug:"retired",lastUfcFight:"2025-01-11",reason:"confirmed_retired",
   evidence:{source:"https://www.ufc.com/news/retirement"}},
  {slug:"returned",lastUfcFight:"2025-01-11",reason:"confirmed_left_ufc",
   evidence:{source:"https://www.ufc.com/news/old"}},
  {slug:"moved",lastUfcFight:"2024-04-11",reason:"later_professional_mma_outside_ufc",
   evidence:{date:"2025-04-11",source:"archived fight",promotion:"pfl"}},
  {slug:"unsourced",lastUfcFight:"2024-04-11",reason:"confirmed_retired",
   evidence:{source:"not independently documented"}}
 ],reviewCandidates:[{slug:"pending",lastUfcFight:"2025-01-11"}]};
 const x=candidateManifest(progress,{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",rosterReview});
 assert(!x.fighters.some(f=>f.slug==="retired"));
 assert(!x.fighters.some(f=>f.slug==="moved"));
 assert(x.fighters.some(f=>f.slug==="returned"));
 assert(x.fighters.some(f=>f.slug==="unsourced"));
 assert.equal(x.fighters.find(f=>f.slug==="pending").eligibilityStatus,"review_required");
 assert.equal(x.summary.excludedConfirmedRetired,1);
 assert.equal(x.summary.excludedLaterNonUfcMma,1);
 const existing=auditUfcLastFive(progress,{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",rosterReview});
 assert.equal(existing.activityMonths,18);
 assert.equal(existing.summary.excludedConfirmedRetired,0);
});

test("completed official UFC event detail must be cached before certifying the 36-month scan",()=>{
 const base={historicalWindowMonthsUfc:36,historicalComplete:{ufc:true},bouts:{},
  eventIndex:{
   "ufc:647":{org:"ufc",date:"2023-11-18",status:"completed",title:"UFC Fight Night: Allen vs Craig"},
   "ufc:feeder":{org:"ufc",date:"2024-01-01",status:"completed",title:"Road to UFC: Asia"},
   "ufc:upcoming":{org:"ufc",date:"2026-12-01",status:"scheduled",title:"UFC Fight Night: Future"},
   "ufc:old":{org:"ufc",date:"2023-10-20",status:"completed",title:"UFC 294"}
  },eventDetails:{}};
 const args=[{profiles:{}},{fighters:{}},{divisions:[]},{asOf:"2026-11-13"}];
 const pending=candidateManifest(base,...args);
 assert.equal(pending.indexCompleteness,"36_month_event_scan_incomplete");
 assert.equal(pending.officialCompletedEventsIndexed,1);
 assert.equal(pending.missingOfficialUfcEventDetails,1);
 assert.deepEqual(pending.missingOfficialEventKeys,["ufc:647"]);
 base.eventDetails["ufc:647"]="2026-11-13T20:28:00Z";
 const complete=candidateManifest(base,...args);
 assert.equal(complete.indexCompleteness,"36_month_event_scan_complete");
 assert.equal(complete.missingOfficialUfcEventDetails,0);
 assert.deepEqual(complete.missingOfficialEventKeys,[]);
});
test("completed historical detail is still required if UFC event-list pagination finished",()=>{
 const progress={historicalWindowMonthsUfc:36,historicalComplete:{ufc:true},
  eventIndex:{"ufc:651":{org:"ufc",date:"2024-01-20",status:"completed",title:"UFC 297"}},
  eventDetails:{},bouts:{}};
 const x=candidateManifest(progress,{profiles:{}},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13"});
 assert.equal(x.indexCompleteness,"36_month_event_scan_incomplete");
});

test("source-backed MMA disqualifies but a verified later BJJ match does not",()=>{
 const progress={bouts:{
  "1":bout(1,"2024-11-02","Fighter A","fighter-a","UFC Opp A","ufc-opp-a"),
  "2":bout(2,"2026-06-06","Fighter B","fighter-b","UFC Opp B","ufc-opp-b"),
  "3":bout(3,"2025-01-01","Fighter C","fighter-c","UFC Opp C","ufc-opp-c")
 }};
 const research={profiles:{
  "fighter-a":{recentHistory:[{date:"2026-03-28",opponent:"New MMA Rival",result:"loss",promotion:""}]},
  "fighter-b":{recentHistory:[{date:"2026-09-24",opponent:"Grappling Rival",result:"loss",promotion:""}]},
  "fighter-c":{recentHistory:[{date:"2026-07-01",opponent:"Unknown Rival",result:"loss",promotion:""}]}
 }};
 const evidenceReview={asOf:"2026-11-13",fighters:{
  "fighter-a":[{date:"2026-03-28",opponent:"New MMA Rival",ruleset:"mma",
   checkedAt:"2026-11-13",source:"https://example.org/mma"}],
  "fighter-b":[{date:"2026-09-24",opponent:"Grappling Rival",ruleset:"grappling",
   checkedAt:"2026-11-13",source:"https://example.org/bjj"}],
  "fighter-c":[{date:"2026-07-01",opponent:"Unknown Rival",ruleset:"mma",
   checkedAt:"2026-11-14",source:"not-a-url"}]
 }};
 const args=[progress,research,{fighters:{}},{divisions:[]}];
 const checked=candidateManifest(...args,{asOf:"2026-11-13",evidenceReview});
 assert(!checked.fighters.some(f=>f.slug==="fighter-a"));
 assert.equal(checked.fighters.find(f=>f.slug==="fighter-b").eligibilityStatus,
  "latest_observed_mma_ufc");
 assert.equal(checked.fighters.find(f=>f.slug==="fighter-c").eligibilityStatus,
  "review_required");
 assert.equal(checked.eligibilityExcluded.find(f=>f.slug==="fighter-a").evidence.source,
  "https://example.org/mma");
 const existing=auditUfcLastFive(...args,
  {asOf:"2026-11-13",verifiedOtherBoutRulesets:evidenceReview});
 assert.equal(existing.activityMonths,18);
 assert.equal(existing.fighters.find(f=>f.slug==="fighter-b").eligibilityStatus,
  "review_required");
});
test("dated departure is ignored after a verified later UFC return",()=>{
 const progress={bouts:{
  "11":bout(11,"2024-04-13","Fighter X","fighter-x","X Opp","x-opp"),
  "12":bout(12,"2024-04-13","Fighter Y","fighter-y","Y Opp","y-opp"),
  "13":bout(13,"2026-09-01","Fighter Y","fighter-y","Z Opp","z-opp")
 }};
 const evidenceReview={asOf:"2026-11-13",departures:[
  {slug:"fighter-x",lastUfcFight:"2024-04-13",reason:"confirmed_left_ufc",
   evidence:{source:"https://example.org/exit"}},
  {slug:"fighter-y",lastUfcFight:"2024-04-13",reason:"confirmed_left_ufc",
   evidence:{source:"https://example.org/old-exit"}}
 ]};
 const args=[progress,{profiles:{}},{fighters:{}},{divisions:[]}];
 const checked=candidateManifest(...args,{asOf:"2026-11-13",evidenceReview});
 assert(!checked.fighters.some(f=>f.slug==="fighter-x"));
 assert(checked.fighters.some(f=>f.slug==="fighter-y"));
 assert.equal(checked.summary.excludedConfirmedUfcExit,1);
 const futureReview=candidateManifest(...args,{asOf:"2026-11-13",
   evidenceReview:{...evidenceReview,asOf:"2026-11-14"}});
 assert(futureReview.fighters.some(f=>f.slug==="fighter-x"));
});

test("verified kickboxing, Muay Thai and other non-MMA disciplines do not disqualify",()=>{
 const sports=["kickboxing","muay-thai","boxing","grappling",
  "submission-grappling","bjj","wrestling","bare-knuckle-boxing","custom-striking","karate"];
 const bouts={},profiles={},fighters={};
 for(let i=0;i<sports.length;i++){
  const slug="fighter-"+i,opp="Later Opponent "+i;
  bouts[String(100+i)]=bout(100+i,"2025-06-16","Fighter "+i,slug,"UFC Rival "+i,"ufc-rival-"+i);
  profiles[slug]={recentHistory:[{date:"2026-07-27",opponent:opp,
   promotion:"",result:"loss"}]};
  fighters[slug]=[{date:"2026-07-27",opponent:opp,ruleset:sports[i],
   checkedAt:"2026-11-13",source:"https://example.org/verified-"+i}];
 }
 const reviewed={asOf:"2026-11-13",fighters};
 const args=[{bouts},{profiles},{fighters:{}},{divisions:[]}];
 const a=candidateManifest(...args,{asOf:"2026-11-13",evidenceReview:reviewed});
 for(let i=0;i<sports.length;i++){
  const row=a.fighters.find(x=>x.slug==="fighter-"+i);
  assert(row,"non-MMA cannot exclude "+sports[i]);
  assert.equal(row.eligibilityStatus,"latest_observed_mma_ufc",
   "the independently verified "+sports[i]+" contest is not an MMA departure");
 }
 const old=auditUfcLastFive(...args,{asOf:"2026-11-13",
  verifiedOtherBoutRulesets:reviewed});
 assert.equal(old.activityMonths,18);
 assert.equal(old.fighters.find(x=>x.slug==="fighter-0").eligibilityStatus,
  "review_required","36-month evidence cannot affect public 18-month processing");
});

test("verified non-MMA cannot suppress actual MMA or mismatched opponent records",()=>{
 const bouts={
  "1":bout(1,"2025-03-01","Mixed Fighter","mixed-fighter","Rival 1","rival-1"),
  "2":bout(2,"2025-03-01","Wrong Opponent","wrong-opponent","Rival 2","rival-2"),
  "3":bout(3,"2025-03-01","Verified MMA","verified-mma","Rival 3","rival-3")
 };
 const profiles={
  "mixed-fighter":{recentHistory:[{date:"2026-07-27",
   opponent:"Later Opponent",promotion:"",sport:"mma",result:"loss"}]},
  "wrong-opponent":{recentHistory:[{date:"2026-07-27",
   opponent:"Actual Opponent",promotion:"",result:"loss"}]},
  "verified-mma":{recentHistory:[{date:"2026-07-27",
   opponent:"Verified Opponent",promotion:"",result:"loss"}]}
 };
 const evidence={asOf:"2026-11-13",fighters:{
  "mixed-fighter":[{date:"2026-07-27",opponent:"Later Opponent",
   ruleset:"kickboxing",checkedAt:"2026-11-13",source:"https://example.org/one"}],
  "wrong-opponent":[{date:"2026-07-27",opponent:"Different Opponent",
   ruleset:"muay-thai",checkedAt:"2026-11-13",source:"https://example.org/two"}],
  "verified-mma":[{date:"2026-07-27",opponent:"Verified Opponent",
   ruleset:"mma",checkedAt:"2026-11-13",source:"https://example.org/three"}]
 }};
 const out=candidateManifest({bouts},{profiles},{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",evidenceReview:evidence});
 assert(!out.fighters.some(f=>f.slug==="mixed-fighter"),
  "a provider-tagged MMA fight remains MMA despite contradictory later evidence");
 assert.equal(out.fighters.find(f=>f.slug==="wrong-opponent").eligibilityStatus,
  "review_required","mismatched opponent cannot clear an unrelated mystery fight");
 assert(!out.fighters.some(f=>f.slug==="verified-mma"),
  "independently verified later professional MMA must exclude");
});

test("later Road-to-UFC MMA is not an official UFC roster fight; UFC BJJ remains non-MMA",()=>{
 const progress={bouts:{
  "11":bout(11,"2024-05-18","Victor Example","victor-example","UFC Rival","ufc-rival"),
  "12":bout(12,"2025-06-01","Grappler Example","grappler-example","UFC Rival 2","ufc-rival-2"),
  "13":{...bout(13,"2026-05-28","Feeder Only","feeder-only",
    "Road Rival","road-rival"),event:"Road To UFC Season 5: Opening Rounds"}
 }};
 const research={profiles:{
  "victor-example":{recentHistory:[{date:"2026-05-28",opponent:"Rongzhu",
   promotion:"",result:"loss"}]},
  "grappler-example":{recentHistory:[{date:"2026-05-28",opponent:"BJJ Rival",
   promotion:"",result:"loss"}]}
 }};
 const review={asOf:"2026-11-13",fighters:{
  "victor-example":[{date:"2026-05-28",opponent:"Rongzhu",ruleset:"mma",
   promotion:"road-to-ufc",checkedAt:"2026-11-13",
   source:"https://www.ufc.com/video/157154"}],
  "grappler-example":[{date:"2026-05-28",opponent:"BJJ Rival",ruleset:"grappling",
   promotion:"ufc-bjj",checkedAt:"2026-11-13",
   source:"https://www.ufc.com/news/ufc-bjj"}]
 }};
 const out=candidateManifest(progress,research,{fighters:{}},{divisions:[]},
  {asOf:"2026-11-13",evidenceReview:review});
 assert(!out.fighters.some(f=>f.slug==="victor-example"),
  "completed professional MMA on a feeder show is not an official UFC match");
 assert(!out.fighters.some(f=>f.slug==="feeder-only"),
  "a feeder bout alone cannot establish UFC roster activity");
 assert(out.fighters.some(f=>f.slug==="grappler-example"),
  "UFC BJJ alone does not disqualify a fighter with a recent official UFC bout");
 assert.equal(out.eligibilityExcluded.find(f=>f.slug==="victor-example").evidence.source,
  "https://www.ufc.com/video/157154");
});

test("default roster research day respects Melbourne midnight, not UTC midnight",()=>{
 assert.equal(melbourneResearchDay(new Date("2026-11-13T21:45:00Z")),"2026-11-14");
 assert.equal(melbourneResearchDay(new Date("2026-11-13T10:00:00Z")),"2026-11-13");
 assert.equal(melbourneResearchDay(new Date("2026-11-14T13:30:00Z")),"2026-11-15");
});

test("official UFC active confirmation clears only matching legacy roster flag",()=>{
 const bout=(id,date,slug,opponent)=>({id:String(id),org:"ufc",
  event:"UFC Fight Night: Example",eventDate:date,status:"completed",
  a:{name:slug,slug,id:11},b:{name:opponent,slug:opponent,id:12},
  result:{winnerId:"11",round:3,time:"5:00"}});
 const progress={bouts:{"100":bout(100,"2025-03-01","fighter-a","rival-a"),
  "101":bout(101,"2025-03-01","fighter-b","rival-b")}};
 const review={asOf:"2026-11-13",excluded:[],
  reviewCandidates:[{slug:"fighter-a",lastUfcFight:"2025-03-01"},
   {slug:"fighter-b",lastUfcFight:"2025-03-01"}]};
 const confirmed=slug=>({slug,lastUfcFight:"2025-03-01",status:"active",
  checkedAt:"2026-11-14",source:"https://www.ufc.com/athlete/"+slug});
 const evidence={asOf:"2026-11-14",confirmedCurrentRoster:[
  confirmed("fighter-a"),confirmed("fighter-b")]};
 const args=[progress,{profiles:{}},{fighters:{}},{divisions:[]}];
 const out=candidateManifest(...args,{asOf:"2026-11-14",rosterReview:review,
  evidenceReview:evidence});
 assert.equal(out.fighters.find(f=>f.slug==="fighter-a").eligibilityStatus,
  "latest_observed_mma_ufc");
 assert.equal(out.fighters.find(f=>f.slug==="fighter-b").eligibilityStatus,
  "latest_observed_mma_ufc");
 const unknown=candidateManifest(progress,{profiles:{"fighter-a":{recentHistory:[
  {date:"2026-01-01",opponent:"Another",result:"win",promotion:""}]}}},
  {fighters:{}},{divisions:[]},{asOf:"2026-11-14",rosterReview:review,evidenceReview:evidence});
 assert.equal(unknown.fighters.find(f=>f.slug==="fighter-a").eligibilityStatus,
  "review_required","a later unknown ruleset is still an exception");
 const wrong=candidateManifest(...args,{asOf:"2026-11-14",rosterReview:review,
  evidenceReview:{...evidence,confirmedCurrentRoster:[
   {...confirmed("fighter-a"),lastUfcFight:"2024-01-01"},
   {...confirmed("fighter-b"),source:"https://example.org/athlete/fighter-b"}]}});
 assert.equal(wrong.summary.latestPromotionReviewRequired,2);
});

test("direct official UFC Not Fighting status excludes from confirmed active roster only",()=>{
 const ufc=(id,date,slug)=>({id:String(id),org:"ufc",
  event:"UFC Fight Night: Test",eventDate:date,status:"completed",
  a:{slug,name:slug,id:11},b:{slug:"opponent",name:"Opponent",id:12},
  result:{winnerId:"11",round:3}});
 const opts={asOf:"2026-11-14",rosterReview:{asOf:"2026-11-13",
  reviewCandidates:[{slug:"f-a",lastUfcFight:"2025-03-01"}]}};
 const not=slug=>({slug,lastUfcFight:"2025-03-01",status:"not_fighting",
  checkedAt:"2026-11-14",source:"https://www.ufc.com/athlete/"+slug});
 const args=[{bouts:{"1":ufc(1,"2025-03-01","f-a")}},
   {profiles:{}},{fighters:{}},{divisions:[]}];
 const x=candidateManifest(...args,{...opts,evidenceReview:{
   asOf:"2026-11-14",confirmedNotFighting:[not("f-a")]}});
 assert.ok(!x.fighters.some(f=>f.slug==="f-a"));
 assert.equal(x.summary.excludedOfficialNotFighting,1);
 assert.equal(x.eligibilityExcluded.find(e=>e.slug==="f-a").reason,
   "official_ufc_status_not_fighting");
 const stale=candidateManifest({bouts:{...args[0].bouts,"2":ufc(2,"2026-10-01","f-a")}},
   ...args.slice(1),{...opts,evidenceReview:{asOf:"2026-11-14",
     confirmedNotFighting:[not("f-a")]}});
 assert.ok(stale.fighters.some(f=>f.slug==="f-a"),
   "a fresh official UFC return overrides historical Not Fighting");
 const untrusted=candidateManifest(...args,{...opts,evidenceReview:{
   asOf:"2026-11-14",confirmedNotFighting:[
    {...not("f-a"),source:"https://example.org/fake"}]}});
 assert.equal(untrusted.fighters.find(f=>f.slug==="f-a").eligibilityStatus,
   "review_required");
 const public18=auditUfcLastFive(...args,{asOf:"2026-11-14",
   activityMonths:18,rosterReview:opts.rosterReview});
 const baseline18=auditUfcLastFive(...args,{asOf:"2026-11-14",
   activityMonths:18});
 assert.deepEqual(public18,baseline18,
   "36-month classification must not modify public 18-month roster");
});
