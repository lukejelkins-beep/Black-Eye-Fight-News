#!/usr/bin/env node
/** Cached provider-source disagreements in the approved UFC V4 stat cohort.
 * Does not declare any disputed value true or change the canonical archive.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const core=new Set(["sigLanded","sigAttempted","totalLanded","totalAttempted",
 "takedowns","takedownAttempts","knockdowns","controlSec","subAttempts","reversals"]);
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const key=(d,a,b)=>d+":"+[norm(a),norm(b)].sort().join(":");
function findRows(archive,b){
 const fights=Object.values(archive?.fights||{});
 const rows=fights.filter(f=>String(f?.promotion||"").toUpperCase()==="UFC"&&
  [norm(f.fighterA),norm(f.fighterB)].sort().join(":")===
  [norm(b.a?.name),norm(b.b?.name)].sort().join(":")&&
  Math.abs(Date.parse(String(f.date)+"T00:00:00Z")-
           Date.parse(String(b.eventDate)+"T00:00:00Z"))<=86400000);
 const exact=rows.filter(x=>x.date===b.eventDate);
 return exact.length?exact:rows;
}
export function auditConflicts(diagnostics,progress,archive){
 if(diagnostics?.scope!=="ufc-v4-exception-diagnostics"||
  !Array.isArray(diagnostics?.cases))
  throw Error("Offline V4 exception diagnostics required");
 const cases=[],perMetric={},events={},sources={};
 let onlySecondary=0,coreAffected=0,missingEvidence=0;
 for(const c of diagnostics.cases.filter(x=>x.cause==="archived_metric_source_conflict")){
  const b=progress?.bouts?.[c.boutId];
  const found=b?findRows(archive,b):[];
  if(found.length!==1){missingEvidence++;continue;}
  const source=found[0];
  const conflicts=Array.isArray(source.conflicts)?source.conflicts:[];
  const perFightFields=[...new Set(conflicts.map(x=>String(x?.metric||""))
   .filter(Boolean))].sort();
  const contestedCore=perFightFields.filter(x=>core.has(x));
  if(contestedCore.length)coreAffected++;
  else onlySecondary++;
  const title=String(b.event||"unknown");
  if(!events[title])events[title]={fights:0,coreAffected:0,secondaryOnly:0};
  events[title].fights++;
  events[title][contestedCore.length?"coreAffected":"secondaryOnly"]++;
  for(const item of conflicts){
   const field=String(item.metric||"unknown"),from=String(item.source||"unknown");
   perMetric[field]=(perMetric[field]||0)+1;
   sources[from]=(sources[from]||0)+1;
  }
  cases.push({boutId:c.boutId,event:title,band:c.band,
   hasCoreFieldDispute:contestedCore.length>0,
   disputedCoreFields:contestedCore,disputedFieldNames:perFightFields,
   conflictingRoundObservations:conflicts.length,
   recommendation:contestedCore.length?
    "compare_core_round_fields_against_an_independent_official_record":
    "secondary_disagreement_review_core_fields_uncontested"});
 }
 return {schema:1,scope:"ufc-v4-source-conflict-triage",
  status:"offline_unverified_do_not_apply_stat_values",
  summary:{cases:cases.length,coreAffected,secondaryOnly:onlySecondary,
   sourceArchiveNotUniquelyMatched:missingEvidence,
   byEvent:events,conflictEntriesByMetric:perMetric,
   contestedAlternativeSourceEntries:sources},cases,
  note:"Secondary-only conflicts are candidates for separate per-metric processing after QA, NOT automatic verification. Chosen and alternative numbers remain quarantined where contested."};
}
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),"utf8"));
export function main(){
 const out=auditConflicts(read("qa/ufc-v4-exception-causes.json"),
  read("data/ufcalendar-rich-progress.json"),read("data/ufc-research-archive.json"));
 fs.writeFileSync(path.join(root,"qa/ufc-v4-source-conflict-triage.json"),
  JSON.stringify(out,null,2)+"\n");
 console.log("BEFN_V4_SOURCE_CONFLICT_TRIAGE "+JSON.stringify(out.summary));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
