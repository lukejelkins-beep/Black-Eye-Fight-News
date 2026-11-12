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
assert.equal(model.credentialBonuses({credentials:[credential]}).wrestling.points,3);
assert.equal(model.evaluate({...career,credentials:[{...credential,source:""}]},last5)
 .find(x=>x.id==="wrestling").credentialAdjustment,0);
// The entire credential schedule is fixed and auditable.
const sourced=(kind,opts={})=>({kind,source:"https://example.org/official-record",...opts});
const ncaa=(division,medal,placement)=>sourced("ncaa",{
 division,...(medal?{medal}:{}),...(placement?{placement}:{})
});
const wPts=c=>model.credentialBonuses({credentials:[c]}).wrestling.points;
assert.equal(wPts(ncaa("I","gold")),11);
assert.equal(wPts(ncaa("I","silver")),10);
assert.equal(wPts(ncaa("I","bronze")),9);
assert.equal(wPts(ncaa("II","gold")),8);
assert.equal(wPts(ncaa("II","silver")),7);
assert.equal(wPts(ncaa("II","bronze")),6);
assert.equal(wPts(ncaa("III","gold")),5);
assert.equal(wPts(ncaa("III","silver")),4);
assert.equal(wPts(ncaa("III","bronze")),3);
assert.equal(wPts(ncaa("I",null,5)),5,"Non-medallist All-American gets no medal, but a documented top-eight award");
assert.equal(wPts(ncaa("I","gold",5)),5,"Incorrect medal placement must not gain gold points");
assert.equal(wPts(ncaa("II")),2);
assert.equal(wPts(ncaa("III")),1);
assert.equal(wPts(ncaa("I",null,5)),5);
const noData=model.evaluate({credentials:[ncaa("I","gold")]},[]);
assert.equal(noData.find(x=>x.id==="wrestling").score,null,
 "Credential must not manufacture an otherwise missing metric");
const duplicate=model.credentialBonuses({credentials:[
 ncaa("I","gold"),ncaa("I","gold"),ncaa("II","silver")
]});
assert.equal(duplicate.wrestling.points,11,"Highest NCAA award only, never sum duplicates");
const reported=model.credentialBonuses({credentials:[sourced("bjj",{belt:"black",verification:"reported"})]});
assert.equal(reported.grappling.points,0,"Reported rank is not verified achievement");
const black=model.credentialBonuses({credentials:[sourced("bjj",{belt:"black"})]});
assert.equal(black.grappling.points,4);
const judo=model.credentialBonuses({credentials:[
 sourced("olympic-judo",{participated:true,medal:"gold",medalCount:2})
]});
assert.equal(judo.wrestling.points,10);
assert.equal(judo.grappling.points,8);
const adccAndBjj=model.credentialBonuses({credentials:[
 sourced("adcc",{medal:"gold"}),sourced("bjj",{belt:"black"})
]});
assert.equal(adccAndBjj.grappling.points,12,"Capped across different families");
const samboSport=model.credentialBonuses({credentials:[sourced("sambo",{medal:"gold",discipline:"sport"})]});
assert.equal(samboSport.striking.points,0);
assert.equal(samboSport.grappling.points,5);
assert.equal(samboSport.wrestling.points,5);
const samboCombat=model.credentialBonuses({credentials:[sourced("sambo",{medal:"gold",discipline:"combat"})]});
assert.equal(samboCombat.striking.points,3);
assert.equal(samboCombat.grappling.points,5);
assert.equal(samboCombat.wrestling.points,5);
assert.equal(model.credentialBonuses({credentials:[
 sourced("adcc",{medal:"gold",source:"http://insecure.example"}),
 sourced("bjj",{belt:"black",source:""})
]}).grappling.points,0);
// Finishing impact: with all else unchanged, more KDs/KOs or submissions
// must raise respective statistical indices.
const strongerStriker={...career,stats:{...career.stats,kdAvg:1.7,koTkoWinRate:.65}};
const regularStriker=model.evaluate(career,last5).find(x=>x.id==="striking");
const finisher=model.evaluate(strongerStriker,last5).find(x=>x.id==="striking");
assert(finisher.baseScore>regularStriker.baseScore,"Finishing evidence must matter");
const submissionFinisher={...career,stats:{...career.stats,submissionWinRate:.31}};
const regularGrappler=model.evaluate(career,last5).find(x=>x.id==="grappling");
const finisherGrappler=model.evaluate(submissionFinisher,last5).find(x=>x.id==="grappling");
assert(finisherGrappler.baseScore>regularGrappler.baseScore,"Submission finishes must matter");
assert.equal(model.evaluate({...career,credentials:[sourced("bjj",{belt:"black"})]},last5)
 .find(x=>x.id==="form").credentialAdjustment,0,"Credential cannot alter form");
assert(model.CREDENTIAL_CAP===12);
console.log("PASS: 5 MMA dimensions, evidence gating, form, no cardio, merged cage-time history");
