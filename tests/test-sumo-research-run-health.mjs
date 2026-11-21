import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSumoHealth,resolvePreviousResearchFailure} from '../scripts/sumo-research-run-health.mjs';
const cohort={count:190,rikishi:Array.from({length:190},(_,i)=>({
 sourceId:i+1,sumoDbId:12000+i}))};
const api={counts:{collected:190},weightSnapshots:415,rankEntries:8711,matchEntries:76532};
const weights={mappedSumoDbRikishi:190,rawApiWeightEntries:415,
 checkedIndependentRikishi:58,independentDatedPoints:340,
 additionalDatedPoints:205,conflictingOverlaps:0};
const collection={lastRunAt:'2026-11-14T23:31:41Z',requestsThisRun:10,
 updatedThisRun:10,reviewCases:[],nextAllowedAt:null};
const jsa={checked:66,pending:124,historicalBashoCompared:3855,
 historicalDiscrepancies:0,officialOutcomeOverlaysUsed:1};
const profiles={available:190,weightGraphs:58,currentOfficial:66,sourceReady:190};
const input={cohort,api,weights,collection,jsa,profiles,official:{profileReviewCases:5},
 runId:'123456789',workflowSha:'abcdef',completedAt:'2026-11-15T00:00:00.000Z'};
test('report links exact successful research checkpoint, never claims certifications',()=>{
 const r=buildSumoHealth(input);
 assert.equal(r.sumoDb.mapped,190);
 assert.equal(r.sumoDb.additionalDatedWeights,205);
 assert.equal(r.researchProfileProjections.sourceLinkedWeightGraphs,58);
 assert.equal(r.officialJsa.checked,66);
 assert.equal(r.workflowRunUrl,'https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/123456789');
 assert.equal(r.certifiedCareers,0);
 assert.equal(r.productionPublished,false);
});
test('refuse stale coverage and duplicate or missing SumoDB IDs',()=>{
 assert.throws(()=>buildSumoHealth({...input,weights:{...weights,mappedSumoDbRikishi:183}}),/not in sync/);
 const broken={count:190,rikishi:cohort.rikishi.map(x=>({...x}))};
 broken.rikishi[15].sumoDbId=12000;
 assert.throws(()=>buildSumoHealth({...input,cohort:broken}),/mapping incomplete/);
});

test('a successful and committed Sumo research checkpoint resolves an old failure marker',()=>{
 const prior={schemaVersion:1,status:'research-run-incomplete',runId:'123456789',
  stepOutcomes:{validation:'failure',sumoDbCollector:'skipped'}};
 const success=buildSumoHealth(input);
 const resolved=resolvePreviousResearchFailure(prior,success);
 assert.equal(resolved.status,'resolved-after-successful-retry');
 assert.equal(resolved.resolvedByRunId,'123456789');
 assert.equal(resolved.resolvedAt,'2026-11-15T00:00:00.000Z');
 assert.equal(resolved.stepOutcomes.validation,'failure','audit history is retained');
 assert.equal(resolvePreviousResearchFailure({...prior,status:'resolved-after-successful-retry'},success),null);
 assert.equal(resolvePreviousResearchFailure(prior,{...success,runId:null}),null);
});

test('run health independently displays JSA source-omission and banzuke rank QA',()=>{
 const r=buildSumoHealth({...input,official:{profileReviewCases:6,
  officialCareerTotalsNotFoundCases:6,genuineParserOrFieldReviewCases:0,
  officialBanzukeRanksCompared:97,officialBanzukeRankDiscrepancies:1}});
 assert.equal(r.officialJsa.officialReviewCases,6);
 assert.equal(r.officialJsa.officialCareerTotalsNotFound,6);
 assert.equal(r.officialJsa.genuineParserOrFieldReviews,0);
 assert.equal(r.officialJsa.officialHistoricalRanksCompared,97);
 assert.equal(r.officialJsa.officialHistoricalRankDiscrepancies,1);
 assert.equal(r.certifiedCareers,0);
});

test('Run health keeps source identity rechecks separate from new collection',()=>{
 const values=buildSumoHealth({...input,
  collection:{...collection,updatedThisRun:0,identityAuditsThisRun:8},
  weights:{...weights,
   historicalSourceIdentityRechecks:8,
   corroboratedLegacyWeightObservations:29,
   independentIdentityBirthDateVerified:123,
   independentIdentityBirthDatePending:67}});
 assert.equal(values.sumoDb.updatedThisRun,0);
 assert.equal(values.sumoDb.identityRechecksThisRun,8);
 assert.equal(values.sumoDb.historicalIdentityRechecks,8);
 assert.equal(values.sumoDb.historicalWeightObservationsRecorroborated,29);
 assert.equal(values.sumoDb.birthDateMatchedProfiles,123);
 assert.equal(values.sumoDb.birthDateNotYetVerifiedProfiles,67);
 assert.equal(values.sumoDb.additionalDatedWeights,205);
 assert.equal(values.certifiedCareers,0);
});

test('health checkpoint publishes only strict-preflight candidates and JSA rank rechecks, never certificates',()=>{
 const v=buildSumoHealth({...input,
  jsa:{...jsa,historicalRankRechecksThisRun:8},
  preflight:{candidateForStrictAudit:26,needsSourceOrManualReview:164,
    blockerCounts:{'independent-JSA-historical-ranks-not-compared':115}}});
 assert.equal(v.officialJsa.historicalRankRechecksThisRun,8);
 assert.equal(v.strictPreflight.eligible,26);
 assert.equal(v.strictPreflight.blocked,164);
 assert.equal(v.strictPreflight.blockerCounts['independent-JSA-historical-ranks-not-compared'],115);
 assert.equal(v.strictPreflight.certified,0);
 assert.equal(v.certifiedCareers,0);
});

test('reports strict career-result certificates without declaring full profiles certified',()=>{
 const report=buildSumoHealth({...input,
  preflight:{candidateForStrictAudit:34,needsSourceOrManualReview:156},
  strict:{cohortSize:190,strictAuditSuccessful:true,strictCareerResultsCertified:28}});
 assert.equal(report.careerResultsStrictlyCertified,28);
 assert.equal(report.strictCareerAuditPassed,true);
 assert.equal(report.fullProfilesCertified,0);
 assert.equal(report.certifiedCareers,0);
 assert.equal(report.productionPublished,false);
 assert.throws(()=>buildSumoHealth({...input,
  preflight:{candidateForStrictAudit:3},
  strict:{cohortSize:190,strictAuditSuccessful:true,strictCareerResultsCertified:28}}),
  /Strict certification checkpoint/);
});

test('health reports independent career record checks separately from source weight rechecks',()=>{
 const r=buildSumoHealth({...input,
  collection:{...collection,careerRecordCrosschecksThisRun:10,
   careerRecordCrosschecksOutstanding:58,
   independentlyPublishedCareerRecordsCaptured:10},
  preflight:{candidateForStrictAudit:70,needsSourceOrManualReview:120,
   sourceCorroboratedDebutRankGaps:9},
  strict:{cohortSize:190,strictAuditSuccessful:true,
   strictCareerResultsCertified:70,confirmedNumberedRankAbsentAtDebut:1}});
 assert.equal(r.sumoDb.careerEvidenceChecksThisRun,10);
 assert.equal(r.sumoDb.careerEvidenceChecksOutstanding,58);
 assert.equal(r.sumoDb.publishedIndependentCareerRecords,10);
 assert.equal(r.strictPreflight.documentedRanklessDebutExceptions,9);
 assert.equal(r.strictlyVerifiedDebutRankGaps,1);
 assert.equal(r.fullProfilesCertified,0);
});

test('existing health report exposes missing early JSA bouts as a source coverage gap, not conflicting match results',()=>{
 const r=buildSumoHealth({...input,official:{
  profileReviewCases:11,
  sourceCoverageCases:11,
  missingOfficialHistoricalBashoTotal:217,
  historicalTournamentsDisagree:0}});
 assert.equal(r.officialJsa.incompleteOfficialHistoryProfiles,11);
 assert.equal(r.officialJsa.missingOfficialHistoricalTournaments,217);
 assert.equal(r.officialJsa.unresolvedHistoricalDiscrepancies,0);
 assert.equal(r.certifiedCareers,0);
});
