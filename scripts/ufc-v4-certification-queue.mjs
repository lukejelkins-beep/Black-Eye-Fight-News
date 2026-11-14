#!/usr/bin/env node
/** Offline certification ATTEMPT triage; no provider calls or collector writes. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arr=x=>Array.isArray(x)?x:[];
const map=x=>new Map(arr(x).filter(v=>typeof v?.slug==='string').map(v=>[v.slug,v]));
const weights={
  source_proof_fails_certification_gate:0,
  source_confirmed_missing_history:1,
  source_result_conflict:2,
  native_identity_ambiguous:3,
  known_fight_coverage_gap:4,
  provider_history_discrepancy:5,
  source_search_depth_gap:6,
  source_search_manual_review:7,
  source_search_partial:8,
  source_search_retry:9
};
/**
 * Every approved fighter goes into exactly one lane. Merely having all KNOWN
 * measured bouts never qualifies an athlete for a full-career certificate.
 */
export function buildCertificationQueue(report,registry={}){
 const s=report?.summary||{},d=arr(report?.careerVerificationDecisions);
 if(report?.schema!==1||report?.scope!=='ufc-36-month-stage3-progress'||
    s.approvedFighters!==783||d.length!==783||
    new Set(d.map(x=>x?.slug)).size!==783||
    d.some(x=>typeof x?.slug!=='string'||!x.slug))
   throw Error('Refusing triage: incomplete/duplicated 783-fighter audit');
 const src=registry?.fighters||{},searches=map(report.fullFightIndexSearchReview),
   ambiguous=map(report.profilesWithAmbiguousNumericIdentity),
   rosterGaps=map(report.rosterLastBoutSourceGaps),
   sourceMissing=map(report.officialSourceInventory?.cases),
   sourceConflicts=map(report.officialSourceInventory?.conflicts);
 const lanes={certified:[],fastLane:[],exceptions:[]};
 for(const x of d){
   const slug=x.slug,base={slug,knownUfcBouts:x.knownOfficialUfcFightCount,
     lastSavedUfcFight:x.newestSavedUfcFight||null,
     indexed:!!x.allKnownFightsIndexed,measured:!!x.allKnownFightsMeasured};
   if(x.independentlyVerifiedFullCareer===true){
     lanes.certified.push({...base,status:'independently_verified_full_career'});continue;
   }
   const codes=[],add=c=>{if(!codes.includes(c))codes.push(c);};
   if(src[slug]?.sourceCoverageAttested===true&&
      src[slug]?.scope==='complete_official_ufc_career')
     add('source_proof_fails_certification_gate');
   if(x.minimumConfirmedMissingHistoricalUfcBouts>0||
      x.status==='official_source_confirms_missing_historical_bouts'||
      sourceMissing.has(slug))add('source_confirmed_missing_history');
   if(sourceConflicts.has(slug))add('source_result_conflict');
   if(ambiguous.has(slug))add('native_identity_ambiguous');
   if(!x.allKnownFightsIndexed||!x.allKnownFightsMeasured||
      x.status==='known_fight_coverage_gap')add('known_fight_coverage_gap');
   if(x.providerHistoryDiscrepancy===true||
      x.status==='provider_history_discrepancy'||
      rosterGaps.has(slug))add('provider_history_discrepancy');
   const scan=searches.get(slug);
   if(scan?.status==='source_depth_gap')add('source_search_depth_gap');
   if(scan?.status==='manual_review')add('source_search_manual_review');
   if(scan?.status==='partial')add('source_search_partial');
   if(scan?.status==='retry')add('source_search_retry');
   if(codes.length){
     codes.sort((a,b)=>weights[a]-weights[b]);
     lanes.exceptions.push({...base,reasonCodes:codes,priority:weights[codes[0]],
       searchStatus:scan?.status||null,
       numericIds:ambiguous.get(slug)?.knownNumericIds||[],
       missingSourceMinimum:x.minimumConfirmedMissingHistoricalUfcBouts||0});
   }else{
     lanes.fastLane.push({...base,
       reason:'needs_independent_exhaustive_source_attestation',
       searchStatus:scan?.status||'not_attempted_or_checked'});
   }
 }
 const count=x=>Number.isFinite(x)?x:9999;
 lanes.certified.sort((a,b)=>a.slug.localeCompare(b.slug));
 lanes.fastLane.sort((a,b)=>count(a.knownUfcBouts)-count(b.knownUfcBouts)||a.slug.localeCompare(b.slug));
 lanes.exceptions.sort((a,b)=>a.priority-b.priority||
   count(a.knownUfcBouts)-count(b.knownUfcBouts)||a.slug.localeCompare(b.slug));
 const totals={certified:lanes.certified.length,fastLane:lanes.fastLane.length,
   exceptions:lanes.exceptions.length,approved:783};
 if(totals.certified+totals.fastLane+totals.exceptions!==783||
    totals.certified!==s.independentlyVerifiedFullCareerTimelines)
   throw Error('Refusing triage: stale/nonconserving certification audit');
 return {schema:1,scope:'ufc-v4-certification-attempt-and-exception-queue',
   asOf:s.asOf,approvedSnapshotAsOf:s.approvedSnapshotAsOf,
   source:'qa/ufc-36-month-stage3-progress.json',
   certificationRule:'Only the independent Stage3 source gate may certify; fast lane remains uncertified until exhaustive source-attested UFC fight URLs match saved numeric fights and measured statistics.',
   totals,lanes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const report=read('qa/ufc-36-month-stage3-progress.json');
 const evidence=read('data/ufc-independent-full-career-verification.json');
 const queue=buildCertificationQueue(report,evidence);
 fs.writeFileSync(path.join(root,'qa/ufc-v4-certification-queue.json'),
   JSON.stringify(queue,null,2)+'\n');
 console.log('BEFN_UFC_V4_CERTIFICATION_TRIAGE='+JSON.stringify({
   ...queue.totals,nextFastLane:queue.lanes.fastLane.slice(0,8).map(x=>x.slug),
   nextExceptions:queue.lanes.exceptions.slice(0,8).map(x=>({slug:x.slug,reasons:x.reasonCodes}))
 }));
}
