/* BEFN UFC profile-card data gate; run on every test-branch UFC profile update.
 * This protects content integrity, not actual image-loading/browser layout.
 * Browser visual QA and external source verification remain separate steps.
 */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const model=require("../assets/fighter-power-index.js");
const classifier=require("../assets/ufc-prospect-contender.js");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const html=read("index.html");
const insights=read("assets/fighter-insights.js");
const source=x=>typeof x==="string"&&/^https:\/\/[^/\s]+\/\S*/i.test(x)&&!(/google\.com\/search/i.test(x));
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const files=fs.readdirSync(path.join(root,"data"))
 .filter(n=>/^ufc-(champion|ranked|contender|prospect|roster)-profiles\.json$/.test(n));
assert(files.includes("ufc-champion-profiles.json"),"Champion cohort missing");
const seen=new Set();
let checked=0;
for(const file of files){
 const data=JSON.parse(read("data/"+file));
 assert.equal(data.schema,1,file+": unsupported schema");
 assert(/^\d{4}-\d\d-\d\d$/.test(data.reviewedOn),file+": dated audit required");
 assert(data.fighters&&typeof data.fighters==="object",file+": missing fighters");
 if(file==="ufc-champion-profiles.json"){
  assert.equal(Object.keys(data.fighters).length,11,"All 11 verified titleholders required");
  assert.equal(data.divisions.length,11,"Each champion has one distinct division");
  assert.equal(new Set(data.divisions.map(d=>d.division)).size,11);
  assert(!data.divisions.some(d=>/women.s featherweight/i.test(d.division)),
   "Vacant women's featherweight title must remain unassigned");
 }
 for(const [slug,f] of Object.entries(data.fighters)){
  const context=file+"/"+slug;
  assert(f.id&&f.name&&f.division,context+": identity/division required");
  assert(f.sport==="MMA"&&f.organisation==="UFC",context+": UFC MMA only");
  assert(f.category&&f.record,context+": category and record required");
  assert(!seen.has(norm(f.name)),context+": duplicate athlete across cohorts");
  seen.add(norm(f.name));
  assert(source(f.source)&&f.source.includes("ufc.com/athlete/"),
    context+": individual official athlete link required");
  assert(f.review&&/^\d{4}-\d{2}-\d{2}$/.test(f.review.checkedAt||"")&&
    f.review.checkedAt<=data.reviewedOn,
    context+": every fighter needs a dated review at or before cohort snapshot");
  assert(f.review.credentialsChecked===true,context+": credential check required");
  assert(Array.isArray(f.review.notes)&&f.review.notes.length>0,
    context+": independent findings required");
  assert(Array.isArray(f.latest)&&f.latest.length>0&&f.latest.length<=5,
    context+": up to five completed UFC results required");
  assert(Array.isArray(f.credentials),context+": explicitly list credentials, even if empty");
  let previous="9999-99-99";
  const results=new Set();
  for(const fight of f.latest){
   assert(/^\d{4}-\d\d-\d\d$/.test(fight.date)&&fight.date<=data.reviewedOn,
    context+": invalid or future result date");
   assert(fight.date<=previous,context+": history must be newest-first");
   previous=fight.date;
   assert(fight.opponent&&fight.method&&["W","L","D","NC"].includes(fight.outcome),
    context+": incomplete bout record");
   assert(source(fight.source),context+": every bout needs a source");
   const key=fight.date+":"+norm(fight.opponent);
   assert(!results.has(key),context+": duplicate bout "+key);
   results.add(key);
   if(fight.cageSec!==undefined){
    assert(Number.isInteger(fight.cageSec)&&fight.cageSec>=0&&fight.cageSec<=1500,
      context+": impossible cage duration");
    const match=String(fight.method).match(/\bR(\d)\s+(\d{1,2}):(\d{2})\b/i);
    if(match){
     const [round,min,sec]=match.slice(1).map(Number);
     assert(round>=1&&round<=5&&min<=5&&sec<60,context+": bad fight clock");
     assert.equal(fight.cageSec,(round-1)*300+min*60+sec,
       context+": cage time and finish clock disagree for "+fight.opponent);
    }
   }
  }
  const stats=f.verifiedStats;
  if(stats){
   assert(stats.scope==="ufc-only"&&source(stats.source),
    context+": stats must cite UFC-only evidence");
   assert(Number.isInteger(stats.sampleBouts)&&stats.sampleBouts>=2,
    context+": stats denominator too small or invalid");
   assert(/^\d{4}-\d{2}-\d{2}$/.test(stats.observedOn||"")&&
     stats.observedOn<=f.review.checkedAt,
     context+": stats observation must precede or match individual review");
   const ranges={
    slpm:[0,20],sapm:[0,20],strAcc:[0,100],strDef:[0,100],
    tdAvg:[0,20],tdAcc:[0,100],tdDef:[0,100],
    subAvg:[0,12],revAvg:[0,12],controlShare:[0,1],
    controlAgainst:[0,1],kdAvg:[0,7],kdAgainstAvg:[0,7],
    koTkoWinRate:[0,1],submissionWinRate:[0,1]
   };
   for(const [metric,[minimum,maximum]] of Object.entries(ranges)){
    if(stats[metric]===undefined||stats[metric]===null)continue;
    assert(typeof stats[metric]==="number"&&Number.isFinite(stats[metric])&&
      stats[metric]>=minimum&&stats[metric]<=maximum,
      context+": "+metric+" invalid");
   }
  }
  for(const c of f.credentials){
   assert(source(c.source),context+": unsupported credential URL");
   assert(c.kind,context+": credential family missing");
   if(["reported","pending","unverified","disputed"].includes(c.verification)){
    const adjustment=model.credentialBonuses({credentials:[c]});
    assert(Object.values(adjustment).every(x=>x.points===0),
      context+": unverified credential must not contribute points");
   }
  }
  if(f.category!=="Champion"){
   const classification=classifier.classify(f,model);
   assert(classification.eligible,context+": classification has insufficient verified input");
   assert.equal(classification.label,f.category,
     context+": algorithmic classification does not match published category");
  }
  const scores=model.evaluate({stats:stats||undefined,credentials:f.credentials,
   recent:{fights:stats?.sampleBouts||0}},f.latest);
  assert.equal(scores.length,5,context+": expected 5 dimensions");
  assert(scores.every(s=>s.score===null||(Number.isInteger(s.score)&&s.score>=0&&s.score<=100)),
    context+": invalid rating");
  for(const metric of scores){
   if(metric.baseScore===null)assert.equal(metric.credentialAdjustment,0,
     context+": credential created an evidence-free rating");
   else assert(metric.score===metric.baseScore+metric.credentialAdjustment,
     context+": score breakdown is not auditable");
  }
  // Every champ must have a portrait candidate in the currently shipped HTML
  // registry. Network errors, crop and licence still need separate visual QA.
  if(f.category==="Champion"){
   assert(html.includes('"'+f.name+'":{"photo":"https://'),
      context+": no image candidate in rendered app registry");
  }
  checked++;
 }
}
assert(insights.includes('BEFNUfcClassifier')&&
 insights.includes('target.category=classified.label'),
 "All reviewed UFC fighters must use uncapped algorithmic category assignment");
assert(insights.includes('data/ufc-ranked-profiles.json')&&
 insights.includes('data/ufc-contender-profiles.json')&&
 insights.includes('data/ufc-prospect-profiles.json')&&
 insights.includes('data/ufc-roster-profiles.json'),
 "Reviewed UFC cohorts must hydrate the same shared profile engine");
assert(insights.includes('data/ufc-postfight-metrics.json')&&
 insights.includes('Tracked UFC fight statistics')&&
 insights.includes('tracked-sample totals, not career totals'),
 "UFC post-fight totals must hydrate into clearly labelled fighter cards");
assert(insights.includes('data/ufc-champion-profiles.json'),
 "Champion data must be loaded into fighter cards");
assert(html.includes('data-fighter="mma-champion--'),
 "Champion table needs direct fighter profile actions");
console.log("PASS UFC profile data/card gate:",checked,"fighters in",files.length,"cohorts");
