/* UFC champions are the first fully individually sourced BEFN fighter cohort. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const data=JSON.parse(fs.readFileSync(path.join(root,"data/ufc-champion-profiles.json"),"utf8"));
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const insights=fs.readFileSync(path.join(root,"assets/fighter-insights.js"),"utf8");
const model=require("../assets/fighter-power-index.js");
assert.equal(data.schema,1);
assert.equal(data.scope,"ufc-champions");
assert(/^\d{4}-\d\d-\d\d$/.test(data.reviewedOn),"Cohort review must have a real audit date");
const roster=Object.values(data.fighters);
assert.equal(roster.length,11);
assert.equal(data.divisions.length,11);
assert.equal(roster.reduce((s,f)=>s+f.latest.length,0),53);
const knownNames=new Set();
for(const fighter of roster){
 assert.equal(fighter.sport,"MMA");
 assert.equal(fighter.organisation,"UFC");
 assert.equal(fighter.category,"Champion");
 assert(fighter.id.startsWith("mma-champion--"));
 assert(!knownNames.has(fighter.id),"Duplicate fighter ID");
 knownNames.add(fighter.id);
 assert(/^https:\/\/www.ufc.com\/athlete\//.test(fighter.source),"UFC athlete source required");
 assert(fighter.statSource.startsWith("https://www.ufcalendar.com/fighters/"));
 assert(/^\d{4}-\d\d-\d\d$/.test(fighter.review.checkedAt)&&fighter.review.checkedAt<=data.reviewedOn,
  "Per-fighter review date must be valid and no later than the cohort update");
 assert.equal(fighter.review.credentialsChecked,true);
 assert(Array.isArray(fighter.review.notes)&&fighter.review.notes.length,"Every champion personally researched");
 assert(fighter.verifiedStats.scope==="ufc-only");
 assert(fighter.verifiedStats.sampleBouts>=2);
 assert(Array.isArray(fighter.latest)&&fighter.latest.length>0&&fighter.latest.length<=5);
 for(const row of fighter.latest){
  assert(/^\d{4}-\d\d-\d\d$/.test(row.date));
  assert(row.opponent&&row.method);
  assert(["W","L","D","NC"].includes(row.outcome));
  if(row.cageSec!==undefined)assert(Number.isInteger(row.cageSec)&&row.cageSec>=0);
 }
 const result=model.evaluate({recent:{fights:fighter.verifiedStats.sampleBouts},
  stats:fighter.verifiedStats,credentials:fighter.credentials},fighter.latest);
 assert.deepEqual(result.map(x=>x.label),[
  "Striking","Grappling","Wrestling","Defence","Recent form"]);
 assert(result.every(x=>x.score===null||(Number.isInteger(x.score)&&x.score>=0&&x.score<=100)));
 for(const credential of fighter.credentials)assert(/^https:\/\//.test(credential.source));
}
assert.equal(data.fighters["kayla-harrison"].latest.length,3,
 "PFL results must not be inserted into UFC-only sample");
const h=data.fighters["kayla-harrison"];
const k=model.evaluate({stats:h.verifiedStats,credentials:h.credentials,
 recent:{fights:h.verifiedStats.sampleBouts}},h.latest);
assert.equal(k.find(x=>x.id==="wrestling").credentialAdjustment,10);
assert.equal(k.find(x=>x.id==="grappling").credentialAdjustment,8);
const islam=data.fighters["islam-makhachev"];
const im=model.evaluate({stats:islam.verifiedStats,credentials:islam.credentials,
 recent:{fights:islam.verifiedStats.sampleBouts}},islam.latest);
assert.equal(im.find(x=>x.id==="striking").credentialAdjustment,3,
 "World Combat Sambo champion contributes to striking");
const justin=data.fighters["justin-gaethje"];
assert.equal(justin.credentials[0].placement,7);
assert(!justin.credentials[0].medal,"Division I All-American is not a top-three podium");
const j=model.evaluate({stats:justin.verifiedStats,credentials:justin.credentials,
 recent:{fights:justin.verifiedStats.sampleBouts}},justin.latest);
assert.equal(j.find(x=>x.id==="wrestling").credentialAdjustment,5);
const gane=data.fighters["ciryl-gane"];
const g=model.evaluate({stats:gane.verifiedStats,credentials:gane.credentials,
 recent:{fights:gane.verifiedStats.sampleBouts}},gane.latest);
assert.equal(g.find(x=>x.id==="grappling").credentialAdjustment,0,
 "Disputed black-belt claim must not earn points");
const mack=data.fighters["mackenzie-dern"];
const mk=model.evaluate({stats:mack.verifiedStats,credentials:mack.credentials,
 recent:{fights:mack.verifiedStats.sampleBouts}},mack.latest);
assert.equal(mk.find(x=>x.id==="grappling").credentialAdjustment,12);
assert(index.includes('class="befn-champion-profile-link" data-fighter="mma-champion--'),
 "Champions page requires clickable complete-profile links");
assert(index.includes("['All','Champion','Contender','Prospect','Roster','Unassessed']"),
 "Fighter profiles must include Champion filter");
assert(insights.includes("data/ufc-champion-profiles.json"),
 "Champion research must hydrate shared profile engine");
assert(insights.includes("if(!fighter.championReview"),
 "UFC card samples must not overwrite champion-level evidence");
console.log("PASS 11 individually sourced UFC champions, 53 UFC results, stats isolation, badges and profile navigation");
