#!/usr/bin/env node
/**
 * V4 readiness audit by statistical field. Read-only and cache-only:
 * distinguishes a linked fight from a fight with the specific numbers
 * needed for the intended leaderboard or technical attribute.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fields=[
 "sigLanded","sigAttempted","sigAbsorbed","sigStrikeDifferential",
 "knockdowns","takedowns","takedownAttempts","subAttempts",
 "controlSec","controlDifferentialSec","reversals"
];
const core=["sigLanded","sigAttempted","sigAbsorbed",
 "sigStrikeDifferential","knockdowns","takedowns",
 "takedownAttempts","subAttempts","controlSec"];
const windows={last5:5,last10:10,career:1};
export function auditMetricAvailability(foundation){
 if(foundation?.scope!=="ufc-only-v4-stat-foundation"||
   !foundation?.fighters||!Number.isInteger(foundation.population))
  throw Error("Approved V4 stat foundation required");
 const summary={};
 for(const [key,required] of Object.entries(windows)){
  let eligible=0,allCoreComplete=0,allCoreRateReady=0,linkedAll=0;
  const availability=Object.fromEntries(fields.map(f=>[f,{
   completeFighters:0,partiallyMeasuredFighters:0,noMeasurements:0,
   measuredBoutRows:0,knownBoutRows:0
  }]));
  for(const fighter of Object.values(foundation.fighters)){
   const w=fighter?.windows?.[key];
   if(!w||w.knownBouts<required)continue;
   eligible++;
   if(w.linkedMeasuredBouts===w.knownBouts)linkedAll++;
   let completeCore=0;
   for(const field of fields){
    const covered=w.metricCoverage?.[field]?.bouts||0;
    if(!Number.isInteger(covered)||covered<0||covered>w.knownBouts)
     throw Error("Invalid evidence denominator for "+key+" "+field);
    const m=availability[field];
    m.measuredBoutRows+=covered;
    m.knownBoutRows+=w.knownBouts;
    if(covered===w.knownBouts){m.completeFighters++;if(core.includes(field))completeCore++;}
    else if(covered>0)m.partiallyMeasuredFighters++;
    else m.noMeasurements++;
   }
   if(completeCore===core.length)allCoreComplete++;
   const requiredRates=["sigLandedPerMinute","sigAbsorbedPerMinute",
    "sigStrikeDifferentialPer15","knockdownsPer15","takedownsPer15",
    "subAttemptsPer15","controlSecPer15"];
   if(completeCore===core.length&&requiredRates.every(rate=>{
    const r=w.rates?.[rate];
    return r?.coveredBouts===w.knownBouts&&
     Number.isFinite(r?.elapsedSeconds)&&r.elapsedSeconds>0&&
     Number.isFinite(r?.value);
   }))allCoreRateReady++;
  }
  summary[key]={minimumKnownBouts:required,eligibleFighters:eligible,
   allBoutIdsLinkedToRoundCache:linkedAll,
   fullyObservedAllNineCoreFields:allCoreComplete,
   fullyRateReadyAllNineCoreFields:allCoreRateReady,
   perMetric:availability};
 }
 return {schema:1,scope:"ufc-v4-per-metric-coverage",
  status:"offline_qa_only_not_published",population:foundation.population,
  asOf:foundation.asOf,summary,
  note:"Per-metric completeness is computed only across the chronological known fights in each window. The historical career may still be incomplete or unverified. Complete round linkage does not guarantee all metrics were recorded. No scoring or provider calls."};
}
export function main(){
 const foundation=JSON.parse(fs.readFileSync(
  path.join(root,"qa/ufc-v4-stat-foundation.json"),"utf8"));
 const result=auditMetricAvailability(foundation);
 fs.writeFileSync(path.join(root,"qa/ufc-v4-metric-coverage.json"),
  JSON.stringify(result,null,2)+"\n");
 const digest=Object.fromEntries(Object.entries(result.summary).map(([name,r])=>
  [name,{eligible:r.eligibleFighters,linked:r.allBoutIdsLinkedToRoundCache,
   allCore:r.fullyObservedAllNineCoreFields,
   rateReady:r.fullyRateReadyAllNineCoreFields,
   fullByMetric:Object.fromEntries(Object.entries(r.perMetric).map(
    ([field,d])=>[field,d.completeFighters]))}]));
 console.log("BEFN_V4_METRIC_READINESS "+JSON.stringify(digest));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
