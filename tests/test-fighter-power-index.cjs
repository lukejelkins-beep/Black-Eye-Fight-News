/* Preview regression tests: source-gated MMA ratings and Last 5 / cage consolidation. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../assets/fighter-power-index.js");
const insights=fs.readFileSync(path.join(__dirname,"../assets/fighter-insights.js"),"utf8");
const html=require('./helpers/read-index.cjs')();
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
assert(insights.includes("secTime(historyCageSeconds(h,official?.fights))"),"Render per-fight UFC archive durations rather than an inferred average");
const matchStart=insights.indexOf(" function historyCageSeconds(");
const matchEnd=insights.indexOf(" function fightHistoryColumn(",matchStart);
assert(matchStart>=0&&matchEnd>matchStart,"History cage-time source matcher must exist");
const historyCageSeconds=new Function("norm",insights.slice(matchStart,matchEnd)+";return historyCageSeconds;")(model.normalize);
const jiri=require("../data/ufc-stats/fighters/jiri-prochazka.json");
const navajo=require("../data/ufc-stats/fighters/navajo-stirling.json");
assert.equal(historyCageSeconds({date:"11 Apr 2026",opponent:"CU Carlos Ulberg"},jiri.fights),225,"Specific day and legacy initials must match UFC archive");
assert.equal(historyCageSeconds({date:"Aug 2026",opponent:"JB Jan Błachowicz"},navajo.fights),176,"Month-only legacy dates and Polish names must match UFC archive");
assert.equal(historyCageSeconds({date:"Aug 2024",opponent:"JB Jan Błachowicz"},navajo.fights),null,"Never invent cage time from a different date");
assert.equal(historyCageSeconds({date:"Aug 2024",opponent:"Unknown Fighter",cageSec:345},navajo.fights),345,"Preserve independently stored duration when archive has no match");
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
// UFC V3 profiles: ratings come from recorded-bout metrics, not stored nulls.
const v3={
 recent:[
  {date:"2026-08-15",opponent:"A",outcome:"W",method:"Unanimous decision R5"},
  {date:"2025-11-15",opponent:"B",outcome:"W",method:"Unanimous decision R5"},
  {date:"2025-01-18",opponent:"C",outcome:"W",method:"Submission R1 4:05"},
  {date:"2024-06-01",opponent:"D",outcome:"L",method:"TKO R2 1:00"},
  {date:"2023-10-21",opponent:"E",outcome:"NC",method:"Overturned"}
 ],
 metrics:{
  slpm:{value:4.1,bouts:4},sapm:{value:2.4,bouts:4},acc:{value:52,bouts:4},
  kd:{value:.4,bouts:4},td:{value:2.5,bouts:4},control:{value:240,bouts:4},
  net:{value:120,bouts:4},sub:{value:.8,bouts:4},tdDef:{value:75,bouts:3},
  ko:{value:1,bouts:4},submission:{value:1,bouts:4}
 }
};
const v3Result=model.evaluateV3(v3,{asOf:"2026-11-14"});
assert.deepEqual(v3Result.ratings.map(x=>x.id),["striking","grappling","wrestling","defence","form"]);
assert(v3Result.ratings.every(x=>Number.isInteger(x.score)&&x.score>=0&&x.score<=100),"Complete V3 metrics rate all five");
assert.equal(v3Result.ratings.find(x=>x.id==="form").score,
 model.recentForm(v3.recent.map(b=>({...b,result:b.outcome}))),"V3 form uses the shared recency model");
assert(Number.isInteger(v3Result.overall)&&v3Result.overall>=0&&v3Result.overall<=100);
const v3Stats=model.v3Stats(v3,"2026-11-14").stats;
assert.equal(v3Stats.koTkoWinRate,.25,"Finish counts divide by their own measured bouts");
assert.equal(v3Stats.controlAgainst,120/900,"Opponent control derives from control minus net control");
const thin=model.evaluateV3({recent:v3.recent,metrics:{slpm:{value:9,bouts:1},sapm:{value:1,bouts:1}}});
assert(thin.ratings.filter(x=>x.id!=="form").every(x=>x.score===null),"One measured bout never creates a skill rating");
assert.equal(thin.overall,null,"Overall needs three skill ratings");
assert.equal(model.evaluateV3({recent:[],metrics:{}}).ratings.filter(x=>x.score!==null).length,0);
assert.equal(model.overall([{id:"striking",score:60},{id:"grappling",score:40},{id:"wrestling",score:50},
 {id:"defence",score:null},{id:"form",score:80}]),Math.round((60*.25+40*.15+50*.2+80*.15)/.75));
// Roster percentiles: same formulas, shrink toward the roster mean, rank on the roster.
assert.equal(model.percentileOf(5,[1,2,3,4,5,6,7,8,9,10]),45);
assert.equal(model.percentileOf(3,[3,3,3,3]),50,"Ties share the midpoint");
assert.equal(model.percentileOf(null,[1,2]),null);
const roster={asOf:"2026-11-14",fighters:{}};
for(let i=0;i<40;i++){
 const k=i/39;
 roster.fighters["f"+i]={recent:v3.recent,metrics:{
  slpm:{value:1+4*k,bouts:5},sapm:{value:5-3*k,bouts:5},acc:{value:30+30*k,bouts:5},
  kd:{value:.8*k,bouts:5},td:{value:5*k,bouts:5},control:{value:400*k,bouts:5},
  net:{value:300*k-50,bouts:5},sub:{value:2*k,bouts:5},tdDef:{value:45+50*k,bouts:5},
  ko:{value:Math.round(2*k),bouts:5},submission:{value:Math.round(2*k),bouts:5}}};
}
const population=model.buildV3Population(roster);
assert.equal(population.skills.striking.values.length,40);
const top=model.evaluateV3(roster.fighters.f39,{population});
const bottom=model.evaluateV3(roster.fighters.f0,{population});
assert.equal(top.scale,"percentile");
for(const id of ["striking","grappling","wrestling","defence"]){
 const t=top.ratings.find(x=>x.id===id),b=bottom.ratings.find(x=>x.id===id);
 assert(t.score>=85,"Best of roster ranks near the top: "+id+"="+t.score);
 assert(b.score<=15,"Worst of roster ranks near the bottom: "+id+"="+b.score);
 assert.equal(t.scale,"percentile");
}
assert.equal(top.ratings.find(x=>x.id==="form").scale,"absolute","Recent form stays on its 0–100 scale");
const thinTop={...roster.fighters.f39,metrics:Object.fromEntries(Object.entries(roster.fighters.f39.metrics).map(([k,m])=>[k,{...m,bouts:2}]))};
assert(model.evaluateV3(thinTop,{population}).ratings[0].score<top.ratings[0].score,"Fewer bouts shrink toward the roster mean");
const noTdDef={...roster.fighters.f39,metrics:{...roster.fighters.f39.metrics,tdDef:{value:100,bouts:1}}};
assert(Number.isInteger(model.evaluateV3(noTdDef,{population}).ratings.find(x=>x.id==="defence").score),
 "Defence rates from strikes absorbed and opponent control when takedown defence is unmeasured");
const decorated=model.evaluateV3(roster.fighters.f39,{population,credentials:[sourced("bjj",{belt:"black"})]});
assert(decorated.ratings.every(x=>x.scale!=="percentile"||x.score<=99),"Credentials never push a percentile past 99th");
// Opponent strength: beating strong opponents lifts form, losing to them costs less.
const wins=[{opponent:"A",date:"2026-05-01",result:"W"},{opponent:"B",date:"2026-01-01",result:"W"},
 {opponent:"C",date:"2025-09-01",result:"L"}];
const plain=model.recentForm(wins);
assert.equal(model.recentForm(wins,()=>.5),plain,"Roster-average opponents leave form unchanged");
assert.equal(model.recentForm(wins,()=>null),plain,"Unknown opponents leave form unchanged");
assert(model.recentForm(wins,()=>1)>plain,"Elite opposition raises form");
assert(model.recentForm(wins,()=>0)<plain,"Weak opposition lowers form");
assert(model.recentForm(wins,()=>1)-plain<=Math.ceil(100*model.OPPONENT_SWING/2),"Opponent shift is bounded");
const perfect=[1,2,3,4,5].map(i=>({opponent:"X"+i,date:"2026-0"+i+"-01",result:"W"}));
assert(model.recentForm(perfect,()=>1)<=100,"Form never exceeds 100");
const quality=model.buildOpponentQuality(roster,population);
assert(quality.size>=30,"Most of the roster gets an opponent-strength value");
assert(Math.max(...quality.values())<=1&&Math.min(...quality.values())>=0);
const named={fighters:{},asOf:"2026-11-14"};
for(let i=0;i<40;i++)named.fighters["f"+i]={...roster.fighters["f"+i],name:"Fighter "+i};
const namedPop=model.buildV3Population(named),namedQ=model.buildOpponentQuality(named,namedPop);
const vsTop={...named.fighters.f20,recent:[{opponent:"Fighter 39",date:"2026-05-01",outcome:"W"},{opponent:"Fighter 38",date:"2026-01-01",outcome:"W"}]};
const vsBottom={...named.fighters.f20,recent:[{opponent:"Fighter 0",date:"2026-05-01",outcome:"W"},{opponent:"Fighter 1",date:"2026-01-01",outcome:"W"}]};
const formOf=x=>model.evaluateV3(x,{population:namedPop,opponents:namedQ}).ratings.find(r=>r.id==="form");
assert(formOf(vsTop).score>formOf(vsBottom).score,"Same record against better opponents rates higher");
assert(formOf(vsTop).opponents.every(o=>Number.isFinite(o.quality)),"Form exposes each opponent's strength");
const fewRoster=model.buildV3Population({fighters:{a:roster.fighters.f39,b:roster.fighters.f0}});
assert.equal(model.evaluateV3(roster.fighters.f39,{population:fewRoster}).ratings[0].score,null,"A roster under 20 fighters cannot rank");
console.log("PASS: 5 MMA dimensions, evidence gating, form, no cardio, merged cage-time history");
