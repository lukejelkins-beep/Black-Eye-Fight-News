#!/usr/bin/env node
/**
 * BEFN UFC V3 metrics and leaderboards. Pure calculation over saved research;
 * NEVER connects to UFCalendar or invents unfinished per-bout observations.
 * Ratings and credentials remain deliberately unrated until separately reviewed.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const divkey=norm;
const integer=x=>Number.isInteger(x)&&x>=0?x:null;
const signed=x=>Number.isInteger(x)?x:null;
const fixed=x=>Number.isFinite(x)?Math.round(x*1e6)/1e6:null;
const boards=[
 ["slpm","Significant strikes landed/min","rate",false],
 ["sapm","Significant strikes absorbed/min","rate",true],
 ["diff","Net significant strikes/15 min","rate",false],
 ["kd","Knockdowns/15 min","rate",false],
 ["td","Takedowns/15 min","rate",false],
 ["control","Control time/15 min","rate",false],
 ["net","Net control time/15 min","rate",false],
 ["sub","Submission attempts/15 min","rate",false],
 ["acc","Significant-strike accuracy","pct",false],
 ["tdDef","Takedown defence","def",false],
 ["ko","KO/TKO wins","count",false],
 ["submission","Submission wins","count",false]
];
const techniques=["striking","wrestling","grappling","defence","form"];
const eligibleOutcome=o=>["W","L","D"].includes(o);
function reviewedMap(sources){
 const map=new Map();
 for(const cohort of sources){
  if(cohort?.scope!=="ufc-only"||cohort.schema!==1)continue;
  const records=Object.values(cohort.fighters||{});
  for(const row of records){
   if(!row?.name||row.organisation!=="UFC"||row.sport!=="MMA"||!row.division)continue;
   const key=norm(row.name);
   const old=map.get(key);
   if(!old||row.category==="Champion")map.set(key,row);
  }
 }
 return map;
}
function metricOn(rows,id){
 let sum=0,base=0,bouts=0;
 if(id==="ko"||id==="submission"){
  for(const row of rows){
   const result=row.result;
   // Only confirmed unique UFC bout IDs can qualify finish leaderboards.
   // A research-note-only result is useful context, not a measured bout.
   if(!result?.boutId||!eligibleOutcome(result?.outcome))continue;
   const method=String(result.method||"").trim().toLowerCase();
   if(result.outcome==="W"&&!method)continue;
   bouts++;
   if(result.outcome==="W"&&(id==="ko"?/\b(?:ko|tko|knockout)\b/.test(method):
    /\bsubmission\b|\btap(?:ped)?\b/.test(method)))sum++;
  }
  return bouts?{value:sum,bouts}:null;
 }
 for(const row of rows){
  const a=row.stats?.metrics;
  const b=row.opponent?.metrics;
  const seconds=integer(row.stats?.cageSec);
  if(!a||seconds===null||seconds<=0)continue;
  let top=null,below=0;
  switch(id){
   case "slpm":top=integer(a.sigLanded);below=seconds/60;break;
   case "sapm":top=integer(a.sigAbsorbed);below=seconds/60;break;
   case "diff":top=signed(a.sigStrikeDifferential);below=seconds/900;break;
   case "kd":top=integer(a.knockdowns);below=seconds/900;break;
   case "td":top=integer(a.takedowns);below=seconds/900;break;
   case "control":top=integer(a.controlSec);below=seconds/900;break;
   case "net":top=signed(a.controlDifferentialSec);below=seconds/900;break;
   case "sub":top=integer(a.subAttempts);below=seconds/900;break;
   case "acc":
    top=integer(a.sigLanded);
    below=integer(a.sigAttempted);
    if(below!==null&&top!==null&&top>below)top=null;
    break;
   case "tdDef":
    top=integer(b?.takedownAttempts);
    below=integer(b?.takedowns);
    if(top!==null&&below!==null&&below<=top){
     const attempts=top;
     top=attempts-below;
     below=attempts;
    }else{top=null;}
    break;
  }
  if(top===null||below===null||below<0)continue;
  if(id==="acc"||id==="tdDef"){
   // Attempts of zero cannot define a percentage and must not become 100%.
   if(below===0)continue;
  }else if(!Number.isFinite(below)||below<=0)continue;
  sum+=top;base+=below;bouts++;
 }
 if(!bouts||!base)return null;
 return {value:fixed((sum/base)*(["acc","tdDef"].includes(id)?100:1)),bouts};
}
export function buildSnapshot(coverage,postfight,cohorts=[],options={}){
 if(coverage?.schema!==1||coverage.scope!=="ufc"||
    postfight?.schema!==1||postfight.scope!=="ufc-only"||
    !Array.isArray(coverage.fighters))throw Error("Required saved UFC source schema missing");
 const asOf=options.asOf||coverage.asOf;
 if(asOf!==coverage.asOf||!/^\d{4}-\d{2}-\d{2}$/.test(asOf))
  throw Error("Coverage snapshot date must match the verified generation date");
 const samples=new Map(), byBout=new Map();
 for(const record of Object.values(postfight.fighters||{})){
  if(record?.scope!=="ufc-only"||!record.name)continue;
  samples.set(norm(record.name),record);
  for(const row of record.recentBouts||[]){
   const id=String(row.boutId||"");
   if(!id)continue;
   const items=byBout.get(id)||[];
   items.push({name:norm(record.name),row});
   byBout.set(id,items);
  }
 }
 const reviewed=reviewedMap(cohorts),fighters={},divisions=new Map();
 const current=coverage.fighters.filter(f=>f&&f.lastUfcFight>=coverage.activityCutoff&&
   f.lastUfcFight<=asOf&&Array.isArray(f.recent));
 // Keep a profile even when all five historical fights are still unresolved.
 // Absence of reliable fight rows must never silently remove an active athlete.
 for(const f of current){
  const key=norm(f.name);
  if(!key||fighters[key])continue;
  const source=reviewed.get(key);
  const division=source?.division||null;
  const verifiedCategory=f.champion===true||source?.category==="Champion"?"Champion":
   source?.review?.credentialsChecked===true&&
   ["Prospect","Contender","Roster"].includes(source.category)?source.category:"Unassessed";
  const next=(f.recent||[]).slice(0,5).map(x=>({
   boutId:x.boutId?String(x.boutId):null,date:x.date,
   opponent:x.opponent,outcome:x.outcome||null,method:x.method||null
  }));
  const observed=next.map(result=>{
   const id=result.boutId,matched=(samples.get(key)?.recentBouts||[])
     .find(x=>String(x.boutId||"")===id);
   const opposite=(byBout.get(id)||[]).find(x=>x.name!==key)?.row||null;
   return {result,stats:matched||null,opponent:opposite};
  });
  const metrics={};
  for(const [id] of boards){const m=metricOn(observed,id);if(m)metrics[id]=m;}
  const rank=source?.ranking;
  const rankValid=Number.isInteger(rank?.rank)&&rank.rank>=1&&rank.rank<=15&&
   typeof rank.source==="string"&&/^https:\/\//.test(rank.source)&&
   typeof rank.checkedAt==="string"&&rank.checkedAt<=asOf&&
   (new Date(asOf)-new Date(rank.checkedAt))<=60*86400000;
  fighters[key]={
   name:f.name,division,category:verifiedCategory,
   officialRank:rankValid?rank.rank:null,
   power:null,trajectory:null,technical:Object.fromEntries(techniques.map(id=>[id,{score:null}])),
   recent:next,metrics
  };
  if(division)divisions.set(key,divkey(division));
 }
 const resultBoards=boards.map(([id,label,type,lowerBetter])=>{
  const ranked=Object.entries(fighters).flatMap(([key,f])=>{
   const m=f.metrics[id];
   return m&&m.bouts>=3&&m.bouts<=5&&Number.isFinite(m.value)?
    [{key,name:f.name,value:m.value,bouts:m.bouts,division:divisions.get(key)||null}]:[];
  });
  ranked.sort((a,b)=>(lowerBetter?a.value-b.value:b.value-a.value)||
    b.bouts-a.bouts||a.name.localeCompare(b.name));
  const divisional=new Map();
  for(let i=0;i<ranked.length;i++){
   const row=ranked[i];
   const rank=i&&Math.abs(ranked[i-1].value-row.value)<1e-6?ranked[i-1].rank:i+1;
   row.rank=rank;
   const metric=fighters[row.key].metrics[id];
   metric.rank=rank;
   if(row.division){
    const list=divisional.get(row.division)||[];
    list.push(row);
    divisional.set(row.division,list);
   }
  }
  for(const list of divisional.values()){
   for(let i=0;i<list.length;i++){
    const m=fighters[list[i].key].metrics[id];
    m.divisionRank=i&&Math.abs(list[i-1].value-list[i].value)<1e-6?
      fighters[list[i-1].key].metrics[id].divisionRank:i+1;
    m.divisionEligible=list.length;
   }
  }
  return {id,label,type,eligible:ranked.length,
   leaders:ranked.slice(0,30).map(x=>({
    name:x.name,value:x.value,bouts:x.bouts,rank:x.rank
   }))};
 });
 return {schema:4,scope:"ufc-only",asOf,cutoff:coverage.activityCutoff,
  population:Object.keys(fighters).length,boards:resultBoards,fighters};
}
const read=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,name),"utf8"))}
 catch(e){if(e.code==="ENOENT")return fallback;throw e}};
export function main(){
 const coverage=read("data/ufc-last-five-coverage.json",null);
 const postfight=read("data/ufc-postfight-metrics.json",null);
 const cohorts=["ufc-champion-profiles","ufc-ranked-profiles","ufc-contender-profiles",
  "ufc-prospect-profiles","ufc-roster-profiles"].map(x=>read("data/"+x+".json",{}));
 const snapshot=buildSnapshot(coverage,postfight,cohorts);
 const qualifying=snapshot.boards.some(b=>b.eligible>=3);
 if(!qualifying)throw Error("No metrics with three verified recent UFC bouts; do not publish an empty ranking");
 const file=path.join(root,"data/ufc-fighter-v3.json");
 const next=JSON.stringify(snapshot,null,2)+"\n";
 if(fs.existsSync(file)&&fs.readFileSync(file,"utf8")===next){console.log("V3 unchanged");return}
 fs.writeFileSync(file,next);
 console.log("UFC V3 fighters:",snapshot.population,"categories:",
  snapshot.boards.map(b=>b.id+":"+b.eligible).join(","));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
