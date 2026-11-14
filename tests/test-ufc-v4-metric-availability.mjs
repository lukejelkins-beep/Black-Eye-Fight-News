import test from "node:test";
import assert from "node:assert/strict";
import {auditMetricAvailability} from "../scripts/audit-ufc-v4-metric-availability.mjs";

const core=[
 "sigLanded","sigAttempted","sigAbsorbed","sigStrikeDifferential",
 "knockdowns","takedowns","takedownAttempts","subAttempts","controlSec"
];
const window=(known,covered)=>{
 const names=[...core,"controlDifferentialSec","reversals"];
 return {knownBouts:known,linkedMeasuredBouts:covered,
  metricCoverage:Object.fromEntries(names.map(n=>[n,{bouts:covered}]))};
};
test("metric readiness requires every chronological bout, not just any observation",()=>{
 const a=window(5,5);a.metricCoverage.controlSec.bouts=4;
 const b=window(5,0);
 const c=window(3,3);
 const foundation={scope:"ufc-only-v4-stat-foundation",population:3,asOf:"2026-11-14",
  fighters:{a:{windows:{last5:a,last10:a,career:a}},
   b:{windows:{last5:b,last10:b,career:b}},
   c:{windows:{last5:c,last10:c,career:c}}}};
 const report=auditMetricAvailability(foundation);
 assert.equal(report.summary.last5.eligibleFighters,2);
 assert.equal(report.summary.last5.allBoutIdsLinkedToRoundCache,1);
 assert.equal(report.summary.last5.perMetric.sigLanded.completeFighters,1);
 assert.equal(report.summary.last5.perMetric.controlSec.partiallyMeasuredFighters,1);
 assert.equal(report.summary.last5.perMetric.controlSec.noMeasurements,1);
 assert.equal(report.summary.last5.fullyObservedAllNineCoreFields,0);
 assert.equal(report.summary.last10.eligibleFighters,0);
 assert.equal(report.summary.career.eligibleFighters,3);
});
test("rejects impossible per-fight evidence coverage rather than inflating scores",()=>{
 const w=window(2,2);w.metricCoverage.sigLanded.bouts=3;
 const f={scope:"ufc-only-v4-stat-foundation",population:1,
  fighters:{a:{windows:{career:w}}}};
 assert.throws(()=>auditMetricAvailability(f),/Invalid evidence denominator/);
});

test("raw core fields do not imply rate readiness without valid cage time",()=>{
 const w=window(5,5);
 const rates=["sigLandedPerMinute","sigAbsorbedPerMinute",
  "sigStrikeDifferentialPer15","knockdownsPer15","takedownsPer15",
  "subAttemptsPer15","controlSecPer15"];
 w.rates=Object.fromEntries(rates.map(n=>[n,{value:1,coveredBouts:5,elapsedSeconds:1500}]));
 const f={scope:"ufc-only-v4-stat-foundation",population:1,
  fighters:{a:{windows:{last5:w,career:w}}}};
 let report=auditMetricAvailability(f);
 assert.equal(report.summary.last5.fullyObservedAllNineCoreFields,1);
 assert.equal(report.summary.last5.fullyRateReadyAllNineCoreFields,1);
 w.rates.knockdownsPer15={value:null,coveredBouts:4,elapsedSeconds:1200};
 report=auditMetricAvailability(f);
 assert.equal(report.summary.last5.fullyObservedAllNineCoreFields,1);
 assert.equal(report.summary.last5.fullyRateReadyAllNineCoreFields,0);
 w.rates.knockdownsPer15={value:0,coveredBouts:5,elapsedSeconds:0};
 report=auditMetricAvailability(f);
 assert.equal(report.summary.last5.fullyRateReadyAllNineCoreFields,0);
});
