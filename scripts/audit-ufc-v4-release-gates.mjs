#!/usr/bin/env node
/**
 * V4 release-readiness gates. Read-only and never authorizes deployment.
 * Source-certified full career evidence, model calibration and live QA
 * are independent gates; a passing descriptive backtest is not approval.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const bool=(ok,details)=>({pass:ok===true,details});
export function auditV4Release(approval,foundation,verification,shadow){
 if(approval?.status!=="approved"||
  approval?.approvedFighters?.length!==783||
  foundation?.scope!=="ufc-only-v4-stat-foundation"||
  verification?.scope!=="ufc-v4-official-career-verification-queue"||
  shadow?.scope!=="ufc-only-shadow-ratings"||
  foundation.population!==783||verification.population!==783||
  shadow.summary?.approved!==783)
  throw Error("V4 readiness requires matched approved 783-fighter sources");
 if(shadow.externalCredentialBonusesApplied!==false)
  throw Error("External credential bonuses are unauthorized");
 const matched=(foundation.summary.knownUfcHistoryRows===
  foundation.summary.linkedMeasuredFighterBoutRows)&&
  foundation.summary.unlinkedHistoryRows===0&&
  foundation.summary.missingBoutsByPriority.distinctMissingNativeIds===0;
 const certified=783-verification.summary.pendingCertification;
 const baseline=shadow.backtest?.referenceBrier,
  brier=shadow.backtest?.brier,
  backtestCount=shadow.backtest?.fightsWithBothPrefightRatings||0;
 const backtestDescriptive=backtestCount>=1000&&
  typeof brier==="number"&&brier<baseline;
 const calibrated=false; // Only documented out-of-sample calibration + approval can change.
 const previewQaApproved=false; // Production and responsive QA are not part of this offline PR.
 const ownerReleaseApproval=false; // No implied approval through code, CI, or schedule.
 const gates={
  approvedUfcRoster:bool(true,"783-person user-approved cohort"),
  allKnownOfficialUfcBoutsMeasured:bool(matched,
   {known:foundation.summary.knownUfcHistoryRows,
    measured:foundation.summary.linkedMeasuredFighterBoutRows}),
  historicalFullCareerVerification:bool(certified===783,
   {certified,total:783,officiallyDocumentedDeficitCases:
    verification.summary.officialOmission,
    unresolvedProviderDiscrepancies:verification.summary.providerDiscrepancy}),
  descriptiveWalkForwardModelSignal:bool(backtestDescriptive,
   {sample:backtestCount,brier,flatBaseline:baseline,
    note:"Positive signal is NOT calibrated deployment readiness"}),
  independentlyCalibratedAndFairnessAudited:bool(calibrated,
   "Requires frozen model, held-out validation, divisional/era bias tests and owners' review"),
  responsiveProductionPreviewAndOwnerSignoff:bool(
   previewQaApproved&&ownerReleaseApproval,
   "No preview/live-site QA or owner release authorization completed"),
  externalCredentialBonusesDisabled:bool(true,"No external achievement bonuses in UFC V4")
 };
 const blockers=Object.entries(gates).filter(([name,value])=>
  !value.pass).map(([name])=>name);
 return {schema:1,scope:"ufc-v4-production-release-gates",
  status:"production_blocked_until_further_explicit_approval",
  asOf:foundation.asOf,approved:783,
  model:shadow.version,shadowRatedFighters:shadow.summary.scoredLast5,
  gates,productionReady:false,blockers,
  note:"Completeness of all KNOWN UFC statistics is not certified completeness of historical careers. No automatic merge, production deploy, scoring activation, external credential bonus or publication is authorized by passing offline CI."};
}
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
export function main(){
 const r=auditV4Release(read("data/ufc-36-month-roster-approval.json"),
  read("qa/ufc-v4-stat-foundation.json"),
  read("qa/ufc-v4-career-verification-queue.json"),
  read("qa/ufc-v4-shadow-ratings.json"));
 fs.writeFileSync(path.join(root,"qa/ufc-v4-release-readiness.json"),
  JSON.stringify(r,null,2)+"\n");
 console.log("BEFN_V4_RELEASE_GATES "+JSON.stringify({
  productionReady:r.productionReady,
  blockers:r.blockers,
  shadowRatedFighters:r.shadowRatedFighters,
  knownStatsComplete:r.gates.allKnownOfficialUfcBoutsMeasured.pass,
  certifiedCareers:r.gates.historicalFullCareerVerification.details.certified}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
