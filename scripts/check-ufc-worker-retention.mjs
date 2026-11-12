#!/usr/bin/env node
/* Prevent research checkpoints from being accidentally replaced by empty files.
 * Append-only fighter worklog identity: workers can update an athlete's status
 * and supporting evidence but must never silently remove prior research.
 * This is a GitHub history consistency check, not source fact verification.
 */
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");
const WORKERS=["a-f","g-l","m-r","s-z","priority"];
export function lostFighters(previous,current){
 const before=previous?.fighters&&typeof previous.fighters==="object"?Object.keys(previous.fighters):[];
 const after=new Set(Object.keys(current?.fighters||{}));
 return before.filter(slug=>!after.has(slug));
}
function previousFile(file){
 try {return JSON.parse(execFileSync("git",["show","HEAD^:"+file],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","ignore"]}));}
 catch{return null;}
}
export function auditRetention(){
 const issues=[];
 for(const worker of WORKERS){
  const file="data/ufc-research-workers/"+worker+".json";
  const full=path.join(root,file);
  if(!fs.existsSync(full))continue;
  const current=JSON.parse(fs.readFileSync(full,"utf8"));
  const previous=previousFile(file);
  const removed=lostFighters(previous,current);
  if(removed.length)issues.push({file,removed});
 }
 return issues;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const issues=auditRetention();
 if(issues.length){
  console.error("UFC RESEARCH WORKLOG LOSS: restore prior fighter notes before approving this commit.",JSON.stringify(issues));
  process.exitCode=1;
 }else console.log("PASS: no worker research entries were removed relative to the previous Git commit.");
}