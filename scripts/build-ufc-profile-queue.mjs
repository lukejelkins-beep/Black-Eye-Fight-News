#!/usr/bin/env node
/**
 * BEFN UFC fighter research workload. No API requests or autonomous claims.
 * Scheduled/published fight cards trigger work for absent profiles; post-fight
 * appearances trigger re-verification of existing profiles.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const INPUT="data/ufcalendar-rich-progress.json";
const CARDS="data/upcoming-cards.json";
const OUTPUT="data/ufc-profile-research-queue.json";
const REVIEW_FILES=["data/ufc-champion-profiles.json","data/ufc-ranked-profiles.json",
 "data/ufc-contender-profiles.json","data/ufc-prospect-profiles.json","data/ufc-roster-profiles.json"];
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const slug=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const date=x=>String(x||"").slice(0,10);
const validDate=x=>/^\d{4}-\d\d-\d\d$/.test(x);
const days=(a,b)=>Math.round((Date.parse(a+"T00:00:00Z")-Date.parse(b+"T00:00:00Z"))/86400000);
function read(relative,fallback){
 try{return JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"))}
 catch(e){if(e.code==="ENOENT")return fallback;throw e}
}
function reviewedIndex(files){
 const reviewed=new Map();
 for(const file of files){
  if(!file?.fighters)continue;
  for(const f of Object.values(file.fighters)){
   if(!f?.name||!f.review?.credentialsChecked||!validDate(f.review.checkedAt)||
      !Array.isArray(f.latest)||!f.latest.length)continue;
   reviewed.set(norm(f.name),{
    name:f.name,reviewedOn:f.review.checkedAt,
    mostRecentFight:date(f.latest[0].date),
    mostRecentOpponent:norm(f.latest[0].opponent)
   });
  }
 }
 return reviewed;
}
const requirement=["current UFC roster status","dated official ranking (if any)",
 "official UFC fighter biography","most recent UFC fight history and methods",
 "UFC-only statistics with sample denominators","primary-sourced non-API credentials",
 "licensed portrait and individual desktop/mobile card QA"];
export function buildQueue(progress,profileFiles,{
 max=120,asOf="2026-11-12",upcomingCards={events:[]}
}={}){
 if(!validDate(asOf))throw Error("asOf must be YYYY-MM-DD");
 const reviewed=reviewedIndex(profileFiles);
 const candidates=new Map(),needsRefresh=new Map(),cardCandidates=new Map();
 const sourceBouts=Object.values(progress?.bouts||{});
 function add(name,fields){
  const key=norm(name);if(key.length<3||reviewed.has(key))return;
  const current=candidates.get(key);
  if(!current||fields.lastSeenDate>current.lastSeenDate||
      (fields.lastSeenDate===current.lastSeenDate&&fields.upcoming&&!current.upcoming))
   candidates.set(key,{name:String(name).slice(0,110),slug:slug(fields.slug||name),
    lastSeenDate:fields.lastSeenDate,lastSeenEvent:String(fields.event||"").slice(0,140),
    appearanceEvidence:fields.evidence,upcoming:!!fields.upcoming,
    rosterStatus:"unverified",rankingStatus:"unverified"});
 }
 for(const b of sourceBouts){
  if(String(b?.org||"").toLowerCase()!=="ufc")continue;
  const when=date(b.eventDate);
  if(!validDate(when)||days(when,asOf)< -580||days(when,asOf)>180)continue;
  for(const side of ["a","b"]){
   const athlete=b[side],name=String(athlete?.name||"").trim();
   if(!name||name.length>110)continue;
   const k=norm(name);
   const prior=reviewed.get(k);
   if(prior){
    const finished=["completed","draw","no_contest"].includes(b.status);
    // Provider archive dates can be UTC while the individually verified UFC
    // fight history uses event-local dates. A one-day shift with the SAME
    // opponent is the same fight, not a new completed appearance.
    const sameFight=validDate(prior.mostRecentFight)&&
     Math.abs(days(when,prior.mostRecentFight))<=1&&
     prior.mostRecentOpponent===norm(b[side==="a"?"b":"a"]?.name);
    if(finished&&!sameFight&&when<=asOf&&validDate(prior.mostRecentFight)&&when>prior.mostRecentFight){
     const old=needsRefresh.get(k);
     if(!old||when>old.newFightDate)
      needsRefresh.set(k,{name:prior.name,newFightDate:when,
       opponent:String(b[side==="a"?"b":"a"]?.name||""),
       boutId:String(b.id||""),event:String(b.event||"").slice(0,140),
       reason:"New completed UFC bout after most recently reviewed fight",
       needs:["verify official result, finish clock and record",
        "refresh latest five UFC results and credentials as necessary",
        "reconcile new tracked statistics, rates, and rating index",
        "inspect desktop/mobile profile rendering"]});
    }
    continue;
   }
   add(name,{slug:athlete.slug,lastSeenDate:when,event:b.event,
    upcoming:["announced","scheduled","live"].includes(b.status),
    evidence:"UFCalendar UFC bout archive; not proof of current roster eligibility"});
  }
 }
 // Site event feed is checked independently of the UFCalendar archive so
 // newly booked fighters enter the AI review queue before their stats exist.
 for(const event of upcomingCards?.events||[]){
  if(!event||String(event.sport||"").toLowerCase()!=="mma"||
     !/\bufc\b/i.test(String(event.promotion||"")))continue;
  const when=date(event.date);
  if(!validDate(when)||days(when,asOf)< -7||days(when,asOf)>60)continue;
  for(const fight of event.bouts||[]){
   if(!Array.isArray(fight?.fighters))continue;
   for(const name of fight.fighters){
    const n=String(name||"").trim(),k=norm(n);
    if(k.length<3||reviewed.has(k))continue;
    const entry={name:n,slug:slug(n),cardDate:when,
     cardEvent:String(event.title||"").slice(0,140),
     cardSource:String(fight.source||event.source||"").slice(0,350),
     confirmation:String(event.status||"").toLowerCase().includes("reported")?
      "reported_not_officially_confirmed":"source_review_required",
     task:"Individually research and publish a sourced UFC profile before fight night; do not infer opponent confirmation"};
    const old=cardCandidates.get(k);
    if(!old||Math.abs(days(when,asOf))<Math.abs(days(old.cardDate,asOf)))
     cardCandidates.set(k,entry);
    add(n,{lastSeenDate:when,event:event.title,upcoming:true,
     evidence:"BEFN announced UFC card (pairing needs primary-source reconfirmation)"});
   }
  }
 }
 const entrants=[...cardCandidates.values()]
  .sort((a,b)=>Math.abs(days(a.cardDate,asOf))-Math.abs(days(b.cardDate,asOf))||
   a.name.localeCompare(b.name));
 const latest=[...candidates.values()]
  .sort((a,b)=>Number(b.upcoming)-Number(a.upcoming)||
   b.lastSeenDate.localeCompare(a.lastSeenDate)||a.name.localeCompare(b.name));
 const chosen=new Map();
 // Do not truncate anyone appearing on a near-term UFC card.
 for(const c of entrants){
  const base=candidates.get(norm(c.name));
  if(base)chosen.set(norm(c.name),{...base,onCard:true,
   cardDate:c.cardDate,cardSource:c.cardSource});
 }
 for(const c of latest){
  if(chosen.size>=Math.max(max,entrants.length))break;
  if(!chosen.has(norm(c.name)))chosen.set(norm(c.name),c);
 }
 return {schema:1,scope:"ufc-only",source:[INPUT,CARDS],
  note:"Candidate names from announced cards or past bouts are NOT verified active UFC roster members. Only publish after primary-source checking, accurate biography/credentials, and per-card visual QA. Post-fight refresh candidates require validation before career stats or records change.",
  knownCompletedProfiles:reviewed.size,candidateCount:candidates.size,
  fullActiveRosterVerified:false,
  newCardEntrants:entrants,
  postFightRefreshCandidates:[...needsRefresh.values()].sort((a,b)=>
   b.newFightDate.localeCompare(a.newFightDate)||a.name.localeCompare(b.name)),
  candidates:[...chosen.values()].map((c,i)=>({priority:i+1,...c,needs:requirement}))
 };
}
function main(){
 const queue=buildQueue(read(INPUT,{bouts:{}}),REVIEW_FILES.map(f=>read(f,null)),
  {asOf:new Date().toISOString().slice(0,10),
   upcomingCards:read(CARDS,{events:[]})});
 const target=path.join(root,OUTPUT),next=JSON.stringify(queue,null,2)+"\n";
 if(fs.existsSync(target)&&fs.readFileSync(target,"utf8")===next){
  console.log("UFC candidate, booking and post-fight queues unchanged");return;
 }
 fs.writeFileSync(target,next);
 console.log("Queue:",queue.candidates.length,"candidates,",
  queue.newCardEntrants.length,"new card entrants,",
  queue.postFightRefreshCandidates.length,"post-fight refresh requests");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
