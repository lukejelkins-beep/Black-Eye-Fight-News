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
const ACTIONS=Object.freeze({
 'independent-JSA-historical-ranks-not-compared':{
  lane:'official-rank-recheck',owner:'existing JSA source worker',
  nextAction:'Collect dated JSA banzuke positions for this cached profile, compare exact ranks with existing API history; do not re-fetch if a validated rank snapshot exists.'},
 'independent-SumoDB-birth-date-not-verified':{
  lane:'source-identity-recheck',owner:'existing SumoDB source worker',
  nextAction:'Crosscheck original SumoDB profile header name, date of birth and all saved measurements without replacing original source values.'},
 'official-absence-total-unpublished-or-disagree':{
  lane:'absence-proof-review',owner:'historical manual source review',
  nextAction:'Locate independently published career absences or documented tournament absences. Never turn an unreported absence total into zero.'},
 'official-JSA-career-totals-unpublished-or-disagree':{
  lane:'career-totals-review',owner:'historical manual source review',
  nextAction:'Separate absent JSA career totals from as-of-date mismatches and true historic record conflicts; preserve both sources until reconciled.'},
 'official-completed-basho-ledger-coverage-incomplete':{
  lane:'official-tournament-gap',owner:'historical manual source review',
  nextAction:'Review which completed tournament results lack independent official comparison, preserving absence-only and unranked tournament distinctions.'},
 'complete-rank-timeline-not-evidenced':{
  lane:'api-rank-history-gap',owner:'historical manual source review',
  nextAction:'Identify missing banzuke rank dates and seek dated official archive evidence; never interpolate unrecorded positions.'},
 'official-JSA-profile-field-disagreement':{
  lane:'profile-source-conflict',owner:'historical manual source review',
  nextAction:'Investigate the exact official/API current profile disagreement and document which publication is newer; do not overwrite either raw source.'}
});
const ACTION_PRIORITY=[
 'official-JSA-profile-field-disagreement',
 'official-completed-basho-ledger-coverage-incomplete',
 'complete-rank-timeline-not-evidenced',
 'official-JSA-career-totals-unpublished-or-disagree',
 'official-absence-total-unpublished-or-disagree',
 'independent-JSA-historical-ranks-not-compared',
 'independent-SumoDB-birth-date-not-verified'
];
export function planPreflightNextAction(blockers){
 if(!Array.isArray(blockers)||!blockers.length)
  return {lane:'fast-lane-strict-audit',owner:'strict audit reviewer',
   nextAction:'Run complete independent strict career audit against raw and saved official evidence; certification cannot be granted by preflight.'};
 const issue=ACTION_PRIORITY.find(x=>blockers.includes(x))||blockers[0];
 return ACTIONS[issue]||{lane:'manual-triage',owner:'historical source reviewer',
  nextAction:'Investigate unclassified source verification issue without changing original data.'};
}
/** An independently documented debut may precede any published numbered
 * banzuke entry. Preserve the actual debut rank as null, never interpolate. */
export function documentedDebutRankGap(p,jsa){
 const gaps=p?.rankHistoryGaps,ranks=p?.rankTimeline;
 if(!Array.isArray(gaps)||gaps.length!==1||!Array.isArray(ranks)||!ranks.length)return false;
 const g=gaps[0],first=ranks.slice().sort((a,b)=>String(a.bashoId).localeCompare(String(b.bashoId)))[0];
 const debut=(p.perBasho||[]).slice().sort((a,b)=>a.bashoId.localeCompare(b.bashoId))[0];
 if(g.status!=='competed-before-first-published-banzuke-rank'||
    g.rank!==null||g.independentlyCertified!==false||
    g.bashoId!==debut?.bashoId||g.firstPublishedRankBasho!==first.bashoId||
    !(debut.wins+debut.losses>0))return false;
 const officialBasho=jsa?.officialBashoRecords||[],officialRanks=jsa?.officialRankRecords||[];
 const officialDebut=officialBasho.find(x=>x.bashoId===g.bashoId);
 const officialFirstRank=officialRanks.find(x=>x.bashoId===g.firstPublishedRankBasho);
 return officialDebut?.wins===debut.wins&&officialDebut.losses===debut.losses&&
   !!officialFirstRank&&
   !officialRanks.some(x=>x.bashoId===g.bashoId)&&
   jsa?.bashoReconciliation?.discrepantBasho===0&&
   jsa?.rankReconciliation?.mismatches?.length===0;
}

/** For older careers, public JSA pages sometimes omit the earliest basho
 * rows. Those dates may be independently corroborated by a one-time SumoDB
 * snapshot if ALL missing dated W-L values and overlapping years agree.
 * No inference of ranks, results or absence totals is permitted.
 */
export function supplementalHistoricalBashoCoverage(p,jsa,sdb,activeBasho){
 const prior=(p?.perBasho||[]).filter(x=>x.bashoId!==activeBasho&&
   Number(x.scheduledBoutRows||0)>0);
 const bh=jsa?.bashoReconciliation||null;
 const baseline=!!bh&&bh.discrepantBasho===0&&
   Number(bh.comparedBasho)>=prior.length;
 if(baseline)return {passed:true,baselineJsa:true,
   otherSourceBasho:0,missingOfficialBasho:0,sourceOverlapConflicts:0};
 const official=new Map((jsa?.officialBashoRecords||[]).map(x=>[String(x.bashoId),x]));
 const missing=prior.filter(x=>!official.has(x.bashoId));
 const snapshot=sdb?.careerRecordCrosscheck||null;
 const goodSource=snapshot?.identityVerified===true&&
   snapshot?.originalMeasurementsUnchanged===true&&
   snapshot?.independentOfApi===true&&
   snapshot?.careerRecordDiffersFromPriorSnapshot!==true&&
   /^[0-9a-f]{64}$/.test(String(snapshot?.datedBashoLedgerSourceSha256||''))&&
   snapshot?.sourceUrl==='https://sumodb.sumogames.de/Rikishi.aspx?r='+sdb?.sumoDbId&&
   Array.isArray(snapshot.independentBashoRows);
 const independent=goodSource?
   new Map(snapshot.independentBashoRows.map(x=>[String(x.bashoId),x])):new Map();
 const exact=(r,x)=>r&&r.wins===x.wins&&r.losses===x.losses;
 const supplementalMatch=missing.length>0&&goodSource&&
   missing.every(x=>exact(independent.get(x.bashoId),x));
 const overlapConflicts=prior.filter(x=>official.has(x.bashoId)&&
   independent.has(x.bashoId)&&
   (!exact(official.get(x.bashoId),x)||!exact(independent.get(x.bashoId),x))).length;
 const passed=supplementalMatch&&overlapConflicts===0&&
   bh?.discrepantBasho===0&&bh?.agreeingBasho===bh?.comparedBasho&&
   prior.every(x=>exact(official.get(x.bashoId)||independent.get(x.bashoId),x));
 return {passed:!!passed,baselineJsa:false,
   otherSourceBasho:passed?missing.length:0,
   missingOfficialBasho:missing.length,sourceOverlapConflicts:overlapConflicts};
}

/** Use only exact date-and-numbered-rank matches from an independently
 * captured source to extend JSA's bounded public historical banzuke view.
 * Official JSA mismatches and independently conflicting ranks always block.
 */
export function independentHistoricalRankCoverage(p,jsa,sdb){
 const history=p?.rankTimeline||[], ranks=jsa?.rankReconciliation||null;
 const officialRows=jsa?.officialRankRecords||[];
 const minimum=Math.max(1,Math.floor(history.length*0.75));
 const current=Number(ranks?.comparedBasho||0);
 const officialDates=new Set(officialRows.map(x=>String(x.bashoId)));
 const src=sdb?.careerRecordCrosscheck||null;
 const valid=src?.identityVerified===true&&
   src?.originalMeasurementsUnchanged===true&&src?.independentOfApi===true&&
   src?.careerRecordDiffersFromPriorSnapshot!==true&&
   /^[a-f0-9]{64}$/.test(String(src?.datedBashoLedgerSourceSha256||''))&&
   src?.sourceUrl==='https://sumodb.sumogames.de/Rikishi.aspx?r='+sdb?.sumoDbId&&
   Array.isArray(src.independentBashoRows);
 const sourceRanks=valid?new Map(src.independentBashoRows.filter(x=>x.rankEn!=null)
   .map(x=>[String(x.bashoId),String(x.rankEn)])):new Map();
 const additional=history.filter(x=>!officialDates.has(x.bashoId)&&
   sourceRanks.get(x.bashoId)===x.rank).length;
 const conflicts=history.filter(x=>sourceRanks.has(x.bashoId)&&
   sourceRanks.get(x.bashoId)!==x.rank).length;
 const validJsa=!!ranks&&Number.isSafeInteger(ranks.comparedBasho)&&
   ranks.comparedBasho>=0&&ranks.mismatches?.length===0&&
   ranks.agreedBasho===ranks.comparedBasho&&
   officialRows.length===current&&
   (ranks.missingSourceRankBasho||[]).length===0;
 // JSA's published historical rank table is sometimes entirely absent.
 // Never report zero as an official comparison. In that distinct case,
 // require at least 75% independent, date-exact SumoDB rank matches,
 // already crosschecked against the immutable native rank timeline.
 // Any present but invalid JSA rank reconciliation continues to block.
 const noOfficialHistoricalRankRows=ranks===null&&officialRows.length===0;
 const independentMeetsQuota=valid&&current+additional>=minimum&&conflicts===0;
 const passed=(validJsa||noOfficialHistoricalRankRows)&&
   ((validJsa&&current>=minimum)||independentMeetsQuota);
 const evidenceBasis=passed?(noOfficialHistoricalRankRows?
   'SumoDB-dated-ranks-JSA-historical-ranks-unavailable':
   current>=minimum?'JSA-dated-ranks':'JSA-and-SumoDB-dated-ranks'):null;
 return {passed,jsaCompared:validJsa?current:null,
   jsaHistoricalRankRowsPresent:validJsa,noOfficialHistoricalRankRows,
   independentAdditional:additional,sourceConflicts:conflicts,
   quota:minimum,independentEvidenceValid:!!valid,evidenceBasis};
}

/** Verify that a later official source snapshot differs ONLY by an explicitly
 * dated, already completed CURRENT-basho bout. The native cache is never
 * mutated or assumed to be as current as the JSA's live page.
 * Missing absences are never supplied or inferred.
 */
export function independentlyVerifiedCurrentBashoCutoff(p,jsa,activeBasho){
 const months=['January','February','March','April','May','June','July',
  'August','September','October','November','December'];
 const year=Number(String(activeBasho).slice(0,4));
 const month=Number(String(activeBasho).slice(4,6));
 const monthYear=months[month-1]+' '+year;
 const asOf=jsa?.officialAsOf||{};
 const publishedDay=asOf.day;
 const cache=(p?.perBasho||[]).find(x=>x.bashoId===activeBasho);
 const official=(jsa?.officialBashoRecords||[]).find(x=>x.bashoId===activeBasho);
 const matches=(p?.headToHead||[]).flatMap(x=>x.meetings||[])
  .filter(x=>x.bashoId===activeBasho);
 const latestNativeDay=matches.reduce((n,x)=>Math.max(n,Number(x.day)||0),0);
 const diffWins=Number(official?.wins)-Number(cache?.wins);
 const diffLosses=Number(official?.losses)-Number(cache?.losses);
 const career=jsa?.career,baseline=p?.career;
 const publishedAbsences=career?.absences!=null&&
  Number.isSafeInteger(career.absences)&&career.absences>=0;
 const sourceValid=asOf.monthYear===monthYear&&
  Number.isInteger(publishedDay)&&publishedDay>=1&&publishedDay<=15&&
  latestNativeDay>=1&&publishedDay>latestNativeDay&&
  /^[a-f0-9]{64}$/.test(String(jsa?.rawHtmlSha256||''))&&
  jsa?.bashoReconciliation?.discrepantBasho===0;
 const deltaValid=(diffWins===1&&diffLosses===0||
  diffWins===0&&diffLosses===1);
 const totalsValid=Number.isSafeInteger(career?.wins)&&
  Number.isSafeInteger(career?.losses)&&
  Number.isSafeInteger(baseline?.wins)&&Number.isSafeInteger(baseline?.losses)&&
  career.wins-baseline.wins===diffWins&&
  career.losses-baseline.losses===diffLosses;
 const passed=!!(sourceValid&&cache&&official&&publishedAbsences&&
  career.absences===baseline?.absences&&deltaValid&&totalsValid);
 return {passed,activeBasho,sourceDay:sourceValid?publishedDay:null,
  lastCachedBoutDay:latestNativeDay||null,
  extraWins:passed?diffWins:0,extraLosses:passed?diffLosses:0,
  evidenceBasis:passed?'dated-JSA-current-basho-WLA-cutoff':null};
}

/** Independently prove an already recorded ZERO absence total from every
 * completed, numbered-rank tournament. No unpublished JSA absence field is
 * rewritten: absence=0 must already exist in the native source, while every
 * scheduled 7/15-bout tournament must have independently verified full W-L.
 * Non-numbered mae-zumo/banzuke-gai dates are not falsely treated as seven
 * scheduled bouts; a documented collegiate debut is separately corroborated.
 */
export function proveZeroCareerAbsencesFromCompleteBasho(p,jsa,sdb,activeBasho){
 const no=reason=>({passed:false,reason,completedBashoProven:0,sourceBasis:null});
 if(p?.career?.absences!==0||jsa?.career?.absences!=null||
    !Number.isSafeInteger(jsa?.career?.wins)||!Number.isSafeInteger(jsa?.career?.losses))
  return no('missing-native-zero-or-conflicting-official-absence');
 const months=['January','February','March','April','May','June','July',
  'August','September','October','November','December'];
 const b=String(activeBasho);
 const expectedAsOf=months[Number(b.slice(4))-1]+' '+b.slice(0,4);
 if(jsa?.officialAsOf?.monthYear!==expectedAsOf||
    !Number.isInteger(jsa.officialAsOf.day)||jsa.officialAsOf.day<1||
    jsa.officialAsOf.day>15||
    !/^[a-f0-9]{64}$/.test(String(jsa?.rawHtmlSha256||'')))
  return no('dated-official-snapshot-not-evidenced');
 const cur=(p?.perBasho||[]).find(x=>x.bashoId===b);
 const officialCur=(jsa?.officialBashoRecords||[]).find(x=>x.bashoId===b);
 if(!cur||!officialCur||Number(officialCur.absences||0)>0)
  return no('current-tournament-not-crosschecked');
 const winShift=jsa.career.wins-p.career.wins;
 const lossShift=jsa.career.losses-p.career.losses;
 const currentWinShift=officialCur.wins-cur.wins;
 const currentLossShift=officialCur.losses-cur.losses;
 const currentNativeDays=(p.headToHead||[]).flatMap(h=>h.meetings||[])
  .filter(x=>x.bashoId===b).map(x=>Number(x.day)||0);
 const latestNativeDay=Math.max(0,...currentNativeDays);
 const exactCurrent=winShift===0&&lossShift===0&&
  currentWinShift===0&&currentLossShift===0&&latestNativeDay>0&&
  jsa.officialAsOf.day>=latestNativeDay;
 const laterOneBout=(winShift===1&&lossShift===0||
  winShift===0&&lossShift===1)&&
  winShift===currentWinShift&&lossShift===currentLossShift&&
  latestNativeDay>0&&jsa.officialAsOf.day>latestNativeDay;
 if(!exactCurrent&&!laterOneBout)return no('published-active-basho-cutoff-unreconciled');
 const completed=(p.perBasho||[]).filter(x=>x.bashoId!==b);
 if(!completed.length)return no('no-completed-ranked-tournament-proof');
 const ranks=new Map((p.rankTimeline||[]).map(x=>[String(x.bashoId),String(x.rank)]));
 const sourceByDate=new Map((jsa.officialBashoRecords||[]).map(x=>[String(x.bashoId),x]));
 const check=sdb?.careerRecordCrosscheck;
 const extraValid=check?.identityVerified===true&&
  check?.originalMeasurementsUnchanged===true&&check?.independentOfApi===true&&
  check?.careerRecordDiffersFromPriorSnapshot!==true&&
  /^[a-f0-9]{64}$/.test(String(check?.datedBashoLedgerSourceSha256||''))&&
  check?.sourceUrl==='https://sumodb.sumogames.de/Rikishi.aspx?r='+sdb?.sumoDbId;
 const otherByDate=extraValid?new Map((check.independentBashoRows||[])
  .map(x=>[String(x.bashoId),x])):new Map();
 const debutGap=documentedDebutRankGap(p,jsa);
 const fullBasho=(rank,bashoId)=>{
  if(/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo)\b/.test(rank))return 15;
  if(/^(Makushita|Sandanme|Jonidan|Jonokuchi)\b/.test(rank))return 7;
  if(debutGap&&p.rankHistoryGaps[0].bashoId===bashoId)return 7;
  return null;
 };
 const counted=new Set(completed.map(x=>String(x.bashoId)));
 // No numbered-ranking date can disappear silently from the bout ledger.
 for(const rank of p.rankTimeline||[]){
  if(rank.bashoId===b)continue;
  if(fullBasho(String(rank.rank),String(rank.bashoId))!==null&&
     !counted.has(String(rank.bashoId)))
   return no('ranked-tournament-missing-from-native-ledger');
 }
 const historicallyCovered=supplementalHistoricalBashoCoverage(p,jsa,sdb,b);
 if(!historicallyCovered.passed||jsa?.bashoReconciliation?.discrepantBasho!==0)
  return no('all-historical-basho-not-independently-evidenced');
 for(const x of completed){
  const d=String(x.bashoId),needed=fullBasho(ranks.get(d)||'',d);
  const official=sourceByDate.get(d),other=otherByDate.get(d);
  // One extra scheduled lower-division bout is legitimate ONLY if the
  // independent JSA tournament record confirms its exact W-L. A missing
  // scheduled bout or an uncorroborated extra bout is never full attendance.
  const fought=x.wins+x.losses;
  const normalAttendance=fought===needed;
  const independentlyConfirmedExtra=fought===needed+1&&
   official?.wins===x.wins&&official?.losses===x.losses;
  if(needed===null||!(normalAttendance||independentlyConfirmedExtra)||
     Number(x.scheduledBoutRows)!==fought)
   return no('incomplete-or-unnumbered-tournament-bouts');
  const exact=row=>row&&row.wins===x.wins&&row.losses===x.losses&&
   !(row.absences!=null&&row.absences!==0);
  if(!exact(official)&&!exact(other))
   return no('dated-independent-full-attendance-evidence-missing');
  if(official&&other&&(official.wins!==other.wins||
      official.losses!==other.losses))
   return no('independent-tournament-results-conflict');
 }
 return {passed:true,completedBashoProven:completed.length,
  sourceBasis:'source-verified-fully-attended-ranked-basho-no-absence',
  originalNativeAbsences:0,officialCareerAbsencesPublished:false,
  extraCurrentWins:laterOneBout?winShift:0,
  extraCurrentLosses:laterOneBout?lossShift:0,
  sourceDay:jsa.officialAsOf.day};
}

/** Accept a documented weight-only profile source conflict for career results
 * identity. Never certify the weight itself or alter the original API/JSA data.
 */
export function independentlyCorroboratedProfileWeightForCareerOnly(w,p,jsa,sdb){
 const reject=reason=>({passed:false,reason});
 const fields=jsa?.fieldComparisons||{};
 const onlyWeightMismatch=fields.weight===false&&
  ['name','stable','rankGrade','height'].every(k=>fields[k]===true)&&
  Object.values(fields).filter(x=>x===false).length===1;
 if(!onlyWeightMismatch)return reject('not-a-weight-only-disagreement');
 const validSha=x=>/^[a-f0-9]{64}$/.test(String(x||''));
 const expectedUrl='https://sumodb.sumogames.de/Rikishi.aspx?r='+w?.sumoDbId;
 const matchedIdentity=Number(jsa?.sourceId)===Number(w?.sourceId)&&
  Number(jsa?.officialNskId)===Number(w?.officialNskId)&&
  Number(sdb?.sourceId)===Number(w?.sourceId)&&
  Number(sdb?.officialNskId)===Number(w?.officialNskId)&&
  Number(sdb?.sumoDbId)===Number(w?.sumoDbId)&&
  sdb?.sourcePageUrl===expectedUrl&&sdb?.identityEvidence?.valid===true&&
  sdb.identityEvidence.birthDateStatus==='match'&&
  sdb?.careerRecordCrosscheck?.identityVerified===true&&
  sdb.careerRecordCrosscheck.independentOfApi===true&&
  validSha(jsa?.rawHtmlSha256)&&
  validSha(sdb?.careerRecordCrosscheck?.rawHtmlSha256);
 if(!matchedIdentity)return reject('independent-source-identity-or-snapshot-not-proven');
 const officialWeight=jsa?.weightKg;
 if(typeof officialWeight!=='number'||!Number.isFinite(officialWeight)||
    officialWeight<=0||p?.current?.weightKg!==w?.weightKg||
    p?.current?.weightKg===officialWeight||
    p?.measurementCoverage?.conflictingOverlaps?.length!==0)
  return reject('weight-source-or-raw-disagreement-not-isolated');
 const dated=x=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(x));
 const nativeDated=(p?.measurements||[]).some(x=>
  x.source==='Sumo API historical change'&&
  x.weightKg===officialWeight&&dated(x.bashoId));
 const independentDated=(sdb?.datedEvidence||[]).some(x=>
  x.sourceUrl===expectedUrl&&x.weightKg===officialWeight&&dated(x.bashoId));
 if(!nativeDated||!independentDated)
  return reject('native-and-independent-dated-weight-evidence-required');
 return {passed:true,scope:'career-results-source-identity-only',
  officialJsaWeightKg:officialWeight,
  preservedRawApiProfileWeightKg:p.current.weightKg,
  historicalApiAndSumoDbDatedWeightsAgree:true,
  weightProfileFieldStillDisputed:true,historicalWeightTimelineCertified:false};
}

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
 const justifiedDebutGap=documentedDebutRankGap(p,jsa);
 add(Array.isArray(p.rankTimeline)&&p.rankTimeline.length>0&&
    (!p.rankHistoryGaps||p.rankHistoryGaps.length===0||justifiedDebutGap),
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
 const reviewedWeightDifference=independentlyCorroboratedProfileWeightForCareerOnly(w,p,jsa,sdb);
 add(officialId&&(Object.values(jsa.fieldComparisons||{}).every(x=>x!==false)||reviewedWeightDifference.passed),
  'official-JSA-profile-field-disagreement');
 // A separately captured SumoDB W-L-A may verify an aggregate omitted by JSA,
 // but it cannot override any explicit disagreement with the official JSA.
 // All three values must match the full native-bout career ledger exactly.
 const other=sdb?.careerRecordCrosscheck||null,totals=other?.career||null;
 const independentlyMatched=other?.identityVerified===true&&
  other?.originalMeasurementsUnchanged===true&&other?.independentOfApi===true&&
  Number(sdb.sourceId)===Number(w.sourceId)&&
  totals&&totals.absences!==null&&totals.absences!==undefined&&
  totals.wins===p.career?.wins&&totals.losses===p.career?.losses&&
  totals.absences===p.career?.absences;
 const jsaHasCareer=officialId&&jsa.career!==null&&jsa.career!==undefined;
 const currentCutoff=independentlyVerifiedCurrentBashoCutoff(p,jsa,activeBasho);
 const fullAttendance=proveZeroCareerAbsencesFromCompleteBasho(p,jsa,sdb,activeBasho);
 const jsaWinLossMatches=jsaHasCareer&&(
  jsa.career.wins===p.career?.wins&&jsa.career.losses===p.career?.losses||
  currentCutoff.passed||fullAttendance.passed);
 add(jsaHasCareer?jsaWinLossMatches:officialId&&independentlyMatched,
  'official-JSA-career-totals-unpublished-or-disagree');
 const jsaAbsencesPresent=jsaHasCareer&&jsa.career.absences!=null;
 add(jsaAbsencesPresent?
   jsa.career.absences===p.career?.absences:
   officialId&&(fullAttendance.passed||
    independentlyMatched&&(!jsaHasCareer||jsaWinLossMatches)),
  'official-absence-total-unpublished-or-disagree');
 const prior=(p.perBasho||[]).filter(x=>x.bashoId!==activeBasho&&
  Number(x.scheduledBoutRows||0)>0);
 const historical=jsa?.bashoReconciliation||null;
 const completedBasho=supplementalHistoricalBashoCoverage(p,jsa,sdb,activeBasho);
 add(completedBasho.passed,'official-completed-basho-ledger-coverage-incomplete');
 const missingRecords=(historical?.unmatchedOfficialBasho||[]).filter(basho=>{
  const row=jsa?.officialBashoRecords?.find(x=>x.bashoId===basho);
  return !row||Number(row.wins||0)>0||Number(row.losses||0)>0;
 });
 add(missingRecords.length===0,'official-nonabsence-basho-rows-unreconciled');
 const ranks=jsa?.rankReconciliation||null;
 const sourceRankCoverage=independentHistoricalRankCoverage(p,jsa,sdb);
 add(sourceRankCoverage.passed,'independent-JSA-historical-ranks-not-compared');
 // Photo rights are a separate display/release gate, never an invented source
 // for records or a reason to alter the strictly verified career history.
 const plan=planPreflightNextAction(problems);
 return {sourceId:w.sourceId,name:w.shikonaEn,division:p.current?.rank?.split(' ')[0],
  certificationLane:plan.lane,owner:plan.owner,nextAction:plan.nextAction,
  classification:problems.length?'needs-source-or-manual-review':'candidate-for-strict-audit',
  blockers:problems,completedHistoricalBoutTournaments:prior.length,
  officialBashoCompared:Number(historical?.comparedBasho||0),
  independentlyReconciledOlderBasho:completedBasho.otherSourceBasho,
  missingJsaOlderBasho:completedBasho.missingOfficialBasho,
  historicalSourceOverlapConflicts:completedBasho.sourceOverlapConflicts,
  JsaHistoricalRankCompared:Number(ranks?.comparedBasho||0),
  independentAdditionalRankPositions:sourceRankCoverage.passed&&
   sourceRankCoverage.jsaCompared<sourceRankCoverage.quota?
   sourceRankCoverage.independentAdditional:0,
  documentedNoPublishedNumberedDebutRank:justifiedDebutGap,
  debutRankStillUnpublished:justifiedDebutGap?String(p.rankHistoryGaps[0].bashoId):null,
  careerTotalsEvidence:jsaWinLossMatches&&jsaAbsencesPresent?
   (currentCutoff.passed?'published-JSA-three-part-WLA-as-of-reconciled':
    'published-JSA-three-part-career-record'):fullAttendance.passed?
   'independent-complete-ranked-basho-proof-of-native-zero-absences':
   independentlyMatched&&(!jsaHasCareer||jsaWinLossMatches)?
   'independent-SumoDB-three-part-career-record-plus-JSA-basho':'incomplete-or-conflicting',
  fullAttendanceZeroAbsencesProved:fullAttendance.passed,
  fullAttendanceBashoProven:fullAttendance.passed?fullAttendance.completedBashoProven:0,
  independentBirthDateMatch:rawIdentity?.birthDateStatus==='match',
  sourceEligibilityChecked:true,strictAuditPassed:false,certified:false,
  productionReleaseApproved:false,photoRightsReviewedSeparately:true};
}
export function summarizePreflight(rows){
 if(rows.length!==190||new Set(rows.map(x=>x.sourceId)).size!==190)
  throw Error('Certification preflight must cover exactly 190 immutable source IDs');
 const count=x=>rows.filter(r=>r.blockers.includes(x)).length;
 const all=[...new Set(rows.flatMap(x=>x.blockers))].sort();
 const laneCount=Object.fromEntries([...new Set(rows.map(x=>x.certificationLane))]
   .sort().map(lane=>[lane,rows.filter(x=>x.certificationLane===lane).length]));
 return {schemaVersion:1,cohortSize:190,scope:'Research-only strict Sumo career preflight; never self-certifies',
  candidateForStrictAudit:rows.filter(x=>x.classification==='candidate-for-strict-audit').length,
  sourceCorroboratedDebutRankGaps:rows.filter(x=>x.documentedNoPublishedNumberedDebutRank).length,
  needsSourceOrManualReview:rows.filter(x=>x.blockers.length>0).length,
  blockerCounts:Object.fromEntries(all.map(x=>[x,count(x)])),
  certificationLanes:laneCount,
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
