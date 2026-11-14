#!/usr/bin/env node
/**
 * BEFN V4: read-only certification-attempt router.
 * Attempts every approved fighter in a single offline audit. A strict,
 * independently verified career is counted only by the EXISTING Stage 3 gate.
 * Missing source research is a normal work queue; actual contradictions,
 * identity problems and retry failures go into a separate exception queue.
 *
 * No requests, credentials, paid API calls, collector cache writes, V4
 * publication, or automatic edits to the independent certification register.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const arr=x=>Array.isArray(x)?x:[];
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const number=x=>Number.isFinite(x)&&x>=0?x:0;
const stable=(a,b)=>a.priority-b.priority||a.knownUfcBouts-b.knownUfcBouts||
  a.slug.localeCompare(b.slug);

export function routeCertificationAttempts(approval,audit,register,progress,{sourceBatchSize=25,exceptionBatchSize=15}={}){
 const roster=arr(approval?.approvedFighters),decisions=arr(audit?.careerVerificationDecisions);
 if(approval?.schema!==1||approval?.status!=='approved'||roster.length!==783||
    new Set(roster).size!==783||audit?.scope!=='ufc-36-month-stage3-progress'||
    audit?.summary?.approvedFighters!==783||register?.scope!=='ufc-independent-full-career-verification'||
    register?.rosterAsOf!==approval.rosterAsOf||decisions.length!==783||
    !Number.isInteger(sourceBatchSize)||sourceBatchSize<1||sourceBatchSize>100||
    !Number.isInteger(exceptionBatchSize)||exceptionBatchSize<1||exceptionBatchSize>100)
   throw Error('Invalid immutable approved 783-fighter audit or queue bounds');
 const bySlug=new Map(decisions.map(d=>[d.slug,d]));
 if(bySlug.size!==783||roster.some(slug=>!bySlug.has(slug)))throw Error('Missing or duplicate fighter decisions');
 const missingOfficial=new Set(arr(audit?.officialSourceInventory?.cases).map(x=>x.slug).filter(nonempty));
 const numericAmbiguous=new Set(arr(audit?.profilesWithAmbiguousNumericIdentity).map(x=>x.slug).filter(nonempty));
 const indexedGaps=new Map(arr(audit?.cachedCareerHistoryCandidates).map(x=>[x.slug,x]));
 const manual=new Map(arr(audit?.fullFightIndexSearchReview).map(x=>[x.slug,x]));
 const checks=progress?.ufcApprovedFullFightSearchChecks||{};
 const rows=roster.map(slug=>{
   const d=bySlug.get(slug),independent=register.fighters?.[slug]||{};
   const cached=indexedGaps.get(slug)||{},history=checks[slug]||{};
   const issues=[];
   if(number(d.minimumConfirmedMissingHistoricalUfcBouts)>0||missingOfficial.has(slug))
     issues.push('independent_official_fights_not_saved');
   if(numericAmbiguous.has(slug))issues.push('numeric_fighter_identity_ambiguous');
   if(arr(cached.missingIndexedOfficialUfcFights).length)
     issues.push('existing_cached_ufc_fights_not_linked');
   if(arr(cached.historicalIdentityConflicts).length)
     issues.push('duplicate_or_conflicting_native_bout_identity');
   if(d.allKnownFightsIndexed!==true)issues.push('known_native_fights_not_indexed');
   if(d.allKnownFightsMeasured!==true)issues.push('measured_round_statistics_missing');
   if(independent.sourceCoverageAttested===true&&d.independentlyVerifiedFullCareer!==true)
     issues.push('attested_career_failed_independent_gate');
   if(d.providerLatestFightMismatch===true)
     issues.push('provider_latest_roster_bout_mismatch');
   const searchStatus=history.status||manual.get(slug)?.status||'not_attempted';
   if(searchStatus==='manual_review'||searchStatus==='requires_manual_review')
     issues.push('numeric_fight_index_manual_review');
   else if(searchStatus==='retry'||searchStatus==='partial')
     issues.push('numeric_fight_index_retry_or_partial');
   // The existing Stage 3 independent gate has already checked source-linked
   // native aliases, all official fights and their measured data. Its PASS
   // prevails over generic provider search/manual or numeric-ID heuristics;
   // such heuristics must not falsely demote a valid career certificate.
   const verified=d.independentlyVerifiedFullCareer===true&&
     d.allKnownFightsIndexed===true&&d.allKnownFightsMeasured===true&&
     independent.sourceCoverageAttested===true&&
     independent.verificationMethod==='full_official_ufc_fight_listing_crosscheck';
   if(verified)issues.length=0;
   const lane=verified?'certified':issues.length?'exception':'source_research';
   const reason=verified?'exhaustive_source_and_native_bout_checks_passed':
     issues.length?issues[0]:'independent_complete_career_listing_not_yet_attested';
   const owner=lane==='certified'?'certification_register':
     issues.some(x=>x==='known_native_fights_not_indexed'||x==='measured_round_statistics_missing')?
     'github_collector_plus_independent_research':'chatgpt_independent_research';
   const priority=lane==='certified'?99:
     issues.includes('independent_official_fights_not_saved')?0:
     issues.includes('attested_career_failed_independent_gate')?1:
     issues.includes('numeric_fighter_identity_ambiguous')?2:
     issues.includes('duplicate_or_conflicting_native_bout_identity')?3:
     issues.includes('existing_cached_ufc_fights_not_linked')?4:
     issues.includes('numeric_fight_index_manual_review')?5:
     issues.length?6:10;
   return {slug,lane,priority,reason,issues,owner,
     knownUfcBouts:number(d.knownOfficialUfcFightCount),
     sourceAttested:independent.sourceCoverageAttested===true,
     verifiedByExistingStage3Gate:d.independentlyVerifiedFullCareer===true,
     fullNumericIndexSearch:searchStatus,
     nativeIdentityChecked:progress?.ufcFullCareerHistoryChecks?.[slug]?.status==='checked',
     sourceFightCount:arr(independent.bouts).length,
     verifiedSourceUrl:independent.fighterUrl||null,
     lastResearchAt:progress?.lastRun||null};
 });
 const certified=rows.filter(x=>x.lane==='certified').sort(stable);
 const exceptions=rows.filter(x=>x.lane==='exception').sort(stable);
 const source=rows.filter(x=>x.lane==='source_research').sort(stable);
 const summary={approved:783,attempted:783,certified:certified.length,
   exceptions:exceptions.length,awaitingIndependentSourceResearch:source.length,
   sourceResearchBatch:Math.min(sourceBatchSize,source.length),
   exceptionResearchBatch:Math.min(exceptionBatchSize,exceptions.length),
   byExceptionCode:Object.fromEntries([...new Set(exceptions.flatMap(x=>x.issues))].sort().map(code=>
     [code,exceptions.filter(x=>x.issues.includes(code)).length]))};
 if(certified.length+exceptions.length+source.length!==783)throw Error('Nonexhaustive routing');
 return {schema:1,scope:'ufc-v4-attempt-and-exception-routing',rosterAsOf:approval.rosterAsOf,
   auditedCollectorRun:progress?.lastRun||null,
   status:'offline_evidence_based_triage_not_a_new_certification_gate',summary,
   certified:certified.map(x=>({slug:x.slug,sourceFightCount:x.sourceFightCount,
     verifiedSourceUrl:x.verifiedSourceUrl})),
   sourceResearchNextBatch:source.slice(0,sourceBatchSize),
   exceptionResearchNextBatch:exceptions.slice(0,exceptionBatchSize),
   sourceResearch:source,exceptions,
   note:'Every fighter attempted. Source-not-yet-collected is not an exception. Certified is counted only when the existing strict Stage 3 gate passes. Exception work must create separate independently evidenced research PRs. The sole existing five-minute collector owns every paid UFCalendar request and mutable research cache. This script does not promote evidence or certify fighters.'};
}
export function main(){
 const {auditApprovedStage3}=awaitableAudit();
 const approval=read('data/ufc-36-month-roster-approval.json');
 const census=read('data/ufc-36-month-candidates.json');
 const progress=read('data/ufcalendar-rich-progress.json');
 const research=read('data/ufcalendar-fighter-research.json');
 const archive=read('data/ufc-research-archive.json');
 const feeder=read('data/ufc-feeder-bout-evidence.json');
 const finale=read('data/ufc-official-finale-recovery.json');
 const legacy=read('data/ufc-official-legacy-evidence.json');
 const registry=read('data/ufc-independent-full-career-verification.json');
 const official=read('data/ufc-official-career-bout-inventory.json');
 const audit=auditApprovedStage3(approval,census,progress,research,archive,feeder,finale,legacy,registry,official);
 const out=routeCertificationAttempts(approval,audit,registry,progress);
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-v4-attempt-routing.json'),JSON.stringify(out,null,2)+'\n');
 fs.writeFileSync(path.join(qa,'ufc-v4-certification-exceptions.json'),
   JSON.stringify({schema:1,scope:'ufc-v4-research-exceptions',rosterAsOf:out.rosterAsOf,
     summary:out.summary,exceptions:out.exceptions},null,2)+'\n');
 console.log('BEFN_V4_CERTIFICATION_ATTEMPTS='+JSON.stringify(out.summary));
 console.log('BEFN_V4_CERTIFIED_NAMES='+JSON.stringify(out.certified.map(x=>x.slug)));
 console.log('BEFN_V4_NEXT_EXCEPTION_BATCH='+JSON.stringify(out.exceptionResearchNextBatch));
 console.log('BEFN_V4_NEXT_SOURCE_RESEARCH_BATCH='+JSON.stringify(out.sourceResearchNextBatch));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '\n### BEFN V4 independent certification attempts (offline)\n' +
   'Attempted: 783; certified by existing gate: '+out.summary.certified+
   '; exception queue: '+out.summary.exceptions+
   '; need independent source research: '+out.summary.awaitingIndependentSourceResearch+
   '. No paid API requests or cache writes.\n');
}
let loadedAudit=null;
function awaitableAudit(){
 if(!loadedAudit)throw Error('Stage 3 audit module not initialized');
 return loadedAudit;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 import('./ufc-36-month-stage3-progress.mjs').then(m=>{loadedAudit=m;main();})
   .catch(e=>{console.error(e);process.exitCode=1;});
}
