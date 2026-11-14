import test from "node:test";
import assert from "node:assert/strict";
import {scoreFighter,walkForwardBacktest,buildShadowRatings,MODEL_VERSION}
 from "../scripts/build-ufc-v4-shadow-ratings.mjs";
const metrics={
 sigLanded:34,sigAttempted:65,sigAbsorbed:20,
 sigStrikeDifferential:14,knockdowns:1,takedowns:2,
 takedownAttempts:3,subAttempts:1,reversals:1,
 controlSec:125,controlDifferentialSec:85,totalLanded:50,totalAttempted:100
};
const bout=(id,date,slug,opponentSlug,outcome="W",fields=metrics)=>({
 boutId:String(id),date,opponent:"Opponent "+opponentSlug,
 opponentSlug,outcome,cageSec:600,metrics:{...fields}});
const past=[
 bout(100,"2023-05-01","a","op1"),
 bout(101,"2024-05-01","a","op2"),
 bout(102,"2025-05-01","a","op3")];
test("small samples never silently produce public-grade technical ratings",()=>{
 const rows=[past[0],past[1]];
 const out=scoreFighter(rows,new Map(), "2026-01-01",5);
 assert.equal(out.overall,null);
 assert.equal(out.status,"insufficient_sample");
});
test("opponent priors and own ratings use only bouts before the as-of date",()=>{
 const t="2025-10-15",base=new Map([["a",past]]);
 const prior=scoreFighter(past,base,t,5);
 assert.notEqual(prior.overall,null);
 assert.equal(prior.externalCredentialBonus,0);
 const all=[...past,bout(777,"2026-09-01","a","op9","L",
  Object.fromEntries(Object.keys(metrics).map(k=>[k,0])))];
 base.set("a",all);
 const stable=scoreFighter(all,base,t,5);
 assert.deepEqual(stable,prior);
 assert.equal(MODEL_VERSION,"ufc-v4-shadow-0.1");
});
test("historical opponent strength excludes its future wins",()=>{
 const before=scoreFighter(past,new Map([["op1",[]],["op2",[]],["op3",[]]]),
  "2026-01-01",5);
 const enriched=new Map();
 for(let i=1;i<=3;i++){
  const key="op"+i;
  enriched.set(key,[
   bout("win"+i,"2027-02-01",key,"a","W"),
   bout("win2"+i,"2027-02-15",key,"a","W"),
   bout("win3"+i,"2027-05-15",key,"a","W")
  ]);
 }
 const after=scoreFighter(past,enriched,"2026-01-01",5);
 assert.deepEqual(after,before);
});
test("a retrospective backtest only predicts fights with both pre-fight rated corners",()=>{
 const opponent=[bout(200,"2023-03-01","b","o1","L"),
  bout(201,"2024-05-01","b","o2","L"),
  bout(202,"2025-06-01","b","o3","L")];
 const aResult=bout(500,"2025-10-01","a","b","W");
 const bResult=bout(500,"2025-10-01","b","a","L");
 const all=new Map([["a",[aResult,...past]],["b",[bResult,...opponent]]]);
 const r=walkForwardBacktest(all,{from:"2025-08-01"});
 assert.equal(r.fightsWithBothPrefightRatings,1);
 assert.equal(r.byYear["2025"].n,1);
 assert(r.brier>=0&&r.brier<=1);
 assert.equal(r.referenceBrier,0.25);
 const future={
  ...metrics,sigLanded:0,sigAttempted:40,sigAbsorbed:100,
  sigStrikeDifferential:-100};
 all.get("a").push(bout(999,"2026-05-01","a","b","L",future));
 const retest=walkForwardBacktest(all,{from:"2025-08-01"});
 assert.equal(retest.fightsWithBothPrefightRatings,1);
 assert.equal(retest.brier,r.brier,"future fights cannot alter backtest predictions");
});
test("shadow export never calls credential bonuses or certifies incomplete careers",()=>{
 const cohort=Array.from({length:783},(_,i)=>"fighter-"+i);
 const approval={status:"approved",approvedFighters:cohort};
 const fighters=Object.fromEntries(cohort.map(slug=>[slug,{
  name:slug,knownCareerBouts:0,careerCoverageStatus:"historical_completeness_unverified",
  ufcTimelineCertified:false,independentlyCertifiedCareer:false,
  windows:{career:{linkedMeasuredBouts:0}}}]));
 fighters["fighter-0"]={...fighters["fighter-0"],
  knownCareerBouts:3,windows:{career:{linkedMeasuredBouts:3}}};
 const foundation={scope:"ufc-only-v4-stat-foundation",population:783,
  asOf:"2026-11-14",fighters};
 const postfight={scope:"ufc-only",fighters:{
  "fighter-0":{careerBouts:past}
 }};
 const out=buildShadowRatings(approval,foundation,postfight);
 assert.equal(out.summary.approved,783);
 assert.equal(out.summary.historicalCareersCertified,0);
 assert.equal(out.summary.scoredLast5,1);
 assert.equal(out.summary.scoredLast5FullHorizon,0);
 assert.equal(out.summary.scoredLast10FullHorizon,0);
 assert.equal(out.summary.fewerThanThreeOfficialUfcBouts,782);
 assert.equal(out.summary.officialUfcHistoryLengthBands["3plus"],1);
 assert.equal(out.summary.atLeastThreeOfficialUfcBoutsUnrated,0);
 assert.equal(out.externalCredentialBonusesApplied,false);
 assert.equal(out.fighters["fighter-0"].windows.last5.externalCredentialBonus,0);
 assert.equal(out.fighters["fighter-1"].windows.last5.overall,null);
 assert.equal(out.status,"experimental_not_calibrated_not_public");
});

test("no-contests retain a chronological Last 5 slot and do not backfill older decisions",()=>{
 const rows=[
  bout(901,"2026-09-01","a","op-nc","NC"),
  bout(902,"2026-08-01","a","op1","W"),
  bout(903,"2026-07-01","a","op2","W"),
  bout(904,"2026-06-01","a","op3","W"),
  bout(905,"2026-05-01","a","op4","W"),
  bout(906,"2026-04-01","a","op5","L")
 ];
 const actual=scoreFighter(rows,new Map(),"2026-11-14",5);
 assert.equal(actual.fightsInChronologicalWindow,5);
 assert.equal(actual.noContestsInWindow,1);
 assert.equal(actual.bouts,4);
 assert.notEqual(actual.overall,null);
 const substituted=scoreFighter(rows.slice(1),new Map(),"2026-11-14",5);
 assert.equal(substituted.noContestsInWindow,0);
 assert.equal(substituted.bouts,5);
 assert.notEqual(actual.skills.form,substituted.skills.form,
  "a previously overlooked older loss must not enter the actual Last5 window");
});
