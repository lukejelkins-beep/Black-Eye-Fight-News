#!/usr/bin/env node
/** Offline, read-only 36-month UFC roster sign-off inventory. No API calls. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=(file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const arr=v=>Array.isArray(v)?v:[];
const id=v=>/^[1-9][0-9]*$/.test(String(v||''))?String(v):null;
export function rosterReviewReport(census,progress={},research={},approval={}){
 if(census?.schema!==1||census?.scope!=='ufc'||census?.activityMonths!==36||
    !Array.isArray(census?.fighters)||!Array.isArray(census?.eligibilityReview)||
    !Array.isArray(census?.eligibilityExcluded))throw Error('Invalid 36-month roster census');
 const fighters=census.fighters;
 const candidates=new Map(),integrity=[];
 for(const row of fighters){
   if(!row?.slug||candidates.has(row.slug))integrity.push({reason:'duplicate_or_blank_candidate',slug:row?.slug||''});
   else candidates.set(row.slug,row);
   if(!['latest_observed_mma_ufc','review_required'].includes(row.eligibilityStatus))
     integrity.push({reason:'unknown_eligibility_status',slug:row.slug});
 }
 const exceptions=arr(census.eligibilityReview).map(e=>{
   const row=candidates.get(e.slug);
   if(!row||row.eligibilityStatus!=='review_required')integrity.push({reason:'review_state_mismatch',slug:e.slug});
   return {name:e.name,slug:e.slug,lastUfcFight:e.lastUfcFight||null,
     latestUnknownDate:e.evidence?.date||null,opponent:e.evidence?.opponent||null,
     promotion:e.evidence?.promotion||null,
     reason:e.evidence?.date?'later_bout_ruleset_or_promotion_unresolved':'ufc_departure_or_roster_status_unconfirmed'};
 }).sort((a,b)=>a.reason.localeCompare(b.reason)||a.slug.localeCompare(b.slug));
 const pending=new Set(exceptions.map(e=>e.slug));
 const proposed=fighters.filter(f=>f.eligibilityStatus==='latest_observed_mma_ufc'&&!pending.has(f.slug));
 const exclusions=census.eligibilityExcluded.map(e=>({name:e.name,slug:e.slug,
   reason:e.reason,lastUfcFight:e.lastUfcFight||null,
   date:e.evidence?.date||null,promotion:e.evidence?.promotion||null}));
 const exclusionsByReason={};
 for(const e of exclusions)exclusionsByReason[e.reason]=(exclusionsByReason[e.reason]||0)+1;
 let existingHistoryRows=0,knownNativeUfcFightIds=0,completeTimelines=0,indexedNativeIds=0;
 const distinct=new Set(),unindexed=new Set();
 for(const f of fighters){
   const profile=research?.profiles?.[f.slug]||{};
   const ufcRows=arr(profile.recentHistory).filter(x=>x&&
     String(x.promotion||x.org||'').toLowerCase()==='ufc'&&
     ['win','loss','draw','no_contest','w','l','d','nc'].includes(String(x.result||x.outcome||x.status||'').toLowerCase()));
   existingHistoryRows+=ufcRows.length;
   const linked=new Set(ufcRows.filter(x=>x.source==='native').map(x=>id(x.boutId)).filter(Boolean));
   knownNativeUfcFightIds+=linked.size;
   for(const k of linked){
     distinct.add(k);
     if(progress?.bouts?.[k]?.org==='ufc')indexedNativeIds++;
     else unindexed.add(k);
   }
   if(profile.ufcTimeline?.complete===true)completeTimelines++;
 }
 const eventScanComplete=census.indexCompleteness==='36_month_event_scan_complete'&&
   census.missingOfficialUfcEventDetails===0;
 const summary={
   asOf:census.asOf,activityCutoff:census.activityCutoff,eventScanComplete,
   indexedOfficialEvents:census.officialCompletedEventsIndexed??null,
   missingOfficialEventDetails:census.missingOfficialUfcEventDetails??null,
   provisionalIncluded:fighters.length,proposedWithoutExceptions:proposed.length,
   openExceptions:exceptions.length,excludedCount:exclusions.length,
   exclusionsByReason,integrityIssues:integrity.length,
   readyForWholeRosterReview:eventScanComplete&&exceptions.length===0&&integrity.length===0,
   userApprovalStatus:approval?.status||'not_recorded',
   alreadyCached:{savedUfcHistoryRows:existingHistoryRows,
     nativeUfcIdsPerFighter:knownNativeUfcFightIds,
     distinctNativeFightIds:distinct.size,
     indexedNativeFightIdsPerFighter:indexedNativeIds,
     uniqueNativeIdsNotYetIndexed:unindexed.size,
     completeProviderTimelines:completeTimelines}
 };
 return {schema:1,scope:'ufc-36-month-roster-review',summary,exceptions,exclusions,
   proposedRoster:proposed.map(f=>({name:f.name,slug:f.slug,lastUfcFight:f.lastUfcFight})),
   integrityIssues:integrity,note:'Pre-approval roster evidence only; pending cases require independent verification. Career cache is not a claim of fully measured round statistics.'};
}
export function summaryMarkdown(report){
 const s=report.summary,c=s.alreadyCached;
 const rows=[['36-month event scan complete',s.eventScanComplete?'Yes':'No'],
   ['Official events indexed',s.indexedOfficialEvents],['Uncached event details',s.missingOfficialEventDetails],
   ['Provisional fighters (including exceptions)',s.provisionalIncluded],
   ['Fighters without open exceptions',s.proposedWithoutExceptions],
   ['Unresolved exceptions',s.openExceptions],['Automatically excluded',s.excludedCount],
   ['Ready to request one roster-wide sign-off',s.readyForWholeRosterReview?'Yes':'No'],
   ['Approval status',s.userApprovalStatus],
   ['Saved UFC career history rows',c.savedUfcHistoryRows],
   ['Distinct native UFC fight IDs already cached in history',c.distinctNativeFightIds],
   ['Distinct native fight IDs still needing an indexed bout',c.uniqueNativeIdsNotYetIndexed],
   ['Explicitly complete provider timelines',c.completeProviderTimelines]];
 return ['## BEFN — 36-month UFC roster sign-off audit',
   'Saved observation as of '+s.asOf+' (cutoff '+s.activityCutoff+').',
   '| Measure | Result |','|---|---:|',
   ...rows.map(r=>'| '+r[0]+' | '+String(r[1]??'unknown')+' |'),'',
   '### Exceptions requiring independent research',
   ...report.exceptions.slice(0,16).map(e=>'- '+e.name+': '+e.reason+
     ', last UFC '+(e.lastUfcFight||'unknown')+
     (e.latestUnknownDate?', later fight '+e.latestUnknownDate+' versus '+(e.opponent||'unknown'):'')),
   ...(report.exceptions.length>16?['- ...plus '+(report.exceptions.length-16)+' additional exceptions in the report artifact.']:[]),
   '','Only the user can approve the final roster. Full-career expansion remains separately gated.',
   'This audit does not make UFCalendar API calls or change production.'].join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=rosterReviewReport(load('data/ufc-36-month-candidates.json'),
   load('data/ufcalendar-rich-progress.json'),
   load('data/ufcalendar-fighter-research.json'),
   load('data/ufc-36-month-roster-approval.json'));
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-36-month-roster-review.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(qa,'ufc-36-month-roster-review.md'),summaryMarkdown(report));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summaryMarkdown(report));
 console.log('BEFN_ROSTER_REVIEW_SUMMARY='+JSON.stringify(report.summary));
 console.log('BEFN_ROSTER_OPEN_EXCEPTIONS='+JSON.stringify(report.exceptions));
}
