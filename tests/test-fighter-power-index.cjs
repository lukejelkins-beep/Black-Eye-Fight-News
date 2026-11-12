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
console.log("PASS: 5 MMA dimensions, evidence gating, form, no cardio, merged cage-time history");
