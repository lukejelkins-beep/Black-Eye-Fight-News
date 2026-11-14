#!/usr/bin/env node
/**
 * Derived UFC-only post-fight totals from the SAVED, budget-controlled research
 * archive. Does not call APIs, create athlete biographies, or claim career totals.
 * Idempotent: one confirmed bout ID is counted once per fighter.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isOfficialUfcEvent} from "./ufc-official-event-scope.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const progressPath="data/ufcalendar-rich-progress.json";
const archivePath="data/ufc-research-archive.json";
const outputPath="data/ufc-postfight-metrics.json";
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const safe=x=>String(x||"").slice(0,130);
const num=x=>Number.isInteger(x)&&x>=0?x:null;
const METRICS=["totalLanded","totalAttempted","sigLanded","sigAttempted",
 "controlSec","knockdowns","takedowns","takedownAttempts","subAttempts","reversals"];
const paired={totalLanded:"totalStrikeDifferential",
 sigLanded:"sigStrikeDifferential",controlSec:"controlDifferentialSec"};
const sortDate=(a,b)=>b.date.localeCompare(a.date)||String(a.boutId).localeCompare(String(b.boutId));
function key(day,a,b){
 const names=[norm(a),norm(b)].sort();
 return day+":"+names.join(":");
}
function adjacentDate(day,offset){
 const stamp=Date.parse(String(day)+"T00:00:00Z");
 return Number.isFinite(stamp)?new Date(stamp+offset*86400000).toISOString().slice(0,10):null;
}
function archivedBoutFor(archiveFights,bout){
 const exact=archiveFights.get(key(bout.eventDate,bout.a.name,bout.b.name));
 if(exact)return exact;
 // A venue-local card date and the UTC provider date can disagree by a day.
 // Accept only ONE same-opponent candidate on an adjacent date, and reject
 // conflicting event titles where both datasets supply them.
 const matches=[-1,1].map(offset=>{
  const date=adjacentDate(bout.eventDate,offset);
  return date?archiveFights.get(key(date,bout.a.name,bout.b.name)):null;
 }).filter(row=>row&&(!row.event||!bout.event||
   norm(row.event)===norm(bout.event)));
 return matches.length===1?matches[0]:null;
}
function elapsed(result){
 if(!result||!Number.isInteger(result.round)||result.round<1||result.round>5)return null;
 const m=/^(\d{1,2}):([0-5]\d)$/.exec(String(result.time||""));
 if(!m)return null;
 const min=Number(m[1]),sec=Number(m[2]);
 if(min>5||(min===5&&sec!==0))return null;
 return (result.round-1)*300+min*60+sec;
}
function fullMetric(rounds,corner,field,roundCount){
 if(rounds.length!==roundCount)return null;
 let sum=0;
 for(let i=1;i<=roundCount;i++){
  const r=rounds.find(x=>x.round===i);
  const n=num(r?.[corner]?.[field]);
  if(n===null)return null;
  sum+=n;
 }
 return sum;
}
function rollup(parts,field){
 let sum=0,covered=0;
 for(const p of parts){
  const raw=p.metrics[field];
  const n=field.endsWith("Differential")||field.endsWith("DifferentialSec")?
    (Number.isInteger(raw)?raw:null):num(raw);
  if(n!==null){sum+=n;covered++;}
 }
 return {value:covered?sum:null,coveredBouts:covered};
}
/**
 * A disagreement in head/body/distance/clinch/ground subdivisions must not
 * erase unrelated UFC core stats. However, the archived conflict ledger is
 * capped at 40 entries, so checking its named fields alone is NOT sufficient.
 * Rescan every saved provider round for ALL core metrics before allowing any
 * secondary-only-conflict fight through. Missing provenance fails closed.
 */
export function classifyArchivedMetricConflicts(observed){
 const conflicts=Array.isArray(observed?.conflicts)?observed.conflicts:[];
 if(!conflicts.length)return {blocked:false,secondaryOnly:false,reason:null};
 if(conflicts.some(c=>METRICS.includes(String(c?.metric||""))))
  return {blocked:true,secondaryOnly:false,reason:"cross_source_core_metric_conflict"};
 const origins=Object.values(observed?.sources||{}).filter(src=>
  Array.isArray(src?.rounds)&&src.rounds.length);
 if(origins.length<2)return {blocked:true,secondaryOnly:false,
  reason:"cross_source_conflict_provenance_missing"};
 const values=new Map();
 for(const source of origins){
  for(const r of source.rounds){
   if(!Number.isInteger(r?.round))continue;
   for(const corner of ["a","b"]){
    for(const metric of METRICS){
     const value=num(r?.[corner]?.[metric]);
     if(value===null)continue;
     const k=r.round+"|"+corner+"|"+metric;
     if(values.has(k)&&values.get(k)!==value)
      return {blocked:true,secondaryOnly:false,
       reason:"cross_source_core_metric_conflict"};
     values.set(k,value);
    }
   }
  }
 }
 if(!values.size)return {blocked:true,secondaryOnly:false,
  reason:"cross_source_conflict_provenance_missing"};
 return {blocked:false,secondaryOnly:true,reason:null};
}
export function buildPostfightMetrics(progress,archive,{asOf="2026-11-12"}={}){
 const complete=Object.values(progress?.bouts||{})
  .filter(b=>b?.org==="ufc"&&isOfficialUfcEvent(b.event)&&
   ["completed","draw","no_contest"].includes(b.status)&&
   /^\d{4}-\d\d-\d\d$/.test(b.eventDate||"")&&b.eventDate<=asOf&&
   b.a?.name&&b.b?.name);
 const archiveFights=new Map();
 for(const f of Object.values(archive?.fights||{})){
  if(String(f?.promotion||"").toUpperCase()!=="UFC"||
     !/^\d{4}-\d\d-\d\d$/.test(f.date||"")||!f.fighterA||!f.fighterB)continue;
  const k=key(f.date,f.fighterA,f.fighterB);
  if(!archiveFights.has(k))archiveFights.set(k,f);
 }
 const fighters=new Map(),matchedBouts=new Set(),pending=[],
  recoveredSecondaryOnlyDisputes=new Set();
 function entry(name,slug){
  // Names are NOT unique identities: two different athletes can share the
  // same display name. Prefer the immutable source athlete slug and never
  // collapse two fighter histories merely because their names match.
  const stableSlug=String(slug||"").trim();
  const k=stableSlug?"slug:"+stableSlug:"unnamed:"+norm(name);
  if(!fighters.has(k))fighters.set(k,{name:safe(name),slug:safe(slug),
   bouts:[],_ids:new Set()});
  return fighters.get(k);
 }
 for(const b of complete){
  const id=String(b.id||"").trim();
  if(!id||matchedBouts.has(id))continue;
  matchedBouts.add(id);
  const sides=["a","b"];
  const a=entry(b.a.name,b.a.slug),c=entry(b.b.name,b.b.slug);
  const observed=archivedBoutFor(archiveFights,b);
  if(!observed){pending.push({boutId:id,date:b.eventDate,reason:"round_data_not_available"});continue;}
  const conflictAudit=classifyArchivedMetricConflicts(observed);
  if(conflictAudit.blocked){
   pending.push({boutId:id,date:b.eventDate,reason:conflictAudit.reason});continue;
  }
  if(conflictAudit.secondaryOnly)recoveredSecondaryOnlyDisputes.add(id);
  const minutes=elapsed(b.result);
  const roundCount=b.result?.round;
  if(minutes===null||!Number.isInteger(roundCount)||roundCount<1||roundCount>5){
   pending.push({boutId:id,date:b.eventDate,reason:"finish_clock_unverified"});continue;
  }
  const rounds=Array.isArray(observed.rounds)?observed.rounds:[];
  if(new Set(rounds.map(x=>x?.round)).size!==roundCount||
     !Array.from({length:roundCount},(_,i)=>i+1).every(n=>rounds.some(x=>x.round===n))){
   pending.push({boutId:id,date:b.eventDate,reason:"round_coverage_incomplete"});continue;
  }
  const alignment=norm(observed.fighterA)===norm(b.a.name)&&
   norm(observed.fighterB)===norm(b.b.name)?["a","b"]:
   norm(observed.fighterA)===norm(b.b.name)&&
   norm(observed.fighterB)===norm(b.a.name)?["b","a"]:null;
  if(!alignment){pending.push({boutId:id,date:b.eventDate,reason:"identity_mismatch"});continue;}
  const mapped=[];
  for(let i=0;i<2;i++){
   const corner=alignment[i],other=alignment[1-i],metrics={};
   for(const field of METRICS){
    metrics[field]=fullMetric(rounds,corner,field,roundCount);
   }
   for(const [field,diff] of Object.entries(paired)){
    const own=metrics[field],opp=fullMetric(rounds,other,field,roundCount);
    // Signed differential cannot use missing opponent stats as zero.
    metrics[diff]=own===null||opp===null?null:own-opp;
   }
   const otherSig=fullMetric(rounds,other,"sigLanded",roundCount);
   metrics.sigAbsorbed=otherSig;
   metrics.totalAbsorbed=fullMetric(rounds,other,"totalLanded",roundCount);
   const won=String(b.result?.winnerId||"")===String(b[sides[i]].id||"");
   const otherWon=String(b.result?.winnerId||"")===String(b[sides[1-i]].id||"");
   mapped.push({boutId:id,date:b.eventDate,event:safe(b.event),
    opponent:safe(b[sides[1-i]].name),cageSec:minutes,
    outcome:won?"W":otherWon?"L":b.status==="no_contest"?"NC":b.status==="draw"?"D":null,
    finishMethod:safe(b.result?.method),metrics,
    sourceDisputeStatus:conflictAudit.secondaryOnly?
     "secondary_breakdowns_disputed_core_uncontested":"no_recorded_metric_conflicts"});
  }
  [a,c].forEach((fighter,i)=>{
   if(fighter._ids.has(id))return;
   fighter._ids.add(id);fighter.bouts.push(mapped[i]);
  });
 }
 const output={schema:1,scope:"ufc-only",
  source:"Saved UFCalendar-derived UFC research observations with completed bout IDs",
  note:"Tracked UFC bouts ONLY, not certified career totals. Per-metric missing values are null. Core source conflicts and unverified source lineage remain quarantined. Secondary-only conflicts are allowed only after all retained provider rounds have matching core values.",
  recoveredSecondaryOnlyConflictedBouts:recoveredSecondaryOnlyDisputes.size,
  processedCompletedBouts:matchedBouts.size,
  metricBouts:[...fighters.values()].reduce((sum,f)=>sum+f.bouts.length,0)/2,
  pending:pending.slice(-200).sort((a,b)=>a.date.localeCompare(b.date)||a.boutId.localeCompare(b.boutId)),
  fighters:{}};
 for(const f of [...fighters.values()].filter(x=>x.bouts.length)
  .sort((a,b)=>norm(a.name).localeCompare(norm(b.name)))){
  f.bouts.sort(sortDate);
  const totals={};
  for(const field of [...METRICS,...Object.values(paired),"sigAbsorbed","totalAbsorbed"])
   totals[field]=rollup(f.bouts,field);
  const expected=f.bouts.length;
  output.fighters[f.slug||norm(f.name)]={
   name:f.name,slug:f.slug,scope:"ufc-only",
   trackedBouts:expected,lastFightDate:f.bouts[0].date,
   totals,
   // Backward-compatible V3 window, retained unchanged.
   recentBouts:f.bouts.slice(0,5),
   // Full measured UFC sample for offline V4 processing. This is NOT proof
   // of a complete career: the verified fight timeline must supply missing
   // and unmeasured bouts before computing Last 5/Last 10/Career windows.
   careerBouts:f.bouts
  };
 }
 return output;
}
function read(relative,fallback){
 try{return JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"))}
 catch(e){if(e.code==="ENOENT")return fallback;throw e}
}
export function main(){
 const output=buildPostfightMetrics(read(progressPath,{bouts:{}}),read(archivePath,{fights:{}}),
  {asOf:new Date().toISOString().slice(0,10)});
 const dest=path.join(root,outputPath),next=JSON.stringify(output,null,2)+"\n";
 if(fs.existsSync(dest)&&fs.readFileSync(dest,"utf8")===next){
  console.log("Post-fight statistics unchanged; no commit");return;
 }
 fs.writeFileSync(dest,next);
 console.log("Post-fight sample:",Object.keys(output.fighters).length,
  "fighters,",output.metricBouts,"unique completed bouts with rounds,",
  output.pending.length,"pending validation;",
  output.recoveredSecondaryOnlyConflictedBouts,"secondary-dispute fights passed all-source core-field comparison");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
