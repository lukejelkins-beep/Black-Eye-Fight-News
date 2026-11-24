/**
 * Store an auditable checkpoint only once a Sumo research Actions run has
 * passed validation, collection, official correction audit, and profile build.
 * No network calls, no new certificates and no production deployment.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT='data/sumo/backfill/v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const num=n=>Number.isFinite(Number(n))?Number(n):0;
export function buildSumoHealth({cohort,api,weights,collection,jsa,official,profiles,preflight,strict,
 runId,workflowSha,completedAt}){
 if(cohort?.count!==190||cohort.rikishi?.length!==190)throw Error('Expected frozen 190-rikishi cohort');
 if(!api||!weights||!jsa||!collection)throw Error('Missing core checkpoint data');
 const mapped=cohort.rikishi.filter(w=>Number.isSafeInteger(Number(w.sumoDbId))&&Number(w.sumoDbId)>0).length;
 if(mapped!==190||new Set(cohort.rikishi.map(w=>w.sumoDbId)).size!==190)
  throw Error('SumoDB source identity mapping incomplete');
 if(weights.mappedSumoDbRikishi!==190||weights.rawApiWeightEntries!==api.weightSnapshots)
  throw Error('Historical weight coverage not in sync with current cohort and API cache');
 if(jsa.checked>190||weights.checkedIndependentRikishi>190)throw Error('Invalid coverage count');
 if(strict&&(strict.cohortSize!==190||strict.strictAuditSuccessful!==true||
   strict.strictCareerResultsCertified>Number(preflight?.candidateForStrictAudit||0)))
  throw Error('Strict certification checkpoint must pass frozen-cohort audit');
 return {
  schemaVersion:1,scope:'Completed research-cache job checkpoint only; excludes post-checkpoint H2H preview sync',
  lastResearchCheckpointAt:completedAt,runId:runId||null,
  workflowRef:workflowSha||null,
  workflowRunUrl:runId?
   'https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/'+runId:null,
  dataCommitPending:true,
  status:'research-validation-and-projections-completed',
  api:{collected:api.counts?.collected||0,weightRecords:api.weightSnapshots,
   rankRecords:api.rankEntries,matchRecords:api.matchEntries},
  sumoDb:{mapped,checked:weights.checkedIndependentRikishi,
   independentDatedWeights:weights.independentDatedPoints,
   additionalDatedWeights:weights.additionalDatedPoints,
   conflictingOverlaps:weights.conflictingOverlaps,
   lastFetchAt:collection.lastRunAt||null,
   requestedThisRun:collection.requestsThisRun||0,
   updatedThisRun:collection.updatedThisRun||0,
   identityRechecksThisRun:collection.identityAuditsThisRun||0,
   careerEvidenceChecksThisRun:collection.careerRecordCrosschecksThisRun||0,
   careerEvidenceChecksOutstanding:collection.careerRecordCrosschecksOutstanding??null,
   publishedIndependentCareerRecords:collection.independentlyPublishedCareerRecordsCaptured||0,
   historicalIdentityRechecks:weights.historicalSourceIdentityRechecks||0,
   historicalWeightObservationsRecorroborated:weights.corroboratedLegacyWeightObservations||0,
   birthDateMatchedProfiles:weights.independentIdentityBirthDateVerified||0,
   birthDateNotYetVerifiedProfiles:weights.independentIdentityBirthDatePending||0,
   providerCooldownUntil:collection.nextAllowedAt||null,
   reviewCases:collection.reviewCases?.length||0},
  officialJsa:{checked:jsa.checked,pending:jsa.pending,
   historicalRankRechecksThisRun:jsa.historicalRankRechecksThisRun||0,
   comparedHistoricalTournaments:jsa.historicalBashoCompared||0,
   unresolvedHistoricalDiscrepancies:jsa.historicalDiscrepancies||0,
   reconciledOutcomeOverlays:jsa.officialOutcomeOverlaysUsed||0,
   officialReviewCases:official?.profileReviewCases||0,
   officialCareerTotalsNotFound:official?.officialCareerTotalsNotFoundCases||0,
   genuineParserOrFieldReviews:official?.genuineParserOrFieldReviewCases||0,
   incompleteOfficialHistoryProfiles:official?.sourceCoverageCases||0,
   missingOfficialHistoricalTournaments:official?.missingOfficialHistoricalBashoTotal||0,
   officialHistoricalRanksCompared:official?.officialBanzukeRanksCompared||0,
   officialHistoricalRankDiscrepancies:official?.officialBanzukeRankDiscrepancies||0},
  strictPreflight:{eligible:preflight?.candidateForStrictAudit||0,
    documentedRanklessDebutExceptions:preflight?.sourceCorroboratedDebutRankGaps||0,
    blocked:preflight?.needsSourceOrManualReview??190,
    blockerCounts:preflight?.blockerCounts||{},
    certified:0,neverSelfCertifies:true},
  researchProfileProjections:{available:profiles.available||0,sourceLinkedWeightGraphs:profiles.weightGraphs||0,
   currentOfficialWeightSnapshots:profiles.currentOfficial||0},
  sourceReadyProfiles:num(profiles.sourceReady),
  careerResultsStrictlyCertified:num(strict?.strictCareerResultsCertified),
  strictlyVerifiedDebutRankGaps:num(strict?.confirmedNumberedRankAbsentAtDebut),
  strictCareerAuditPassed:strict?.strictAuditSuccessful===true,
  fullProfilesCertified:0,
  certifiedCareers:0,productionPublished:false,
  note:'Strict career-result summaries are distinct from full-profile certification, individual-kimarite corroboration, licensed photos and production approval.'
 };
}
export function resolvePreviousResearchFailure(previous,success){
 if(!previous||previous.status!=='research-run-incomplete')return null;
 if(!success?.runId||!success?.lastResearchCheckpointAt)return null;
 return {...previous,status:'resolved-after-successful-retry',
   resolvedByRunId:success.runId,resolvedAt:success.lastResearchCheckpointAt,
   successEvidencePath:'data/sumo/backfill/v1/workflow-health.json',
   note:'Previous run failed before a complete data checkpoint. A later validated run completed the collection, data audit, projections and checkpoint. Original outcomes retained for traceability.'};
}
async function main(){
 const [cohort,api,weights,collection,jsa,official,audit,preflight,strict]=await Promise.all([
  read('data/sumo/rikishi-index.json'),
  read(join(ROOT,'summary.json')),
  read(join(ROOT,'weight-source-coverage.json')),
  read(join(ROOT,'sumodb-collection-status.json')),
  read(join(ROOT,'jsa-public','summary.json')),
  optional(join(ROOT,'jsa-public','exception-register.json')),
  read(join(ROOT,'audit.json')),
  optional(join(ROOT,'career-certification-preflight.json')),
  optional(join(ROOT,'career-certification-strict.json'))]);
 const stats={available:0,weightGraphs:0,currentOfficial:0,sourceReady:audit.sourceReady};
 for(const w of cohort.rikishi){
  const p=await optional(join(ROOT,'profile-ready',w.sourceId+'.json'));
  if(!p||p.status==='not-ready')continue;
  stats.available++;
  if(p.measurementCoverage?.extraPoints>0)stats.weightGraphs++;
  if(p.currentOfficialMeasurement?.measurementDateKnown===false)stats.currentOfficial++;
 }
 const data=buildSumoHealth({
  cohort,api,weights,collection,jsa,official,profiles:stats,preflight,strict,
  completedAt:new Date().toISOString(),
  runId:process.env.GITHUB_RUN_ID||null,
  workflowSha:process.env.GITHUB_SHA||null});
 const dest=join(ROOT,'workflow-health.json'),prev=await optional(dest);
 if(JSON.stringify(prev)!==JSON.stringify(data)){
  await mkdir(ROOT,{recursive:true});const temp=dest+'.tmp';
  await writeFile(temp,JSON.stringify(data,null,2)+'\n');await rename(temp,dest);
 }
 const failPath=join(ROOT,'workflow-last-failure.json');
 const previousFailure=await optional(failPath);
 const resolved=resolvePreviousResearchFailure(previousFailure,data);
 if(resolved&&JSON.stringify(previousFailure)!==JSON.stringify(resolved)){
  const temp=failPath+'.tmp';await writeFile(temp,JSON.stringify(resolved,null,2)+'\n');
  await rename(temp,failPath);
 }
 console.log(JSON.stringify({status:data.status,weightProfiles:data.sumoDb.checked,
  extraWeightPoints:data.sumoDb.additionalDatedWeights,
  jsa:data.officialJsa.checked,projections:data.researchProfileProjections,
  runId:data.runId,careerResultsStrictlyCertified:data.careerResultsStrictlyCertified,
  fullProfilesCertified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
