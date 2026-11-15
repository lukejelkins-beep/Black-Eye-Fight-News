import test from "node:test";
import assert from "node:assert/strict";
import {auditV4Release} from "../scripts/audit-ufc-v4-release-gates.mjs";
function fixture(){
 return [
 {status:"approved",approvedFighters:Array.from({length:783},(_,i)=>"f"+i)},
 {scope:"ufc-only-v4-stat-foundation",population:783,asOf:"2026-11-14",
  summary:{knownUfcHistoryRows:6704,linkedMeasuredFighterBoutRows:6704,
   unlinkedHistoryRows:0,missingBoutsByPriority:{distinctMissingNativeIds:0}}},
 {scope:"ufc-v4-official-career-verification-queue",population:783,
  summary:{pendingCertification:783,officialOmission:3,providerDiscrepancy:31}},
 {scope:"ufc-only-shadow-ratings",version:"ufc-v4-shadow-0.1",
  externalCredentialBonusesApplied:false,
  summary:{approved:783,scoredLast5:608},
  backtest:{fightsWithBothPrefightRatings:1250,brier:0.236,referenceBrier:0.25}}
 ];
}
test("complete known UFC data and a positive backtest cannot authorize V4 release",()=>{
 const r=auditV4Release(...fixture());
 assert.equal(r.productionReady,false);
 assert.equal(r.gates.allKnownOfficialUfcBoutsMeasured.pass,true);
 assert.equal(r.gates.descriptiveWalkForwardModelSignal.pass,true);
 assert.equal(r.gates.historicalFullCareerVerification.pass,false);
 assert.equal(r.gates.independentlyCalibratedAndFairnessAudited.pass,false);
 assert(r.blockers.includes("responsiveProductionPreviewAndOwnerSignoff"));
});
test("missing known bout data is an additional release blocker",()=>{
 const a=fixture();a[1].summary.linkedMeasuredFighterBoutRows--;
 const r=auditV4Release(...a);
 assert.equal(r.gates.allKnownOfficialUfcBoutsMeasured.pass,false);
 assert.equal(r.productionReady,false);
});
test("source changes cannot silently enable external achievement bonuses",()=>{
 const a=fixture();a[3].externalCredentialBonusesApplied=true;
 assert.throws(()=>auditV4Release(...a),/unauthorized/);
});
