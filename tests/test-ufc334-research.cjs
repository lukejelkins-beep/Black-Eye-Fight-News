/* BEFN UFC 334 test-branch research and comparison regression. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root,name),"utf8");
const card=JSON.parse(read("data/upcoming-cards.json")).events
  .find(e=>e.id==="ufc-334-2026-11-14");
const facts=JSON.parse(read("data/ufc334-fighter-evidence.json"));
const engine=require("../assets/fighter-power-index.js");
const code=read("assets/fighter-insights.js");
const norm=engine.normalize;
assert(card&&card.bouts.length===13,"All 13 official UFC 334 bouts should be present");
assert.equal(facts.eventId,card.id);
const names=card.bouts.flatMap(b=>b.fighters);
assert.equal(names.length,26);
const athletes=Object.values(facts.fighters);
assert.equal(athletes.length,26,"Every upcoming fighter gets an evidence record");
for(const name of names){
 const athlete=athletes.find(a=>norm(a.name)===norm(name));
 assert(athlete,"Missing evidence record: "+name);
 assert(/^https:\/\//.test(athlete.source),"No source for "+name);
 assert.equal(athlete.sport,"MMA");
 if(athlete.verifiedStats){
  const stat=athlete.verifiedStats;
  assert(/^https:\/\//.test(stat.source));
  assert(stat.observedOn&&stat.sampleBouts>=2);
  for(const key of ["slpm","sapm","strAcc","tdAvg","tdAcc","tdDef","subAvg"]){
   assert(stat[key]===undefined||(typeof stat[key]==="number"&&
     Number.isFinite(stat[key])&&stat[key]>=0),"Invalid "+key+" for "+name);
  }
  const m=engine.evaluate({recent:{fights:stat.sampleBouts},stats:stat},
    (athlete.latest||[]).map(x=>({...x,result:x.outcome})));
  assert.deepEqual(m.map(x=>x.id),["striking","grappling","wrestling","defence","form"]);
  assert(m.every(x=>x.score===null||(Number.isInteger(x.score)&&x.score>=0&&x.score<=100)));
 }
 for(const result of athlete.latest||[]){
  assert(result.date&&result.opponent&&result.outcome);
  assert(result.cageSec===undefined||Number.isInteger(result.cageSec)&&result.cageSec>=0,
   "Invalid elapsed cage time");
 }
}
const judo=facts.fighters["kayla-harrison"].credentials.find(c=>c.kind==="olympic-judo");
assert(judo&&judo.participated===true);
assert.equal(judo.medal,"gold");
assert.equal(judo.medalCount,2);
assert.deepEqual(judo.years,[2012,2016]);
assert(judo.source.includes("teamusa.com"));
const ncaa=facts.fighters["josh-hokit"].credentials.find(c=>c.kind==="ncaa");
assert.equal(ncaa.division,"I");
assert(!ncaa.medal,"All-American must NOT show a championship medal");
assert(facts.fighters["bia-mesquita"].credentials.some(c=>c.kind==="adcc"&&c.medal==="gold"));
assert(facts.fighters["bia-mesquita"].credentials.some(c=>c.kind==="bjj"&&c.belt==="black"));
assert(facts.fighters["amanda-nunes"].credentials.some(c=>c.kind==="bjj"&&c.belt==="black"));
for(const name of ["Donte Johnson","Alatengheili","Juan Diaz","Samuel Sanches"]){
 const f=athletes.find(x=>x.name===name);
 assert(f&&!f.verifiedStats,"Small or missing samples must not produce artificial ratings");
}
assert(code.includes('data/ufc334-fighter-evidence.json'),"Fighter snapshots load card evidence");
assert(code.includes('"olympic-judo"'),"Judo Olympic credential enabled");
assert(code.includes('c.medalCount>1'),"Double gold displays badge count");
assert(code.includes("befn-fight-snapshot"),"Credentials appear in collapsible fight card");
const gane=facts.fighters["ciryl-gane"];
const reportedBjj=gane.credentials.find(c=>c.kind==="bjj"&&c.belt==="black");
assert(reportedBjj);
assert.equal(reportedBjj.verification,"reported");
assert(reportedBjj.detail.includes("does not independently confirm"));
const h=facts.fighters["josh-hokit"];
const hCred=h.credentials.find(c=>c.kind==="ncaa"&&c.division==="I");
assert.equal(hCred.placement,5);
assert(!hCred.medal);
const hRecord={recent:{fights:h.verifiedStats.sampleBouts},stats:h.verifiedStats};
const hBase=engine.evaluate(hRecord,h.latest).find(m=>m.id==="wrestling");
const hModified=engine.evaluate({...hRecord,credentials:[hCred]},h.latest).find(m=>m.id==="wrestling");
assert(hModified.score>hBase.score);
assert(hModified.credentialAdjustment>0&&hModified.credentialAdjustment<=5);
// Gane's UFC-only submission wins complete grappling evidence; the 3
// professional submission victories on the UFC profile include pre-UFC bouts.
const ganeStats=gane.verifiedStats;
assert.equal(ganeStats.sampleBouts,14);
assert.equal(ganeStats.submissionWins,2);
assert.equal(ganeStats.submissionWinRate,2/14);
assert(ganeStats.submissionWinSource.includes("ufc.com/athlete/ciryl-gane"));
const ganeRecord={recent:{fights:ganeStats.sampleBouts},stats:ganeStats};
const ganeRatings=engine.evaluate(ganeRecord,gane.latest);
assert.equal(ganeRatings.find(m=>m.id==="grappling").score,36);
assert.equal(ganeRatings.length,5);
const missingFinish=engine.evaluate({recent:ganeRecord.recent,
 stats:{...ganeStats,submissionWinRate:null}},gane.latest);
assert.equal(missingFinish.find(m=>m.id==="grappling").score,null);
assert(code.includes('Submission finishes'),"Official submission source should be visible");
// Verified medals and ranks modify only appropriate domains, while
// unsupported reported credentials earn no points.
const withGaneBelt=engine.evaluate({...ganeRecord,
 credentials:gane.credentials},gane.latest);
assert.equal(withGaneBelt.find(m=>m.id==="grappling").score,36,
 "Reported Gane belt must not change score");
const newH=engine.evaluate({...hRecord,credentials:h.credentials},h.latest);
assert.equal(newH.find(m=>m.id==="wrestling").credentialAdjustment,5);
const kayla=facts.fighters["kayla-harrison"];
const kRate=engine.evaluate({stats:kayla.verifiedStats,
 recent:{fights:kayla.verifiedStats.sampleBouts},
 credentials:kayla.credentials},kayla.latest);
assert.equal(kRate.find(m=>m.id==="wrestling").credentialAdjustment,10);
assert.equal(kRate.find(m=>m.id==="grappling").credentialAdjustment,8);
const bia=facts.fighters["bia-mesquita"];
const biaRate=engine.evaluate({stats:bia.verifiedStats,
 recent:{fights:bia.verifiedStats.sampleBouts},
 credentials:bia.credentials},bia.latest);
assert.equal(biaRate.find(m=>m.id==="grappling").credentialAdjustment,12);
console.log("PASS UFC 334: 13 bouts, 26 sourced profiles, five metrics, BJJ/ADCC/NCAA, Olympic judo gold x2");
