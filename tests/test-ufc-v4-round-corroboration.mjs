import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {buildPostfightMetrics,verifiedRoundReconciliation}
 from "../scripts/build-ufc-postfight-metrics.mjs";
const proof=JSON.parse(fs.readFileSync(new URL(
 "../data/ufc-v4-targeted-round-corroboration.json",import.meta.url),"utf8"));

function fixture(record){
 const aName=record.aName,bName=record.bName;
 const result={round:record.resultRound,time:record.resultTime,
  winnerId:record.winnerName===aName?"1":"2",
  method:record.resultRound===2?"KO/TKO":
   record.winnerName==="Piera Rodriguez"?"decision_unanimous":"KO/TKO"};
 const bout={id:record.fightId,org:"ufc",status:"completed",
  event:record.event,eventDate:record.date,
  a:{id:"1",name:aName,slug:"first-"+record.fightId},
  b:{id:"2",name:bName,slug:"second-"+record.fightId},result};
 const archived={promotion:"UFC",date:record.date,event:record.event,
  fighterA:aName,fighterB:bName,
  rounds:structuredClone(record.rounds),conflicts:[]};
 if(record.fightId==="60230"){
  archived.rounds.push({round:3,
   a:{sigLanded:8,sigAttempted:12},b:{sigLanded:4,sigAttempted:8}});
 }else{
  archived.rounds[0].a.sigLanded+=3;
  archived.conflicts=[{round:1,corner:"a",metric:"sigLanded",
   chosen:archived.rounds[0].a.sigLanded,
   alternative:record.rounds[0].a.sigLanded,source:"ufcalendar"}];
 }
 return {bout,archived};
}
for(const item of proof.bouts){
 test("corrects independently corroborated UFC fight "+item.fightId+" without archive mutation",()=>{
  const {bout,archived}=fixture(item);
  const orig=structuredClone(archived);
  const output=buildPostfightMetrics(
   {bouts:{[item.fightId]:bout}},
   {fights:{one:archived}},
   {asOf:"2026-11-14",roundCorroboration:proof});
  assert.equal(output.independentlyCorroboratedExceptionBouts,1);
  assert.equal(output.metricBouts,1);
  const f=output.fighters["first-"+item.fightId].careerBouts[0];
  assert.equal(f.metrics.sigLanded,item.rounds.reduce((n,r)=>n+r.a.sigLanded,0));
  assert.equal(f.metrics.totalLanded,item.rounds.reduce((n,r)=>n+r.a.totalLanded,0));
  assert.equal(f.metrics.takedownAttempts,item.rounds.reduce((n,r)=>n+r.a.takedownAttempts,0));
  assert.equal(f.cageSec,(item.resultRound-1)*300+
   Number(item.resultTime.split(":")[0])*60+Number(item.resultTime.split(":")[1]));
  assert.equal(f.sourceDisputeStatus,"two_independent_UFCStats_derived_round_mirrors_QA");
  assert.deepEqual(archived,orig,"original archived observations must never be overwritten");
  const absent=buildPostfightMetrics({bouts:{[item.fightId]:bout}},
   {fights:{one:archived}},{asOf:"2026-11-14"});
  assert.equal(absent.metricBouts,0,"without separate evidence the error remains quarantined");
 });
}
test("rejects changed identity, winner, clock, and untrusted sources",()=>{
 const record=proof.bouts[0];
 const {bout,archived}=fixture(record);
 const good=structuredClone(proof);
 for(const mutation of [
  obj=>obj.bouts[0].aName="Another Fighter",
  obj=>obj.bouts[0].resultTime="5:00",
  obj=>obj.bouts[0].officialResultUrl="https://ufc.com.attacker.com/results",
  obj=>obj.bouts[0].roundEvidenceUrls[1]="https://untrusted.test/fight",
  obj=>obj.bouts[0].rounds[0].a.sigLanded=999
 ]){
  const invalid=structuredClone(good);mutation(invalid);
  assert.equal(verifiedRoundReconciliation(bout,archived,invalid),null);
 }
 const wrong=structuredClone(bout);wrong.result.winnerId="2";
 assert.equal(verifiedRoundReconciliation(wrong,archived,proof),null);
 const cleaned=structuredClone(archived);cleaned.conflicts=[];
 assert.equal(verifiedRoundReconciliation(bout,cleaned,proof),null,
  "verified existing archive must not be silently replaced by external mirrors");
});
