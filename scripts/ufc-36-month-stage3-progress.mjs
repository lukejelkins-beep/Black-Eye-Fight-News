#!/usr/bin/env node
/** Offline, read-only, cache-grounded Stage 3 career/round coverage audit. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const arr=x=>Array.isArray(x)?x:[];
const numId=x=>/^[1-9][0-9]{0,11}$/.test(String(x??''))?String(x):null;
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x??''))?x:null;
const normal=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const key=(day,a,b)=>day&&normal(a)&&normal(b)&&normal(a)!==normal(b)?
  day+':'+[normal(a),normal(b)].sort().join(':'):null;
const ratio=(n,d)=>d?Number((100*n/d).toFixed(1)):null;
const sorted=(set)=>[...set].sort();
const isUfc=row=>String(row?.promotion||row?.org||'').toLowerCase()==='ufc'&&
  ['win','loss','draw','no_contest','w','l','d','nc'].includes(
    String(row?.result||row?.outcome||row?.status||'').toLowerCase());

export function auditApprovedStage3(approval,census,progress,research,archive={}){
  if(approval?.status!=='approved'||approval?.approvedBy!=='user'||approval?.schema!==1||
     approval?.scope!=='ufc-36-month-roster')throw Error('Stage 3 roster not approved');
  const approved=arr(approval.approvedFighters);
  if(approved.length!==783||new Set(approved).size!==783||
    approved.some(s=>typeof s!=='string'||!s))throw Error('Invalid immutable 783-fighter cohort');
  if(census?.indexCompleteness!=='36_month_event_scan_complete'||
    census?.scope!=='ufc'||census?.activityMonths!==36)throw Error('Invalid cached UFC census');
  const current=new Map(arr(census.fighters).map(f=>[f.slug,f]));
  const currentEligible=new Set(arr(census.fighters).filter(f=>
    f?.eligibilityStatus==='latest_observed_mma_ufc').map(f=>f.slug));
  const bouts=progress?.bouts||{},roundDone=progress?.roundDone||{},
    fights=archive?.fights||{},profiles=research?.profiles||{};
  let profilesWithHistory=0,fullyCertified=0,historyRows=0,nativeLinks=0,
    fightersWithFive=0,fightersWithTen=0,withMeasuredRecent=0,
    fullFiveMeasured=0,fullTenMeasured=0,unlinkedCareerRows=0,
    linkedArchiveRounds=0,linkedArchiveMetrics=0;
  const missingIndex=new Set(),allKnownNativeIds=new Set(),indexedNative=new Set(),
    linkedRounds=new Set(),linkedMetrics=new Set(),missingRounds=new Set(),
    missingHistory=[],blockedByEligibility=[],certified=[];
  const cohorts=[];
  for(const slug of approved){
    const eligible=currentEligible.has(slug);
    if(!eligible)blockedByEligibility.push(slug);
    const profile=profiles[slug]||{};
    const history=arr(profile.recentHistory).filter(isUfc).filter(r=>!date(r.date)||r.date<=census.asOf);
    if(history.length)profilesWithHistory++;
    if(profile.ufcTimeline?.complete===true){fullyCertified++;certified.push(slug);}
    historyRows+=history.length;
    const nativeForFighter=new Set();
    const observed=[];
    const recordIds=new Set(),recordText=new Set();
    for(const row of history){
      const bid=row.source==='native'?numId(row.boutId):null;
      const semantic=date(row.date)+'|'+normal(row.opponent);
      if(bid?recordIds.has(bid):recordText.has(semantic))continue;
      if(bid)recordIds.add(bid);else recordText.add(semantic);
      if(bid){
        nativeForFighter.add(bid);allKnownNativeIds.add(bid);
        if(bouts[bid]?.org==='ufc')indexedNative.add(bid);
        else missingIndex.add(bid);
      }else unlinkedCareerRows++;
      observed.push({id:bid,date:row.date,opponent:row.opponent});
    }
    nativeLinks+=nativeForFighter.size;
    observed.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const samples=observed.map(r=>{
      if(!r.id||bouts[r.id]?.org!=='ufc')return {indexed:false,measured:false};
      const fight=bouts[r.id];
      const eventDate=date(fight.eventDate),a=fight.a?.name,b=fight.b?.name;
      const entry=fights[key(eventDate,a,b)]||null;
      const rounds=arr(entry?.rounds);
      const measured=rounds.some(row=>row&&['a','b'].some(c=>
        row[c]&&Object.keys(row[c]).some(m=>m!=='sourceByMetric'&&Number.isFinite(row[c][m]))));
      if(rounds.length){
        linkedRounds.add(r.id);
        if(measured)linkedMetrics.add(r.id);
      }
      if(!measured)missingRounds.add(r.id);
      return {indexed:true,measured};
    });
    const latestFive=samples.slice(0,5),latestTen=samples.slice(0,10);
    if(observed.length>=5)fightersWithFive++;
    if(observed.length>=10)fightersWithTen++;
    if(latestFive.some(r=>r.measured))withMeasuredRecent++;
    if(observed.length>=5&&latestFive.every(r=>r.measured))fullFiveMeasured++;
    if(observed.length>=10&&latestTen.every(r=>r.measured))fullTenMeasured++;
    if(!history.length)missingHistory.push(slug);
    cohorts.push({slug,eligible,lastUfcFight:current.get(slug)?.lastUfcFight||null,
      historyRows:history.length,uniqueObserved:observed.length,
      nativeFightIds:nativeForFighter.size,
      indexedNativeIds:observed.filter(r=>r.id&&bouts[r.id]?.org==='ufc').length,
      lastFiveMeasured:latestFive.filter(r=>r.measured).length,
      lastTenMeasured:latestTen.filter(r=>r.measured).length,
      timelineCertified:profile.ufcTimeline?.complete===true});
  }
  const withUnindexed=cohorts.filter(c=>c.nativeFightIds>c.indexedNativeIds).length;
  const allIndexedMissingRounds=sorted(missingRounds);
  const summary={
    asOf:census.asOf,approvedSnapshotAsOf:approval.rosterAsOf,
    approvalHash:approval.approvedRosterSha256||null,
    approvedFighters:approved.length,
    stillEligibleApproved:approved.filter(x=>currentEligible.has(x)).length,
    approvedNotCurrentlyEligible:blockedByEligibility.length,
    newlyEligibleNotInApproval:sorted(new Set([...currentEligible].filter(x=>!approved.includes(x)))).length,
    profilesWithSavedUfcHistory:profilesWithHistory,
    profilesWithoutSavedUfcHistory:missingHistory.length,
    fullyProviderCertifiedTimelines:fullyCertified,
    savedUfcHistoryRows:historyRows,uniqueNativeFightIds:allKnownNativeIds.size,
    nativeLinksAcrossFighters:nativeLinks,
    uniquelyIndexedNativeFightIds:indexedNative.size,
    uniqueNativeFightIdsAwaitingIndex:missingIndex.size,
    fightersWithNativeIndexGaps:withUnindexed,
    unlinkedCareerHistoryRows:unlinkedCareerRows,
    indexedFightsWithArchivedRounds:linkedRounds.size,
    indexedFightsWithMeasuredRoundMetrics:linkedMetrics.size,
    indexedNativeFightsWithoutConfirmedMeasuredRounds:indexedNative.size-linkedMetrics.size,
    fightersWithAtLeastFiveObservedUfcFights:fightersWithFive,
    fightersWithAtLeastTenObservedUfcFights:fightersWithTen,
    fightersWithAnyMeasuredRecentFight:withMeasuredRecent,
    fightersWithMeasuredFiveOfFive:fullFiveMeasured,
    fightersWithMeasuredTenOfTen:fullTenMeasured,
    proportionIndexedNativeFightIds:ratio(indexedNative.size,allKnownNativeIds.size),
    providerCallsLastRun:progress.lastCalls??null,
    providerStatus:progress.status||null,
    providerUsedAtStart:progress?.provider?.usedAtStart??null,
    lastCollectorRun:progress.lastRun||null
  };
  return {
    schema:1,scope:'ufc-36-month-stage3-progress',summary,
    topGaps:cohorts.filter(c=>c.eligible&&c.nativeFightIds>c.indexedNativeIds)
      .sort((a,b)=>(b.nativeFightIds-b.indexedNativeIds)-(a.nativeFightIds-a.indexedNativeIds))
      .slice(0,30),
    savedKnownIdsAwaitingIndex:sorted(missingIndex).slice(0,30),
    unmeasuredIndexedIds:allIndexedMissingRounds.slice(0,30),
    approvedMissingHistory:missingHistory.slice(0,30),
    approvedNoLongerEligible:blockedByEligibility.slice(0,30),
    note:'This report reads saved caches only. Measured round metrics require a matching native bout ID and actual archived round values. History rows do not prove complete UFC careers; only provider-explicit completeness is certified. Unlinked historical bouts and missing provider round statistics are not invented.'
  };
}
export function markdownReport(report){
 const s=report.summary;
 const labels={
   approvedFighters:'Approved fighters',stillEligibleApproved:'Approved and currently eligible',
   approvedNotCurrentlyEligible:'Approved roster members now excluded by current evidence',
   newlyEligibleNotInApproval:'Newly eligible fighters outside original approval',
   profilesWithSavedUfcHistory:'Profiles with saved UFC history',
   profilesWithoutSavedUfcHistory:'Profiles without saved UFC history',
   fullyProviderCertifiedTimelines:'Provider-certified complete UFC timelines',
   savedUfcHistoryRows:'Saved UFC history rows',
   uniqueNativeFightIds:'Distinct native fight IDs referenced by approved fighters',
   uniquelyIndexedNativeFightIds:'Distinct native fight IDs indexed as official UFC',
   uniqueNativeFightIdsAwaitingIndex:'Native fight IDs awaiting indexing',
   unlinkedCareerHistoryRows:'UFC history rows without native fight IDs',
   indexedFightsWithMeasuredRoundMetrics:'Indexed fights with independently matched round metrics',
   indexedNativeFightsWithoutConfirmedMeasuredRounds:'Indexed native fights without confirmed measured round values',
   fightersWithAtLeastFiveObservedUfcFights:'Fighters with ≥5 observed UFC fights',
   fightersWithMeasuredFiveOfFive:'Fighters with measured statistics for all 5 most recent',
   fightersWithAtLeastTenObservedUfcFights:'Fighters with ≥10 observed UFC fights',
   fightersWithMeasuredTenOfTen:'Fighters with measured statistics for all 10 most recent',
   providerCallsLastRun:'Provider requests in last collector run',
   lastCollectorRun:'Last saved collector run'
 };
 return ['## BEFN Stage 3 — approved UFC career collection (offline)',
   'Snapshot as of '+s.asOf+', user approval as of '+s.approvedSnapshotAsOf+'.',
   '| Metric | Saved evidence |','|---|---:|',
   ...Object.entries(labels).map(([k,label])=>'| '+label+' | '+String(s[k]??'unknown')+' |'),
   '', 'Data only counts confirmed archived values; a blank/missing statistic is not zero.',
   'This audit makes no UFCalendar API requests and does not publish profiles.'
 ].join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=auditApprovedStage3(
   read('data/ufc-36-month-roster-approval.json'),
   read('data/ufc-36-month-candidates.json'),
   read('data/ufcalendar-rich-progress.json'),
   read('data/ufcalendar-fighter-research.json'),
   read('data/ufc-research-archive.json'));
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-36-month-stage3-progress.json'),JSON.stringify(r,null,2)+'\n');
 fs.writeFileSync(path.join(qa,'ufc-36-month-stage3-progress.md'),markdownReport(r));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdownReport(r));
 console.log('BEFN_STAGE3_PROGRESS='+JSON.stringify(r.summary));
}