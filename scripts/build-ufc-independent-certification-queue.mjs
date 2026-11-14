#!/usr/bin/env node
/**
 * BEFN read-only independent UFC career verification work queue.
 * Runs inside the EXISTING five-minute collector, after its Stage 3 audit.
 * No HTTP requests, no provider calls, no writes to canonical collector data.
 * UFCStats collection remains off until access conditions can be verified.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const states=['official_history_gap','native_identity_review','cached_bout_reconciliation',
 'known_fight_data_gap','source_listing_review','independent_history_certified'];
const number=x=>Number.isSafeInteger(x)&&x>=0?x:0;

export function buildCertificationQueue(approval,report,registry,{batchSize=20}={}){
 const roster=approval?.approvedFighters;
 if(approval?.schema!==1||approval.status!=='approved'||!Array.isArray(roster)||
    roster.length!==783||new Set(roster).size!==783||
    report?.scope!=='ufc-36-month-stage3-progress'||
    report?.summary?.approvedFighters!==783||
    registry?.scope!=='ufc-independent-full-career-verification'||
    registry?.rosterAsOf!==approval.rosterAsOf||
    !Number.isInteger(batchSize)||batchSize<1||batchSize>50)
   throw Error('Invalid approved 783-fighter audit/registry or bounded batch size');
 const decisions=new Map();
 for(const row of report.careerVerificationDecisions||[]){
   if(!roster.includes(row?.slug)||decisions.has(row.slug))throw Error('Invalid or duplicate Stage 3 decision');
   decisions.set(row.slug,row);
 }
 if(decisions.size!==783)throw Error('Missing Stage 3 decisions');
 const ambiguous=new Set((report.profilesWithAmbiguousNumericIdentity||[]).map(x=>x.slug));
 const cache=new Map((report.cachedCareerHistoryCandidates||[]).map(x=>[x.slug,x]));
 const officialMissing=new Map((report.officialSourceInventory?.cases||[])
   .filter(x=>x?.slug).map(x=>[x.slug,true]));
 const queue=roster.map(slug=>{
   const d=decisions.get(slug), proof=registry.fighters?.[slug]||{};
   const cached=cache.get(slug);
   const certified=d.independentlyVerifiedFullCareer===true&&
     proof.sourceCoverageAttested===true&&
     proof.verificationMethod==='full_official_ufc_fight_listing_crosscheck'&&
     number(d.minimumConfirmedMissingHistoricalUfcBouts)===0&&
     !officialMissing.has(slug)&&!ambiguous.has(slug)&&
     number(cached?.missingIndexedOfficialUfcFights?.length)===0&&
     number(cached?.historicalIdentityConflicts?.length)===0&&
     d.allKnownFightsIndexed===true&&d.allKnownFightsMeasured===true;
   let state='source_listing_review',priority=4;
   if(certified){state='independent_history_certified';priority=99;}
   else if(number(d.minimumConfirmedMissingHistoricalUfcBouts)>0||
     officialMissing.has(slug)){state='official_history_gap';priority=0;}
   else if(ambiguous.has(slug)){state='native_identity_review';priority=1;}
   else if(number(cached?.missingIndexedOfficialUfcFights?.length)>0||
     number(cached?.historicalIdentityConflicts?.length)>0){
       state='cached_bout_reconciliation';priority=2;
   }else if(!d.allKnownFightsIndexed||!d.allKnownFightsMeasured){
     state='known_fight_data_gap';priority=3;
   }
   const reason=state==='official_history_gap'?'Reconcile independently listed UFC bouts with native history':
     state==='native_identity_review'?'Resolve numeric UFC athlete identity before comparing histories':
     state==='cached_bout_reconciliation'?'Reconcile already cached UFC bout identities first':
     state==='known_fight_data_gap'?'Resolve native or measured-round gaps':
     state==='source_listing_review'?'Independently check exhaustive UFCStats fighter and fight-detail listing':
     'Full independent certification previously passed strict Stage 3 checks';
   return {slug,state,priority,reason,knownUfcBouts:number(d.knownOfficialUfcFightCount),
     sourceMinimum:d.sourceVerifiedMinimumOfficialUfcBouts??null,
     minimumMissing:number(d.minimumConfirmedMissingHistoricalUfcBouts),
     independentSourceAttested:proof.sourceCoverageAttested===true,
     fullCareerCertified:certified};
 }).sort((a,b)=>a.priority-b.priority||
    b.minimumMissing-a.minimumMissing||
    b.knownUfcBouts-a.knownUfcBouts||a.slug.localeCompare(b.slug));
 const summary=Object.fromEntries(states.map(s=>[s,queue.filter(x=>x.state===s).length]));
 const pending=queue.filter(x=>!x.fullCareerCertified);
 return {schema:1,scope:'ufc-independent-certification-work-queue',
   rosterAsOf:approval.rosterAsOf,total:783,
   status:'offline_evidence_triage_not_source_crawl',
   summary:{...summary,pending:pending.length,certified:783-pending.length,
     batchSize:Math.min(batchSize,pending.length)},
   nextBatch:pending.slice(0,batchSize),queue,
   note:'No source HTTP access or calls were performed. This queue never certifies from known-bout coverage, provider metadata, or an inventory minimum. Independent source collection needs separate verified access and exhaustive per-bout URL evidence.'};
}
export function main(){
 const output=buildCertificationQueue(
   read('data/ufc-36-month-roster-approval.json'),
   read('qa/ufc-36-month-stage3-progress.json'),
   read('data/ufc-independent-full-career-verification.json'));
 const out=path.join(root,'qa/ufc-independent-certification-queue.json');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
 console.log('BEFN_INDEPENDENT_CERTIFICATION '+JSON.stringify(output.summary));
 if(process.env.GITHUB_STEP_SUMMARY)
   fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
     '\n### UFC independent career certification (offline)\n'+
     'Certified: '+output.summary.certified+'/783; pending: '+
      output.summary.pending+'; next evidence batch: '+output.nextBatch.length+
     '. No independent source requests made.\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
