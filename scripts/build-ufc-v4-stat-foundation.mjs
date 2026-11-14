#!/usr/bin/env node
/**
 * BEFN V4 offline UFC-only statistical foundation. No API calls, credential
 * research, skill ratings or production profile writes.
 *
 * Join the immutable approved roster's complete known UFC timelines against
 * measured post-fight observations by exact native bout ID. In particular,
 * never select "the five most recently MEASURED fights": missing latest bouts
 * must occupy their actual positions in Last 5 / Last 10 / Career.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isFeederUfcEvent} from "./ufc-official-event-scope.mjs";
import {evaluateCareerEvidence} from "./ufc-36-month-stage3-progress.mjs";
import {certifyAttestedFullCareers} from "./certify-ufc-v4-independent-full-careers.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const validDay=x=>/^\d{4}-\d\d-\d\d$/.test(String(x||""));
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const integer=x=>Number.isInteger(x)&&x>=0?x:null;
const signed=x=>Number.isInteger(x)?x:null;
const round=x=>Number.isFinite(x)?Math.round(x*1e6)/1e6:null;
const fields=["sigLanded","sigAttempted","sigAbsorbed","sigStrikeDifferential",
 "totalLanded","totalAttempted","totalAbsorbed","totalStrikeDifferential",
 "knockdowns","takedowns","takedownAttempts","subAttempts","reversals",
 "controlSec","controlDifferentialSec"];
const signedFields=new Set(["sigStrikeDifferential","totalStrikeDifferential",
 "controlDifferentialSec"]);
const rates={
 sigLandedPerMinute:["sigLanded",60],
 sigAbsorbedPerMinute:["sigAbsorbed",60],
 sigStrikeDifferentialPer15:["sigStrikeDifferential",900],
 knockdownsPer15:["knockdowns",900],
 takedownsPer15:["takedowns",900],
 subAttemptsPer15:["subAttempts",900],
 controlSecPer15:["controlSec",900],
 controlDifferentialSecPer15:["controlDifferentialSec",900]
};
const officialResult=x=>["win","loss","draw","no_contest","w","l","d","nc"]
 .includes(String(x||"").toLowerCase());
const isHistoryRow=x=>
 String(x?.promotion||x?.org||"").toLowerCase()==="ufc"&&
 officialResult(x?.result||x?.outcome||x?.status);

function feederDatesFrom(progress){
 const byDay=new Map();
 for(const b of Object.values(progress?.bouts||{})){
  if(b?.org!=="ufc"||!validDay(b.eventDate)||!b.event)continue;
  if(!byDay.has(b.eventDate))byDay.set(b.eventDate,new Set());
  byDay.get(b.eventDate).add(b.event);
 }
 return new Set([...byDay].filter(([,titles])=>
  titles.size&&[...titles].every(isFeederUfcEvent)).map(([day])=>day));
}
function verifiedFeederRecord(slug,row,evidence){
 if(evidence?.schema!==1||!Array.isArray(evidence.bouts))return false;
 return evidence.bouts.some(item=>
  item?.fighterSlug===slug&&
  String(item.boutId||"")===String(row.boutId||"")&&
  row.source==="native"&&
  item.date===row.date&&norm(item.opponent)===norm(row.opponent)&&
  isFeederUfcEvent(item.event)&&
  /^https:\/\/(?:www\.)?ufc\.com\//i.test(String(item.sourceUrl||""))
 );
}
function timeline(profile,asOf,feederDates,slug,feederEvidence){
 const rows=(Array.isArray(profile?.recentHistory)?profile.recentHistory:[])
  .filter(x=>isHistoryRow(x)&&validDay(x.date)&&x.date<=asOf&&
   !feederDates.has(x.date)&&!verifiedFeederRecord(slug,x,feederEvidence));
 rows.sort((a,b)=>b.date.localeCompare(a.date)||
  Number(b.source==="native")-Number(a.source==="native")||
  String(a.opponent||"").localeCompare(String(b.opponent||"")));
 const seenIds=new Set(),seenMatch=new Set(),out=[];
 for(const row of rows){
  const id=row.source==="native"&&/^[1-9]\d{0,11}$/.test(String(row.boutId||""))?
   String(row.boutId):null;
  const semantic=row.date+"|"+norm(row.opponent);
  if(id&&seenIds.has(id))continue;
  if(seenMatch.has(semantic))continue;
  if(id)seenIds.add(id);
  seenMatch.add(semantic);
  out.push({boutId:id,date:row.date,opponent:row.opponent||null,
   result:row.result||row.outcome||row.status||null,
   outcome:row.result||row.outcome||row.status||null});
 }
 return out;
}
function aggregate(rows,measured){
 const observed=rows.map(row=>row.boutId?measured.get(row.boutId)||null:null);
 const totals={},coverage={};
 for(const field of fields){
  let sum=0,count=0,seconds=0,secondsCount=0;
  for(const bout of observed){
   const raw=bout?.metrics?.[field];
   const v=signedFields.has(field)?signed(raw):integer(raw);
   if(v===null)continue;
   sum+=v;count++;
   const clock=integer(bout.cageSec);
   if(clock!==null&&clock>0){seconds+=clock;secondsCount++;}
  }
  totals[field]=count?sum:null;
  coverage[field]={bouts:count,elapsedSeconds:secondsCount?seconds:null};
 }
 const calculatedRates={};
 for(const [label,[field,factor]] of Object.entries(rates)){
  let sum=0,seconds=0,count=0;
  for(const bout of observed){
   const raw=bout?.metrics?.[field],clock=integer(bout?.cageSec);
   const v=signedFields.has(field)?signed(raw):integer(raw);
   if(v===null||clock===null||clock<=0)continue;
   sum+=v;seconds+=clock;count++;
  }
  calculatedRates[label]={value:seconds?round(sum*factor/seconds):null,
   coveredBouts:count,elapsedSeconds:seconds||null};
 }
 let landed=0,attempted=0,attemptBouts=0;
 for(const bout of observed){
  const a=integer(bout?.metrics?.sigLanded),b=integer(bout?.metrics?.sigAttempted);
  if(a===null||b===null||b<=0||a>b)continue;
  landed+=a;attempted+=b;attemptBouts++;
 }
 calculatedRates.sigAccuracyPercent={
  value:attempted?round(100*landed/attempted):null,
  coveredBouts:attemptBouts,attempts:attempted||null
 };
 return {knownBouts:rows.length,linkedMeasuredBouts:observed.filter(Boolean).length,
  unlinkedTimelineRows:rows.filter(x=>!x.boutId).length,
  totals,metricCoverage:coverage,rates:calculatedRates};
}
export function buildV4StatFoundation(approval,research,progress,postfight,
  {asOf,census=null,independentEvidence=null,feederEvidence=null}={}){
 if(approval?.schema!==1||approval?.scope!=="ufc-36-month-roster"||
    approval?.status!=="approved"||approval?.approvedBy!=="user"||
    !Array.isArray(approval.approvedFighters)||
    approval.approvedFighters.length===0||
    new Set(approval.approvedFighters).size!==approval.approvedFighters.length)
  throw Error("V4 requires the unique, user-approved UFC roster");
 if(postfight?.schema!==1||postfight?.scope!=="ufc-only")
  throw Error("V4 requires measured UFC-only post-fight observations");
 const day=asOf||approval.rosterAsOf;
 if(!validDay(day))throw Error("V4 requires a valid as-of date");
 const feederDates=feederDatesFrom(progress);
 // Use the same stringent, independently maintained timeline verification
 // rules as the existing Stage 3 career audit. A legacy .complete=true
 // flag NEVER certifies a UFC career on its own.
 const censusBySlug=new Map(Array.isArray(census?.fighters)?
  census.fighters.map(f=>[f.slug,f]):[]);
 const independentRegistry=independentEvidence?.schema===1&&
  independentEvidence.scope==="ufc-independent-full-career-verification"&&
  independentEvidence.rosterAsOf===approval.rosterAsOf?
   independentEvidence.fighters||{}:{};
 const missingByBout=new Map();
 const fighters={},stats={approved:approval.approvedFighters.length,knownHistory:0,
  knownFive:0,knownTen:0,measuredFiveOfFive:0,measuredTenOfTen:0,
  providerCertified:0,independentCertified:0,legacyClaims:0,
  historyRows:0,linkedMeasuredRows:0,uniqueMeasuredIds:new Set(),
  unlinkedHistoryRows:0,missingNativeMetricRows:0,
  excludedFeederHistoryRows:0,excludedFeederFightIds:new Set()};
 for(const slug of approval.approvedFighters){
  const profile=research?.profiles?.[slug]||{};
  const history=timeline(profile,day,feederDates,slug,feederEvidence);
  const excludedExactFeederRows=(Array.isArray(profile?.recentHistory)?
   profile.recentHistory:[]).filter(x=>
   isHistoryRow(x)&&validDay(x.date)&&x.date<=day&&
   (feederDates.has(x.date)||verifiedFeederRecord(slug,x,feederEvidence)));
  stats.excludedFeederHistoryRows+=excludedExactFeederRows.length;
  for(const row of excludedExactFeederRows)if(row.boutId)
   stats.excludedFeederFightIds.add(String(row.boutId));
  const sampled=postfight.fighters?.[slug];
  // An old five-bout-only cache cannot claim comprehensive V4 career coverage.
  if(sampled&&!Array.isArray(sampled.careerBouts))
   throw Error("Full measured career cache required for "+slug+
    "; regenerate postfight metrics offline with V4-compatible builder");
  const measured=new Map();
  for(const bout of sampled?.careerBouts||[]){
   const id=String(bout?.boutId||"");
   if(!id)continue;
   if(measured.has(id))throw Error("Duplicate measured UFC fight "+id+" for "+slug);
   measured.set(id,bout);
  }
  // Prioritise documented missing native IDs, never infer that a new
  // provider call is appropriate before checking saved retry status.
  for(let position=0;position<history.length;position++){
   const row=history[position],id=row.boutId;
   if(!id||measured.has(id))continue;
   const checked=progress?.ufcCareerBoutChecks?.[id]||{};
   const current=missingByBout.get(id);
   const priority=position<5?1:position<10?2:3;
   const indexed=progress?.bouts?.[id]?.org==="ufc";
   const retryAfter=validDay(checked.retryAfter)?checked.retryAfter:null;
   const action=checked.status==="requires_manual_review"?"manual_review":
    retryAfter&&retryAfter>day?"retry_cooldown":
    indexed?"inspect_saved_round_or_clock_data":"review_uncached_native_id";
   const reference={fighterSlug:slug,date:row.date,opponent:row.opponent,
    careerPosition:position+1};
   if(!current)missingByBout.set(id,{boutId:id,priority,
    band:priority===1?"last5":priority===2?"last10":"career",
    indexedInSavedProviderCache:indexed,action,
    retryAfter,references:[reference]});
   else{
    current.references.push(reference);
    if(priority<current.priority){
     current.priority=priority;
     current.band=priority===1?"last5":priority===2?"last10":"career";
    }
   }
  }
  const windows={last5:aggregate(history.slice(0,5),measured),
   last10:aggregate(history.slice(0,10),measured),
   career:aggregate(history,measured)};
  const all=windows.career;
  const proof=evaluateCareerEvidence(profile,history,
   censusBySlug.get(slug)?.lastUfcFight,census?.asOf||day,
   independentRegistry[slug]);
  const completeMeasuredHistory=history.length>0&&
   windows.career.linkedMeasuredBouts===history.length;
  const certified=proof.providerCertified&&completeMeasuredHistory;
  const independentlyCertified=proof.independentlyVerified&&completeMeasuredHistory;
  if(proof.legacyClaim)stats.legacyClaims++;
  if(independentlyCertified)stats.independentCertified++;
  if(history.length)stats.knownHistory++;
  if(history.length>=5)stats.knownFive++;
  if(history.length>=10)stats.knownTen++;
  if(history.length>=5&&windows.last5.linkedMeasuredBouts===5)stats.measuredFiveOfFive++;
  if(history.length>=10&&windows.last10.linkedMeasuredBouts===10)stats.measuredTenOfTen++;
  if(certified)stats.providerCertified++;
  stats.historyRows+=history.length;
  stats.linkedMeasuredRows+=all.linkedMeasuredBouts;
  stats.unlinkedHistoryRows+=all.unlinkedTimelineRows;
  stats.missingNativeMetricRows+=history.filter(x=>x.boutId&&!measured.has(x.boutId)).length;
  for(const row of history)if(row.boutId&&measured.has(row.boutId))
   stats.uniqueMeasuredIds.add(row.boutId);
  fighters[slug]={name:profile?.name||null,slug,
   ufcTimelineCertified:certified,
   independentlyCertifiedCareer:independentlyCertified,
   // A complete history is never inferred from how many observations were saved.
   careerCoverageStatus:independentlyCertified?"independently_verified_full_career":
    certified?"provider_certified_full_career":
    !completeMeasuredHistory?"known_fight_coverage_gap":
    proof.providerDiscrepancy||(censusBySlug.has(slug)&&!proof.rosterLatestPresent)?
     "provider_history_discrepancy":
    proof.legacyClaim?"legacy_completeness_flag_unsubstantiated":
    "historical_completeness_unverified",
   knownCareerBouts:history.length,windows,
   v4Scores:null,externalCredentialBonusApplied:false};
 }
 const missingNativeBoutQueue=[...missingByBout.values()]
  .sort((a,b)=>a.priority-b.priority||
   b.references[0].date.localeCompare(a.references[0].date)||
   a.boutId.localeCompare(b.boutId));
 const gapBreakdown={
  distinctMissingNativeIds:missingNativeBoutQueue.length,
  latestFive:missingNativeBoutQueue.filter(x=>x.band==="last5").length,
  fightsSixToTen:missingNativeBoutQueue.filter(x=>x.band==="last10").length,
  beyondTen:missingNativeBoutQueue.filter(x=>x.band==="career").length,
  manualReview:missingNativeBoutQueue.filter(x=>x.action==="manual_review").length,
  retryCooldown:missingNativeBoutQueue.filter(x=>x.action==="retry_cooldown").length,
  inspectSavedData:missingNativeBoutQueue.filter(x=>x.action==="inspect_saved_round_or_clock_data").length,
  notIndexed:missingNativeBoutQueue.filter(x=>!x.indexedInSavedProviderCache).length,
  notIndexedAndManualReview:missingNativeBoutQueue.filter(x=>
   !x.indexedInSavedProviderCache&&x.action==="manual_review").length
 };
 const summary={approvedFighters:stats.approved,fightersWithKnownHistory:stats.knownHistory,
  fightersWithFiveKnownBouts:stats.knownFive,
  fightersWithTenKnownBouts:stats.knownTen,
  fightersWithFiveMeasuredLatestBouts:stats.measuredFiveOfFive,
  fightersWithTenMeasuredLatestBouts:stats.measuredTenOfTen,
  fullyProviderCertifiedTimelines:stats.providerCertified,
  independentlyCertifiedCareers:stats.independentCertified,
  uncertifiedLegacyCompleteFlags:stats.legacyClaims,
  knownUfcHistoryRows:stats.historyRows,
  linkedMeasuredFighterBoutRows:stats.linkedMeasuredRows,
  distinctLinkedMeasuredUfcFights:stats.uniqueMeasuredIds.size,
  unlinkedHistoryRows:stats.unlinkedHistoryRows,
  nativeHistoryRowsWithoutFullRoundMetrics:stats.missingNativeMetricRows,
  excludedKnownFeederHistoryRows:stats.excludedFeederHistoryRows,
  excludedDistinctKnownFeederBoutIds:stats.excludedFeederFightIds.size,
  missingBoutsByPriority:gapBreakdown};
 return {schema:1,scope:"ufc-only-v4-stat-foundation",asOf:day,
  status:"offline_qa_only_not_production",population:stats.approved,
  note:"Last 5/10 reflect known chronological UFC bouts, not merely the latest measured ones. Career means all saved known UFC bouts, NOT provider-certified completeness. Per-metric absent evidence is null, never zero. No external achievement bonuses or unvalidated V4 ratings.",
  summary,missingNativeBoutQueue,fighters};
}
function read(name){return JSON.parse(fs.readFileSync(path.join(root,name),"utf8"))}
export function main(){
 const approval=read("data/ufc-36-month-roster-approval.json");
 const research=read("data/ufcalendar-fighter-research.json");
 const progress=read("data/ufcalendar-rich-progress.json");
 const measured=read("data/ufc-postfight-metrics.json");
 const independentBase=read("data/ufc-independent-full-career-verification.json");
 const sourceBatch=read("data/ufc-v4-independent-full-career-certification-batch-20261114.json");
 // Independent source attestation is never a shortcut past the exact
 // canonical native ID, fighter identity, UFC scope, outcome, or stats gates.
 const proof=certifyAttestedFullCareers(approval,research,progress,measured,independentBase,sourceBatch);
 const out=buildV4StatFoundation(
  approval,research,progress,measured,
  {asOf:approval.rosterAsOf,
   census:read("data/ufc-36-month-candidates.json"),
   independentEvidence:proof.registry,
   feederEvidence:read("data/ufc-feeder-bout-evidence.json")}
 );
 if(out.population!==783)throw Error("Immutable BEFN cohort must contain 783 fighters");
 for(const certified of proof.report.certifiedFighters){
  if(out.fighters?.[certified.slug]?.independentlyCertifiedCareer!==true)
   throw Error("BEFN V4: independently attested fighter failed final full-career proof "+certified.slug);
 }
 fs.mkdirSync(path.join(root,"qa"),{recursive:true});
 fs.writeFileSync(path.join(root,"qa/ufc-v4-independent-full-career-certifications.json"),
  JSON.stringify(proof.report,null,2)+"\n");
 console.log("BEFN_V4_INDEPENDENT_CERTIFIED "+JSON.stringify({
  count:proof.report.certifiedCount,
  fighters:proof.report.certifiedFighters.map(x=>({slug:x.slug,bouts:x.nativeBoutsMatched,
   dateOffsets:x.dateOffsets,nativeFighterId:x.nativeFighterId}))}));
 const file=path.join(root,"qa/ufc-v4-stat-foundation.json");
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(out,null,2)+"\n");
 console.log("BEFN_V4_STAT_FOUNDATION "+JSON.stringify(out.summary));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
