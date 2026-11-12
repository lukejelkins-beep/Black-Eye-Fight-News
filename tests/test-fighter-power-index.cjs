/* Preview regression tests: source-gated MMA ratings and Last 5 / cage consolidation. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../assets/fighter-power-index.js");
const insights=fs.readFileSync(path.join(__dirname,"../assets/fighter-insights.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"../assets/fighter-power.css"),"utf8");
const last5=[
 {date:"2026-11-07",opponent:"A",result:"win"},
 {date:"2026-09-08",opponent:"B",result:"loss"},
 {date:"2026-08-01",opponent:"C",result:"no contest"},
 {date:"2026-04-01",opponent:"D",result:"draw"},
 {date:"2026-01-01",opponent:"E",result:"win"}
];
const career={
 recent:{fights:8},
 stats:{source:"UFC Stats API",observedOn:"2026-11-12",sampleBouts:8,
  slpm:4.2,sapm:2.1,strAcc:51,strDef:61,tdAvg:3.2,tdAcc:42,tdDef:82,
  subAvg:1.4,revAvg:.7,controlShare:.3,kdAvg:.4,koTkoWinRate:.2,submissionWinRate:.1}
};
const ratings=model.evaluate(career,last5);
assert.deepEqual(ratings.map(x=>x.label),["Striking","Grappling","Wrestling","Defence","Recent form"]);
assert(ratings.every(x=>Number.isInteger(x.score)&&x.score>=0&&x.score<=100));
assert.equal(model.recentForm(last5),58);
assert.equal(model.evaluate(null,[]).filter(x=>x.score!==null).length,0);
assert.equal(model.evaluate({recent:{fights:1},stats:{observedOn:"2026-11-12",source:"API",slpm:9}},[])[0].score,null);
const noGrappling=model.evaluate({recent:{fights:5},stats:{observedOn:"2026-11-12",source:"API",slpm:5,sapm:3,tdAvg:0}},last5);
assert.equal(noGrappling[1].score,null,"Absence of submission evidence must not produce grappling score");
const raw={performanceEvidence:{verified:true,source:"https://www.ufc.com/stats",sampleBouts:4,observedSeconds:3000,
 sigLanded:260,sigAttempted:550,sigAbsorbed:190,oppSigAttempted:445,
 takedowns:6,takedownAttempts:16,opponentTakedowns:4,opponentTakedownAttempts:13,
 submissionAttempts:7,reversals:3,controlSec:710,opponentControlSec:370,
 knockdowns:2,knockdownsAbsorbed:1,koTkoWins:1,submissionWins:1}};
assert(model.evaluate(raw,last5).every(x=>Number.isInteger(x.score)));
raw.performanceEvidence.verified=false;
assert.equal(model.evaluate(raw,last5).filter(x=>x.score!==null).length,1,"Unverified fight samples never contribute to attributes");
assert(!insights.includes('["cage","Cage Time"]'),"Cage Time tab must be removed");
assert(insights.includes("Cage time"),"Merged last-five heading should include cage time");
assert(insights.includes('befn-history-duration'),"Each fight needs a duration column");
assert(insights.includes("secTime(h.cageSec)"),"Use per-fight durations rather than an inferred average");
assert(css.includes(".befn-history-with-cage"),"Responsive fight-and-time styling");
assert(html.includes("fighter-insights.js"),"Insights must load on preview");
// Verify the optional curated round-preview adapter: only fully timed bouts
// with continuous round coverage qualify; incomplete sources stay unrated.
const round=(n,a,b)=>({round:n,a:{sigLanded:a[0],sigAttempted:a[1],
 takedowns:a[2],takedownAttempts:a[3],controlSec:a[4],knockdowns:a[5],
 subAttempts:a[6],reversals:a[7]},b:{sigLanded:b[0],sigAttempted:b[1],
 takedowns:b[2],takedownAttempts:b[3],controlSec:b[4],knockdowns:b[5],
 subAttempts:b[6],reversals:b[7]}});
const events={a:{org:"ufc",date:"2026-11-08",bouts:[
 {a:"Person A",b:"Person B",result:{round:3,time:"5:00"},roundPreview:[
 round(1,[34,70,1,3,125,0,1,1],[19,45,0,2,30,0,0,0]),
 round(2,[32,68,2,4,100,0,1,0],[22,51,1,2,70,0,0,0]),
 round(3,[36,68,0,2,20,1,2,0],[18,42,1,3,50,0,1,0])
 ]},
 {a:"Person A",b:"Person C",result:{round:2,time:"2:30"},roundPreview:[
 round(1,[28,60,1,2,80,1,1,0],[22,48,0,1,10,0,0,1]),
 round(2,[15,34,1,3,60,0,1,1],[8,20,0,1,25,0,0,0])
 ]}
]}};
const extracted=model.aggregateRoundPreviews(events).get(model.normalize("Person A"));
assert.equal(extracted.sampleBouts,2);
assert.equal(extracted.observedSeconds,1350);
assert.equal(extracted.submissionAttempts,6);
assert.equal(extracted.reversals,2);
assert(model.evaluate({performanceEvidence:extracted},last5).filter(x=>x.score!==null).length>=4);
events.a.bouts[1].result.time="unconfirmed";
assert.equal(model.aggregateRoundPreviews(events).size,0,"One timed fight alone is insufficient evidence");
assert(insights.includes("befn:round-previews-ready"),"Round observations must reach the rating model");
// Verified collegiate competition may nudge statistically supported
// wrestling, but may not invent an otherwise missing wrestling rating.
const credential={kind:"ncaa",division:"I",source:"https://gobulldogs.com/news/2019/3/23/wrestling-2019-ncaa-championships-day-three"};
const collegeBase=model.evaluate(career,last5).find(x=>x.id==="wrestling");
const collegeStats=model.evaluate({...career,credentials:[credential]},last5);
const collegeWrestling=collegeStats.find(x=>x.id==="wrestling");
assert(collegeWrestling.score>collegeBase.score);
assert(collegeWrestling.credentialAdjustment>=1&&collegeWrestling.credentialAdjustment<=5);
for(const rated of collegeStats){
 if(rated.id!=="wrestling")
  assert.equal(rated.score,model.evaluate(career,last5).find(x=>x.id===rated.id).score);
}
assert.equal(model.evaluate({credentials:[credential]},[]).find(x=>x.id==="wrestling").score,null);
assert.equal(model.ncaaWrestlingPrior(null,{credentials:[credential]},5),null);
assert.equal(model.evaluate({...career,credentials:[{...credential,source:""}]},last5)
 .find(x=>x.id==="wrestling").credentialAdjustment,0);
console.log("PASS: 5 MMA dimensions, evidence gating, form, no cardio, merged cage-time history");
