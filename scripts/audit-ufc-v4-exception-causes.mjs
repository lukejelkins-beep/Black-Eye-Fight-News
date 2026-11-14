#!/usr/bin/env node
/**
 * Offline cause-by-cause forensic audit for the V4 missing-round queue.
 * Reads previously saved UFC bout and archive records; NEVER makes provider
 * calls, modifies collection state, or silently repairs uncertain identities.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isOfficialUfcEvent} from "./ufc-official-event-scope.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const dateOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||""));
const key=(day,a,b)=>day+":"+[norm(a),norm(b)].sort().join(":");
function neighbour(day,amount){
 const t=Date.parse(String(day)+"T00:00:00Z");
 return Number.isFinite(t)?new Date(t+amount*86400000).toISOString().slice(0,10):null;
}
const clockOk=b=>{
 const r=b?.result;
 if(!Number.isInteger(r?.round)||r.round<1||r.round>5)return false;
 const x=/^(\d{1,2}):([0-5]\d)$/.exec(String(r.time||""));
 if(!x)return false;
 const m=Number(x[1]),s=Number(x[2]);
 return m<5||(m===5&&s===0);
};
function archiveIndex(archive){
 const index=new Map();
 for(const f of Object.values(archive?.fights||{})){
  if(String(f?.promotion||"").toUpperCase()!=="UFC"||
    !dateOk(f?.date)||!f?.fighterA||!f?.fighterB)continue;
  const k=key(f.date,f.fighterA,f.fighterB);
  if(!index.has(k))index.set(k,[]);
  index.get(k).push(f);
 }
 return index;
}
function matching(index,b){
 const k=key(b.eventDate,b.a.name,b.b.name),exact=index.get(k)||[];
 // Mirror the postfight builder: exact day is preferred over adjacent days,
 // which require compatible event names where both are known.
 if(exact.length)return exact;
 return [-1,1].flatMap(offset=>{
  const day=neighbour(b.eventDate,offset);
  return day?(index.get(key(day,b.a.name,b.b.name))||[])
   .filter(row=>!row.event||!b.event||norm(row.event)===norm(b.event)):[];
 });
}
function causeFor(b,index){
 if(!b)return "native_fight_not_indexed";
 if(b.org!=="ufc")return "provider_promotion_scope_mismatch";
 if(!isOfficialUfcEvent(b.event))return "official_ufc_event_identity_review";
 if(!["completed","draw","no_contest"].includes(b.status))
  return "result_not_final";
 if(!dateOk(b.eventDate)||!b.a?.name||!b.b?.name)
  return "identity_or_date_missing";
 const matches=matching(index,b);
 if(!matches.length)return "matching_round_archive_absent";
 if(matches.length>1)return "multiple_archive_candidates";
 const observed=matches[0];
 if(Array.isArray(observed.conflicts)&&observed.conflicts.length)
  return "archived_metric_source_conflict";
 if(!clockOk(b))return "finish_clock_unverified";
 const expected=b.result.round,rounds=Array.isArray(observed.rounds)?observed.rounds:[];
 if(rounds.length!==expected||
    new Set(rounds.map(x=>x?.round)).size!==expected||
    !Array.from({length:expected},(_,i)=>i+1).every(n=>rounds.some(x=>x.round===n)))
  return "missing_or_incomplete_round_rows";
 const a=norm(observed.fighterA),c=norm(observed.fighterB);
 if(!((a===norm(b.a.name)&&c===norm(b.b.name))||
       (a===norm(b.b.name)&&c===norm(b.a.name))))
  return "archive_fighter_identity_mismatch";
 return "unexpected_postfight_join_gap";
}
export function diagnoseMissingUfcBouts(foundation,progress,archive){
 if(foundation?.scope!=="ufc-only-v4-stat-foundation"||
   !Array.isArray(foundation?.missingNativeBoutQueue))
  throw Error("V4 foundation and deduplicated missing fight queue required");
 const index=archiveIndex(archive),detail=[];
 const counts={},priority={},sourceActions={},eventGroups={},byPriorityAndCause={};
 const conflictEvents={},conflictSamples=[],unindexedEventGroups={};
 for(const item of foundation.missingNativeBoutQueue){
  const bout=progress?.bouts?.[item.boutId]||null;
  const reason=causeFor(bout,index);
  const check=progress?.ufcCareerBoutChecks?.[item.boutId]||{};
  const retry=progress?.roundRetry?.[item.boutId]||{};
  const action=item.action||"manual_review";
  if(reason==="official_ufc_event_identity_review"){
   const name=String(bout?.event||"unknown");eventGroups[name]=(eventGroups[name]||0)+1;
  }
  if(reason==="archived_metric_source_conflict"){
   const title=String(bout?.event||"unknown");
   conflictEvents[title]=(conflictEvents[title]||0)+1;
   const archived=matching(index,bout)[0];
   if(conflictSamples.length<5)conflictSamples.push({boutId:item.boutId,
    event:title,example:JSON.stringify(archived?.conflicts||[]).slice(0,500)});
  }
  if(reason==="native_fight_not_indexed"){
   const date=item.references?.[0]?.date||"unknown";
   const year=String(date).slice(0,4);
   unindexedEventGroups[year]=(unindexedEventGroups[year]||0)+1;
  }
  const bucket=item.band||"unknown";
  if(!byPriorityAndCause[bucket])byPriorityAndCause[bucket]={};
  byPriorityAndCause[bucket][reason]=(byPriorityAndCause[bucket][reason]||0)+1;
  counts[reason]=(counts[reason]||0)+1;
  priority[item.band]=(priority[item.band]||0)+1;
  sourceActions[action]=(sourceActions[action]||0)+1;
  detail.push({
   boutId:item.boutId,band:item.band,priority:item.priority,
   cause:reason,action,sourceReviewReason:typeof check.reason==="string"?
    check.reason.slice(0,160):null,
   event:bout?.event||null,date:bout?.eventDate||null,
   expectedRounds:bout?.result?.round??null,
   roundsReportedComplete:progress?.roundDone?.[item.boutId]??null,
   roundRetryAfter:retry.retryAfter||null,
   roundRetryAttempts:retry.attempts??null,
   references:item.references
  });
 }
 return {schema:1,scope:"ufc-v4-exception-diagnostics",
  status:"read_only_offline_qa_not_production",asOf:foundation.asOf,
  summary:{distinctExceptions:detail.length,byCause:counts,
   byPriorityBand:priority,bySavedWorkflowAction:sourceActions,
   notIndexedInProviderCache:foundation.missingNativeBoutQueue.filter(x=>
    x.indexedInSavedProviderCache===false).length,
   byPriorityAndCause,conflictEvents:Object.entries(conflictEvents)
    .sort((a,b)=>b[1]-a[1]).map(([title,count])=>({title,count})),
   unindexedFightYears:unindexedEventGroups,
   conflictExamples:conflictSamples,
   eventTitleGroups:Object.entries(eventGroups)
    .sort((a,b)=>b[1]-a[1]).map(([title,count])=>({title,count}))},
  cases:detail,note:"Cause classifications are cached-evidence diagnostics only, not authority to retry an API request or impute missing statistics."};
}
function read(filename){return JSON.parse(fs.readFileSync(path.join(root,filename),"utf8"))}
export function main(){
 const out=diagnoseMissingUfcBouts(
  read("qa/ufc-v4-stat-foundation.json"),
  read("data/ufcalendar-rich-progress.json"),
  read("data/ufc-research-archive.json"));
 const file=path.join(root,"qa/ufc-v4-exception-causes.json");
 fs.writeFileSync(file,JSON.stringify(out,null,2)+"\n");
 console.log("BEFN_V4_MISSING_CAUSES "+JSON.stringify(out.summary));
 console.log("BEFN_V4_UNEXPECTED_JOIN "+JSON.stringify(
  out.cases.filter(x=>x.cause==="unexpected_postfight_join_gap").map(x=>{
   const b=read("data/ufcalendar-rich-progress.json").bouts?.[x.boutId]||{};
   return {boutId:x.boutId,event:x.event,date:x.date,
    payloadNativeId:b.id||null,aSlug:b.a?.slug||null,bSlug:b.b?.slug||null,
    references:x.references};
  })));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
