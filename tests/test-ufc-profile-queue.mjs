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
