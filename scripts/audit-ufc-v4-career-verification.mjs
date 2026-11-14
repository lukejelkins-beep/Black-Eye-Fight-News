#!/usr/bin/env node
/** BEFN V4 independent career-depth audit and verification queue.
 * Offline only. UFC-backed minimum bout evidence can establish an omission,
 * NEVER completeness. Do not overwrite UFCalendar, repair identities, or
 * publish uncertified full-career labels.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||""))?String(x):null;
const outcomes=new Map(Object.entries({w:"win",win:"win",l:"loss",loss:"loss",
 d:"draw",draw:"draw",nc:"no_contest",no_contest:"no_contest"}));
const result=x=>outcomes.get(String(x||"").toLowerCase())||null;
const officialUrl=x=>/^https:\/\/(?:www\.)?ufc\.com\//i.test(String(x||""));
const verifiedFeeder=(slug,row,feeder)=>{
 const id=String(row.boutId||"");
 return Array.isArray(feeder?.bouts)&&feeder.bouts.some(x=>
  x.fighterSlug===slug&&String(x.boutId||"")===id&&
  date(x.date)===date(row.date)&&norm(x.opponent)===norm(row.opponent)&&
  /(?:contender series|road to ufc|dwcs)/i.test(String(x.event||""))&&
  officialUrl(x.sourceUrl));
};
function canonHistory(slug,profile,feeder){
 const seen=new Set();
 return (Array.isArray(profile?.recentHistory)?profile.recentHistory:[])
 .filter(row=>String(row?.promotion||row?.org||"").toLowerCase()==="ufc"&&
  date(row.date)&&result(row.result||row.outcome||row.status)&&
  !verifiedFeeder(slug,row,feeder))
 .sort((a,b)=>b.date.localeCompare(a.date))
 .filter(row=>{
  const key=date(row.date)+"|"+norm(row.opponent);
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).map(row=>({boutId:String(row.boutId||""),date:date(row.date),
  opponent:row.opponent,opponentKey:norm(row.opponent),
  result:result(row.result||row.outcome||row.status)}));
}
function exactMatch(a,b){
 if(a.opponentKey!==norm(b.opponent)||a.result!==result(b.result))return false;
 if(a.date===date(b.date))return true;
 // UTC/local offsets are a real source of a one-day difference; record
 // as a close candidate, not as an independently verified exact identity.
 return false;
}
export function auditCareerVerification(approval,foundation,research,progress,
 census,independent,inventory,feeder){
 const approved=approval?.approvedFighters;
 if(approval?.schema!==1||approval.status!=="approved"||
   approved?.length!==783||new Set(approved).size!==783||
   foundation?.scope!=="ufc-only-v4-stat-foundation"||
   foundation.population!==783)throw Error("Approved 783-person V4 foundation required");
 if(independent?.scope!=="ufc-independent-full-career-verification"||
   independent?.rosterAsOf!==approval.rosterAsOf||
   inventory?.scope!=="ufc-official-career-bout-inventory"||
   inventory.rosterAsOf!==approval.rosterAsOf)
  throw Error("Independent evidence must match approved snapshot");
 const censusMap=new Map((census?.fighters||[]).map(x=>[x.slug,x]));
 const cases=[], counts={officialOmission:0,providerDiscrepancy:0,
  fullIndexNotAttempted:0,partialOrManualProviderSearch:0,
  identityCheckUnattempted:0,uncertified:0,verifiedComplete:0,
  independentlyCertified:0,providerOnlyCertified:0,conflictingSavedOutcomes:0};
 const officialReview=[];
 for(const slug of approved){
  const f=foundation.fighters?.[slug];
  if(!f)throw Error("Missing approved V4 fighter "+slug);
  const profile=research?.profiles?.[slug]||{};
  const timeline=canonHistory(slug,profile,feeder);
  // Never silently collapse contradictory results for the same dated opponent.
  const outcomesByBout=new Map();
  const contradictorySavedRows=[];
  for(const row of profile?.recentHistory||[]){
   if(String(row?.promotion||row?.org||"").toLowerCase()!=="ufc"||
      !date(row.date)||!norm(row.opponent)||!result(row.result||row.outcome||row.status)||
      verifiedFeeder(slug,row,feeder))continue;
   const k=date(row.date)+"|"+norm(row.opponent);
   const outcome=result(row.result||row.outcome||row.status);
   if(outcomesByBout.has(k)&&outcomesByBout.get(k)!==outcome)
    contradictorySavedRows.push({date:date(row.date),opponent:row.opponent,
     outcomes:[outcomesByBout.get(k),outcome]});
   else outcomesByBout.set(k,outcome);
  }
  const checked=progress?.ufcApprovedFullFightSearchChecks?.[slug]||{};
  const identity=progress?.ufcFullCareerHistoryChecks?.[slug]||{};
  const external=independent.fighters?.[slug]||{};
  const source=inventory.fighters?.[slug]||null;
  const approvedBoutInventory=Array.isArray(source?.bouts)&&officialUrl(source.sourceUrl)?
   source.bouts.filter(x=>date(x.date)&&norm(x.opponent)&&result(x.result)):[];
  let unmatched=[];
  if(approvedBoutInventory.length){
   unmatched=approvedBoutInventory.filter(row=>!timeline.some(x=>exactMatch(x,row)));
   // Expose near matches for human reconciliation; never silently accept them.
   const oneDayApart=(a,b)=>Math.abs(Date.parse(a+"T00:00:00Z")-
    Date.parse(b+"T00:00:00Z"))===86400000;
   const closeCandidates=unmatched.map(row=>({
    official:{date:row.date,opponent:row.opponent,result:result(row.result)},
    savedCandidates:timeline.filter(x=>norm(x.opponent)===norm(row.opponent)&&
     (x.date===row.date||oneDayApart(x.date,row.date))).map(x=>({
      boutId:x.boutId,date:x.date,opponent:x.opponent,result:x.result,
      reason:x.date!==row.date?"one_day_date_offset":
       x.result!==result(row.result)?"outcome_conflict":"candidate_not_exact"
     }))
   })).filter(x=>x.savedCandidates.length);
   officialReview.push({slug,officialSourceUrl:source.sourceUrl,
    closeCandidates,
    independentlyListedBouts:approvedBoutInventory.length,
    currentlySavedKnownUfcBouts:f.knownCareerBouts,
    exactUnmatchedBouts:unmatched.map(x=>({
     date:x.date,opponent:x.opponent,result:result(x.result)})),
    // Do not claim the official list is exhaustive unless a human reviews
    // its pagination, date range, eligibility, no-contests, and scope.
    completeCareerCertifiedByInventory:false});
  }
  const hasOfficialOmission=unmatched.length>0||
    (Number.isInteger(external.minimumOfficialUfcBouts)&&
     external.minimumOfficialUfcBouts>f.knownCareerBouts);
  const mismatch=f.careerCoverageStatus==="provider_history_discrepancy"||
    Boolean(profile.ufcTimeline?.savedHistoryHasAdditionalUfcBouts||
     profile.ufcTimeline?.missingRosterLastUfcFight||
     (profile.ufcHistoryIdConflicts||[]).length);
  // Independent source-attested and native-verified completeness can supersede
  // stale provider history flags. It CANNOT supersede a real official omission,
  // contradictory result or an unresolved numeric fighter-ID collision.
  // The V4 foundation sets independentlyCertifiedCareer only after strict
  // per-fight source URL, native ID, identity, result and measured stats gates.
  const unresolvedIdentityConflicts=Boolean(
    (profile.ufcHistoryIdConflicts||[]).length||
    Number(profile.ufcTimeline?.conflictingNativeFightIds)>0);
  const sourceContradiction=contradictorySavedRows.length>0||
    hasOfficialOmission||unresolvedIdentityConflicts;
  const independentlyCertified=f.independentlyCertifiedCareer===true&&
    !sourceContradiction;
  // A provider-only certificate remains blocked by all provider mismatches.
  const providerCertified=f.ufcTimelineCertified===true&&
    !sourceContradiction&&!mismatch;
  const verified=providerCertified||independentlyCertified;
  const noFullSearch=checked.status===undefined;
  const incompleteSearch=checked.status&&checked.status!=="checked";
  const identityNotChecked=identity.status!=="checked";
  if(hasOfficialOmission)counts.officialOmission++;
  if(mismatch)counts.providerDiscrepancy++;
  if(noFullSearch)counts.fullIndexNotAttempted++;
  if(incompleteSearch)counts.partialOrManualProviderSearch++;
  if(identityNotChecked)counts.identityCheckUnattempted++;
  if(!verified)counts.uncertified++;else counts.verifiedComplete++;
  if(independentlyCertified)counts.independentlyCertified++;
  else if(providerCertified)counts.providerOnlyCertified++;
  if(contradictorySavedRows.length)counts.conflictingSavedOutcomes++;
  const priority=contradictorySavedRows.length?1:hasOfficialOmission?1:mismatch?2:incompleteSearch?3:
   noFullSearch?4:identityNotChecked?5:6;
  const labels=[...(contradictorySavedRows.length?["contradictory_saved_ufc_outcomes"]:[]),
    ...(hasOfficialOmission?["official_listing_has_unsaved_bouts"]:[]),
    ...(mismatch?["saved_provider_history_discrepancy"]:[]),
    ...(incompleteSearch?["full_fight_index_incomplete_or_manual_review"]:[]),
    ...(noFullSearch?["full_fight_index_not_attempted"]:[]),
    ...(identityNotChecked?["numeric_identity_career_check_not_completed"]:[]),
    ...(!verified?["historical_completeness_unverified"]:[])];
  cases.push({slug,name:profile.name||censusMap.get(slug)?.name||slug,
   priority,knownUfcBouts:f.knownCareerBouts,
   historicalStatus:f.careerCoverageStatus,
   officialInventoryBoutCount:approvedBoutInventory.length||null,
   officialInventoryUnmatched:unmatched.length,
   contradictorySavedOutcomes:contradictorySavedRows,
   fullFightIndexSearchStatus:checked.status||"not_attempted",
   identityCareerCheckStatus:identity.status||"not_attempted",
   providerExplicitUntruncated:profile?.ufcTimeline?.providerTruncatedFlag===false,
   providerOrIndependentCareerCertified:verified,
   independentlyCertifiedCareer:independentlyCertified,
   providerOnlyCertified:providerCertified&&!independentlyCertified,
   reasons:labels});
 }
 cases.sort((a,b)=>a.priority-b.priority||
  b.officialInventoryUnmatched-a.officialInventoryUnmatched||
  b.knownUfcBouts-a.knownUfcBouts||a.slug.localeCompare(b.slug));
 return {schema:1,scope:"ufc-v4-official-career-verification-queue",
  status:"offline_qa_not_a_certification",
  asOf:foundation.asOf,population:approved.length,
  summary:{...counts,officialInventoryFighters:officialReview.length,
   officialListedBouts:officialReview.reduce((n,x)=>n+x.independentlyListedBouts,0),
   officiallyListedBoutsNotExactlyMatched:officialReview.reduce((n,x)=>n+x.exactUnmatchedBouts.length,0),
   priority1:cases.filter(x=>x.priority===1).length,
   priority2:cases.filter(x=>x.priority===2).length,
   pendingCertification:cases.filter(x=>!x.providerOrIndependentCareerCertified).length},
  priorityQueue:cases,officialCrosschecks:officialReview,
  note:"A full saved statistical history is NOT proof of an exhaustive UFC career. Crosscheck the authoritative official event/result listing bout by bout, verify source pagination and athlete identity, and only then add an independently attested complete career record. No new provider calls, no credential bonuses."};
}
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
export function main(){
 const r=auditCareerVerification(read("data/ufc-36-month-roster-approval.json"),
  read("qa/ufc-v4-stat-foundation.json"),
  read("data/ufcalendar-fighter-research.json"),
  read("data/ufcalendar-rich-progress.json"),
  read("data/ufc-36-month-candidates.json"),
  read("data/ufc-independent-full-career-verification.json"),
  read("data/ufc-official-career-bout-inventory.json"),
  read("data/ufc-feeder-bout-evidence.json"));
 fs.writeFileSync(path.join(root,"qa/ufc-v4-career-verification-queue.json"),
  JSON.stringify(r,null,2)+"\n");
 console.log("BEFN_V4_CAREER_VERIFICATION "+JSON.stringify(r.summary));
 const foundation=read("qa/ufc-v4-stat-foundation.json");
 const research=read("data/ufcalendar-fighter-research.json");
 const flagged=Object.entries(foundation.fighters).filter(([,entry])=>
  entry.independentlyCertifiedCareer===true);
 console.log("BEFN_V4_CERTIFICATION_COUNTER_DIFF "+JSON.stringify({
  foundationCertified:flagged.length,auditCertified:r.summary.independentlyCertified,
  discrepancies:flagged.map(([slug,entry])=>{
   const audit=r.priorityQueue.find(x=>x.slug===slug);
   const p=research.profiles?.[slug]||{};
   return {slug,foundation:entry.independentlyCertifiedCareer,
    audit:audit?.independentlyCertifiedCareer,
    auditReasons:audit?.reasons||[],
    identityConflictCount:(p.ufcHistoryIdConflicts||[]).length,
    identityConflicts:(p.ufcHistoryIdConflicts||[]).slice(0,5),
    timelineIdentityConflictCount:p.ufcTimeline?.conflictingNativeFightIds??0,
    savedHistoryHasAdditionalUfcBouts:p.ufcTimeline?.savedHistoryHasAdditionalUfcBouts??null,
    missingRosterLastUfcFight:p.ufcTimeline?.missingRosterLastUfcFight??null};
  }).filter(x=>x.foundation!==x.audit)}));

 console.log("BEFN_V4_OFFICIAL_OMISSIONS "+JSON.stringify(
  r.officialCrosschecks.filter(x=>x.exactUnmatchedBouts.length)));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
