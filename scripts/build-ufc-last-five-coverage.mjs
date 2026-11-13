#!/usr/bin/env node
/**
 * BEFN UFC last-five coverage audit, no network/API usage.
 * Reads saved UFCalendar observations and emits a deterministic action queue.
 * Does NOT infer that a fighter has five UFC fights or invent missing totals.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));}catch(e){if(e.code==="ENOENT")return fallback;throw e;}};
const slugify=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const nameKey=s=>slugify(s).replace(/-/g,"");
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||"")&&!Number.isNaN(Date.parse(s));
const cutoffFrom=(day)=>{const [y,m,d]=day.split("-").map(Number);let p=(y*12+m-1)-18;let py=Math.floor(p/12),pm=p%12+1;
 const max=new Date(Date.UTC(py,pm,0)).getUTCDate();return [py,String(pm).padStart(2,"0"),String(Math.min(d,max)).padStart(2,"0")].join("-");};
const settled=new Set(["completed","draw","no_contest"]);
const normalOutcome=o=>{const x=String(o||"").toLowerCase();return x==="win"||x==="w"?"W":x==="loss"||x==="l"?"L":x==="draw"||x==="d"?"D":x==="no_contest"||x==="nc"?"NC":null;};
const priorityNames=data=>new Set((data.divisions||[]).map(x=>nameKey(x.name)).filter(Boolean));
// Evidence tiers are deliberately NOT "complete fighter profiles": a provider
// fight row can have only a few measured fields, and an under-five history
// cannot establish that the fighter has fewer than five UFC appearances.
const evidenceStages=[
 "fiveLinkedMeasured","fiveLinkedStatsGap","fiveUnlinked",
 "shortLinkedMeasuredDepthUnconfirmed","shortLinkedStatsGap","shortUnlinked"
];
function evidenceStage(recent){
 const five=recent.length===5;
 if(recent.some(b=>!b.boutId))return five?"fiveUnlinked":"shortUnlinked";
 if(recent.some(b=>!b.hasMeasuredTotals))return five?
  "fiveLinkedStatsGap":"shortLinkedStatsGap";
 return five?"fiveLinkedMeasured":"shortLinkedMeasuredDepthUnconfirmed";
}
export function auditUfcLastFive(progress,research,postfight,champions,{asOf,upcoming={},ranked=[]}){
 if(!validDate(asOf))throw Error("asOf must be YYYY-MM-DD");
 const cutoff=cutoffFrom(asOf),registry=new Map();
 const ensure=(s,name)=>{const slug=slugify(s);if(!slug)return null;
  if(!registry.has(slug))registry.set(slug,{slug,name:name||slug,lastActive:null,history:new Map(),active:false,shiftedAliasesJoined:0});
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
 const bouts=Object.values(progress?.bouts||{}).filter(b=>b?.org==="ufc"&&settled.has(b.status)&&validDate(b.eventDate)&&b.eventDate<=asOf);
 for(const bout of bouts){
  for(const side of ["a","b"]){
   const own=bout[side],opp=bout[side==="a"?"b":"a"];
   if(!own?.slug||!opp?.name)continue;
   const person=ensure(own.slug,own.name);
   if(bout.eventDate>=cutoff){
    person.active=true;if(!person.lastActive||person.lastActive<bout.eventDate)person.lastActive=bout.eventDate;
   }
   const winId=String(bout.result?.winnerId||"");
   const result=bout.status==="no_contest"?"NC":bout.status==="draw"?"D":
    winId?String(own.id)===winId?"W":"L":null;
   put(person,bout.eventDate,opp.name,{boutId:String(bout.id||"")||null,
    method:bout.result?.method||null,outcome:result,origin:"ufc-bout-index"});
  }
 }
 for(const [slug,record] of Object.entries(research?.profiles||{})){
  const athlete=registry.get(slugify(slug));if(!athlete)continue;
  for(const row of record?.recentHistory||[]){
   if(!row||String(row.promotion||row.org||"").toLowerCase()!=="ufc")continue;
   const outcome=normalOutcome(row.result||row.outcome||row.status);
   if(!outcome||!validDate(row.date)||!row.opponent)continue;
   // A fight ID is trustworthy only for the provider's native tracked row;
   // public-records career notes may share an opponent/date but no linked ID.
   const nativeId=row.source==="native"&&/^[1-9][0-9]{0,11}$/.test(String(row.boutId||""))?
    String(row.boutId):null;
   put(athlete,row.date,row.opponent,{boutId:nativeId,
    method:row.method||null,outcome,origin:"ufc-history"});
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
 const fighters=[...registry.values()].filter(f=>f.active).map(f=>{
  const recent=[...f.history.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.opponent.localeCompare(b.opponent)).slice(0,5);
  const measured=metrics.get(nameKey(f.name))||new Set();
  const entries=recent.map(row=>({...row,hasMeasuredTotals:!!row.boutId&&measured.has(row.boutId)}));
  const measuredCount=entries.filter(row=>row.hasMeasuredTotals).length;
  const unknownIds=entries.filter(row=>!row.boutId).length;
  const historyNeeded=recent.length<5||unknownIds>0;
  const stage=evidenceStage(entries);
  return {name:f.name,slug:f.slug,lastUfcFight:f.lastActive,
   champion:championsSet.has(nameKey(f.name)),
   upcoming:upcomingNames.has(nameKey(f.name)),
   ranked:rankedNames.has(nameKey(f.name)),
   recentCount:recent.length,
   measuredCount,evidenceStage:stage,
   needsHistoryCheck:historyNeeded,needsStats:entries.some(x=>!x.hasMeasuredTotals),
   recent:entries};
 }).sort((a,b)=>Number(b.champion)-Number(a.champion)||
   Number(b.upcoming)-Number(a.upcoming)||
   Number(b.ranked)-Number(a.ranked)||
   Number(b.needsHistoryCheck)-Number(a.needsHistoryCheck)||
   b.lastUfcFight.localeCompare(a.lastUfcFight)||a.slug.localeCompare(b.slug));
 const totals={activeFighters:fighters.length,
  withFiveKnown:fighters.filter(f=>f.recentCount===5).length,
  withFiveLinkedIds:fighters.filter(f=>f.recentCount===5&&
   f.recent.every(x=>x.boutId)&&
   new Set(f.recent.map(x=>String(x.boutId))).size===5).length,
  withThreeMeasured:fighters.filter(f=>f.measuredCount>=3).length,
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
 return {schema:1,scope:"ufc",asOf,activityCutoff:cutoff,summary:totals,fighters};
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
