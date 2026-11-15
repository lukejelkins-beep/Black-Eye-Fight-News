/**
 * Strict, research-only per-rikishi preflight. This does NOT grant a
 * certification, approve publication, or alter any cached source record.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {cohortCurrentBasho} from './sumo-jsa-public-spotcheck.mjs';
const ROOT='data/sumo/backfill/v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const maybe=async p=>{try{return await read(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const id=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const numeric=n=>n!=null&&Number.isInteger(Number(n))&&Number(n)>=0;
const ACTIONS=Object.freeze({
 'independent-JSA-historical-ranks-not-compared':{
  lane:'official-rank-recheck',owner:'existing JSA source worker',
  nextAction:'Collect dated JSA banzuke positions for this cached profile, compare exact ranks with existing API history; do not re-fetch if a validated rank snapshot exists.'},
 'independent-SumoDB-birth-date-not-verified':{
  lane:'source-identity-recheck',owner:'existing SumoDB source worker',
  nextAction:'Crosscheck original SumoDB profile header name, date of birth and all saved measurements without replacing original source values.'},
 'official-absence-total-unpublished-or-disagree':{
  lane:'absence-proof-review',owner:'historical manual source review',
  nextAction:'Locate independently published career absences or documented tournament absences. Never turn an unreported absence total into zero.'},
 'official-JSA-career-totals-unpublished-or-disagree':{
  lane:'career-totals-review',owner:'historical manual source review',
  nextAction:'Separate absent JSA career totals from as-of-date mismatches and true historic record conflicts; preserve both sources until reconciled.'},
 'official-completed-basho-ledger-coverage-incomplete':{
  lane:'official-tournament-gap',owner:'historical manual source review',
  nextAction:'Review which completed tournament results lack independent official comparison, preserving absence-only and unranked tournament distinctions.'},
 'complete-rank-timeline-not-evidenced':{
  lane:'api-rank-history-gap',owner:'historical manual source review',
  nextAction:'Identify missing banzuke rank dates and seek dated official archive evidence; never interpolate unrecorded positions.'},
 'official-JSA-profile-field-disagreement':{
  lane:'profile-source-conflict',owner:'historical manual source review',
  nextAction:'Investigate the exact official/API current profile disagreement and document which publication is newer; do not overwrite either raw source.'}
});
const ACTION_PRIORITY=[
 'official-JSA-profile-field-disagreement',
 'official-completed-basho-ledger-coverage-incomplete',
 'complete-rank-timeline-not-evidenced',
 'official-JSA-career-totals-unpublished-or-disagree',
 'official-absence-total-unpublished-or-disagree',
 'independent-JSA-historical-ranks-not-compared',
 'independent-SumoDB-birth-date-not-verified'
];
export function planPreflightNextAction(blockers){
 if(!Array.isArray(blockers)||!blockers.length)
  return {lane:'fast-lane-strict-audit',owner:'strict audit reviewer',
   nextAction:'Run complete independent strict career audit against raw and saved official evidence; certification cannot be granted by preflight.'};
 const issue=ACTION_PRIORITY.find(x=>blockers.includes(x))||blockers[0];
 return ACTIONS[issue]||{lane:'manual-triage',owner:'historical source reviewer',
  nextAction:'Investigate unclassified source verification issue without changing original data.'};
}
export function preflightRikishi(w,p,jsa,sdb,activeBasho){
 if(!id(w?.sourceId)||!id(w?.officialNskId)||!id(w?.sumoDbId)||
   !p||p.sourceId!==w.sourceId||p.officialNskId!==w.officialNskId||
   p.certification!=='not-started'||p.releaseGates?.certified!==false)
  throw Error('Missing frozen source identity or incorrect certification state '+w?.sourceId);
 const problems=[];
 const add=(ok,reason)=>{if(!ok)problems.push(reason);};
 const ledger=p.boutHistory||{};
 add(ledger.fullPagination===true&&ledger.rawSourceImmutable===true,
  'complete-original-bout-pagination-not-proven');
 add(numeric(ledger.regularWins)&&numeric(ledger.regularLosses)&&
  ledger.regularWins===p.career?.wins&&ledger.regularLosses===p.career?.losses&&
  ledger.regularWins+ledger.regularLosses===ledger.regularBouts,
  'career-win-loss-and-complete-bout-ledger-not-reconciled');
 add(Array.isArray(p.rankTimeline)&&p.rankTimeline.length>0&&
    (!p.rankHistoryGaps||p.rankHistoryGaps.length===0),
  'complete-rank-timeline-not-evidenced');
 add(Array.isArray(p.measurements)&&p.measurements.length>0&&
   p.measurementCoverage?.conflictingOverlaps?.length===0,
  'dated-historical-weight-provenance-unresolved');
 const rawIdentity=sdb?.identityRecheck?.identityEvidence||sdb?.identityEvidence;
 add(!!sdb&&Number(sdb.sourceId)===Number(w.sourceId)&&
   Number(sdb.sumoDbId)===Number(w.sumoDbId)&&
   Number(sdb.officialNskId)===Number(w.officialNskId),
  'independent-SumoDB-profile-identity-missing');
 add(rawIdentity?.valid===true&&rawIdentity?.birthDateStatus==='match',
  'independent-SumoDB-birth-date-not-verified');
 const officialId=jsa&&jsa.sourceId===w.sourceId&&jsa.officialNskId===w.officialNskId;
 add(!!officialId&&jsa.fieldComparisons?.name===true&&
   jsa.fieldComparisons?.stable===true&&jsa.fieldComparisons?.rankGrade===true,
  'official-JSA-identity-or-current-rank-unresolved');
 add(officialId&&Object.values(jsa.fieldComparisons||{}).every(x=>x!==false),
  'official-JSA-profile-field-disagreement');
 // A separately captured SumoDB W-L-A may verify an aggregate omitted by JSA,
 // but it cannot override any explicit disagreement with the official JSA.
 // All three values must match the full native-bout career ledger exactly.
 const other=sdb?.careerRecordCrosscheck||null,totals=other?.career||null;
 const independentlyMatched=other?.identityVerified===true&&
  other?.originalMeasurementsUnchanged===true&&other?.independentOfApi===true&&
  Number(sdb.sourceId)===Number(w.sourceId)&&
  totals&&totals.absences!==null&&totals.absences!==undefined&&
  totals.wins===p.career?.wins&&totals.losses===p.career?.losses&&
  totals.absences===p.career?.absences;
 const jsaHasCareer=officialId&&jsa.career!==null&&jsa.career!==undefined;
 const jsaWinLossMatches=jsaHasCareer&&
  jsa.career.wins===p.career?.wins&&jsa.career.losses===p.career?.losses;
 add(jsaHasCareer?jsaWinLossMatches:officialId&&independentlyMatched,
  'official-JSA-career-totals-unpublished-or-disagree');
 const jsaAbsencesPresent=jsaHasCareer&&jsa.career.absences!=null;
 add(jsaAbsencesPresent?
   jsa.career.absences===p.career?.absences:
   officialId&&independentlyMatched&&(!jsaHasCareer||jsaWinLossMatches),
  'official-absence-total-unpublished-or-disagree');
 const prior=(p.perBasho||[]).filter(x=>x.bashoId!==activeBasho&&
  Number(x.scheduledBoutRows||0)>0);
 const historical=jsa?.bashoReconciliation||null;
 add(historical&&historical.discrepantBasho===0&&
   Number(historical.comparedBasho)>=prior.length,
  'official-completed-basho-ledger-coverage-incomplete');
 const missingRecords=(historical?.unmatchedOfficialBasho||[]).filter(basho=>{
  const row=jsa?.officialBashoRecords?.find(x=>x.bashoId===basho);
  return !row||Number(row.wins||0)>0||Number(row.losses||0)>0;
 });
 add(missingRecords.length===0,'official-nonabsence-basho-rows-unreconciled');
 const ranks=jsa?.rankReconciliation||null;
 add(ranks&&Number(ranks.comparedBasho)>0&&
   ranks.mismatches?.length===0,
  'independent-JSA-historical-ranks-not-compared');
 // Photo rights are a separate display/release gate, never an invented source
 // for records or a reason to alter the strictly verified career history.
 const plan=planPreflightNextAction(problems);
 return {sourceId:w.sourceId,name:w.shikonaEn,division:p.current?.rank?.split(' ')[0],
  certificationLane:plan.lane,owner:plan.owner,nextAction:plan.nextAction,
  classification:problems.length?'needs-source-or-manual-review':'candidate-for-strict-audit',
  blockers:problems,completedHistoricalBoutTournaments:prior.length,
  officialBashoCompared:Number(historical?.comparedBasho||0),
  JsaHistoricalRankCompared:Number(ranks?.comparedBasho||0),
  careerTotalsEvidence:jsaWinLossMatches&&jsaAbsencesPresent?
   'published-JSA-three-part-career-record':independentlyMatched&&
   (!jsaHasCareer||jsaWinLossMatches)?
   'independent-SumoDB-three-part-career-record-plus-JSA-basho':'incomplete-or-conflicting',
  independentBirthDateMatch:rawIdentity?.birthDateStatus==='match',
  sourceEligibilityChecked:true,strictAuditPassed:false,certified:false,
  productionReleaseApproved:false,photoRightsReviewedSeparately:true};
}
export function summarizePreflight(rows){
 if(rows.length!==190||new Set(rows.map(x=>x.sourceId)).size!==190)
  throw Error('Certification preflight must cover exactly 190 immutable source IDs');
 const count=x=>rows.filter(r=>r.blockers.includes(x)).length;
 const all=[...new Set(rows.flatMap(x=>x.blockers))].sort();
 const laneCount=Object.fromEntries([...new Set(rows.map(x=>x.certificationLane))]
   .sort().map(lane=>[lane,rows.filter(x=>x.certificationLane===lane).length]));
 return {schemaVersion:1,cohortSize:190,scope:'Research-only strict Sumo career preflight; never self-certifies',
  candidateForStrictAudit:rows.filter(x=>x.classification==='candidate-for-strict-audit').length,
  needsSourceOrManualReview:rows.filter(x=>x.blockers.length>0).length,
  blockerCounts:Object.fromEntries(all.map(x=>[x,count(x)])),
  certificationLanes:laneCount,
  certified:0,productionApproved:false,
  note:'Candidate status means only that source prerequisites pass. Final strict audit, exceptions, photos and explicit release approval are separate.',
  rows};
}
async function main(){
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)throw Error('Unexpected Sumo roster');
 const basho=cohortCurrentBasho(roster);
 const rows=[];
 for(const w of roster.rikishi){
  const p=await read(join(ROOT,'profile-ready',w.sourceId+'.json'));
  const j=await maybe(join(ROOT,'jsa-public','profiles',w.sourceId+'.json'));
  const s=await maybe(join(ROOT,'weight-source-crosschecks',w.sourceId+'.json'));
  rows.push(preflightRikishi(w,p,j,s,basho));
 }
 const report=summarizePreflight(rows);
 const out=join(ROOT,'career-certification-preflight.json');
 await mkdir(ROOT,{recursive:true});
 const text=JSON.stringify(report,null,2)+'\n';
 const prev=await readFile(out,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(text!==prev){const tmp=out+'.tmp';await writeFile(tmp,text);await rename(tmp,out);}
 console.log(JSON.stringify({cohort:190,candidates:report.candidateForStrictAudit,
  review:report.needsSourceOrManualReview,topBlockers:Object.entries(report.blockerCounts)
   .sort((a,b)=>b[1]-a[1]).slice(0,8),certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
