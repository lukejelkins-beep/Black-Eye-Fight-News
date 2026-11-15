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
 add(officialId&&jsa.career&&
   jsa.career.wins===p.career?.wins&&jsa.career.losses===p.career?.losses,
  'official-JSA-career-totals-unpublished-or-disagree');
 add(officialId&&jsa.career?.absences!=null&&
   jsa.career.absences===p.career?.absences,
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
 return {sourceId:w.sourceId,name:w.shikonaEn,division:p.current?.rank?.split(' ')[0],
  classification:problems.length?'needs-source-or-manual-review':'candidate-for-strict-audit',
  blockers:problems,completedHistoricalBoutTournaments:prior.length,
  officialBashoCompared:Number(historical?.comparedBasho||0),
  JsaHistoricalRankCompared:Number(ranks?.comparedBasho||0),
  independentBirthDateMatch:rawIdentity?.birthDateStatus==='match',
  sourceEligibilityChecked:true,strictAuditPassed:false,certified:false,
  productionReleaseApproved:false,photoRightsReviewedSeparately:true};
}
export function summarizePreflight(rows){
 if(rows.length!==190||new Set(rows.map(x=>x.sourceId)).size!==190)
  throw Error('Certification preflight must cover exactly 190 immutable source IDs');
 const count=x=>rows.filter(r=>r.blockers.includes(x)).length;
 const all=[...new Set(rows.flatMap(x=>x.blockers))].sort();
 return {schemaVersion:1,cohortSize:190,scope:'Research-only strict Sumo career preflight; never self-certifies',
  candidateForStrictAudit:rows.filter(x=>x.classification==='candidate-for-strict-audit').length,
  needsSourceOrManualReview:rows.filter(x=>x.blockers.length>0).length,
  blockerCounts:Object.fromEntries(all.map(x=>[x,count(x)])),
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
