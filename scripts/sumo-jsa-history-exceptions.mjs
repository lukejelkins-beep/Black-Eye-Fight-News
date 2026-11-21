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
export function auditJsaSnapshot(rosterItem,doc,projection=null){
 if(!doc)return null;
 const sourceId=Number(rosterItem.sourceId);
 if(Number(doc.sourceId)!==sourceId||Number(doc.officialNskId)!==Number(rosterItem.officialNskId))
   throw Error('JSA source identity does not match frozen roster for '+sourceId);
 const rec=doc.bashoReconciliation||{};
 const differences=Array.isArray(rec.discrepancies)?rec.discrepancies:[];
 const rankAudit=doc.rankReconciliation||null;
 const rankDisagreements=Array.isArray(rankAudit?.mismatches)?rankAudit.mismatches:[];
 const publicFields=Object.entries(doc.fieldComparisons||{})
   .filter(([_,v])=>v===false).map(([field])=>field);
 if(Number(rec.discrepantBasho||0)!==differences.length)
   throw Error('JSA discrepancy count mismatch for '+sourceId);
 // A JSA profile with matched identity/basic fields and validated completed
 // tournament rows may simply omit a Career Record aggregate. This remains
 // a FULL-CAREER VERIFICATION GAP, not a historical bout discrepancy.
 const excluded=String(rec.excludedCurrentBasho||'');
 const officialDates=new Set((doc.officialBashoRecords||[]).map(x=>String(x.bashoId)));
 const priorBasho=(projection?.perBasho||[]).filter(x=>
  /^\d{4}(01|03|05|07|09|11)$/.test(String(x.bashoId||''))&&
  Number(x.scheduledBoutRows||0)>0&&
  (!excluded||String(x.bashoId)<excluded));
 const missingOfficialHistoricalBasho=priorBasho.filter(x=>
   !officialDates.has(String(x.bashoId))).map(x=>({
    bashoId:x.bashoId,wins:x.wins,losses:x.losses,
    scheduledBoutRows:x.scheduledBoutRows,
    missingEvidence:'no independently published JSA tournament W-L in saved official source'
   }));
 const officialCoverageNotComplete=missingOfficialHistoricalBasho.length>0;
 const careerTotalsNotFound=doc.career==null&&
   doc.status==='parse-review'&&publicFields.length===0&&
   Number(rec.comparedBasho||0)>0&&differences.length===0;
 const reviewClassification=careerTotalsNotFound?
   'official-career-totals-not-found':
   differences.length?'historical-tournament-disagreement':
   publicFields.length?'official-profile-field-disagreement':
   doc.status!=='basic-fields-parsed'?'official-parser-review':
   officialCoverageNotComplete?'official-public-tournament-coverage-shortfall':'none';
 return {
  sourceId,name:rosterItem.shikonaEn,officialProfileUrl:doc.url,
  asOf:doc.officialAsOf||null,
  publicProfileStatus:doc.status||'unclassified',
  reviewClassification,
  officialCareerTotalsNotFound:careerTotalsNotFound,
  officialCareerTotalSourceUnresolved:careerTotalsNotFound,
  publicFieldDisagreements:publicFields,
  roundedCompatiblePublicMeasurements:Object.entries(doc.measurementComparisonDetails||{})
    .filter(([_,d])=>d?.method==='integer-display-rounding-compatible')
    .map(([field,d])=>({field,officialDisplayed:d.published,apiPrecise:d.api,
      status:'compatible-with-official-integer-display-not-a-new-weigh-in'})),
  tournamentRowsCompared:Number(rec.comparedBasho||0),
  sourcePriorCompletedBashoWithRecordedBouts:priorBasho.length,
  missingOfficialHistoricalBasho,
  missingOfficialHistoricalBashoCount:missingOfficialHistoricalBasho.length,
  earliestMissingOfficialBasho:missingOfficialHistoricalBasho[0]?.bashoId||null,
  tournamentRowsAgreed:Number(rec.agreeingBasho||0),
  unreconciledTournamentCount:differences.length,
  officialRankRowsCompared:Number(rankAudit?.comparedBasho||0),
  officialRankMismatches:rankDisagreements.length,
  rankDiscrepancies:rankDisagreements.map(x=>({...x,certification:'not-started'})),
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
export function buildJsaExceptionReport(roster,cache,projections=new Map()){
 if(roster?.count!==190||roster?.rikishi?.length!==190)throw Error('Invalid 190-rikishi cohort');
 const checked=[],review=[];
 for(const w of roster.rikishi){
  const s=cache.get(Number(w.sourceId));
  if(!s)continue;
  const result=auditJsaSnapshot(w,s,projections.get(Number(w.sourceId))||null);
  checked.push(result);
  if(result.unreconciledTournamentCount>0||result.officialRankMismatches>0||
    result.publicProfileStatus!=='basic-fields-parsed'||result.publicFieldDisagreements.length||
    result.missingOfficialHistoricalBashoCount>0){
    review.push(result);
  }
 }
 return {schemaVersion:1,scope:'Research-only official tournament result and parser exception register; never full-career certification',
  cohortSize:190,capturedProfiles:checked.length,pendingProfiles:190-checked.length,
  historicalTournamentsCompared:checked.reduce((n,x)=>n+x.tournamentRowsCompared,0),
  historicalTournamentsDisagree:checked.reduce((n,x)=>n+x.unreconciledTournamentCount,0),
  officialBanzukeRanksCompared:checked.reduce((n,x)=>n+x.officialRankRowsCompared,0),
  officialBanzukeRankDiscrepancies:checked.reduce((n,x)=>n+x.officialRankMismatches,0),
  historicalCases:review.filter(x=>x.unreconciledTournamentCount>0).map(x=>x.sourceId),
  sourceCoverageCases:review.filter(x=>x.missingOfficialHistoricalBashoCount>0).length,
  missingOfficialHistoricalBashoTotal:checked.reduce((n,x)=>n+x.missingOfficialHistoricalBashoCount,0),
  profileReviewCases:review.length,
  officialCareerTotalsNotFoundCases:review.filter(x=>x.officialCareerTotalsNotFound).length,
  roundedCompatibleProfileCount:checked.filter(x=>
    x.roundedCompatiblePublicMeasurements.length>0).length,
  roundedCompatibleMeasurements:checked.reduce((n,x)=>
    n+x.roundedCompatiblePublicMeasurements.length,0),
  genuineParserOrFieldReviewCases:review.filter(x=>!x.officialCareerTotalsNotFound&&
   x.unreconciledTournamentCount===0&&
   (x.publicProfileStatus!=='basic-fields-parsed'||x.publicFieldDisagreements.length)).length,
  cases:review.sort((a,b)=>b.unreconciledTournamentCount-a.unreconciledTournamentCount||a.sourceId-b.sourceId),
  sourceBashoResultsIndependentlyCertified:0,
  certifiedCareers:0,
  note:'Current partially completed November 2026 basho is excluded. A missing official career aggregate is classified separately from verified per-basho results and does not enable career certification.'};
}
async function main(){
 const roster=await parse('data/sumo/rikishi-index.json'),docs=new Map(),projections=new Map();
 for(const w of roster.rikishi){
  const d=await optional(join(ROOT,'jsa-public','profiles',w.sourceId+'.json'));
  if(d)docs.set(Number(w.sourceId),d);
  const p=await optional(join(ROOT,'profile-ready',w.sourceId+'.json'));
  if(p)projections.set(Number(w.sourceId),p);
 }
 const report=buildJsaExceptionReport(roster,docs,projections);
 const p=join(ROOT,'jsa-public','exception-register.json'),before=await optional(p);
 if(JSON.stringify(before)!==JSON.stringify(report)){
  await mkdir(join(ROOT,'jsa-public'),{recursive:true});
  const tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(report,null,2)+'\n');await rename(tmp,p);
 }
 console.log(JSON.stringify({captured:report.capturedProfiles,
  tournamentComparisons:report.historicalTournamentsCompared,
  historicalIssues:report.historicalTournamentsDisagree,
  sourceCoverageCases:report.sourceCoverageCases,
  missingOfficialHistoricalBashoTotal:report.missingOfficialHistoricalBashoTotal,
  reviewCases:report.profileReviewCases,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
