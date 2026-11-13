#!/usr/bin/env node
/**
 * BEFN UFC last-five coverage audit, no network/API usage.
 * Reads saved UFCalendar observations and emits a deterministic action queue.
 * Does NOT infer that a fighter has five UFC fights or invent missing totals.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isOfficialUfcEvent,isFeederUfcEvent,isSettledBout,
 MMA_ONLY_PROMOTIONS,MIXED_RULES_PROMOTIONS,NON_MMA_PROMOTIONS}
 from "./ufc-official-event-scope.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));}catch(e){if(e.code==="ENOENT")return fallback;throw e;}};
const slugify=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const nameKey=s=>slugify(s).replace(/-/g,"");
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||"")&&!Number.isNaN(Date.parse(s));
const cutoffFrom=(day)=>{const [y,m,d]=day.split("-").map(Number);let p=(y*12+m-1)-18;let py=Math.floor(p/12),pm=p%12+1;
 const max=new Date(Date.UTC(py,pm,0)).getUTCDate();return [py,String(pm).padStart(2,"0"),String(Math.min(d,max)).padStart(2,"0")].join("-");};
const normalOutcome=o=>{const x=String(o||"").toLowerCase();return x==="win"||x==="w"?"W":x==="loss"||x==="l"?"L":x==="draw"||x==="d"?"D":x==="no_contest"||x==="nc"?"NC":null;};
const priorityNames=data=>new Set((data.divisions||[]).map(x=>nameKey(x.name)).filter(Boolean));
// Evidence tiers are deliberately NOT "complete fighter profiles": a provider
// fight row can have only a few measured fields, and an under-five history
// cannot establish that the fighter has fewer than five UFC appearances.
const evidenceStages=[
 "fiveLinkedMeasured","fiveLinkedStatsGap","fiveUnlinked",
 "shortLinkedMeasuredDepthConfirmed","shortLinkedMeasuredDepthUnconfirmed",
 "shortLinkedStatsGapDepthConfirmed","shortLinkedStatsGap","shortUnlinked"
];
function evidenceStage(recent,depthConfirmed=false){
 const five=recent.length===5;
 if(recent.some(b=>!b.boutId))return five?"fiveUnlinked":"shortUnlinked";
 if(recent.some(b=>!b.hasMeasuredTotals))return five?
  "fiveLinkedStatsGap":depthConfirmed?"shortLinkedStatsGapDepthConfirmed":"shortLinkedStatsGap";
 return five?"fiveLinkedMeasured":depthConfirmed?
  "shortLinkedMeasuredDepthConfirmed":"shortLinkedMeasuredDepthUnconfirmed";
}
export function auditUfcLastFive(progress,research,postfight,champions,{asOf,upcoming={},ranked=[],verifiedMixedMma={}}){
 if(!validDate(asOf))throw Error("asOf must be YYYY-MM-DD");
 const cutoff=cutoffFrom(asOf),registry=new Map();
 const ensure=(s,name)=>{const slug=slugify(s);if(!slug)return null;
  if(!registry.has(slug))registry.set(slug,{slug,name:name||slug,lastActive:null,
   lastMainUfcFight:null,recentUfcLabel:false,history:new Map(),active:false,
   knownLaterMma:[],promotionReview:[],shiftedAliasesJoined:0});
  const x=registry.get(slug);if(name)x.name=name;return x;};
 const put=(fighter,date,opponent,{boutId=null,method=null,outcome=null,origin}={})=>{
  if(!fighter||!validDate(date)||date>asOf||!opponent)return;
  const k=date+":"+nameKey(opponent);
  const existing=fighter.history.get(k);
  if(existing){
   if(!existing.boutId&&boutId)
    fighter.history.set(k,{date,opponent,boutId,method,outcome,origin});
   return;
  }
  // Official bout calendars may use UTC where athlete history uses local day.
  // Join only the same opponent shifted by EXACTLY one day, when one record
  // has a unique provider UFC bout ID and the other is text-only history.
  const opponentKey=nameKey(opponent);
  const candidates=[...fighter.history.entries()].filter(([_,prior])=>
   nameKey(prior.opponent)===opponentKey&&
   Math.abs(Date.parse(prior.date+"T00:00:00Z")-
    Date.parse(date+"T00:00:00Z"))===86400000&&
   Boolean(prior.boutId)!==Boolean(boutId));
  // Native history can now carry the same confirmed fight ID as the index.
  // Do not turn the same fight into two entries solely because the source
  // displays the local date and the event index displays UTC.
  const sameIdCandidates=boutId?[...fighter.history.values()].filter(prior=>
   String(prior.boutId||"")===String(boutId)&&
   nameKey(prior.opponent)===opponentKey&&
   Math.abs(Date.parse(prior.date+"T00:00:00Z")-
    Date.parse(date+"T00:00:00Z"))===86400000):[];
  if(sameIdCandidates.length===1){
   fighter.shiftedAliasesJoined++;
   return;
  }
  if(candidates.length===1){
   fighter.shiftedAliasesJoined++;
   const [priorKey,prior]=candidates[0];
   if(boutId&&!prior.boutId){
    fighter.history.delete(priorKey);
    fighter.history.set(k,{date,opponent,boutId,method,outcome,origin});
   }
   // Retain the indexed date/status and confirmed ID if already present.
   return;
  }
  fighter.history.set(k,{date,opponent,boutId,method,outcome,origin});
 };
 // UFC is also the source's organisation label for two separate feeder
 // tournaments: DWCS and Road to UFC. Neither is an official UFC roster bout.
 const indexed=Object.values(progress?.bouts||{}).filter(b=>
  isSettledBout(b?.status)&&validDate(b.eventDate)&&b.eventDate<=asOf);
 const feeders=new Map(),feederIds=new Set();
 for(const bout of indexed.filter(b=>b.org==="ufc")){
  const regular=isOfficialUfcEvent(bout.event);
  const feeder=isFeederUfcEvent(bout.event);
  if(feeder)feederIds.add(String(bout.id||""));
  for(const side of ["a","b"]){
   const own=bout[side],opp=bout[side==="a"?"b":"a"];
   if(!own?.slug||!opp?.name)continue;
   const person=ensure(own.slug,own.name);
   if(bout.eventDate>=cutoff)person.recentUfcLabel=true;
   if(feeder){
    const list=feeders.get(person.slug)||[];
    list.push({date:bout.eventDate,opponent:opp.name,boutId:String(bout.id||"")});
    feeders.set(person.slug,list);
    // These are professional MMA fights but NOT regular UFC roster bouts.
    person.knownLaterMma.push({date:bout.eventDate,opponent:opp.name,
     promotion:/road\s+to\s+ufc/i.test(bout.event)?"road-to-ufc":"dwcs",
     source:"ufcalendar-feeder-event"});
    continue;
   }
   if(!regular){
    person.promotionReview.push({date:bout.eventDate,opponent:opp.name,
     promotion:"ufc-event-unverified",reason:"event_type_unverified"});
    continue;
   }
   person.lastMainUfcFight=!person.lastMainUfcFight||
    person.lastMainUfcFight<bout.eventDate?bout.eventDate:person.lastMainUfcFight;
   if(bout.eventDate>=cutoff){
    person.active=true;
    if(!person.lastActive||person.lastActive<bout.eventDate)
     person.lastActive=bout.eventDate;
   }
   const winId=String(bout.result?.winnerId||"");
   const result=bout.status==="no_contest"?"NC":bout.status==="draw"?"D":
    winId?String(own.id)===winId?"W":"L":null;
   put(person,bout.eventDate,opp.name,{boutId:String(bout.id||"")||null,
    method:bout.result?.method||null,outcome:result,origin:"ufc-bout-index"});
  }
 }
 // Cross-check indexed PFL bouts as well as source-provided career history.
 for(const bout of indexed.filter(b=>b.org==="pfl")){
  for(const side of ["a","b"]){
   const own=bout[side],opp=bout[side==="a"?"b":"a"];
   const person=registry.get(slugify(own?.slug));
   if(!person||!own?.name||!opp?.name)continue;
   if(nameKey(own.name)!==nameKey(person.name)){
    person.promotionReview.push({date:bout.eventDate,
     promotion:"pfl",reason:"cross_promotion_identity_mismatch"});
    continue;
   }
   person.knownLaterMma.push({date:bout.eventDate,opponent:opp.name,
    promotion:"pfl",source:"ufcalendar-indexed-pfl"});
  }
 }
 const isHistoricalFeeder=(athlete,row)=>{
  if(row.boutId&&feederIds.has(String(row.boutId)))return true;
  return (feeders.get(athlete.slug)||[]).some(f=>
   nameKey(f.opponent)===nameKey(row.opponent)&&
   Math.abs(Date.parse(f.date+"T00:00:00Z")-
    Date.parse(row.date+"T00:00:00Z"))<=86400000);
 };
 for(const [slug,record] of Object.entries(research?.profiles||{})){
  const athlete=registry.get(slugify(slug));if(!athlete)continue;
  // Never certify a short official UFC career against an unverified count.
  athlete.ufcTimeline=record?.ufcTimeline||null;
  const sourceUfcRows=(record?.recentHistory||[]).filter(row=>
   row&&String(row.promotion||row.org||"").toLowerCase()==="ufc"&&
   normalOutcome(row.result||row.outcome||row.status)&&validDate(row.date)&&
   row.opponent&&!isHistoricalFeeder(athlete,row));
  athlete.sourceUfcRowCount=new Set(sourceUfcRows.map(row=>
   row.date+":"+nameKey(row.opponent))).size;
  for(const row of record?.recentHistory||[]){
   if(!row||!normalOutcome(row.result||row.outcome||row.status)||
    !validDate(row.date)||row.date>asOf||!row.opponent)continue;
   const promotion=String(row.promotion||row.org||"").toLowerCase();
   if(promotion==="ufc"){
    if(isHistoricalFeeder(athlete,row))continue;
    const nativeId=row.source==="native"&&/^[1-9][0-9]{0,11}$/.test(String(row.boutId||""))?
     String(row.boutId):null;
    put(athlete,row.date,row.opponent,{boutId:nativeId,
     method:row.method||null,
     outcome:normalOutcome(row.result||row.outcome||row.status),
     origin:"ufc-history"});
    continue;
   }
   const item={date:row.date,opponent:row.opponent,promotion,
    source:"ufcalendar-career-history"};
   if(MMA_ONLY_PROMOTIONS.has(promotion)){
    athlete.knownLaterMma.push(item);
   }else if(MIXED_RULES_PROMOTIONS.has(promotion)){
    const evidence=(verifiedMixedMma?.fighters?.[athlete.slug]||[]).some(e=>
     e?.date===row.date&&e.promotion===promotion&&
     nameKey(e.opponent)===nameKey(row.opponent)&&e.ruleset==="mma"&&
     validDate(e.checkedAt)&&e.checkedAt<=asOf&&/^https:\/\/\S+/.test(e.source||""));
    if(evidence||String(row.ruleset||row.sport||"").toLowerCase()==="mma")
     athlete.knownLaterMma.push({...item,source:evidence?
      "independently-verified-mma-result":item.source});
    else athlete.promotionReview.push({...item,reason:"mixed_rules_promotion"});
   }else if(!NON_MMA_PROMOTIONS.has(promotion)){
    // Unlabeled career entries may be grappling, wrestling or boxing.
    // Unknown sport must NEVER serve as evidence to delete an athlete.
    athlete.promotionReview.push({...item,reason:"sport_or_promotion_unknown"});
   }
  }
 }
 const championsSet=priorityNames(champions);
 // Upcoming is editorial only: it affects research order, not activity eligibility.
 const upcomingNames=new Set((upcoming.events||[]).filter(e=>
  String(e.promotion||"").toLowerCase()==="ufc"&&e.date>=asOf)
  .flatMap(e=>(e.bouts||[]).filter(b=>!["reported","provisional"].includes(b.status))
   .flatMap(b=>b.fighters||[])).map(nameKey).filter(Boolean));
 const rankedNames=new Set(ranked.flatMap(d=>Object.values(d?.fighters||{}))
  .filter(f=>Number.isInteger(f.ranking?.rank)&&f.ranking.rank>=1&&
   f.ranking.rank<=15&&f.ranking.source&&f.ranking.checkedAt)
  .map(f=>nameKey(f.name)).filter(Boolean));
 const metrics=new Map();
 for(const f of Object.values(postfight?.fighters||{})){
  if(f?.scope!=="ufc-only")continue;
  const key=nameKey(f.name);if(!key)continue;
  // The postfight builder can emit a metrics object with every value null.
  // An empty observation is NOT a measured bout; real zeroes are valid.
  const ids=new Set((f.recentBouts||[]).filter(b=>b.boutId&&
   b.metrics&&Object.values(b.metrics).some(value=>Number.isFinite(value)))
   .map(b=>String(b.boutId)));
  metrics.set(key,ids);
 }
 const recentUfcCandidates=[...registry.values()].filter(f=>f.recentUfcLabel);
 const exclusion=new Map(),pending=[];
 for(const f of recentUfcCandidates){
  if(!f.active||!f.lastActive){
   exclusion.set(f.slug,{name:f.name,slug:f.slug,
    reason:"no_official_ufc_fight_in_18_months",
    latestOfficialUfc:f.lastMainUfcFight||null});
   continue;
  }
  const newer=f.knownLaterMma.filter(row=>row.date>f.lastActive)
   .sort((a,b)=>b.date.localeCompare(a.date)||a.promotion.localeCompare(b.promotion));
  if(newer.length){
   exclusion.set(f.slug,{name:f.name,slug:f.slug,
    reason:"later_professional_mma_outside_ufc",
    latestOfficialUfc:f.lastActive,latestOtherMma:newer[0]});
   continue;
  }
  const unresolved=f.promotionReview.filter(row=>row.date>f.lastActive)
   .sort((a,b)=>b.date.localeCompare(a.date));
  if(unresolved.length)pending.push({name:f.name,slug:f.slug,
   latestOfficialUfc:f.lastActive,latestUnresolved:unresolved[0],
   reason:"later_fight_requires_sport_verification"});
 }
 const pendingSlugs=new Set(pending.map(row=>row.slug));
 const fighters=recentUfcCandidates.filter(f=>f.active&&!exclusion.has(f.slug)).map(f=>{
  const recent=[...f.history.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.opponent.localeCompare(b.opponent)).slice(0,5);
  const measured=metrics.get(nameKey(f.name))||new Set();
  const entries=recent.map(row=>({...row,hasMeasuredTotals:!!row.boutId&&measured.has(row.boutId)}));
  const measuredCount=entries.filter(row=>row.hasMeasuredTotals).length;
  const unknownIds=entries.filter(row=>!row.boutId).length;
  const timeline=f.ufcTimeline;
  const depthConfirmed=recent.length>0&&recent.length<5&&unknownIds===0&&
   new Set(entries.map(row=>String(row.boutId))).size===recent.length&&
   timeline?.complete===true&&Number.isInteger(timeline.settledCount)&&
   timeline.settledCount===recent.length&&
   f.sourceUfcRowCount===recent.length&&validDate(timeline.observedOn)&&
   timeline.observedOn>=f.lastActive&&timeline.observedOn<=asOf;
  const historyNeeded=(recent.length<5&&!depthConfirmed)||unknownIds>0;
  const stage=evidenceStage(entries,depthConfirmed);
  return {name:f.name,slug:f.slug,lastUfcFight:f.lastActive,
   champion:championsSet.has(nameKey(f.name)),
   upcoming:upcomingNames.has(nameKey(f.name)),
   ranked:rankedNames.has(nameKey(f.name)),
   recentCount:recent.length,
   measuredCount,evidenceStage:stage,ufcTimelineDepthConfirmed:depthConfirmed,
   needsLatestMmaVerification:pendingSlugs.has(f.slug),
   needsHistoryCheck:historyNeeded,needsStats:entries.some(x=>!x.hasMeasuredTotals),
   recent:entries};
 }).sort((a,b)=>Number(b.champion)-Number(a.champion)||
   Number(b.upcoming)-Number(a.upcoming)||
   Number(b.ranked)-Number(a.ranked)||
   Number(b.needsHistoryCheck)-Number(a.needsHistoryCheck)||
   b.lastUfcFight.localeCompare(a.lastUfcFight)||a.slug.localeCompare(b.slug));
 const removed=[...exclusion.values()].sort((a,b)=>a.slug.localeCompare(b.slug));
 const totals={activeFighters:fighters.length,
  recentUfcLabeledCandidates:recentUfcCandidates.length,
  excludedWithoutRecentOfficialUfc:removed.filter(x=>x.reason==="no_official_ufc_fight_in_18_months").length,
  excludedLaterNonUfcProfessionalMma:removed.filter(x=>x.reason==="later_professional_mma_outside_ufc").length,
  needsLatestMmaVerification:pending.length,
  withFiveKnown:fighters.filter(f=>f.recentCount===5).length,
  withFiveLinkedIds:fighters.filter(f=>f.recentCount===5&&
   f.recent.every(x=>x.boutId)&&
   new Set(f.recent.map(x=>String(x.boutId))).size===5).length,
  withThreeMeasured:fighters.filter(f=>f.measuredCount>=3).length,
  withShortUfcTimelineReconciled:fighters.filter(f=>f.ufcTimelineDepthConfirmed).length,
  withUfcHistoryLinkedAndMeasured:fighters.filter(f=>f.evidenceStage==="fiveLinkedMeasured"||
   f.evidenceStage==="shortLinkedMeasuredDepthConfirmed").length,
  // Mutually exclusive stages: counts always sum to activeFighters.
  // "Measured" means at least one non-null field per bout, not every metric.
  evidenceStages:Object.fromEntries(evidenceStages.map(stage=>[
   stage,fighters.filter(f=>f.evidenceStage===stage).length
  ])),
  needHistoryCheck:fighters.filter(f=>f.needsHistoryCheck).length,
  needStats:fighters.filter(f=>f.needsStats).length,
  shiftedDateAliasesJoined:[...registry.values()].filter(f=>f.active)
   .reduce((sum,f)=>sum+f.shiftedAliasesJoined,0),
  uniqueKnownBoutIds:new Set(fighters.flatMap(f=>f.recent.map(b=>b.boutId).filter(Boolean))).size};
 return {schema:1,scope:"ufc",asOf,activityCutoff:cutoff,
  eligibilityRule:"Latest completed professional MMA fight must be on an official UFC card within the preceding 18 months; DWCS/Road-to-UFC are separate feeder events. Unknown sports are held for review, not excluded.",
  summary:totals,excluded:removed,pendingEligibility:pending,fighters};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const asOf=process.argv[2]||new Date().toISOString().slice(0,10);
 const result=auditUfcLastFive(
  read("data/ufcalendar-rich-progress.json",{}),
  read("data/ufcalendar-fighter-research.json",{}),
  read("data/ufc-postfight-metrics.json",{}),
  read("data/ufc-champion-profiles.json",{}),{
   asOf,
   upcoming:read("data/upcoming-cards.json",{}),
   verifiedMixedMma:read("data/ufc-verified-mixed-rules-mma.json",{}),
   ranked:[
    read("data/ufc-ranked-profiles.json",{}),
    read("data/ufc-contender-profiles.json",{}),
    read("data/ufc-prospect-profiles.json",{})
   ]
  });
 const out=path.join(root,"data/ufc-last-five-coverage.json");
 fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n","utf8");
 console.log("UFC last-five coverage",JSON.stringify(result.summary));
}
