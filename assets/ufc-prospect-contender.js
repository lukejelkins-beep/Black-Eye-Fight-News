/* BEFN UFC Scout v2 — two independent editorial indices.
 * Prospect measures upside and trajectory; contender measures demonstrated
 * competitiveness against meaningful UFC opposition. NO division quotas.
 * Scores are descriptive rubrics, not calibrated probabilities or rankings.
 */
(function(scope){
"use strict";
const url=x=>typeof x==="string"&&/^https:\/\/[^/\s]+\/\S*/i.test(x)&&!/google\.com\/search/i.test(x);
const official=x=>url(x)&&/^https:\/\/(?:www\.)?ufc\.com\//i.test(x);
const date=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x)&&!Number.isNaN(Date.parse(x+"T00:00:00Z"));
const ageDays=(after,before)=>Math.round((Date.parse(after+"T00:00:00Z")-Date.parse(before+"T00:00:00Z"))/86400000);
const integer=x=>Number.isInteger(x)&&x>=0;
const bounded=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const rate=(a,b)=>b>0?a/b:0;
const round=n=>Math.round(n*10)/10;
const isFinish=m=>/\b(KO|TKO|SUBMISSION|SUB|CHOKE|ARMBAR|NECK CRANK|RNC)\b/i.test(String(m||""));
const rankAt=f=>{
 const r=f.ranking,checked=f.review?.checkedAt;
 return r&&Number.isInteger(r.rank)&&r.rank>=1&&r.rank<=15&&
  /^https:\/\/(?:www\.)?ufc\.com\/(?:rankings|news\/[^?#]+)/i.test(r.source||"")&&
  date(r.checkedAt)&&date(checked)&&ageDays(checked,r.checkedAt)>=0&&
  ageDays(checked,r.checkedAt)<=45?r.rank:null;
};
const qualifiedRankedWin=x=>x.outcome==="W"&&
 Number.isInteger(x.opponentRankAtFight)&&x.opponentRankAtFight>=1&&x.opponentRankAtFight<=15&&
 official(x.opponentRankSource)&&date(x.opponentRankCheckedAt)&&
 ageDays(x.date,x.opponentRankCheckedAt)>=0&&
 ageDays(x.date,x.opponentRankCheckedAt)<=90;
const qualifiedVeteranWin=x=>x.outcome==="W"&&
 integer(x.opponentUfcWinsAtFight)&&x.opponentUfcWinsAtFight>=4&&
 integer(x.opponentUfcFightsAtFight)&&x.opponentUfcFightsAtFight>=6&&
 x.opponentUfcFightsAtFight>=x.opponentUfcWinsAtFight&&
 url(x.opponentUfcRecordSource)&&date(x.opponentUfcRecordCheckedAt)&&
 ageDays(x.date,x.opponentUfcRecordCheckedAt)>=0&&
 ageDays(x.date,x.opponentUfcRecordCheckedAt)<=90;
function classify(f,power){
 const unknown=reason=>({label:"Unassessed",score:null,prospectIndex:null,
  contenderIndex:null,confidence:"Insufficient",eligible:false,reason,version:2});
 if(!f||f.organisation!=="UFC"||f.sport!=="MMA")return unknown("Not a verified UFC fighter profile");
 if(f.category==="Champion"&&official(f.source)&&f.review?.credentialsChecked===true){
  return {label:"Champion",score:null,prospectIndex:null,contenderIndex:null,
   confidence:"Snapshot",eligible:true,
   reason:"Verified UFC championship status is a separate dated titleholder designation",
   version:2};
 }
 const ur=f.ufcRecord,review=f.review,h=f.latest;
 if(!official(f.source)||!/\/athlete\//.test(f.source)||
    !official(ur?.source)||!date(ur?.checkedAt)||ur.complete!==true||
    !review?.credentialsChecked||!date(review.checkedAt)||
    !Array.isArray(h)||h.length<2||h.length>5||
    !h.every(x=>x?.opponent&&x.method&&date(x.date)&&url(x.source)&&
      ["W","L","D","NC"].includes(x.outcome))||
    !integer(ur.wins)||!integer(ur.losses)||!integer(ur.draws||0)||
    !integer(ur.noContests||0)){
  return unknown("Needs a complete dated UFC W-L-D/NC record and at least two sourced results");
 }
 if(h.some((x,i)=>i>0&&x.date>h[i-1].date)||
    h.some(x=>x.date>review.checkedAt)||
    ur.checkedAt>review.checkedAt)
  return unknown("Fight dates or UFC-record audit dates are inconsistent");
 const ufcBouts=ur.wins+ur.losses+(ur.draws||0)+(ur.noContests||0);
 if(ufcBouts<2||ufcBouts<h.length)return unknown("UFC results or record denominator incomplete");
 const pro=String(f.record||"").match(/^(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?/);
 if(!pro)return unknown("Verified overall professional W-L record unavailable");
 const proWins=+pro[1],proLosses=+pro[2],proDraws=+(pro[3]||0);
 if(proWins<ur.wins||proLosses<ur.losses||proDraws<(ur.draws||0))
  return unknown("Professional record conflicts with UFC results");
 const officialRank=rankAt(f);
 const rankedWins=h.filter(qualifiedRankedWin).length;
 const veteranWins=h.filter(x=>!qualifiedRankedWin(x)&&qualifiedVeteranWin(x)).length;
 const recent=h.filter(x=>x.outcome!=="NC");
 if(recent.length<2)return unknown("At least two decided UFC results are needed");
 const wins=recent.filter(x=>x.outcome==="W").length;
 const finishes=recent.filter(x=>x.outcome==="W"&&isFinish(x.method)).length;
 const streakLast2=recent.slice(0,2).filter(x=>x.outcome==="W").length;
 const weights=[5,4,3,2,1];
 const weighted=recent.reduce((sum,x,i)=>sum+weights[i]*
  (x.outcome==="W"?1:x.outcome==="D"?.5:0),0)/
  recent.reduce((sum,x,i)=>sum+weights[i],0);
 const proWinRate=rate(proWins,proWins+proLosses+proDraws);
 const ufcWinRate=rate(ur.wins,ur.wins+ur.losses+(ur.draws||0));
 const stat=f.verifiedStats;
 const ratings=stat?.scope==="ufc-only"&&url(stat.source)&&
  date(stat.observedOn)&&stat.observedOn<=review.checkedAt&&
  integer(stat.sampleBouts)&&stat.sampleBouts>=2&&power?.evaluate?
  power.evaluate({stats:stat,credentials:f.credentials||[],
   recent:{fights:stat.sampleBouts}},h):[];
 const measured=ratings.filter(x=>x.id!=="form"&&
   Number.isInteger(x.baseScore)&&x.baseScore>=0&&x.baseScore<=100);
 // Use BASE skill scores, not credential-adjusted scores: awards are included
 // once, in the separate fixed-point credential component.
 const skill=measured.length>=2?
  rate(measured.reduce((s,x)=>s+x.baseScore,0),100*measured.length):null;
 const confidenceSample=stat?bounded((stat.sampleBouts||0)/5):0;
 const bonuses=power?.credentialBonuses?
  power.credentialBonuses({credentials:f.credentials||[]}):{};
 const credentialPoints=Object.values(bonuses).reduce((s,x)=>s+
  (integer(x?.points)?x.points:0),0);
 const credentialFactor=bounded(credentialPoints/12);
 const finishFactor=rate(finishes,recent.length);
 const quality=rankedWins+veteranWins*.5;
 const ufcEstablishment=bounded(ufcBouts/6)*ufcWinRate;
 const recentTerm=bounded(recent.length/3)*
  (.65*ufcWinRate+.35*rate(streakLast2,Math.min(2,recent.length)));
 // Separate weights; each index is /100 and independently intelligible.
 const contenderParts={
  opponentQuality:25*bounded((quality+(officialRank===null?0:.5))/2),
  recentForm:25*weighted,
  UFCExperience:15*ufcEstablishment,
  measuredUFCPerformance:skill===null?null:20*skill*confidenceSample,
  verifiedFinishes:10*finishFactor,
  sourcedCredentials:5*credentialFactor
 };
 const prospectParts={
  recentTrajectory:30*weighted,
  UFCProgression:20*recentTerm,
  professionalFoundation:15*proWinRate*bounded((proWins+proLosses+proDraws)/8),
  finishingAbility:15*finishFactor,
  measuredUFCPerformance:skill===null?null:15*skill*bounded((stat.sampleBouts||0)/4),
  sourcedCredentials:5*credentialFactor
 };
 const sum=parts=>round(Object.values(parts).reduce((s,n)=>s+(n??0),0));
 const contenderIndex=sum(contenderParts),prospectIndex=sum(prospectParts);
 // Status cannot be bought by accumulating lower-quality opponents or gym
 // accolades. Without a fresh official rank or adequately sourced high-calibre
 // UFC victories, the contender gate is CLOSED regardless of the total score.
 const rankPath=officialRank!==null&&recent.length>=3&&
  weighted>=.50&&contenderIndex>=55;
 const qualifiedPath=ufcBouts>=4&&ur.wins>=3&&
  weighted>=.60&&(
   (rankedWins>=1&&contenderIndex>=60)||
   (veteranWins>=2&&ur.wins>=4&&contenderIndex>=67));
 const contender=rankPath||qualifiedPath;
 // A single loss does not automatically erase prospect status, and age is NOT
 // a hard cutoff. "Prospect" means a developing UFC career, not a youth award.
 const prospect=!contender&&ufcBouts<=9&&ur.wins>=1&&proWins>=5&&
  proWinRate>=.55&&wins>=1&&streakLast2>=1&&prospectIndex>=50;
 const label=contender?"Contender":prospect?"Prospect":"Roster";
 const gap=[];
 if(officialRank===null)gap.push("no fresh, verified official UFC ranking");
 if(quality<1)gap.push("high-calibre UFC opposition not yet established by dated sources");
 if(skill===null)gap.push("fewer than two verified statistical skill dimensions");
 if(recent.length<4)gap.push("short recent UFC results sample");
 const confidence=ufcBouts>=6&&recent.length>=4&&
  skill!==null&&quality>=1?"High":
  ufcBouts>=3&&recent.length>=3&&skill!==null?"Moderate":"Limited";
 const reason=contender?rankPath?
   "Proven contender: a fresh official UFC ranking plus credible current UFC form":
   "Proven contender: documented quality UFC victories and sustained winning form":
  prospect?"Emerging UFC talent: positive verified trajectory; contender-level opposition not yet established":
  "Reviewed UFC fighter, but current contender/prospect thresholds are not met";
 return {version:2,label,score:label==="Contender"?contenderIndex:prospectIndex,
  contenderIndex,prospectIndex,confidence,eligible:true,reason,
  reviewedOn:review.checkedAt,ufcBouts,ufcWins:ur.wins,recentDecisions:recent.length,
  recentWins:wins,ufcFinishesInRecent:finishes,verifiedRank:officialRank,
  rankedWins,veteranWins,qualityEvidence:round(quality),
  components:{
   contender:Object.fromEntries(Object.entries(contenderParts).map(([k,v])=>[k,v===null?null:round(v)])),
   prospect:Object.fromEntries(Object.entries(prospectParts).map(([k,v])=>[k,v===null?null:round(v)]))
  },evidenceGaps:gap,
  criteria:{contenderRankScore:55,contenderRankForm:.50,
   contenderRankedWinScore:60,contenderVeteranWinScore:67,
   prospectScore:50,prospectMaxUfcAppearances:9},
  note:"Editorial scouting rubric, not an official ranking or win forecast. Opponent quality gates contender designation. No per-division quotas. Unavailable stats are distinct from poor performance."};
}
const api={classify,version:2};
scope.BEFNUfcClassifier=api;
if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
