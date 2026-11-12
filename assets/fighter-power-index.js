/* BEFN Fighter Performance Index v2 (preview only)
 * Descriptive, evidence-gated 0–100 activity indices. Not objective skill grades,
 * win probabilities or betting advice. Zero is valid evidence; missing is null.
 * Never mix screenshots marked unverified into scoring inputs.
 */
(function(scope){
 "use strict";
 const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const clamp=(x,lo=0,hi=100)=>Math.max(lo,Math.min(hi,x));
 const finite=(v,lo=0,hi=Infinity)=>typeof v==="number"&&Number.isFinite(v)&&v>=lo&&v<=hi?v:null;
 const between=(n,lo,hi)=>n===null?null:clamp((n-lo)*100/(hi-lo));
 const pct=v=>{
  const n=finite(v,0,100);
  return n===null?null:n<=1&&n>0?n*100:n;
 };
 const byRate=(count,seconds,scale)=>count===null||seconds===null?null:count*scale/seconds;
 const sumParts=(items,totalWeight,minCoverage,minParts=2)=>{
  const valid=items.filter(([v])=>v!==null&&Number.isFinite(v));
  const weight=valid.reduce((a,x)=>a+x[1],0);
  if(valid.length<minParts||weight<totalWeight*minCoverage)return null;
  return valid.reduce((a,[v,w])=>a+v*w,0)/weight;
 };
 const confidence=(score,n)=>{
  if(score===null)return null;
  // Bayesian-style neutral shrinkage: tiny samples never get extreme ratings.
  return Math.round(clamp(50+(score-50)*(n/(n+4))));
 };
 function normalizeHistory(items){
  const seen=new Set(),arr=[];
  for(const h of Array.isArray(items)?items:[]){
   if(!h)continue;
   const result=String(h.result||h.outcome||"").trim().toLowerCase();
   if(!["w","win","l","loss","d","draw","nc","no contest"].includes(result))continue;
   const key=norm(h.opponent)+":"+String(h.date||"");
   if(seen.has(key))continue;
   seen.add(key);
   arr.push({...h,result});
   if(arr.length>=5)break;
  }
  return arr;
 }
 function recentForm(items){
  // The original order is newest to oldest. NC is ignored in the score and
  // does not count as a defeat; it stays visible in the last-five table.
  const recent=normalizeHistory(items).filter(h=>!["nc","no contest"].includes(h.result));
  if(recent.length<2)return null;
  const recency=[5,4,3,2,1];
  let total=4,earned=2; // equivalent to four neutral-weight results
  recent.forEach((h,i)=>{
   const weight=recency[i];
   const value=["w","win"].includes(h.result)?1:["d","draw"].includes(h.result)?.5:0;
   earned+=weight*value;total+=weight;
  });
  return Math.round(100*earned/total);
 }
 // Aggregated records must describe stat-covered cage seconds and >=2 fights.
 // All raw optional numeric fields must be absent/null if the provider omitted them.
 function advancedData(evidence){
  const x=evidence&&evidence.verified===true?evidence:null;
  if(!x||!x.source||!/^https:\/\//.test(x.source))return null;
  const bouts=finite(x.sampleBouts,2,200);
  const seconds=finite(x.observedSeconds,600,3000000);
  if(!bouts||!seconds||seconds/bouts>2500)return null;
  const count=(k,max=100000)=>finite(x[k],0,max);
  const sg=count("sigLanded"),sgAttempts=count("sigAttempted"),
    absorbed=count("sigAbsorbed"),oppAttempts=count("oppSigAttempted"),
    tds=count("takedowns"),tdAttempts=count("takedownAttempts"),
    oppTds=count("opponentTakedowns"),oppTdAttempts=count("opponentTakedownAttempts"),
    sub=count("submissionAttempts"),rev=count("reversals"),
    control=count("controlSec",3000000),oppControl=count("opponentControlSec",3000000);
  const capPct=(a,b)=>a!==null&&b!==null&&b>=a&&b>=5?100*a/b:null;
  const oppDef=(landed,attempted)=>landed!==null&&attempted!==null&&attempted>=landed&&attempted>=5?100*(1-landed/attempted):null;
  return {
   bouts,source:x.source,observedOn:x.observedOn||null,
   slpm:byRate(sg,seconds,60),sapm:byRate(absorbed,seconds,60),
   strAcc:capPct(sg,sgAttempts),strDef:oppDef(absorbed,oppAttempts),
   td15:byRate(tds,seconds,900),tdAcc:capPct(tds,tdAttempts),
   tdDef:oppDef(oppTds,oppTdAttempts),
   sub15:byRate(sub,seconds,900),rev15:byRate(rev,seconds,900),
   controlShare:control===null?null:clamp(control/seconds,0,1),
   controlAgainst:oppControl===null?null:clamp(oppControl/seconds,0,1),
   kd15:byRate(count("knockdowns"),seconds,900),
   kdAgainst15:byRate(count("knockdownsAbsorbed"),seconds,900),
   koRate:count("koTkoWins")===null?null:clamp(count("koTkoWins")/bouts,0,1),
   subFinishRate:count("submissionWins")===null?null:clamp(count("submissionWins")/bouts,0,1)
  };
 }
 function careerData(profile){
  const stats=profile?.stats;
  if(!stats||!stats.observedOn||!String(stats.source||"").trim())return null;
  const n=finite(stats.sampleBouts,2,200)||finite(profile?.recent?.fights,2,30);
  if(!n)return null;
  return {
   bouts:n,source:String(stats.source),observedOn:stats.observedOn,
   slpm:finite(stats.slpm,0,20),sapm:finite(stats.sapm,0,20),
   strAcc:pct(stats.strAcc),strDef:pct(stats.strDef),
   td15:finite(stats.tdAvg,0,20),tdAcc:pct(stats.tdAcc),tdDef:pct(stats.tdDef),
   sub15:finite(stats.subAvg,0,12),
   rev15:finite(stats.revAvg,0,12),controlShare:finite(stats.controlShare,0,1),
   controlAgainst:finite(stats.controlAgainst,0,1),
   kd15:finite(stats.kdAvg,0,7),kdAgainst15:finite(stats.kdAgainstAvg,0,7),
   koRate:finite(stats.koTkoWinRate,0,1),subFinishRate:finite(stats.submissionWinRate,0,1)
  };
 }
 function metricSpecs(d){
  if(!d)return null;
  const diff=d.slpm!==null&&d.sapm!==null?d.slpm-d.sapm:null;
  return {
    striking:[
      [between(d.slpm,.8,6.5),.25,"Output (sig strikes/min)"],
      [between(diff,-2.0,3.0),.30,"Significant-strike differential/min"],
      [between(d.strAcc,25,65),.17,"Striking accuracy"],
      [between(d.kd15,0,1.0),.17,"Knockdowns/15"],
      [between(d.koRate,0,.50),.11,"KO/TKO wins per observed fight"]
    ],
    grappling:[
      [between(d.sub15,0,3.0),.42,"Submission attempts/15"],
      [between(d.subFinishRate,0,.35),.30,"Submission finishes per observed fight"],
      [between(d.rev15,0,2),.18,"Reversals/15"],
      [between(d.controlShare,0,.50),.10,"Control-time share (secondary context)"]
    ],
    wrestling:[
      [between(d.td15,0,5.5),.34,"Takedowns landed/15"],
      [between(d.tdAcc,20,65),.21,"Takedown completion rate"],
      [between(d.controlShare,0,.55),.28,"Control-time share"],
      [between(d.tdDef,40,95),.12,"Takedown defence"],
      [between(d.rev15,0,2),.05,"Reversals/15"]
    ],
    defence:[
      [between(d.sapm,6.0,1.2),.31,"Strikes absorbed/min (lower is better)"],
      [between(d.strDef,35,75),.29,"Significant-strike avoidance"],
      [between(d.tdDef,35,90),.22,"Takedown defence"],
      [between(d.kdAgainst15,1.0,0),.12,"Knockdowns received/15"],
      [between(d.controlAgainst,.50,0),.06,"Opponent control-time share"]
    ]
  };
 }
 const LABELS=[
  ["striking","Striking","Significant-strike output and differential, accuracy, knockdowns, KO/TKO evidence"],
  ["grappling","Grappling","Submission threats and finishes, reversals and secondary control"],
  ["wrestling","Wrestling","Takedowns, completion rate, top control and takedown defence"],
  ["defence","Defence","Strikes absorbed, strike/takedown defence, damage and opponent control"],
  ["form","Recent form","Recency-weighted results from up to five recorded fights, with NC excluded"]
 ];
 function evaluate(profile,history){
  const d=advancedData(profile?.performanceEvidence)||careerData(profile);
  const specs=metricSpecs(d);
  const n=d?.bouts||0;
  const scores={};
  if(specs){
   // Require sufficient independent dimensions, not single isolated highlights.
   scores.striking=confidence(sumParts(specs.striking,1,.50,2),n);
   // Grappling must include submission/reversal evidence; pure control is not enough.
   scores.grappling=specs.grappling.slice(0,3).some(x=>x[0]!==null)?
      confidence(sumParts(specs.grappling,1,.54,2),n):null;
   // Wrestling must include takedown activity plus at least another signal.
   scores.wrestling=specs.wrestling[0][0]!==null?
      confidence(sumParts(specs.wrestling,1,.53,2),n):null;
   // Require striking-based avoidance AND a second defensive measure.
   scores.defence=[specs.defence[0],specs.defence[1]].some(x=>x[0]!==null)?
      confidence(sumParts(specs.defence,1,.48,2),n):null;
  }
  const fights=normalizeHistory(history);
  scores.form=recentForm(fights);
  return LABELS.map(([id,label,description])=>({
   id,label,description,score:scores[id]??null,
   sample:id==="form"?fights.filter(h=>!["nc","no contest"].includes(h.result)).length:n,
   source:id==="form"?"Recorded recent fight results":d?.source||"No sourced statistics",
   observedOn:id==="form"?null:d?.observedOn||null,
   confidence:id==="form"?(fights.length>=5?"moderate":"limited"):n>=8?"moderate":"limited"
  }));
 }
 function aggregateRoundPreviews(events){
  // Consume the curated, already-loaded fight-card round previews. Each bout
  // must have a confirmed round, clock, and continuous first-through-final
  // round stats; never assume a finish occurred at the end of its round.
  const buckets=new Map(),all=Object.values(events||{});
  for(const event of all){
   if(!event||!["ufc","pfl"].includes(String(event.org||"").toLowerCase())||!Array.isArray(event.bouts))continue;
   for(const fight of event.bouts){
    const result=fight?.result,rounds=fight?.roundPreview;
    if(!result||!Array.isArray(rounds)||!rounds.length||typeof fight.a!=="string"||typeof fight.b!=="string")continue;
    const round=Number(result.round);
    const match=String(result.time||"").trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!Number.isInteger(round)||round<1||round>5||!match||Number(match[1])>5||Number(match[2])>=60)continue;
    const elapsed=(round-1)*300+Number(match[1])*60+Number(match[2]);
    if(elapsed<30||elapsed>1500||rounds.length!==round||!rounds.every((x,i)=>Number(x.round)===i+1))continue;
    const sum=(c,field)=>{
     const values=rounds.map(x=>x?.[c]?.[field]);
     return values.every(n=>Number.isInteger(n)&&n>=0)?values.reduce((a,n)=>a+n,0):null;
    };
    [["a","b"],["b","a"]].forEach(([corner,opposite])=>{
     const name=fight[corner],key=norm(name);
     if(!key)return;
     const stats={
      sigLanded:sum(corner,"sigLanded"),sigAttempted:sum(corner,"sigAttempted"),
      sigAbsorbed:sum(opposite,"sigLanded"),oppSigAttempted:sum(opposite,"sigAttempted"),
      takedowns:sum(corner,"takedowns"),takedownAttempts:sum(corner,"takedownAttempts"),
      opponentTakedowns:sum(opposite,"takedowns"),opponentTakedownAttempts:sum(opposite,"takedownAttempts"),
      controlSec:sum(corner,"controlSec"),opponentControlSec:sum(opposite,"controlSec"),
      submissionAttempts:sum(corner,"subAttempts"),reversals:sum(corner,"reversals"),
      knockdowns:sum(corner,"knockdowns"),knockdownsAbsorbed:sum(opposite,"knockdowns")
     };
     // Basic validity: no landed strikes/takedowns can exceed attempts.
     if(stats.sigLanded===null||stats.sigAttempted===null||
       stats.sigAbsorbed===null||stats.oppSigAttempted===null||
       stats.sigLanded>stats.sigAttempted||stats.sigAbsorbed>stats.oppSigAttempted||
       (stats.takedowns!==null&&stats.takedownAttempts!==null&&stats.takedowns>stats.takedownAttempts))return;
     if(stats.controlSec!==null&&stats.controlSec>elapsed)return;
     const id=String(event.date||"")+":"+norm(fight.a)+":"+norm(fight.b);
     if(!buckets.has(key))buckets.set(key,new Map());
     buckets.get(key).set(id,{date:String(event.date||""),seconds:elapsed,stats});
    });
   }
  }
  const out=new Map();
  for(const [key,rowsMap] of buckets){
   const rows=[...rowsMap.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
   if(rows.length<2)continue;
   const combined={source:"https://www.ufcalendar.com/",verified:true,
     observedOn:rows[0].date||null,sampleBouts:rows.length,
     observedSeconds:rows.reduce((a,x)=>a+x.seconds,0)};
   for(const k of ["sigLanded","sigAttempted","sigAbsorbed","oppSigAttempted",
    "takedowns","takedownAttempts","opponentTakedowns","opponentTakedownAttempts",
    "controlSec","opponentControlSec","submissionAttempts","reversals","knockdowns","knockdownsAbsorbed"]){
    if(rows.every(x=>x.stats[k]!==null))combined[k]=rows.reduce((a,x)=>a+x.stats[k],0);
   }
   out.set(key,combined);
  }
  return out;
 }
 function boxingPower(profile){
  const m=String(profile?.record||"").match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})(?:\s*[-–]\s*\d{1,3})?\s*\((\d{1,3})\s*KOs?\)/i);
  if(!m)return null;
  const wins=Number(m[1]),kos=Number(m[3]);
  return wins>=8&&kos<=wins?Math.round(100*kos/wins):null;
 }
 function evaluateBoxing(profile){
  return [
   {id:"power",label:"Power",score:boxingPower(profile),description:"Career KO share of wins (finishing proxy; not punch force)"},
   {id:"defence",label:"Defence",score:null,description:"Needs verified defensive numbers"},
   {id:"iq",label:"Fight IQ",score:null,description:"Needs verified technical scouting"},
   {id:"footwork",label:"Footwork",score:null,description:"Needs verified movement analysis"},
   {id:"chin",label:"Chin",score:null,description:"Needs opponent knockdown and stoppage records"}
  ];
 }
 function level(n){return n===null?"unrated":n<35?"red":n<55?"orange":n<75?"gold":"green"}
 const api={normalize:norm,normalizeHistory,recentForm,advancedData,careerData,aggregateRoundPreviews,evaluate,evaluateBoxing,boxingPower,level};
 scope.BEFNPowerIndex=api;
 if(typeof module==="object"&&module?.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
