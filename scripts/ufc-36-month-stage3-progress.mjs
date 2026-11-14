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
const isFeederTitle=title=>/(?:contender\s+series|road\s+to\s+ufc|\bdwcs\b)/i.test(String(title||''));
const isFinaleTitle=title=>/(?:the\s+ultimate\s+fighter|\btuf\s*\d+).*finale/i.test(String(title||''));
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
  const titlesByDate=new Map();
  for(const bout of Object.values(bouts)){
    if(bout?.org!=='ufc'||!date(bout.eventDate)||!bout.event)continue;
    if(!titlesByDate.has(bout.eventDate))titlesByDate.set(bout.eventDate,new Set());
    titlesByDate.get(bout.eventDate).add(bout.event);
  }
  // Only dated event titles already in the cache may exclude a fight;
  // a Tuesday or missing native ID alone is never evidence of a feeder.
  const feederDates=new Set([...titlesByDate].filter(([,names])=>
    names.size&&[...names].every(isFeederTitle)).map(([d])=>d));
  const officialFinaleDates=new Set([...titlesByDate].filter(([,names])=>
    names.size&&[...names].every(t=>!isFeederTitle(t))&&
    [...names].some(isFinaleTitle)).map(([d])=>d));
  const excludedFeederFightIds=new Set();
  let excludedFeederHistoryRows=0;
  let profilesWithHistory=0,fullyCertified=0,historyRows=0,nativeLinks=0,
    fightersWithFive=0,fightersWithTen=0,withMeasuredRecent=0,
    fullFiveMeasured=0,fullTenMeasured=0,unlinkedCareerRows=0,
    allKnownIndexed=0,allKnownMeasured=0,certifiedAndIndexed=0;
  const missingIndex=new Set(),allKnownNativeIds=new Set(),indexedNative=new Set(),
    linkedRounds=new Set(),linkedMetrics=new Set(),missingRounds=new Set(),
    missingHistory=[],blockedByEligibility=[],certified=[];
  const idCheckEntries=Object.entries(progress?.ufcFullCareerHistoryChecks||{})
    .filter(([s,r])=>approved.includes(s)&&r&&typeof r==='object');
  const identityChecksCompleted=idCheckEntries.filter(([,r])=>r.status==='checked');
  const identityChecksRetry=idCheckEntries.filter(([,r])=>r.status==='retry');
  const identityCheckDiscoveredUfcBouts=identityChecksCompleted.reduce((n,[,r])=>
    n+(Number.isInteger(r.newUfcBoutsRecovered)?Math.max(0,r.newUfcBoutsRecovered):0),0);
  const missingTier=new Map();
  // Both corners must have an actual measured value for a metric to support
  // fighter-versus-opponent comparison. A missing value is never assumed zero.
  const coreMetrics=['sigLanded','controlSec','knockdowns','subAttempts','takedowns'];
  const pairedMetricFights=Object.fromEntries(coreMetrics.map(metric=>[metric,new Set()]));
  const allPairedCoreFights=new Set();
  const cohorts=[];
  for(const slug of approved){
    const eligible=currentEligible.has(slug);
    if(!eligible)blockedByEligibility.push(slug);
    const profile=profiles[slug]||{};
    const allHistory=arr(profile.recentHistory).filter(isUfc).filter(r=>!date(r.date)||r.date<=census.asOf);
    for(const row of allHistory.filter(r=>feederDates.has(date(r.date)))){
      excludedFeederHistoryRows++;
      const native=row.source==='native'?numId(row.boutId):null;
      if(native)excludedFeederFightIds.add(native);
    }
    const history=allHistory.filter(r=>!feederDates.has(date(r.date)));
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
    const samples=observed.map((r,position)=>{
      if(!r.id||bouts[r.id]?.org!=='ufc'){
        if(r.id){
          const tier=position<5?6:position<10?5:3;
          missingTier.set(r.id,Math.max(missingTier.get(r.id)||0,tier));
        }
        return {indexed:false,measured:false};
      }
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
      for(const metric of coreMetrics){
        // Require both corners in the same measured round; values from
        // unrelated rounds cannot be combined into a false comparison.
        const paired=rounds.some(round=>
          Number.isFinite(round?.a?.[metric])&&
          Number.isFinite(round?.b?.[metric]));
        if(paired)pairedMetricFights[metric].add(r.id);
      }
      if(coreMetrics.every(metric=>pairedMetricFights[metric].has(r.id)))
        allPairedCoreFights.add(r.id);
      if(!measured)missingRounds.add(r.id);
      return {indexed:true,measured};
    });
    if(observed.length>0&&samples.every(r=>r.indexed)){
      allKnownIndexed++;
      if(profile.ufcTimeline?.complete===true)certifiedAndIndexed++;
    }
    if(observed.length>0&&samples.every(r=>r.measured))allKnownMeasured++;
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
  const officialFinaleGaps=[];
  for(const slug of approved){
    for(const r of arr(profiles[slug]?.recentHistory)){
      const id=r?.source==='native'?numId(r.boutId):null;
      if(id&&missingIndex.has(id)&&officialFinaleDates.has(date(r.date)))
        officialFinaleGaps.push(id);
    }
  }
  const allIndexedMissingRounds=sorted(missingRounds);
  const checks=progress?.ufcCareerBoutChecks||{};
  // Only audit native IDs referenced by the approved roster. A saved
  // retry date is data, not permission to assume a failed lookup succeeded.
  const missingDiagnostics=[...missingIndex].map(id=>{
    const check=checks[id]||{};
    const retryAfter=date(check.retryAfter);
    const manual=check.status==='requires_manual_review';
    const cooling=!!retryAfter&&retryAfter>census.asOf;
    const action=manual?'manual_review':cooling?'cooldown':
      (check.checkedAt?'retry_eligible':'not_yet_attempted');
    return {id,priorityTier:missingTier.get(id)||0,action,
      retryAfter:retryAfter||null};
  }).sort((a,b)=>(b.priorityTier-a.priorityTier)||
    (a.action==='not_yet_attempted'?-1:0)-(b.action==='not_yet_attempted'?-1:0)||
    a.id.localeCompare(b.id));
  const blockedCount=type=>missingDiagnostics.filter(x=>x.action===type).length;
  const readyCount=tier=>missingDiagnostics.filter(x=>
    (tier===null||x.priorityTier===tier)&&
    (x.action==='not_yet_attempted'||x.action==='retry_eligible')).length;
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
    excludedFeederHistoryRowsWithCachedEventEvidence:excludedFeederHistoryRows,
    excludedDistinctFeederNativeFightIds:excludedFeederFightIds.size,
    manualReviewOfficialFinaleFightIds:new Set(officialFinaleGaps).size,
    indexedFightsWithArchivedRounds:linkedRounds.size,
    indexedFightsWithMeasuredRoundMetrics:linkedMetrics.size,
    indexedNativeFightsWithoutConfirmedMeasuredRounds:indexedNative.size-linkedMetrics.size,
    profilesWithAllKnownUfcBoutsIndexed:allKnownIndexed,
    profilesWithAllKnownUfcBoutsMeasured:allKnownMeasured,
    providerCertifiedProfilesWithAllKnownBoutsIndexed:certifiedAndIndexed,
    missingKnownFightIdsInRecentFive:[...missingTier.values()].filter(v=>v===6).length,
    missingKnownFightIdsInFightsSixToTen:[...missingTier.values()].filter(v=>v===5).length,
    missingKnownFightIdsBeyondTen:[...missingTier.values()].filter(v=>v===3).length,
    missingKnownNativeIdsNotYetAttempted:blockedCount('not_yet_attempted'),
    missingKnownNativeIdsOnRetryCooldown:blockedCount('cooldown'),
    missingKnownNativeIdsFlaggedManualReview:blockedCount('manual_review'),
    missingKnownNativeIdsRetryEligible:blockedCount('retry_eligible'),
    missingKnownNativeIdsReadyForLookup:readyCount(null),
    recentFiveMissingIdsReadyForLookup:readyCount(6),
    sixToTenMissingIdsReadyForLookup:readyCount(5),
    distinctIndexedFightsWithPairedSignificantStrikes:pairedMetricFights.sigLanded.size,
    distinctIndexedFightsWithPairedControlTime:pairedMetricFights.controlSec.size,
    distinctIndexedFightsWithPairedKnockdowns:pairedMetricFights.knockdowns.size,
    distinctIndexedFightsWithPairedSubmissionAttempts:pairedMetricFights.subAttempts.size,
    distinctIndexedFightsWithPairedTakedowns:pairedMetricFights.takedowns.size,
    distinctIndexedFightsWithAllFivePairedCoreMetrics:allPairedCoreFights.size,
    fightersWithAtLeastFiveObservedUfcFights:fightersWithFive,
    fightersWithAtLeastTenObservedUfcFights:fightersWithTen,
    fightersWithAnyMeasuredRecentFight:withMeasuredRecent,
    fightersWithMeasuredFiveOfFive:fullFiveMeasured,
    fightersWithMeasuredTenOfTen:fullTenMeasured,
    proportionIndexedNativeFightIds:ratio(indexedNative.size,allKnownNativeIds.size),
    approvedFullCareerIdentityChecksCompleted:identityChecksCompleted.length,
    approvedFullCareerIdentityChecksOnRetry:identityChecksRetry.length,
    approvedFullCareerIdentityChecksRecoveredUfcBouts:identityCheckDiscoveredUfcBouts,
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
    priorityMissingIdDiagnostics:missingDiagnostics.slice(0,40),
    unmeasuredIndexedIds:allIndexedMissingRounds.slice(0,30),
    approvedMissingHistory:missingHistory.slice(0,30),
    approvedNoLongerEligible:blockedByEligibility.slice(0,30),
    note:'This report reads saved caches only. Provider UFC org labels may also cover DWCS and feeder contests; UFC-only stats exclude only dates with unambiguous cached feeder-event titles. Unknown dates remain unresolved. TUF Finale bouts are official UFC. No missing value is imputed as zero; provider-explicit completeness is independently tracked.'
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
   excludedFeederHistoryRowsWithCachedEventEvidence:'History rows excluded from UFC-only views on corroborated DWCS/feeder dates',
   excludedDistinctFeederNativeFightIds:'Distinct feeder fight IDs excluded from official UFC statistics',
   manualReviewOfficialFinaleFightIds:'Missing UFC fight IDs with independently cached Finale event dates',
   profilesWithAllKnownUfcBoutsIndexed:'Profiles with every currently known UFC bout indexed (not career-certified)',
   profilesWithAllKnownUfcBoutsMeasured:'Profiles with measured rounds for every currently known UFC bout',
   providerCertifiedProfilesWithAllKnownBoutsIndexed:'Provider-certified careers with all known bouts indexed',
   missingKnownFightIdsInRecentFive:'Unindexed native fight IDs in approved fighters’ latest five',
   missingKnownFightIdsInFightsSixToTen:'Unindexed native fight IDs in positions six to ten',
   missingKnownFightIdsBeyondTen:'Unindexed native fight IDs beyond the latest ten',
   missingKnownNativeIdsNotYetAttempted:'Known UFC native fight IDs never looked up individually',
   missingKnownNativeIdsOnRetryCooldown:'Known UFC native fight IDs waiting for safe retry date',
   missingKnownNativeIdsFlaggedManualReview:'Known UFC fight IDs flagged for identity/manual review',
   missingKnownNativeIdsRetryEligible:'Known UFC native fight IDs eligible for retry',
   missingKnownNativeIdsReadyForLookup:'Known UFC native fight IDs ready for a safe lookup',
   recentFiveMissingIdsReadyForLookup:'Latest-five missing UFC IDs currently ready to look up',
   sixToTenMissingIdsReadyForLookup:'Fights six-to-ten UFC IDs currently ready to look up',
   indexedFightsWithMeasuredRoundMetrics:'Indexed fights with independently matched round metrics',
   distinctIndexedFightsWithPairedSignificantStrikes:'Fights with both fighters’ significant strikes measured',
   distinctIndexedFightsWithPairedControlTime:'Fights with both fighters’ control time measured',
   distinctIndexedFightsWithPairedKnockdowns:'Fights with both fighters’ knockdowns measured',
   distinctIndexedFightsWithPairedSubmissionAttempts:'Fights with both fighters’ submission attempts measured',
   distinctIndexedFightsWithPairedTakedowns:'Fights with both fighters’ takedowns measured',
   distinctIndexedFightsWithAllFivePairedCoreMetrics:'Fights with all five two-sided core metrics measured',
   indexedNativeFightsWithoutConfirmedMeasuredRounds:'Indexed native fights without confirmed measured round values',
   fightersWithAtLeastFiveObservedUfcFights:'Fighters with ≥5 observed UFC fights',
   fightersWithMeasuredFiveOfFive:'Fighters with measured statistics for all 5 most recent',
   fightersWithAtLeastTenObservedUfcFights:'Fighters with ≥10 observed UFC fights',
   fightersWithMeasuredTenOfTen:'Fighters with measured statistics for all 10 most recent',
   approvedFullCareerIdentityChecksCompleted:'Approved full-career numeric-ID crosschecks completed',
   approvedFullCareerIdentityChecksOnRetry:'Numeric-ID crosschecks in provider retry cooldown',
   approvedFullCareerIdentityChecksRecoveredUfcBouts:'Previously missing UFC history bouts recovered by numeric-ID crosschecks',
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