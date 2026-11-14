/**
 * Report which JSA official tournament comparisons need human or source QA.
 * Uses already-cached JSA snapshots; no extra source requests.
 * Important: field comparisons and tournament-level W-L cannot certify a career.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT='data/sumo/backfill/v1';
const parse=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await parse(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export function auditJsaSnapshot(rosterItem,doc){
 if(!doc)return null;
 const sourceId=Number(rosterItem.sourceId);
 if(Number(doc.sourceId)!==sourceId||Number(doc.officialNskId)!==Number(rosterItem.officialNskId))
   throw Error('JSA source identity does not match frozen roster for '+sourceId);
 const rec=doc.bashoReconciliation||{};
 const differences=Array.isArray(rec.discrepancies)?rec.discrepancies:[];
 const publicFields=Object.entries(doc.fieldComparisons||{})
   .filter(([_,v])=>v===false).map(([field])=>field);
 if(Number(rec.discrepantBasho||0)!==differences.length)
   throw Error('JSA discrepancy count mismatch for '+sourceId);
 return {
  sourceId,name:rosterItem.shikonaEn,officialProfileUrl:doc.url,
  asOf:doc.officialAsOf||null,
  publicProfileStatus:doc.status||'unclassified',
  publicFieldDisagreements:publicFields,
  tournamentRowsCompared:Number(rec.comparedBasho||0),
  tournamentRowsAgreed:Number(rec.agreeingBasho||0),
  unreconciledTournamentCount:differences.length,
  discrepancies:differences.map(c=>({
    bashoId:c.bashoId,
    official:c.official,
    apiLedger:c.apiLedger,
    status:'requires-source-investigation',
    note:'Do not change historical bout results or grant certification from this comparison.'
  })),
  missingApiTournamentRows:Array.isArray(rec.unmatchedOfficialBasho)?rec.unmatchedOfficialBasho:[],
  certification:'not-started'
 };
}
export function buildJsaExceptionReport(roster,cache){
 if(roster?.count!==190||roster?.rikishi?.length!==190)throw Error('Invalid 190-rikishi cohort');
 const checked=[],review=[];
 for(const w of roster.rikishi){
  const s=cache.get(Number(w.sourceId));
  if(!s)continue;
  const result=auditJsaSnapshot(w,s);
  checked.push(result);
  if(result.unreconciledTournamentCount>0||
    result.publicProfileStatus!=='basic-fields-parsed'||result.publicFieldDisagreements.length){
    review.push(result);
  }
 }
 return {schemaVersion:1,scope:'Research-only official tournament result and parser exception register; never full-career certification',
  cohortSize:190,capturedProfiles:checked.length,pendingProfiles:190-checked.length,
  historicalTournamentsCompared:checked.reduce((n,x)=>n+x.tournamentRowsCompared,0),
  historicalTournamentsDisagree:checked.reduce((n,x)=>n+x.unreconciledTournamentCount,0),
  historicalCases:review.filter(x=>x.unreconciledTournamentCount>0).map(x=>x.sourceId),
  profileReviewCases:review.length,
  cases:review.sort((a,b)=>b.unreconciledTournamentCount-a.unreconciledTournamentCount||a.sourceId-b.sourceId),
  sourceBashoResultsIndependentlyCertified:0,
  certifiedCareers:0,
  note:'Current partially completed November 2026 basho is excluded by the source reconciler; absence-only tournaments may have no individual bout rows.'};
}
async function main(){
 const roster=await parse('data/sumo/rikishi-index.json'),docs=new Map();
 for(const w of roster.rikishi){
  const d=await optional(join(ROOT,'jsa-public','profiles',w.sourceId+'.json'));
  if(d)docs.set(Number(w.sourceId),d);
 }
 const report=buildJsaExceptionReport(roster,docs);
 const p=join(ROOT,'jsa-public','exception-register.json'),before=await optional(p);
 if(JSON.stringify(before)!==JSON.stringify(report)){
  await mkdir(join(ROOT,'jsa-public'),{recursive:true});
  const tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(report,null,2)+'\n');await rename(tmp,p);
 }
 console.log(JSON.stringify({captured:report.capturedProfiles,
  tournamentComparisons:report.historicalTournamentsCompared,
  historicalIssues:report.historicalTournamentsDisagree,
  reviewCases:report.profileReviewCases,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
