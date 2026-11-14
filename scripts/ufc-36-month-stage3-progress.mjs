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


const normalizedOutcome=value=>({
 win:'win',w:'win',loss:'loss',l:'loss',draw:'draw',d:'draw',
 nc:'no_contest',no_contest:'no_contest'
})[String(value||'').toLowerCase()]||null;

/** Full-career proof must be independently grounded, not inferred from index coverage. */
export function evaluateCareerEvidence(profile,history,rosterLatest,asOf,independentEntry){
 const timeline=profile?.ufcTimeline||{};
 const rows=arr(history);
 const latest=date(rosterLatest),snapshot=date(asOf);
 // Roster activity dates use the event-local calendar day. UFCalendar's
 // historical timestamps can roll into the next UTC day (or vice versa).
 // A one-day difference for the MOST RECENT saved fight is not evidence
 // of a missing fight. Larger gaps remain unresolved, never auto-closed.
 const newestSaved=[...rows].map(r=>date(r.date)).filter(Boolean).sort().at(-1)||null;
 const difference=latest&&newestSaved?
   (Date.parse(latest+'T00:00:00Z')-Date.parse(newestSaved+'T00:00:00Z'))/86400000:null;
 const utcDateShift=(difference===1||difference===-1);
 const rosterLatestPresent=difference===0||utcDateShift;
 const providerFlag=timeline.providerTruncatedFlag===false;
 const providerLatestMismatch=!!timeline.missingRosterLastUfcFight&&!rosterLatestPresent;
 const contradictions=Boolean(providerLatestMismatch||
   timeline.savedHistoryHasAdditionalUfcBouts===true||
   Number(timeline.conflictingNativeFightIds)>0||
   arr(profile?.ufcHistoryIdConflicts).length>0);
 const legacyClaim=timeline.complete===true&&!providerFlag;
 const providerCertified=Boolean(timeline.complete===true&&providerFlag&&
   snapshot&&date(timeline.observedOn)>=snapshot&&
   Number.isInteger(timeline.settledCount)&&timeline.settledCount>0&&
   rosterLatestPresent&&!contradictions);
 // A manually checked independent UFCStats fighter-history listing must
 // cover exactly the same complete bout identities, not a partial sample.
 const ext=independentEntry||{};
 const given=arr(ext.bouts);
 const savedKeys=rows.map(r=>[date(r.date),normal(r.opponent),
   normalizedOutcome(r.result)].join('|'));
 const givenKeys=given.map(r=>[date(r.date),normal(r.opponent),
   normalizedOutcome(r.result)].join('|'));
 const checked=ext.sourceCoverageAttested===true&&
   ext.verificationMethod==='full_official_ufc_fight_listing_crosscheck'&&
   snapshot&&date(ext.verifiedAt)>=snapshot&&
   /^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]+$/i.test(String(ext.fighterUrl||''))&&
   given.length>0&&given.every(r=>date(r?.date)&&normal(r?.opponent)&&
     normalizedOutcome(r?.result)&&
     /^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]+$/i.test(String(r?.fightUrl||'')))&&
   savedKeys.length===givenKeys.length&&
   new Set(givenKeys).size===givenKeys.length&&
   givenKeys.slice().sort().every((v,i)=>v===savedKeys.slice().sort()[i]);
 const independentlyVerified=Boolean(checked&&rosterLatestPresent&&!contradictions);
 return {providerCertified,independentlyVerified,legacyClaim,
   explicitUntruncated:providerFlag,providerDiscrepancy:contradictions,
   rosterLatestPresent,utcDateShift,providerLatestMismatch,
   newestSavedUfcFight:newestSaved,independentCheckAttempted:given.length>0};
}

export function auditApprovedStage3(approval,census,progress,research,archive={},feederEvidence={},finaleEvidence={},legacyEvidence={},independentEvidence={}){
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
  let excludedFeederHistoryRows=0,sourceVerifiedFeederHistoryRows=0;
  const curated=arr(feederEvidence?.schema===1?feederEvidence.bouts:[]);
  const sourceVerified=(slug,row)=>curated.some(item=>
    item?.boutId===numId(row?.boutId)&&item?.fighterSlug===slug&&
    item?.date===date(row?.date)&&normal(item?.opponent)===normal(row?.opponent)&&
    String(item?.sourceUrl||'').startsWith('https://www.ufc.com/'));
  let profilesWithHistory=0,fullyCertified=0,historyRows=0,nativeLinks=0,
    legacyCompleteClaims=0,independentCertified=0,providerTimelineConflicts=0,
    sourceConfirmedIncompleteCareers=0,sourceConfirmedMinimumMissingUfcBouts=0,
    rosterUtcDayAdjustments=0,providerFlagsExplainedByUtcDayShift=0,
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
  const missingTier=new Map(),missingReferences=new Map();
  // Both corners must have an actual measured value for a metric to support
  // fighter-versus-opponent comparison. A missing value is never assumed zero.
  const coreMetrics=['sigLanded','controlSec','knockdowns','subAttempts','takedowns'];
  const pairedMetricFights=Object.fromEntries(coreMetrics.map(metric=>[metric,new Set()]));
  const allPairedCoreFights=new Set();
  const cohorts=[],careerVerificationDecisions=[],rosterLastBoutSourceGaps=[];
  const careerVerificationStatusCounts={
    independently_verified_full_career:0,provider_certified_full_career:0,
    official_source_confirms_missing_historical_bouts:0,
    known_fight_coverage_gap:0,provider_history_discrepancy:0,
    legacy_completeness_flag_unsubstantiated:0,
    all_known_fights_complete_historical_unverified:0
  };
  const independentRegistry=independentEvidence?.schema===1&&
    independentEvidence?.scope==='ufc-independent-full-career-verification'&&
    independentEvidence?.rosterAsOf===approval.rosterAsOf?
      independentEvidence?.fighters||{}:{};

  // One offline pass through indexed official UFC fights, keyed by stable
  // numeric fighter ID. This can expose older bouts omitted by shortened
  // /fighters/history responses without spending another API call.
  const byNumericFighterId=new Map(),anchoredFighterIds=new Map();
  const sourceExcludedFightIds=new Set(curated.filter(x=>
    String(x?.sourceUrl||'').startsWith('https://www.ufc.com/'))
    .map(x=>numId(x?.boutId)).filter(Boolean));
  const officialEventTitle=t=>!isFeederTitle(t)&&
    (/\bufc\b/i.test(String(t||''))||isFinaleTitle(t));
  for(const [indexedId,b] of Object.entries(bouts)){
    const bid=numId(indexedId);
    if(!bid||b?.org!=='ufc'||sourceExcludedFightIds.has(bid)||
       !date(b.eventDate)||b.eventDate>census.asOf||
       !officialEventTitle(b.event)||
       !['completed','no_contest','draw'].includes(b.status))continue;
    for(const [side,other] of [['a','b'],['b','a']]){
      const num=numId(b[side]?.id);
      if(!num||!b[side]?.name||!b[other]?.name)continue;
      if(!byNumericFighterId.has(num))byNumericFighterId.set(num,[]);
      byNumericFighterId.get(num).push({
        id:bid,date:b.eventDate,opponent:b[other].name,
        name:b[side].name,slug:b[side].slug||null,
        event:b.event||null,status:b.status});
    }
  }
  const providerTimelineMetadata={
    explicitUntruncated:0,explicitTruncated:0,flagUnavailable:0,
    previouslySavedWithoutMetadata:0,noTimelineEvidence:0,
    savedHistoryContradictions:0,conflictingNativeIds:0,
    missingRosterLatestBout:0
  };
  for(const slug of approved){
    const eligible=currentEligible.has(slug);
    if(!eligible)blockedByEligibility.push(slug);
    const profile=profiles[slug]||{};
    const timeline=profile.ufcTimeline;
    if(!timeline||typeof timeline!=='object'){
      providerTimelineMetadata.noTimelineEvidence++;
    }else{
      if(timeline.providerTruncatedFlag===false)providerTimelineMetadata.explicitUntruncated++;
      else if(timeline.providerTruncatedFlag===true)providerTimelineMetadata.explicitTruncated++;
      else if(Object.hasOwn(timeline,'providerTruncatedFlag'))
        providerTimelineMetadata.flagUnavailable++;
      else providerTimelineMetadata.previouslySavedWithoutMetadata++;
      if(timeline.savedHistoryHasAdditionalUfcBouts===true)
        providerTimelineMetadata.savedHistoryContradictions++;
      if(Number(timeline.conflictingNativeFightIds)>0)
        providerTimelineMetadata.conflictingNativeIds++;
      if(timeline.missingRosterLastUfcFight)
        providerTimelineMetadata.missingRosterLatestBout++;
    }
    const allHistory=arr(profile.recentHistory).filter(isUfc).filter(r=>!date(r.date)||r.date<=census.asOf);
    for(const row of allHistory.filter(r=>feederDates.has(date(r.date))||sourceVerified(slug,r))){
      excludedFeederHistoryRows++;
      if(sourceVerified(slug,row)&&!feederDates.has(date(row.date)))sourceVerifiedFeederHistoryRows++;
      const native=row.source==='native'?numId(row.boutId):null;
      if(native)excludedFeederFightIds.add(native);
    }
    const history=allHistory.filter(r=>!feederDates.has(date(r.date))&&!sourceVerified(slug,r));
    if(history.length)profilesWithHistory++;
    // Legacy complete=true is not a certification without retained source evidence.
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
        else {
          missingIndex.add(bid);
          if(!missingReferences.has(bid))missingReferences.set(bid,[]);
          const refs=missingReferences.get(bid);
          if(!refs.some(r=>r.fighterSlug===slug))
            refs.push({fighterSlug:slug,date:date(row.date),opponent:row.opponent||null});
        }
      }else unlinkedCareerRows++;
      observed.push({id:bid,date:row.date,opponent:row.opponent});
    }
    nativeLinks+=nativeForFighter.size;
    const anchorIds=new Set();
    for(const knownId of nativeForFighter){
      const linked=bouts[knownId];
      if(!linked||linked.org!=='ufc')continue;
      for(const c of ['a','b']){
        if(linked[c]?.slug===slug||
           (profile.name&&normal(linked[c]?.name)===normal(profile.name))){
          const n=numId(linked[c]?.id);
          if(n)anchorIds.add(n);
        }
      }
    }
    anchoredFighterIds.set(slug,{ids:[...anchorIds],knownIds:nativeForFighter,
      history,profileName:profile.name||null});
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
    const knownIndexed=observed.length>0&&samples.every(r=>r.indexed);
    const knownMeasured=observed.length>0&&samples.every(r=>r.measured);
    if(knownIndexed)allKnownIndexed++;
    if(knownMeasured)allKnownMeasured++;
    const proof=evaluateCareerEvidence(profile,history,
      current.get(slug)?.lastUfcFight,census.asOf,independentRegistry[slug]);
    const independentFullCareer=knownMeasured&&proof.independentlyVerified;
    const providerFullCareer=knownMeasured&&proof.providerCertified;
    const providerHistoryDiscrepancy=proof.providerDiscrepancy||!proof.rosterLatestPresent;
    const independentRow=independentRegistry[slug]||{};
    const minVerified=independentRow.scope==='minimum_count_evidence_only'&&
      independentRow.sourceCoverageAttested===false&&
      date(independentRow.verifiedAt)>=date(census.asOf)&&
      String(independentRow.fighterUrl||'').startsWith(
        'https://www.ufc.com/athlete/')&&
      Number.isSafeInteger(independentRow.minimumOfficialUfcBouts)&&
      independentRow.minimumOfficialUfcBouts>0;
    const sourceMinimum=minVerified?independentRow.minimumOfficialUfcBouts:null;
    const confirmedMissing=minVerified?
      Math.max(0,sourceMinimum-observed.length):0;
    if(confirmedMissing>0){
      sourceConfirmedIncompleteCareers++;
      sourceConfirmedMinimumMissingUfcBouts+=confirmedMissing;
    }
    if(proof.legacyClaim)legacyCompleteClaims++;
    if(providerHistoryDiscrepancy)providerTimelineConflicts++;
    if(proof.utcDateShift)rosterUtcDayAdjustments++;
    if(proof.utcDateShift&&profile.ufcTimeline?.missingRosterLastUfcFight)
      providerFlagsExplainedByUtcDayShift++;
    if(!proof.rosterLatestPresent&&date(current.get(slug)?.lastUfcFight)){
      const latest=date(current.get(slug).lastUfcFight);
      const identityName=normal(profile.name||slug.replace(/-/g,' '));
      const candidateBouts=Object.values(bouts).filter(b=>{
        if(b?.org!=='ufc'||isFeederTitle(b.event)||!date(b.eventDate)||
           !['completed','draw','no_contest'].includes(b.status))return false;
        const shift=Math.abs((Date.parse(b.eventDate+'T00:00:00Z')-
          Date.parse(latest+'T00:00:00Z'))/86400000);
        if(shift>1)return false;
        return b.a?.slug===slug||b.b?.slug===slug||
          normal(b.a?.name)===identityName||normal(b.b?.name)===identityName;
      }).map(b=>({id:numId(b.id),eventDate:b.eventDate,event:b.event||null,
        fighterA:b.a?.name||null,fighterB:b.b?.name||null,
        status:b.status})).sort((a,b)=>a.eventDate.localeCompare(b.eventDate));
      rosterLastBoutSourceGaps.push({slug,rosterLastUfcFight:latest,
        newestSavedUfcFight:proof.newestSavedUfcFight,
        cachedOfficialBoutCandidates:candidateBouts});
    }
    if(independentFullCareer)independentCertified++;
    if(providerFullCareer){fullyCertified++;certifiedAndIndexed++;certified.push(slug);}
    const completenessStatus=!knownMeasured?'known_fight_coverage_gap':
      confirmedMissing>0?'official_source_confirms_missing_historical_bouts':
      independentFullCareer?'independently_verified_full_career':
      providerFullCareer?'provider_certified_full_career':
      providerHistoryDiscrepancy?'provider_history_discrepancy':
      proof.legacyClaim?'legacy_completeness_flag_unsubstantiated':
      'all_known_fights_complete_historical_unverified';
    careerVerificationStatusCounts[completenessStatus]++;
    careerVerificationDecisions.push({
      slug,status:completenessStatus,
      allKnownFightsIndexed:knownIndexed,allKnownFightsMeasured:knownMeasured,
      knownOfficialUfcFightCount:observed.length,
      sourceVerifiedMinimumOfficialUfcBouts:sourceMinimum,
      minimumConfirmedMissingHistoricalUfcBouts:confirmedMissing,
      independentlyVerifiedFullCareer:independentFullCareer,
      providerCertifiedFullCareer:providerFullCareer,
      oldCompleteFlagWithoutProviderEvidence:proof.legacyClaim,
      explicitProviderUntruncated:proof.explicitUntruncated,
      providerHistoryDiscrepancy:proof.providerDiscrepancy,
      rosterLatestUtcDateShift:proof.utcDateShift,
      providerLatestFightMismatch:proof.providerLatestMismatch,
      numericIdHistoryChecked:progress?.ufcFullCareerHistoryChecks?.[slug]?.status==='checked',
      providerTimelineObservedOn:date(profile.ufcTimeline?.observedOn),
      rosterLastUfcFight:date(current.get(slug)?.lastUfcFight),
      newestSavedUfcFight:proof.newestSavedUfcFight
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
      missingMeasuredFightIds:observed.filter((r,i)=>!samples[i]?.measured).map(r=>r.id),
      timelineCertified:providerFullCareer,
      independentFullCareerVerified:independentFullCareer,
      legacyCompleteFlagUnverified:proof.legacyClaim,
      careerVerificationStatus:completenessStatus});
  }
  const numericIdOwners=new Map();
  for(const [slug,x] of anchoredFighterIds){
    if(x.ids.length!==1)continue;
    const id=x.ids[0];
    if(!numericIdOwners.has(id))numericIdOwners.set(id,new Set());
    numericIdOwners.get(id).add(slug);
  }
  const cachedCareerHistoryCandidates=[];
  const profilesWithAmbiguousNumericIdentity=[];
  for(const [slug,x] of anchoredFighterIds){
    if(x.ids.length!==1){
      profilesWithAmbiguousNumericIdentity.push({slug,knownNumericIds:x.ids});
      continue;
    }
    const id=x.ids[0];
    if(numericIdOwners.get(id)?.size!==1){
      profilesWithAmbiguousNumericIdentity.push({
        slug,knownNumericIds:x.ids,reason:'shared_numeric_fighter_identity'});
      continue;
    }
    const missing=[],conflictingHistory=[];
    const knownSemantics=new Set(x.history.map(r=>
      date(r.date)+'|'+normal(r.opponent)));
    for(const b of byNumericFighterId.get(id)||[]){
      if(x.knownIds.has(b.id))continue;
      const semantic=b.date+'|'+normal(b.opponent);
      if(knownSemantics.has(semantic)){
        conflictingHistory.push({id:b.id,date:b.date,opponent:b.opponent});
        continue;
      }
      missing.push({id:b.id,date:b.date,opponent:b.opponent,
        event:b.event,status:b.status});
    }
    if(missing.length||conflictingHistory.length){
      cachedCareerHistoryCandidates.push({slug,numericFighterId:id,
        missingIndexedOfficialUfcFights:missing,
        historicalIdentityConflicts:conflictingHistory});
    }
  }
  const cacheRecoverableHistoryRows=cachedCareerHistoryCandidates.reduce((n,x)=>
    n+x.missingIndexedOfficialUfcFights.length,0);
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
  const verifiedFinales=arr(finaleEvidence?.schema===1&&
    finaleEvidence?.scope==='ufc-official-finale-recovery'?finaleEvidence.bouts:[]);
  const finaleProof=(id,refs)=>verifiedFinales.some(item=>
    numId(item?.fightId)===id&&
    String(item?.sourceUrl||'').startsWith('https://www.ufc.com/')&&
    refs.some(r=>r.fighterSlug===item.fighterSlug&&
      r.date===date(item.date)&&normal(r.opponent)===normal(item.opponent)));
  const legacySearchChecks=progress?.ufcLegacyDateSearchChecks||{};
  const verifiedLegacy=arr(legacyEvidence?.schema===1&&
    legacyEvidence?.scope==='ufc-official-legacy-evidence'?legacyEvidence.bouts:[]);
  const legacyProof=(id,refs)=>verifiedLegacy.some(item=>
    numId(item?.fightId)===id&&
    String(item?.sourceUrl||'').startsWith('https://www.ufc.com/')&&
    refs.some(r=>r.fighterSlug===item.fighterSlug&&
      r.date===date(item.date)&&normal(r.opponent)===normal(item.opponent)));
  // Only audit native IDs referenced by the approved roster. A saved
  // retry date is data, not permission to assume a failed lookup succeeded.
  const missingDiagnostics=[...missingIndex].map(id=>{
    const check=checks[id]||{};
    const retryAfter=date(check.retryAfter);
    const manual=check.status==='requires_manual_review';
    const cooling=!!retryAfter&&retryAfter>census.asOf;
    const action=manual?'manual_review':cooling?'cooldown':
      (check.checkedAt?'retry_eligible':'not_yet_attempted');
    const references=missingReferences.get(id)||[];
    return {id,priorityTier:missingTier.get(id)||0,action,
      retryAfter:retryAfter||null,
      savedReviewReason:typeof check.reason==='string'?check.reason.slice(0,120):null,
      sourceVerifiedOfficialFinale:finaleProof(id,references),
      sourceVerifiedOfficialLegacy:legacyProof(id,references),
      legacyProviderSearchStatus:legacyProof(id,references)?
        (legacySearchChecks[id]?.status||'not_attempted'):null,
      legacyProviderAlternativeId:legacyProof(id,references)?
        numId(legacySearchChecks[id]?.candidateId):null,
      references};
  }).sort((a,b)=>(b.priorityTier-a.priorityTier)||
    (a.action==='not_yet_attempted'?-1:0)-(b.action==='not_yet_attempted'?-1:0)||
    a.id.localeCompare(b.id));
  // Read-only evidence crosswalk. An event/date/opponent match may identify a
  // stale native ID, but it is never proof that the *requested* fight ID was
  // successfully hydrated or that all rounds were recorded.
  const sameMatch=(a,b,expected,opponent)=>
    (normal(a)===normal(expected)&&normal(b)===normal(opponent))||
    (normal(b)===normal(expected)&&normal(a)===normal(opponent));
  const neighbourDays=(day)=>{
    if(!date(day))return [];
    const dayMs=Date.parse(day+'T00:00:00Z');
    return [-1,0,1].map(offset=>new Date(dayMs+offset*86400000).toISOString().slice(0,10));
  };
  const legacyCacheCandidates=missingDiagnostics
    .filter(x=>x.sourceVerifiedOfficialLegacy)
    .map(item=>{
      const cachedBouts=[],archivedRounds=[];
      for(const ref of item.references){
        const fighter=profiles[ref.fighterSlug]?.name||ref.fighterSlug.replace(/-/g,' ');
        const days=neighbourDays(ref.date);
        for(const [foundId,bout] of Object.entries(bouts)){
          if(foundId===item.id||bout?.org!=='ufc'||isFeederTitle(bout.event)||
             !days.includes(date(bout.eventDate)))continue;
          if(!sameMatch(bout.a?.name,bout.b?.name,fighter,ref.opponent))continue;
          if(!cachedBouts.some(row=>row.nativeId===foundId)){
            cachedBouts.push({nativeId:foundId,date:bout.eventDate,
              event:bout.event||null,identityMatch:'same_names_within_one_utc_day'});
          }
        }
        for(const day of days){
          const k=key(day,fighter,ref.opponent),rounds=arr(fights[k]?.rounds);
          if(!k||!fights[k]||archivedRounds.some(row=>row.key===k))continue;
          archivedRounds.push({key:k,date:day,roundRows:rounds.length,
            pairedCoreRoundRows:rounds.filter(r=>
              ['a','b'].every(c=>Number.isFinite(r?.[c]?.sigLanded)&&
                Number.isFinite(r?.[c]?.controlSec))).length});
        }
      }
      return {id:item.id,references:item.references,cachedBouts,archivedRounds};
    });
  const legacyProviderSearchReview=verifiedLegacy.map(item=>{
    const id=numId(item?.fightId),r=id?legacySearchChecks[id]||{}:{};
    return {id,fighterSlug:item?.fighterSlug||null,
      status:typeof r.status==='string'?r.status:'not_attempted',
      matchedAlternativeNativeId:numId(r.candidateId)&&numId(r.candidateId)!==id?
        numId(r.candidateId):null,
      sourceVerifiedOfficialLegacy:!!id&&legacyProof(id,[
        {fighterSlug:item.fighterSlug,date:date(item.date),opponent:item.opponent}]),
      originalNativeIndexed:!!id&&bouts[id]?.org==='ufc'};
  });
  const legacySearchCount=status=>legacyProviderSearchReview.filter(x=>
    x.sourceVerifiedOfficialLegacy&&x.status===status).length;
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
    legacyTimelineCompleteClaimsWithoutRetainedProof:legacyCompleteClaims,
    sourceConfirmedIncompleteCareerHistories:sourceConfirmedIncompleteCareers,
    sourceConfirmedMinimumMissingHistoricalUfcBouts:sourceConfirmedMinimumMissingUfcBouts,
    independentlyVerifiedFullCareerTimelines:independentCertified,
    approvedCareersWithoutIndependentFullCareerCertification:approved.length-independentCertified,
    providerHistoryDiscrepancyCases:providerTimelineConflicts,
    rosterLatestFightOneDayUtcDateShifts:rosterUtcDayAdjustments,
    priorProviderLatestMismatchFlagsExplainedByDayShift:providerFlagsExplainedByUtcDayShift,
    careerVerificationStatusCounts,
    providerMetadataExplicitlyUntruncated:providerTimelineMetadata.explicitUntruncated,
    providerMetadataExplicitlyTruncated:providerTimelineMetadata.explicitTruncated,
    providerMetadataFlagUnavailable:providerTimelineMetadata.flagUnavailable,
    providerMetadataLegacyNotRecorded:providerTimelineMetadata.previouslySavedWithoutMetadata,
    profilesWithoutTimelineEvidence:providerTimelineMetadata.noTimelineEvidence,
    providerTimelinesWithSavedHistoryContradictions:providerTimelineMetadata.savedHistoryContradictions,
    providerTimelinesWithNativeIdConflicts:providerTimelineMetadata.conflictingNativeIds,
    providerTimelinesMissingLatestRosterBout:providerTimelineMetadata.missingRosterLatestBout,
    savedUfcHistoryRows:historyRows,uniqueNativeFightIds:allKnownNativeIds.size,
    nativeLinksAcrossFighters:nativeLinks,
    uniquelyIndexedNativeFightIds:indexedNative.size,
    uniqueNativeFightIdsAwaitingIndex:missingIndex.size,
    fightersWithNativeIndexGaps:withUnindexed,
    unlinkedCareerHistoryRows:unlinkedCareerRows,
    excludedFeederHistoryRowsWithCachedEventEvidence:excludedFeederHistoryRows,
    excludedDistinctFeederNativeFightIds:excludedFeederFightIds.size,
    additionalSourceVerifiedFeederHistoryRows:sourceVerifiedFeederHistoryRows,
    manualReviewOfficialFinaleFightIds:new Set(officialFinaleGaps).size,
    sourceVerifiedOfficialFinaleFightIdsAwaitingIndex:
      missingDiagnostics.filter(x=>x.sourceVerifiedOfficialFinale).length,
    sourceVerifiedOfficialLegacyFightIdsAwaitingIndex:
      missingDiagnostics.filter(x=>x.sourceVerifiedOfficialLegacy).length,
    sourceVerifiedLegacyWithMatchingCachedBout:
      legacyCacheCandidates.filter(x=>x.cachedBouts.length>0).length,
    sourceVerifiedLegacyWithMatchingArchivedRounds:
      legacyCacheCandidates.filter(x=>x.archivedRounds.some(r=>r.roundRows>0)).length,
    sourceVerifiedLegacyProviderSearchNotAttempted:legacySearchCount('not_attempted'),
    sourceVerifiedLegacyProviderSearchNoMatch:legacySearchCount('no_match'),
    sourceVerifiedLegacyProviderSearchAlternativeIds:legacySearchCount('alternative_id_manual_review'),
    sourceVerifiedLegacyProviderSearchExactIds:legacySearchCount('indexed_exact_native_id'),
    sourceVerifiedLegacyProviderSearchAmbiguous:legacySearchCount('ambiguous'),
    sourceVerifiedLegacyProviderSearchOnRetry:legacySearchCount('retry'),
    indexedFightsWithArchivedRounds:linkedRounds.size,
    indexedFightsWithMeasuredRoundMetrics:linkedMetrics.size,
    indexedNativeFightsWithoutConfirmedMeasuredRounds:indexedNative.size-linkedMetrics.size,
    profilesWithKnownFightRoundGaps:cohorts.filter(c=>c.missingMeasuredFightIds.length>0).length,
    profilesWithAllKnownUfcBoutsIndexed:allKnownIndexed,
    fightersWithAdditionalIndexedOfficialUfcFightsMissingFromSavedHistory:
      cachedCareerHistoryCandidates.filter(x=>x.missingIndexedOfficialUfcFights.length>0).length,
    additionalOfficialUfcFightsRecoverableFromExistingCache:cacheRecoverableHistoryRows,
    fightersWithoutUniqueNumericFighterIdAnchor:profilesWithAmbiguousNumericIdentity.length,
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
    manualReviewCases:missingDiagnostics.filter(x=>x.action==='manual_review'),
    legacyCacheCandidates,legacyProviderSearchReview,
    readyForLookupCases:missingDiagnostics.filter(x=>
      x.action==='not_yet_attempted'||x.action==='retry_eligible'),
    unmeasuredIndexedIds:allIndexedMissingRounds.slice(0,30),
    unmeasuredIndexedEvidence:allIndexedMissingRounds.map(id=>{
      const bout=bouts[id]||{},retry=progress?.roundRetry?.[id]||{};
      const refs=cohorts.filter(c=>c.missingMeasuredFightIds.includes(id)).map(c=>c.slug);
      return {id,event:bout.event||null,date:bout.eventDate||null,
        fighterA:bout.a?.name||null,fighterB:bout.b?.name||null,
        expectedRounds:bout.result?.round??null,
        observedRoundRows:progress?.roundDone?.[id]??null,
        retryAttempts:retry.attempts??null,retryAfter:retry.retryAfter||null,
        approvedFighterSlugs:refs};
    }),
    profilesWithKnownRoundGaps:cohorts.filter(c=>c.missingMeasuredFightIds.length>0),
    careerVerificationDecisions,rosterLastBoutSourceGaps,
    cachedCareerHistoryCandidates,profilesWithAmbiguousNumericIdentity,
    approvedMissingHistory:missingHistory.slice(0,30),
    approvedNoLongerEligible:blockedByEligibility.slice(0,30),
    note:'Known-fight indexing and measured-round coverage are not full historical-career certification. Legacy complete flags without explicit saved provider metadata remain unverified. Independent certification requires a full external official fight listing crosschecked bout-by-bout. No additional API calls or missing-value imputation are performed.'
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
   fullyProviderCertifiedTimelines:'Full UFC timelines with strict explicit provider completeness evidence',
   legacyTimelineCompleteClaimsWithoutRetainedProof:'Historic complete flags lacking retained provider proof (not certified)',
   sourceConfirmedIncompleteCareerHistories:'Independent UFC source confirms missing saved historical fights',
   sourceConfirmedMinimumMissingHistoricalUfcBouts:'Minimum confirmed historical UFC fights still absent from saved approved careers',
   independentlyVerifiedFullCareerTimelines:'UFC careers independently reconciled against complete external official records',
   approvedCareersWithoutIndependentFullCareerCertification:'Approved UFC careers still awaiting independent historical completeness verification',
   providerHistoryDiscrepancyCases:'Provider history and roster chronology discrepancies requiring review',
   rosterLatestFightOneDayUtcDateShifts:'Roster latest-fight dates aligned with saved histories after one-day UTC/local normalization',
   priorProviderLatestMismatchFlagsExplainedByDayShift:'Previous provider latest-fight mismatch flags explained by UTC calendar-day normalization',
   providerMetadataExplicitlyUntruncated:'Provider timeline responses explicitly marked untruncated (not necessarily career-certified)',
   providerMetadataExplicitlyTruncated:'Provider timeline responses explicitly marked truncated',
   providerMetadataFlagUnavailable:'Provider timeline responses observed without explicit truncation flag',
   providerMetadataLegacyNotRecorded:'Earlier saved timelines without retained truncation metadata',
   profilesWithoutTimelineEvidence:'Approved fighters with no stored provider timeline evidence',
   providerTimelinesWithSavedHistoryContradictions:'Provider histories missing UFC bouts already present in saved evidence',
   providerTimelinesWithNativeIdConflicts:'Provider histories with conflicting saved UFC bout identities',
   providerTimelinesMissingLatestRosterBout:'Provider histories missing the roster-confirmed latest UFC bout',
   savedUfcHistoryRows:'Saved UFC history rows',
   uniqueNativeFightIds:'Distinct native fight IDs referenced by approved fighters',
   uniquelyIndexedNativeFightIds:'Distinct native fight IDs indexed as official UFC',
   uniqueNativeFightIdsAwaitingIndex:'Native fight IDs awaiting indexing',
   unlinkedCareerHistoryRows:'UFC history rows without native fight IDs',
   excludedFeederHistoryRowsWithCachedEventEvidence:'History rows excluded from UFC-only views on corroborated DWCS/feeder dates',
   excludedDistinctFeederNativeFightIds:'Distinct feeder fight IDs excluded from official UFC statistics',
   additionalSourceVerifiedFeederHistoryRows:'Additional feeder history entries excluded using exact UFC official-source evidence',
   manualReviewOfficialFinaleFightIds:'Missing UFC fight IDs with independently cached Finale event dates',
   sourceVerifiedOfficialFinaleFightIdsAwaitingIndex:'Missing official UFC Finale fight IDs independently confirmed from exact UFC-source evidence',
   sourceVerifiedOfficialLegacyFightIdsAwaitingIndex:'Missing older UFC fight identities corroborated by official source, but provider-native indexing remains unresolved',
   sourceVerifiedLegacyWithMatchingCachedBout:'Legacy official UFC identities with alternative cached native bout candidates (not verified indexed)',
   sourceVerifiedLegacyWithMatchingArchivedRounds:'Legacy official UFC identities with archived matching round rows (not verified native identity)',
   sourceVerifiedLegacyProviderSearchNotAttempted:'Verified legacy bouts awaiting targeted UFCalendar search',
   sourceVerifiedLegacyProviderSearchNoMatch:'Verified legacy bouts without matching provider date-search result',
   sourceVerifiedLegacyProviderSearchAlternativeIds:'Legacy bouts with contradictory provider native IDs requiring review',
   sourceVerifiedLegacyProviderSearchExactIds:'Verified legacy bouts with exact native IDs indexed via date search',
   sourceVerifiedLegacyProviderSearchAmbiguous:'Legacy bouts with ambiguous source search matches',
   sourceVerifiedLegacyProviderSearchOnRetry:'Legacy bouts waiting on provider retry after transient error',
   profilesWithAllKnownUfcBoutsIndexed:'Profiles with every currently known UFC bout indexed (not career-certified)',
   fightersWithAdditionalIndexedOfficialUfcFightsMissingFromSavedHistory:'Approved fighters with older UFC bouts already cached but absent from their career timeline',
   additionalOfficialUfcFightsRecoverableFromExistingCache:'Source-verified UFC fight IDs already cached but missing from approved fighter histories',
   fightersWithoutUniqueNumericFighterIdAnchor:'Approved fighters without unique cached numeric athlete identity (requires verification)',
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
   profilesWithKnownFightRoundGaps:'Profiles with at least one known official fight lacking measured rounds',
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
   read('data/ufc-research-archive.json'),
   read('data/ufc-feeder-bout-evidence.json'),
   read('data/ufc-official-finale-recovery.json'),
   read('data/ufc-official-legacy-evidence.json'),
   read('data/ufc-independent-full-career-verification.json'));
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-36-month-stage3-progress.json'),JSON.stringify(r,null,2)+'\n');
 fs.writeFileSync(path.join(qa,'ufc-36-month-stage3-progress.md'),markdownReport(r));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdownReport(r));
 console.log('BEFN_STAGE3_PROGRESS='+JSON.stringify(r.summary));
}