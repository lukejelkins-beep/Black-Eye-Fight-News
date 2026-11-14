#!/usr/bin/env node
/** BEFN V4: strictly verify manually attested complete UFC career lists.
 * Offline; never calls a provider or modifies collector-owned cache.
 * Event titles are display metadata, NOT a certification criterion.
 */
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const out=x=>({w:'win',win:'win',l:'loss',loss:'loss',d:'draw',draw:'draw',nc:'no_contest',no_contest:'no_contest'})[String(x??'').toLowerCase()]||null;
// Narrow, separately UFC-sourced opponent aliases; NEVER fuzzy-name matching.
const opponentAliases={joannecalderwood:'joannewood',joannewood:'joannewood',
 veronicamacedo:'veronicahardy',veronicahardy:'veronicahardy'};
const opponentKey=x=>opponentAliases[norm(x)]||norm(x);
const day=x=>/^\d{4}-\d\d-\d\d$/.test(String(x||''))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const dateDiff=(a,b)=>day(a)&&day(b)?Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000):999;
const sourceFightUrl=x=>/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i.test(String(x||''));
const sourceFighterUrl=x=>/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]{16}$/i.test(String(x||''));
const feeder=x=>/(?:contender\s+series|road\s+to\s+ufc|\bdwcs\b)/i.test(String(x||''));
const required=['sigLanded','sigAttempted','knockdowns','takedowns','takedownAttempts','subAttempts','controlSec'];
const block=(slug,reason)=>{throw Error('BEFN_V4_CERTIFICATION_BLOCKED '+slug+':'+reason);};
const need=(slug,cond,reason)=>{if(!cond)block(slug,reason);};
export function certifyAttestedFullCareers(approval,research,progress,postfight,base,batch){
 need('cohort',approval?.status==='approved'&&approval?.approvedFighters?.length===783&&
  new Set(approval.approvedFighters).size===783,'must_use_immutable_783');
 need('registry',base?.schema===1&&base?.scope==='ufc-independent-full-career-verification'&&
  base.rosterAsOf===approval.rosterAsOf,'independent_registry_missing_or_stale');
 need('batch',batch?.schema===1&&batch?.scope==='ufc-v4-manual-independent-career-certification-batch'&&
  batch.rosterAsOf===approval.rosterAsOf&&batch.nonproduction===true,'nonproduction_evidence_batch_invalid');
 const registry={...base,fighters:{...base.fighters}},reports=[];
 for(const [slug,s] of Object.entries(batch.fighters||{})){
  need(slug,approval.approvedFighters.includes(slug),'not_approved');
  need(slug,!['bruno-gustavo-da-silva','carlos-hernandez-7','park-hyun-sung'].includes(slug),'pilot_exception');
  need(slug,s.sourceCoverageAttested===true&&s.verificationMethod==='full_official_ufc_fight_listing_crosscheck'&&
   s.verifiedAt===approval.rosterAsOf,'exhaustive_independent_source_attestation');
  need(slug,sourceFighterUrl(s.fighterUrl)&&/^https:\/\/www\.ufc\.com\/athlete\//.test(s.ufcOfficialSourceUrl||''),'unverified_source_urls');
  const p=research?.profiles?.[slug];
  need(slug,p&&norm(p.name)===norm(s.fighterName),'athlete_identity_not_confirmed');
  const saved=(p.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc'&&out(x.result||x.outcome||x.status));
  need(slug,Array.isArray(s.bouts)&&s.bouts.length>0&&
    s.bouts.length===s.completeOfficialUfcCareerCount&&
    saved.length===s.bouts.length,'official_vs_saved_career_length');
  const observed=new Map((postfight.fighters?.[slug]?.careerBouts||[]).map(x=>[String(x.boutId||''),x]));
  const usedIds=new Set(),usedUrls=new Set(),fighterIds=new Set(),bouts=[];
  const documentedOffsets=new Set((s.dateDiscrepancies||[]).map(x=>
    [String(x.boutId),x.officialLocalDate,x.nativeSavedDate].join('|')));
  const usedOffsets=new Set();
  for(const record of s.bouts){
   const id=String(record.nativeBoutId||'');
   need(slug,/^[1-9]\d{0,11}$/.test(id)&&!usedIds.has(id),'missing_duplicate_native_id:'+id);
   need(slug,sourceFightUrl(record.fightUrl)&&!usedUrls.has(record.fightUrl),'invalid_duplicate_source_link:'+id);
   need(slug,day(record.date)&&day(record.nativeSavedDate)&&
      Math.abs(dateDiff(record.nativeSavedDate,record.date))<=1,'invalid_official_native_date:'+id);
   if(record.date!==record.nativeSavedDate){
    const offset=[id,record.date,record.nativeSavedDate].join('|');
    need(slug,documentedOffsets.has(offset),'undocumented_time_zone_shift:'+id);
    usedOffsets.add(offset);
   }
   need(slug,out(record.result)===record.result&&norm(record.opponent),'invalid_official_outcome_opponent:'+id);
   const matches=saved.filter(x=>x.source==='native'&&String(x.boutId||'')===id&&
      x.date===record.nativeSavedDate&&opponentKey(x.opponent)===opponentKey(record.opponent)&&
      out(x.result||x.outcome||x.status)===record.result);
   need(slug,matches.length===1,'native_history_identity_date_outcome_conflict:'+id);
   const native=progress.bouts?.[id];
   need(slug,native?.org==='ufc'&&!feeder(native.event),'not_eligible_official_ufc_bout:'+id);
   need(slug,Math.abs(dateDiff(native.eventDate,record.nativeSavedDate))<=1,
      'native_event_date_mismatch:'+id);
   // Intentionally do NOT require identical event names. An event's title can
   // change after card cancellations; fight ID, corners, date and status matter.
   const corners=[[native.a,native.b],[native.b,native.a]].filter(([a,b])=>a&&b&&
      (a.slug===slug||norm(a.name)===norm(s.fighterName))&&opponentKey(b.name)===opponentKey(record.opponent));
   need(slug,corners.length===1,'native_corners_ambiguous:'+id);
   const [own,opponent]=corners[0];
   need(slug,String(own.id||'')===String(s.uniqueNativeFighterId),'numeric_fighter_identity_mismatch:'+id);
   fighterIds.add(String(own.id));
   const winner=native.result?.winnerId;
   const nativeResult=native.status==='no_contest'?'no_contest':
     native.status==='draw'?'draw':
     winner&&String(winner)===String(own.id)?'win':
     winner&&String(winner)===String(opponent.id)?'loss':null;
   need(slug,nativeResult===record.result,'native_result_disagrees_with_official:'+id);
   const stats=observed.get(id);
   need(slug,stats&&required.every(f=>Number.isFinite(stats.metrics?.[f]))&&
      Number.isFinite(stats.cageSec)&&stats.cageSec>0,'required_statistics_missing:'+id);
   usedIds.add(id);usedUrls.add(record.fightUrl);
   bouts.push({date:record.nativeSavedDate,officialLocalDate:record.date,
     opponent:matches[0].opponent,officialSourceOpponent:record.opponent,
     result:record.result,fightUrl:record.fightUrl,nativeBoutId:id,
     eventTitleForDisplay:native.event});
  }
  need(slug,documentedOffsets.size===usedOffsets.size,'unmatched_source_date_exception');
  need(slug,fighterIds.size===1&&usedIds.size===saved.length&&observed.size===saved.length,
    'native_identity_or_full_measured_career_count_disagreement');
  registry.fighters[slug]={
    fighterUrl:s.fighterUrl,officialSourceUrl:s.ufcOfficialSourceUrl,
    verifiedAt:s.verifiedAt,verificationMethod:'full_official_ufc_fight_listing_crosscheck',
    sourceCoverageAttested:true,sourceScopeVerified:s.sourceScopeVerified,
    sourceCrosschecks:s.independentSourceCrosschecks,
    independentCareerBouts:bouts.length,
    nativeFighterId:s.uniqueNativeFighterId,
    bouts:bouts.map(x=>({date:x.date,opponent:x.opponent,result:x.result,fightUrl:x.fightUrl}))
  };
  reports.push({slug,sourceBouts:bouts.length,nativeBoutsMatched:usedIds.size,
    independentlyVerifiedCareer:true,nativeFighterId:s.uniqueNativeFighterId,
    dateOffsets:usedOffsets.size,displayTitlesNonBlocking:true,
    officialSourceUrl:s.ufcOfficialSourceUrl,sourceFighterUrl:s.fighterUrl,
    matchedBouts:bouts});
 }
 return {registry,report:{schema:1,scope:'ufc-v4-independent-full-career-certification-result',
  asOf:approval.rosterAsOf,certifiedCount:reports.length,
  certifiedFighters:reports,strictNativeMatching:true,
  note:'Verified complete UFC-only careers with exhaustive manually attested source histories. Event titles are descriptive and never exact-match gates; discrepancies in native fight identity, event date, UFC eligibility, results or measured statistics block certification.'}};
}
