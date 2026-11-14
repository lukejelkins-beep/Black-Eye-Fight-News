import test from "node:test";
import assert from "node:assert/strict";
import {buildPostfightMetrics} from "../scripts/build-ufc-postfight-metrics.mjs";
import {buildV4StatFoundation} from "../scripts/build-ufc-v4-stat-foundation.mjs";

function fixtures(){
 const progress={bouts:{}},archive={fights:{}},history=[];
 for(let i=1;i<=12;i++){
  const id=String(500+i),date="2026-10-"+String(i).padStart(2,"0");
  const opponent="Opponent "+i;
  progress.bouts[id]={id,org:"ufc",status:"completed",eventDate:date,
   event:"UFC Fight Night "+i,
   a:{id:"1",name:"Fighter Alpha",slug:"fighter-alpha"},
   b:{id:String(100+i),name:opponent,slug:"opponent-"+i},
   result:{round:1,time:"5:00",method:"decision_unanimous",winnerId:"1"}};
  history.push({source:"native",boutId:id,date,promotion:"UFC",
   result:"win",opponent});
  // The most recent UFC bout exists in verified history, but its round
  // observations are missing. It must occupy a Last 5 and Last 10 slot.
  if(i===12)continue;
  archive.fights["fight-"+id]={promotion:"UFC",date,
   fighterA:"Fighter Alpha",fighterB:opponent,
   rounds:[{round:1,
    a:{sigLanded:i,sigAttempted:i+2,controlSec:20,knockdowns:0,
     takedowns:1,takedownAttempts:2,subAttempts:0,reversals:0},
    b:{sigLanded:1,sigAttempted:3,controlSec:0,knockdowns:0,
     takedowns:0,takedownAttempts:1,subAttempts:0,reversals:0}}]};
 }
 const approval={schema:1,scope:"ufc-36-month-roster",status:"approved",
  approvedBy:"user",rosterAsOf:"2026-11-14",
  approvedFighters:["fighter-alpha","unknown-fighter"]};
 const research={profiles:{"fighter-alpha":{name:"Fighter Alpha",
  ufcTimeline:{complete:false},recentHistory:history},
  "unknown-fighter":{name:"Unknown Fighter",recentHistory:[]}}};
 return {progress,archive,approval,research};
}
test("postfight output exposes full measured UFC career without changing last-five data",()=>{
 const {progress,archive}=fixtures();
 const measured=buildPostfightMetrics(progress,archive,{asOf:"2026-11-14"});
 const fighter=measured.fighters["fighter-alpha"];
 assert.equal(fighter.trackedBouts,11);
 assert.equal(fighter.careerBouts.length,11);
 assert.equal(fighter.recentBouts.length,5);
 assert.equal(fighter.recentBouts[0].boutId,"511");
 assert.equal(fighter.careerBouts[10].boutId,"501");
 assert.equal(new Set(fighter.careerBouts.map(x=>x.boutId)).size,11);
 assert.equal(measured.metricBouts,11);
 assert(measured.pending.some(x=>x.boutId==="512"&&
  x.reason==="round_data_not_available"));
});
test("V4 Last 5/10 are chronological, not last five or ten measured bouts",()=>{
 const {progress,archive,approval,research}=fixtures();
 const measured=buildPostfightMetrics(progress,archive,{asOf:"2026-11-14"});
 const result=buildV4StatFoundation(approval,research,progress,measured,
  {asOf:"2026-11-14"});
 const f=result.fighters["fighter-alpha"];
 assert.equal(result.population,2);
 assert.equal(f.knownCareerBouts,12);
 assert.deepEqual([f.windows.last5.knownBouts,
  f.windows.last5.linkedMeasuredBouts],[5,4]);
 assert.deepEqual([f.windows.last10.knownBouts,
  f.windows.last10.linkedMeasuredBouts],[10,9]);
 assert.deepEqual([f.windows.career.knownBouts,
  f.windows.career.linkedMeasuredBouts],[12,11]);
 assert.equal(f.windows.last5.totals.sigLanded,8+9+10+11);
 assert.equal(f.windows.last10.totals.sigLanded,3+4+5+6+7+8+9+10+11);
 assert.equal(f.windows.last5.rates.sigAccuracyPercent.coveredBouts,4);
 assert.equal(f.windows.last5.metricCoverage.sigLanded.bouts,4);
 assert.equal(f.careerCoverageStatus,"provider_completeness_unverified");
 assert.equal(f.v4Scores,null);
 assert.equal(f.externalCredentialBonusApplied,false);
 assert.equal(result.summary.fightersWithFiveMeasuredLatestBouts,0);
 assert.equal(result.summary.fightersWithTenMeasuredLatestBouts,0);
 assert.equal(result.summary.distinctLinkedMeasuredUfcFights,11);
 const unknown=result.fighters["unknown-fighter"];
 assert.equal(unknown.windows.last5.knownBouts,0);
 assert.equal(unknown.windows.last5.totals.sigLanded,null);
 assert.equal(unknown.windows.last5.rates.sigLandedPerMinute.value,null);
});
test("V4 must not treat old recent-five-only cache as full career",()=>{
 const {progress,archive,approval,research}=fixtures();
 const measured=buildPostfightMetrics(progress,archive,{asOf:"2026-11-14"});
 delete measured.fighters["fighter-alpha"].careerBouts;
 assert.throws(()=>buildV4StatFoundation(approval,research,progress,measured,
  {asOf:"2026-11-14"}),/Full measured career cache required/);
});
test("missing fields do not turn into zeros or inflate per-metric exposure",()=>{
 const {progress,archive,approval,research}=fixtures();
 archive.fights["fight-511"].rounds[0].a.sigAttempted=null;
 const measured=buildPostfightMetrics(progress,archive,{asOf:"2026-11-14"});
 const result=buildV4StatFoundation(approval,research,progress,measured,
  {asOf:"2026-11-14"});
 const f=result.fighters["fighter-alpha"];
 assert.equal(f.windows.last5.totals.sigAttempted,10+11+12);
 assert.equal(f.windows.last5.metricCoverage.sigAttempted.bouts,3);
 assert.equal(f.windows.last5.rates.sigAccuracyPercent.coveredBouts,3);
 assert.equal(f.windows.last5.totals.sigLanded,38);
});
test("identities and feeder events cannot leak into the UFC-only windows",()=>{
 const {progress,archive,approval,research}=fixtures();
 const f=progress.bouts["510"];
 f.event="Dana White's Contender Series 88";
 archive.fights["fight-510"].promotion="UFC";
 // A standalone feeder date is excluded from both the UFC timeline and
 // measured postfight cache, and cannot be reintroduced via label "UFC".
 const measured=buildPostfightMetrics(progress,archive,{asOf:"2026-11-14"});
 const result=buildV4StatFoundation(approval,research,progress,measured,
  {asOf:"2026-11-14"});
 assert.equal(result.fighters["fighter-alpha"].knownCareerBouts,11);
 assert.equal(result.fighters["fighter-alpha"].windows.last5.totals.sigLanded,7+8+9+11);
});
