#!/usr/bin/env node
/**
 * BEFN UFC human/AI research queue.
 * No network requests. Reuses the existing budgeted UFCalendar archive.
 * A listed fighter is NOT automatically a current UFC roster member.
 * Only individually source-reviewed fighter profiles can be published.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const INPUT="data/ufcalendar-rich-progress.json";
const OUTPUT="data/ufc-profile-research-queue.json";
const REVIEW_FILES=[
 "data/ufc-champion-profiles.json",
 "data/ufc-ranked-profiles.json",
 "data/ufc-contender-profiles.json",
 "data/ufc-prospect-profiles.json",
 "data/ufc-roster-profiles.json"
];
const normalize=s=>String(s||"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const slug=s=>String(s||"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function readJson(relative,fallback){
 try{return JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"))}
 catch(error){if(error.code==="ENOENT")return fallback;throw error}
}
function completedFighters(files){
 const reviewed=new Set(),reports=[];
 for(const data of files){
  if(!data||!data.fighters)continue;
  for(const f of Object.values(data.fighters)){
   if(f?.name&&f.review?.credentialsChecked===true&&
      f.review.checkedAt&&Array.isArray(f.latest)&&f.latest.length>0){
    reviewed.add(normalize(f.name));
    reports.push({name:f.name,reviewedOn:f.review.checkedAt});
   }
  }
 }
 return {reviewed,reports};
}
export function buildQueue(progress,profileFiles,{max=50,asOf="2026-11-12"}={}){
 const {reviewed,reports}=completedFighters(profileFiles);
 const candidates=new Map(),bouts=Object.values(progress?.bouts||{});
 // The source archive may include PFL or old UFC participants. UFC appearance
 // alone is NOT evidence that a fighter remains contracted or active today.
 for(const b of bouts){
  if(String(b?.org||"").toLowerCase()!=="ufc")continue;
  const date=String(b.eventDate||"").slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  // Avoid stale historical candidates and far-future announcements.
  if(date<"2025-05-01"||date>"2027-06-01")continue;
  for(const side of ["a","b"]){
   const athlete=b[side],name=String(athlete?.name||"").trim();
   if(!name||name.length>110)continue;
   const key=normalize(name);if(key.length<3||reviewed.has(key))continue;
   const identitySlug=slug(athlete?.slug||name);
   const prev=candidates.get(key);
   if(!prev||date>prev.lastSeenDate||
      (date===prev.lastSeenDate&&b.status==="scheduled"&&!prev.upcoming)){
    candidates.set(key,{name,slug:identitySlug,
     lastSeenDate:date,
     lastSeenEvent:String(b.event||"").slice(0,140),
     appearanceEvidence:"UFCalendar UFC bout archive (not a roster verification)",
     upcoming:["announced","scheduled","live"].includes(String(b.status||"")),
     rosterStatus:"unverified",rankingStatus:"unverified"});
   }
  }
 }
 const ordered=[...candidates.values()].sort((a,b)=>
  Number(b.upcoming)-Number(a.upcoming)||
  b.lastSeenDate.localeCompare(a.lastSeenDate)||
  a.name.localeCompare(b.name));
 return {
  schema:1,scope:"ufc-only",source:INPUT,
  note:"This queue is a RESEARCH CANDIDATE LIST, not a verified active roster or an official ranking. An AI or human must verify each fighter against dated primary sources and validate their card before publishing. Never infer credentials from absence of API data.",
  knownCompletedProfiles:reports.length,
  candidateCount:ordered.length,
  fullActiveRosterVerified:false,
  candidates:ordered.slice(0,max).map((item,i)=>({
   priority:i+1,...item,
   needs:["current UFC roster status","dated official rank / unranked confirmation",
    "UFC athlete biography","UFC-only results and stats",
    "non-API combat-sport credentials with primary evidence",
    "portrait rights and profile-card QA"]
  }))
 };
}
function main(){
 const p=readJson(INPUT,{bouts:{}});
 const data=buildQueue(p,REVIEW_FILES.map(f=>readJson(f,null)));
 const output=path.join(root,OUTPUT);
 const next=JSON.stringify(data,null,2)+"\n";
 const previous=fs.existsSync(output)?fs.readFileSync(output,"utf8"):"";
 if(previous===next){console.log("BEFN UFC research queue unchanged; no commit needed");return}
 fs.writeFileSync(output,next);
 console.log("BEFN UFC queue:",data.knownCompletedProfiles,"sourced profiles,",
  data.candidateCount,"candidates,",data.candidates.length,"awaiting research");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
