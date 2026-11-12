#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OWNERS={"A-F":"a-f","G-L":"g-l","M-R":"m-r","S-Z":"s-z","PRIORITY":"priority"};
const COHORTS=["champion","ranked","contender","prospect","roster"];
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const read=(name,fallback={})=>{const p=path.join(root,name);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):fallback};
export function recentHistoryStatus(f){
 const last=Array.isArray(f?.latest)?f.latest:[];
 const u=f?.ufcRecord;
 const known=!!u?.complete&&[u.wins,u.losses,u.draws,u.noContests??0].every(n=>Number.isInteger(n)&&n>=0);
 const career=known?u.wins+u.losses+u.draws+(u.noContests??0):null;
 const expected=career===null?null:Math.min(5,career);
 const issues=[];
 if(last.length>5)issues.push("too_many_fights");
 if(new Set(last.map(x=>x.date+":"+norm(x.opponent))).size!==last.length)issues.push("duplicate_bouts");
 if(expected===null)issues.push("ufc_only_career_count_not_verified");
 else if(last.length!==expected)issues.push("missing_recent_fights");
 return {careerUfcBouts:career,expectedRecentBouts:expected,recordedRecentBouts:last.length,issues};
}
export function audit({cohorts=[],queue={},workers={}}={}){
 const profiles=new Map(),duplicates=[],missing=[],uncertain=[];
 for(const cohort of cohorts)for(const [slug,f] of Object.entries(cohort.fighters||{})){
  const k=norm(f.name);
  if(profiles.has(k)){duplicates.push(f.name);continue}
  const h=recentHistoryStatus(f);profiles.set(k,{name:f.name,slug,history:h});
  if(h.issues.includes("missing_recent_fights"))missing.push({name:f.name,slug,...h});
  if(h.issues.includes("ufc_only_career_count_not_verified"))uncertain.push({name:f.name,slug});
 }
 const byWorker={};
 for(const [owner,suffix] of Object.entries(OWNERS)){
  const w=workers[owner]||{},entries=Object.values(w.fighters||{}),states={};
  for(const f of entries){const key=f.status||"unknown";states[key]=(states[key]||0)+1;}
  byWorker[owner]={historicalQueueLength:queue.historicalCounts?.[owner]??null,
   researchNotes:entries.length,states,lastUpdated:w.updatedOn??null};
 }
 return {schema:1,generatedAt:new Date().toISOString(),
  note:"Repo-only audit. NOT production QA or independent source truth.",
  counts:{reviewedProfiles:profiles.size,candidateBacklog:queue.candidateCount??null,
   priorityEntrants:queue.newCardEntrants?.length??null,
   postFightRefresh:queue.postFightRefreshCandidates?.length??null,
   previewQueueSize:queue.candidates?.length??null,
   fullHistoricalQueue:queue.historicalCounts?Object.values(queue.historicalCounts).reduce((a,b)=>a+b,0):null,
   recentFiveFullyAuditable:profiles.size-missing.length-uncertain.length,
   recentFiveMissing:missing.length,ufcCareerCountUnverified:uncertain.length,
   duplicateProfiles:duplicates.length},
  byWorker,historyGaps:missing,missingUfcRecord:uncertain,duplicates,
  liveVerification:"not_checked_by_this_script"};
}
export function main(){
 const queue=read("data/ufc-profile-research-queue.json");
 const cohorts=COHORTS.map(x=>read("data/ufc-"+x+"-profiles.json",null)).filter(Boolean);
 const workers=Object.fromEntries(Object.entries(OWNERS).map(([o,s])=>
  [o,read("data/ufc-research-workers/"+s+".json")]));
 return audit({cohorts,queue,workers});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=main(),c=result.counts,output=path.join(root,"qa/ufc-research-pipeline-report.json");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
 const summary=["## UFC fighter research pipeline","","| Metric | Count |","|---|---:|",
  ["Reviewed repository profiles",c.reviewedProfiles],
  ["Unverified backlog",c.candidateBacklog],
  ["Full historical worker pool",c.fullHistoricalQueue],
  ["Priority upcoming-card entrants",c.priorityEntrants],
  ["Reviewed with auditable last five",c.recentFiveFullyAuditable],
  ["Profiles missing UFC-only career count",c.ufcCareerCountUnverified],
  ["Known incomplete last-five histories",c.recentFiveMissing]
 ].map(x=>Array.isArray(x)?"| "+x[0]+" | "+(x[1]??"unknown")+" |":x).join("\n")+
 "\n\nLive Render deployment and browser QA must be checked separately.\n";
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 console.log(summary);
 if(c.recentFiveMissing||c.duplicateProfiles)process.exitCode=1;
}