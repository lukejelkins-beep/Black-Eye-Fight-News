/* BEFN UFC scouting classification v1.
 * Uncapped by division. Classifies only fully source-reviewed UFC profiles.
 * This is an editorial rule-based designation, not an official UFC ranking.
 */
(function(scope){
"use strict";
const source=x=>typeof x==="string"&&/^https:\/\/[^/\s]+\/\S+/i.test(x)&&!/google\.com\/search/i.test(x);
const numeric=x=>Number.isInteger(x)&&x>=0;
const ratio=(a,b)=>b>0?a/b:0;
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const isFinish=m=>/\b(KO|TKO|SUBMISSION|SUB|CHOKE|ARMBAR|NECK CRANK)\b/i.test(String(m||""));
const bounded=(n,min,max)=>Math.min(max,Math.max(min,n));
const day=x=>/^\d{4}-\d\d-\d\d$/.test(x||"");
function classify(f,power){
 const invalid=(reason)=>({label:"Unassessed",score:null,reason,version:1,eligible:false});
 if(!f||f.organisation!=="UFC"||f.sport!=="MMA")return invalid("Outside the UFC-only scouting scope");
 if(f.category==="Champion"&&source(f.source)&&f.review?.credentialsChecked)
  return {label:"Champion",score:null,reason:"Verified dated UFC championship snapshot",eligible:true,version:1};
 const ur=f.ufcRecord,review=f.review,latest=f.latest;
 if(!source(f.source)||!/ufc\.com\/athlete\//.test(f.source)||
   !source(ur?.source)||!day(ur?.checkedAt)||!ur?.complete||
   !review?.credentialsChecked||!day(review.checkedAt)||
   !Array.isArray(latest)||latest.length<2||latest.length>5||
   !latest.every(x=>day(x?.date)&&source(x?.source)&&x?.opponent&&
    ["W","L","D","NC"].includes(x.outcome)&&x.method)||
   !numeric(ur.wins)||!numeric(ur.losses)||!numeric(ur.draws||0)||
   ur.wins+ur.losses+(ur.draws||0)<2)
  return invalid("A complete dated official UFC record and at least two individually sourced results are required");
 // The most recent results must form a continuous, newest-first verified
 // UFC slice. Omitted intervening results must be corrected by an auditor.
 for(let i=1;i<latest.length;i++)if(latest[i].date>latest[i-1].date)
  return invalid("UFC bout history is not in chronological order");
 const total=ur.wins+ur.losses+(ur.draws||0)+(ur.noContests||0);
 if(total<latest.length)return invalid("Recent UFC history exceeds verified UFC record");
 const recent=latest.filter(x=>x.outcome!=="NC");
 if(recent.length<2)return invalid("Insufficient decided UFC fights");
 const recentWin=recent.filter(x=>x.outcome==="W").length;
 const finishes=recent.filter(x=>x.outcome==="W"&&isFinish(x.method)).length;
 const pro=String(f.record||"").match(/^(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?/);
 if(!pro)return invalid("Verified professional win/loss record unavailable");
 const proWins=+pro[1],proLosses=+pro[2],proDraws=+(pro[3]||0);
 const proPct=ratio(proWins,proWins+proLosses+proDraws);
 if(proPct>1||ur.wins>proWins)return invalid("Professional and UFC records contradict each other");
 const verifiedRank=f.ranking&&Number.isInteger(f.ranking.rank)&&
   f.ranking.rank>=1&&f.ranking.rank<=15&&source(f.ranking.source)&&
   day(f.ranking.checkedAt)&&f.ranking.checkedAt<=review.checkedAt?
   f.ranking.rank:null;
 // Ranked victories require the opponent's rank AT THE TIME of that fight.
 const rankedWins=recent.filter(x=>x.outcome==="W"&&
  Number.isInteger(x.opponentRankAtFight)&&x.opponentRankAtFight>=1&&
  x.opponentRankAtFight<=15&&source(x.opponentRankSource)&&
  day(x.opponentRankCheckedAt)&&x.opponentRankCheckedAt<=x.date).length;
 const scored=power?.evaluate&&f.verifiedStats?
  power.evaluate({stats:f.verifiedStats,credentials:f.credentials||[],
   recent:{fights:f.verifiedStats.sampleBouts}},latest):[];
 const dimensions=scored.filter(x=>x.id!=="form"&&x.baseScore!==null);
 // Optional measured skills contribute only when supported by a UFC-only sample.
 const measurable=f.verifiedStats?.scope==="ufc-only"&&dimensions.length>=2?
  bounded(dimensions.reduce((a,x)=>a+x.baseScore,0)/dimensions.length/100,0,1):null;
 const bonus=power?.credentialBonuses?
  power.credentialBonuses({credentials:f.credentials||[]}):{};
 const verifiedBonusPoints=Object.values(bonus).reduce((sum,x)=>
  sum+(numeric(x.points)?x.points:0),0);
 const components={
  establishedUfcWins:35*bounded(ur.wins/4,0,1),
  recentForm:28*ratio(recentWin,recent.length),
  finishes:15*ratio(finishes,recent.length),
  rankedOpposition:10*bounded(rankedWins/2,0,1),
  statisticalSkill:measurable===null?null:8*measurable,
  sourcedCredentials:4*bounded(verifiedBonusPoints/12,0,1)
 };
 const score=Math.round(Object.values(components).reduce((a,v)=>a+(v||0),0)*10)/10;
 const lastWin=latest[0].outcome==="W";
 // Official top-15 ranking may establish contender status even with a
 // relatively short sample; always require a genuine recent win.
 const contender=lastWin&&(
  (verifiedRank!==null&&ur.wins>=1&&total>=2)||
  (ur.wins>=4&&total>=4&&ratio(recentWin,recent.length)>=.70&&score>=72));
 const age=Number.isInteger(f.age)&&f.age>=17&&f.age<=65?f.age:null;
 // No arbitrary top-three or per-division quota; any qualifying athlete
 // can be a prospect. Late starters can qualify through a short UFC tenure.
 const prospect=lastWin&&ur.wins>=1&&proWins>=5&&proPct>=.65&&
  (age!==null&&age<=30||total<=3)&&score>=35;
 const label=contender?"Contender":prospect?"Prospect":"Roster";
 const reasoning=contender?verifiedRank!==null?
  "Currently ranked UFC fighter, supported by a dated official source":
  "Established UFC win volume, strong recent results and sufficient finish evidence":
  prospect?"Developing UFC fighter with positive career evidence and recent winning form":
  "Does not currently meet evidence-backed contender or prospect thresholds";
 return {label,score,eligible:true,version:1,reason:reasoning,
  reviewedOn:review.checkedAt,ufcBouts:total,ufcWins:ur.wins,
  recentDecisions:recent.length,recentWins:recentWin,ufcFinishesInRecent:finishes,
  verifiedRank,rankedWins,
  components:Object.fromEntries(Object.entries(components)
   .map(([k,v])=>[k,v===null?null:Math.round(v*10)/10])),
  criteria:{contenderUfcWins:4,contenderScore:72,prospectScore:35,
   contenderRecentWinRate:.70,prospectProWinRate:.65},
  note:"BEFN editorial classification, not an official UFC rank. No division quotas. Source gaps never contribute invented numerical credit."};
}
const api={classify};
scope.BEFNUfcClassifier=api;
if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
