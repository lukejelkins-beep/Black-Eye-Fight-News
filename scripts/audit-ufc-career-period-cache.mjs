#!/usr/bin/env node
/**
 * Read-only evaluation of complete, indexed UFC career fight coverage.
 * Production consumers are intentionally not wired to this draft preview.
 */
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {isOfficialUfcEvent} from "./ufc-official-event-scope.mjs";
import {computeUfcPeriod,periodOptions} from "./ufc-performance-periods.mjs";
import {buildPostfightMetrics} from "./build-ufc-postfight-metrics.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const settled=new Set(["completed","draw","no_contest"]);
const iso=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x);
const id=x=>String(x??"").trim();
function cutoff36(asOf){
 if(!iso(asOf))throw new Error("Valid asOf required");
 const y=+asOf.slice(0,4)-3,m=+asOf.slice(5,7),d=+asOf.slice(8,10);
 const last=new Date(Date.UTC(y,m,0)).getUTCDate();
 return [y,String(m).padStart(2,"0"),String(Math.min(d,last)).padStart(2,"0")].join("-");
}
const key=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");

function indexedBouts(progress,asOf){
 const indexed=new Map(),idsBySlug=new Map();
 for(const b of Object.values(progress?.bouts||{})){
   if(!b||b.org!=="ufc"||!isOfficialUfcEvent(b.event)||
     !settled.has(b.status)||!iso(b.eventDate)||b.eventDate>asOf||
     !b.a?.slug||!b.b?.slug||!b.id)continue;
   const winner=id(b.result?.winnerId||b.result?.winner_fighter_id);
   for(const [self,other] of [["a","b"],["b","a"]]){
     const person=b[self],opp=b[other],slug=person.slug;
     if(!slug||!opp?.name)continue;
     const ids=idsBySlug.get(slug)||new Set();
     if(person.id)ids.add(id(person.id));
     idsBySlug.set(slug,ids);
     let outcome=null;
     if(b.status==="no_contest")outcome="NC";
     else if(b.status==="draw")outcome="D";
     else if(winner&&id(person.id)===winner)outcome="W";
     else if(winner&&id(opp.id)===winner)outcome="L";
     if(!outcome)continue;
     const bout={boutId:id(b.id),date:b.eventDate,
       promotion:"UFC",outcome,opponent:opp.name,
       method:b.result?.method||null,event:b.event};
     const byId=indexed.get(slug)||new Map();
     if(!byId.has(bout.boutId))byId.set(bout.boutId,bout);
     indexed.set(slug,byId);
   }
 }
 return {indexed,idsBySlug};
}
function matchedMeasured(candidate,postfight){
 if(!candidate||typeof candidate!=="object")return [];
 const direct=postfight[candidate.slug];
 if(direct?.scope==="ufc-only")return direct.careerBouts||[];
 const name=key(candidate.name);
 const same=Object.values(postfight).filter(r=>r?.scope==="ufc-only"&&key(r.name)===name);
 return same.length===1?same[0].careerBouts||[]:[];
}

export function buildOfflineUfcCareerPeriods(progress,coverage,{asOf=coverage?.asOf,measuredFighters={}}={}){
 if(coverage?.schema!==1||coverage.scope!=="ufc"||!Array.isArray(coverage.fighters))
   throw new Error("Unsupported UFC roster coverage schema");
 const expectedCutoff=cutoff36(asOf);
 const rosterGateReady=coverage.activityCutoff===expectedCutoff;
 const {indexed,idsBySlug}=indexedBouts(progress,asOf);
 const fighters={},seen=new Set();
 let excludedPending=0,identityCollisions=0;
 for(const candidate of coverage.fighters){
   if(!candidate?.slug||!candidate?.name||seen.has(candidate.slug))continue;
   seen.add(candidate.slug);
   if(candidate.eligibilityStatus!=="latest_observed_mma_ufc"){
     excludedPending++;continue;
   }
   const raw=[...(indexed.get(candidate.slug)?.values()||[])];
   const ids=idsBySlug.get(candidate.slug);
   if(ids?.size>1){identityCollisions++;continue;}
   const measured=matchedMeasured(candidate,measuredFighters);
   const measures=new Map(measured.filter(b=>b&&b.boutId).map(b=>[id(b.boutId),b]));
   const full=raw.map(b=>{
     const m=measures.get(b.boutId);
     // Both ID and opponent/date must align before using cached statistics.
     const match=m&&m.date===b.date&&key(m.opponent)===key(b.opponent);
     return match?{...b,stats:{cageSec:m.cageSec,metrics:m.metrics}}:b;
   });
   const summaries=Object.fromEntries(["5","10","career"].map(period=>
     [period,computeUfcPeriod(full,period)]));
   const options=periodOptions(full);
   fighters[candidate.slug]={
     name:candidate.name,slug:candidate.slug,lastUfcFight:candidate.lastUfcFight,
     indexedUfcBouts:raw.length,
     measuredUfcBouts:full.filter(b=>b.stats?.metrics&&
       Object.values(b.stats.metrics).some(Number.isFinite)).length,
     unmatchedLastFive: (candidate.recent||[]).filter(b=>b?.boutId&&
       !raw.some(f=>f.boutId===id(b.boutId))).length,
     earliestIndexedUfcFight:raw.reduce((v,b)=>!v||b.date<v?b.date:v,null),
     latestIndexedUfcFight:raw.reduce((v,b)=>!v||b.date>v?b.date:v,null),
     options,periods:summaries,
   };
 }
 const all=Object.values(fighters);
 const summary={
   asOf,expectedCutoff,rosterActivityCutoff:coverage.activityCutoff,
   rosterGateReady,provisionalOnly:true,
   candidatesInSource:coverage.fighters.length,
   eligibleCandidateRowsPrepared:all.length,
   reviewOrUnresolvedCandidatesSkipped:excludedPending,
   numericFighterIdCollisionsSkipped:identityCollisions,
   withIndexedUfcHistory:all.filter(f=>f.indexedUfcBouts>0).length,
   atLeastFiveIndexedUfcFights:all.filter(f=>f.indexedUfcBouts>=5).length,
   atLeastTenIndexedUfcFights:all.filter(f=>f.indexedUfcBouts>=10).length,
   withMeasuredUfcBouts:all.filter(f=>f.measuredUfcBouts>0).length,
   withAllIndexedBoutsMeasured:all.filter(f=>f.indexedUfcBouts>0&&
     f.measuredUfcBouts===f.indexedUfcBouts).length,
   missingIndexedLastFiveIds:all.reduce((sum,f)=>sum+f.unmatchedLastFive,0),
   earliestIndexedFight:all.map(f=>f.earliestIndexedUfcFight)
     .filter(Boolean).sort()[0]||null,
 };
 return {schema:1,scope:"ufc-only-career-preview",summary,fighters};
}

export function main(){
 const asOf=process.argv[2]||new Date().toISOString().slice(0,10);
 const coverage=read("data/ufc-last-five-coverage.json");
 const progress=read("data/ufcalendar-rich-progress.json");
 const archive=read("data/ufc-research-archive.json");
 const postfight=buildPostfightMetrics(progress,archive,{asOf,includeCareerBouts:true});
 const preview=buildOfflineUfcCareerPeriods(progress,coverage,{
   asOf,measuredFighters:postfight.fighters
 });
 console.log("BEFN_UFC_FULL_CAREER_CACHE_AUDIT",JSON.stringify(preview.summary));
 if(!preview.summary.rosterGateReady)
   console.log("BLOCKED_PRODUCTION: source roster is not verified rolling 36-month roster");
 console.log("AUDIT_ONLY: no file written, no UFCALENDAR API calls, no production changes");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
