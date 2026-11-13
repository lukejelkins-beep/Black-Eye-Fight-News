import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {buildQueue} from "../scripts/build-ufc-profile-queue.mjs";

const bout=(name,date,org="ufc",status="completed")=>({
  org,status,eventDate:date,event:"Example UFC bout",
  a:{name,slug:name.toLowerCase().replaceAll(" ","-")},
  b:{name:"Opponent "+name,slug:"opponent-"+name.toLowerCase().replaceAll(" ","-")}
});
test("only UFC bouts enter queue, and reviewed fighters are excluded",()=>{
 const progress={bouts:{a:bout("Alpha Athlete","2026-10-01"),
  b:bout("PFL Fighter","2026-10-05","pfl"),
  c:bout("Old Athlete","2024-10-05"),
  d:bout("Champion Ace","2026-10-04")}};
 const reviewed=[{fighters:{ace:{name:"Champion Ace",latest:[{opponent:"X"}],
  review:{checkedAt:"2026-11-12",credentialsChecked:true}}}}];
 const q=buildQueue(progress,reviewed);
 assert(q.candidates.some(x=>x.name==="Alpha Athlete"));
 assert(!q.candidates.some(x=>x.name==="PFL Fighter"));
 assert(!q.candidates.some(x=>x.name==="Old Athlete"));
 assert(!q.candidates.some(x=>x.name==="Champion Ace"));
 assert.equal(q.knownCompletedProfiles,1);
 assert.equal(q.fullActiveRosterVerified,false);
 assert(q.candidates.every(x=>x.rankingStatus==="unverified"));
});
test("prioritises upcoming card candidates and remains deterministic",()=>{
 const progress={bouts:{a:bout("Old Name","2026-05-01"),
  b:bout("Upcoming Name","2026-11-15","ufc","scheduled"),
  c:bout("Old Name","2026-11-01")}};
 const a=buildQueue(progress,[],{max:3});
 const b=buildQueue(progress,[],{max:3});
 assert.deepEqual(a,b);
 assert(a.candidates[0].upcoming,"Upcoming bouts must appear first");
 assert.equal(a.candidates[0].lastSeenDate,"2026-11-15");
 assert.equal(a.candidates.find(x=>x.name==="Old Name").lastSeenDate,"2026-11-01");
});
test("live files contain confirmed champion starting cohort and no unsupported claim of a complete roster",()=>{
 const champs=JSON.parse(fs.readFileSync("data/ufc-champion-profiles.json","utf8"));
 assert.equal(Object.keys(champs.fighters).length,11);
 const source=fs.readFileSync("scripts/build-ufc-profile-queue.mjs","utf8");
 assert(source.includes("fullActiveRosterVerified:false"));
});

test("every newly booked UFC fighter gets queued, without requiring API collection",()=>{
 const source={events:[{sport:"mma",promotion:"UFC",date:"2026-11-15",title:"UFC Upcoming",
  source:"https://www.ufc.com/events",bouts:[{fighters:["New Person","Champion Ace"]}]}]};
 const q=buildQueue({bouts:{}},[{fighters:{
  champ:{name:"Champion Ace",latest:[{date:"2026-06-01",opponent:"Someone"}],
   review:{credentialsChecked:true,checkedAt:"2026-11-12"}}
 }}],{asOf:"2026-11-12",upcomingCards:source,max:1});
 assert.equal(q.newCardEntrants.length,1);
 assert.equal(q.newCardEntrants[0].name,"New Person");
 assert(q.candidates.some(c=>c.name==="New Person"&&c.onCard===true));
 assert.equal(q.postFightRefreshCandidates.length,0);
});
test("a newly completed UFC fight triggers a separate reviewed-profile update",()=>{
 const source={bouts:{new:{id:"445",org:"ufc",status:"completed",
  event:"UFC Fight Night",eventDate:"2026-11-10",
  a:{name:"Champion Ace"},b:{name:"Another Athlete"}}}};
 const profiles=[{fighters:{champ:{name:"Champion Ace",
  latest:[{date:"2026-09-01",opponent:"Old Match"}],
  review:{credentialsChecked:true,checkedAt:"2026-11-01"}}}}];
 const q=buildQueue(source,profiles,{asOf:"2026-11-12"});
 assert.equal(q.postFightRefreshCandidates.length,1);
 assert.equal(q.postFightRefreshCandidates[0].name,"Champion Ace");
 assert(!q.candidates.some(c=>c.name==="Champion Ace"));
});
test("scheduled bouts cannot falsely trigger post-fight profile refreshes",()=>{
 const source={bouts:{future:{id:"445",org:"ufc",status:"scheduled",
  event:"Future Night",eventDate:"2026-11-20",
  a:{name:"Champion Ace"},b:{name:"Another Athlete"}}}};
 const profiles=[{fighters:{champ:{name:"Champion Ace",
  latest:[{date:"2026-09-01",opponent:"Old Match"}],
  review:{credentialsChecked:true,checkedAt:"2026-11-01"}}}}];
 const q=buildQueue(source,profiles,{asOf:"2026-11-12"});
 assert.equal(q.postFightRefreshCandidates.length,0);
});

test("UTC date rollover does not falsely flag the same opponent as a new UFC fight",()=>{
 const progress={bouts:{g:{...bout("Ciryl Gane","2026-06-15"),id:"66006",
  b:{name:"Alex Pereira"}}}};
 const reviewed=[{fighters:{g:{name:"Ciryl Gane",
  latest:[{date:"2026-06-14",opponent:"Alex Pereira"}],
  review:{credentialsChecked:true,checkedAt:"2026-11-12"}}}}];
 const q=buildQueue(progress,reviewed,{asOf:"2026-11-12"});
 assert.equal(q.postFightRefreshCandidates.length,0);
});
test("one-day later fight against a different opponent still requires verification",()=>{
 const progress={bouts:{g:{...bout("Ciryl Gane","2026-06-15"),id:"66007",
  b:{name:"Different Opponent"}}}};
 const reviewed=[{fighters:{g:{name:"Ciryl Gane",
  latest:[{date:"2026-06-14",opponent:"Alex Pereira"}],
  review:{credentialsChecked:true,checkedAt:"2026-11-12"}}}}];
 const q=buildQueue(progress,reviewed,{asOf:"2026-11-12"});
 assert.equal(q.postFightRefreshCandidates.length,1);
});

test("full owned partitions are not truncated to the 120-candidate preview",()=>{
 const bouts={};
 for(let i=0;i<160;i++){
  const name="Alpha "+String(i).padStart(3,"0");
  bouts[i]={org:"ufc",status:"completed",eventDate:"2026-10-01",event:"UFC Fight Night: Example",
   a:{name},b:{name:"Zulu "+String(i).padStart(3,"0")}};
 }
 const cards={events:[{sport:"mma",promotion:"UFC",date:"2026-11-15",
  title:"UFC Priority Card",bouts:[{fighters:["Alpha 001"]}]}]};
 const q=buildQueue({bouts},[],{asOf:"2026-11-12",upcomingCards:cards});
 assert.equal(q.candidates.length,120);
 assert(q.historicalCounts["A-F"]>120);
 assert(!q.historicalByWorker["A-F"].some(x=>x.name==="Alpha 001"));
 assert(q.historicalByWorker["S-Z"].some(x=>x.name==="Zulu 001"));
 assert.equal(q.historicalByWorker["A-F"].length,q.historicalCounts["A-F"]);
});

test("non-alphabetic UFC names remain visible for priority triage",()=>{
 const progress={bouts:{one:{org:"ufc",event:"UFC Fight Night: Example",status:"completed",eventDate:"2026-10-01",
  a:{name:"Жан Файтер"},b:{name:"Alpha Veteran"}}}};
 const q=buildQueue(progress,[],{asOf:"2026-11-12"});
 assert(q.unassignedHistoricalCandidates.some(x=>x.name==="Жан Файтер"));
 assert(q.historicalByWorker["A-F"].some(x=>x.name==="Alpha Veteran"));
});

test("Contender Series and Road-to-UFC entrants are not added to official UFC fighter research",()=>{
 const mk=(event,name)=>({org:"ufc",status:"completed",
  eventDate:"2026-09-01",event,
  a:{slug:name.toLowerCase().replaceAll(" ","-"),name},
  b:{slug:"other-"+name.toLowerCase().replaceAll(" ","-"),name:"Other "+name}});
 const q=buildQueue({bouts:{
  a:mk("Dana White's Contender Series 97","DWCS Entrant"),
  b:mk("Road To UFC: Example","Road Entrant"),
  c:mk("UFC Fight Night: Example","Official Entrant")
 }},[],{asOf:"2026-11-13",upcomingCards:{events:[]}});
 assert.equal(q.candidateCount,2);
 assert(q.candidates.some(x=>x.name==="Official Entrant"));
 assert.equal(q.candidates.some(x=>x.name==="DWCS Entrant"),false);
 assert.equal(q.candidates.some(x=>x.name==="Road Entrant"),false);
});
