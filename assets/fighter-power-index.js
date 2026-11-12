/* BEFN Fighter Performance Index v3 (preview only)
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
      [between(d.slpm,.8,6.5),.18,"Significant strikes landed/min"],
      [between(diff,-2.0,3.0),.22,"Significant-strike differential/min"],
      [between(d.strAcc,25,65),.15,"Striking accuracy"],
      [between(d.kd15,0,1.0),.20,"Knockdowns/15"],
      [between(d.koRate,0,.50),.25,"KO/TKO finishes per recorded fight"]
    ],
    grappling:[
      [between(d.sub15,0,3.0),.30,"Submission attempts/15"],
      [between(d.subFinishRate,0,.35),.50,"Submission finishes per recorded fight"],
      [between(d.rev15,0,2),.15,"Reversals/15"],
      [between(d.controlShare,0,.50),.05,"Control-time share (secondary context)"]
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
 function metricFrom(d,id){
  if(!d)return null;
  const specs=metricSpecs(d);
  if(!specs)return null;
  if(id==="striking")
   return confidence(sumParts(specs.striking,1,.50,2),d.bouts);
  if(id==="grappling")
   return specs.grappling.slice(0,3).some(x=>x[0]!==null)?
    confidence(sumParts(specs.grappling,1,.45,2),d.bouts):null;
  if(id==="wrestling")
   return specs.wrestling[0][0]!==null?
    confidence(sumParts(specs.wrestling,1,.53,2),d.bouts):null;
  if(id==="defence")
   return [specs.defence[0],specs.defence[1]].some(x=>x[0]!==null)?
    confidence(sumParts(specs.defence,1,.48,2),d.bouts):null;
  return null;
 }

 // All numbers in the schedule are fixed, editorially chosen scouting bonuses,
 // not experimentally validated predictive coefficients. No credential creates
 // a statistical score; bonuses only augment an evidence-backed MMA baseline.
 const CREDENTIAL_CAP=12;
 const CREDENTIAL_SCHEDULE=Object.freeze({
  ncaa:Object.freeze({
   I:Object.freeze({gold:11,silver:10,bronze:9,participant:3,allAmericanExtra:2}),
   II:Object.freeze({gold:8,silver:7,bronze:6,participant:2,allAmericanExtra:1}),
   III:Object.freeze({gold:5,silver:4,bronze:3,participant:1,allAmericanExtra:1})
  }),
  "olympic-judo":Object.freeze({
   gold:Object.freeze({grappling:7,wrestling:9}),
   silver:Object.freeze({grappling:5,wrestling:7}),
   bronze:Object.freeze({grappling:4,wrestling:5}),
   participant:Object.freeze({grappling:1,wrestling:2})
  }),
  bjj:Object.freeze({black:4,brown:3,purple:2,blue:1,white:0}),
  adcc:Object.freeze({gold:8,silver:6,bronze:4}),
  sambo:Object.freeze({
   gold:Object.freeze({striking:3,grappling:5,wrestling:5}),
   silver:Object.freeze({striking:2,grappling:4,wrestling:4}),
   bronze:Object.freeze({striking:1,grappling:3,wrestling:3})
  }),
  "golden-gloves":Object.freeze({national:5,state:4,regional:3,junior:2,unspecified:1})
 });
 function credentialBonuses(profile){
  const best=new Map();
  const input=Array.isArray(profile?.credentials)?profile.credentials:[];
  const isSource=c=>typeof c?.source==="string"&&
   /^https:\/\//i.test(c.source)&&!/google\.com\/search/i.test(c.source);
  const offered=(group,c,points,label)=>{
   if(!Object.values(points).some(n=>n>0))return;
   const before=best.get(group);
   if(before && Object.values(before.points).reduce((a,v)=>a+v,0)>=
      Object.values(points).reduce((a,v)=>a+v,0))return;
   best.set(group,{group,points,label,source:c.source});
  };
  for(const c of input){
   if(!isSource(c)||["reported","pending","unverified","disputed"].includes(c.verification))continue;
   if(c.kind==="ncaa"){
    const tier=CREDENTIAL_SCHEDULE.ncaa[c.division];
    if(!tier)continue;
    const pos=Number.isInteger(c.placement)?c.placement:null;
    const medalPlace={gold:1,silver:2,bronze:3};
    const validMedal=c.medal&&medalPlace[c.medal]&&
      (pos===null||pos===medalPlace[c.medal])?c.medal:null;
    const allAmerican=pos!==null&&pos>=4&&pos<=8;
    const points=validMedal?tier[validMedal]:
      tier.participant+(allAmerican?tier.allAmericanExtra:0);
    offered("ncaa",c,{wrestling:points},"NCAA Division "+c.division+
      (validMedal?" "+validMedal+" medal":allAmerican?" All-American":" competitor"));
   }else if(c.kind==="olympic-judo"&&c.participated===true){
    const medal=["gold","silver","bronze"].includes(c.medal)?c.medal:"participant";
    const points=CREDENTIAL_SCHEDULE["olympic-judo"][medal];
    const count=medal!=="participant"&&Number.isInteger(c.medalCount)?
      Math.max(1,Math.min(3,c.medalCount)):1;
    // Repeat Olympic medals earn one extra point per additional medal,
    // maximum two extra. Do not multiply the full medal bonus by count.
    offered("olympic-judo",c,{
     grappling:points.grappling+count-1,wrestling:points.wrestling+count-1
    },"Olympic judo "+medal+(count>1?" ×"+count:""));
   }else if(c.kind==="bjj"){
    const n=CREDENTIAL_SCHEDULE.bjj[c.belt];
    if(Number.isInteger(n))
     offered("bjj",c,{grappling:n},"BJJ "+c.belt+" belt");
   }else if(c.kind==="adcc"){
    const n=CREDENTIAL_SCHEDULE.adcc[c.medal];
    if(Number.isInteger(n))
     offered("adcc",c,{grappling:n},"ADCC "+c.medal+" medal");
   }else if(c.kind==="sambo"){
    const p=CREDENTIAL_SCHEDULE.sambo[c.medal];
    if(!p)continue;
    // FIAS rules distinguish Combat SAMBO (strikes permitted) from
    // Sport SAMBO. Never credit striking without a sourced Combat award.
    offered("sambo",c,{striking:c.discipline==="combat"?p.striking:0,
     grappling:p.grappling,wrestling:p.wrestling},
     (c.discipline==="combat"?"Combat":"Sport")+" Sambo "+c.medal+" medal");
   }else if(c.kind==="golden-gloves"){
    const n=CREDENTIAL_SCHEDULE["golden-gloves"][c.level];
    if(Number.isInteger(n))
     offered("golden-gloves",c,{striking:n},"Golden Gloves "+c.level);
   }
  }
  const result={striking:{points:0,breakdown:[]},
    grappling:{points:0,breakdown:[]},
    wrestling:{points:0,breakdown:[]},
    defence:{points:0,breakdown:[]},
    form:{points:0,breakdown:[]}};
  for(const group of best.values()){
   for(const [id,n] of Object.entries(group.points)){
    if(!result[id]||!Number.isInteger(n)||n<=0)continue;
    result[id].breakdown.push({label:group.label,points:n,source:group.source});
   }
  }
  for(const entry of Object.values(result)){
   entry.breakdown.sort((a,b)=>b.points-a.points||a.label.localeCompare(b.label));
   entry.rawPoints=entry.breakdown.reduce((acc,x)=>acc+x.points,0);
   entry.points=Math.min(CREDENTIAL_CAP,entry.rawPoints);
  }
  return result;
 }
 function evaluate(profile,history){
  // Preserve each provider's denominator. Never combine career means with
  // selected-round statistics before the per-metric evidence check.
  const sources=[careerData(profile),advancedData(profile?.performanceEvidence)]
   .filter(Boolean).sort((a,b)=>b.bouts-a.bouts);
  const fights=normalizeHistory(history);
  const credentials=credentialBonuses(profile);
  return LABELS.map(([id,label,description])=>{
   if(id==="form")return {id,label,description,score:recentForm(fights),
    baseScore:recentForm(fights),credentialAdjustment:0,credentialBreakdown:[],
    sample:fights.filter(h=>!["nc","no contest"].includes(h.result)).length,
    source:"Recorded recent fight results",observedOn:null,
    confidence:fights.length>=5?"moderate":"limited"};
   let baseScore=null,selected=null;
   for(const d of sources){
    const candidate=metricFrom(d,id);
    if(candidate===null)continue;
    baseScore=candidate;selected=d;break;
   }
   const add=credentials[id];
   // Award the fixed point increase exactly, unless the 100 point ceiling
   // is reached. Keep source, base and point components visible to readers.
   const adjustment=baseScore===null?0:Math.max(0,Math.min(add.points,100-baseScore));
   const final=baseScore===null?null:baseScore+adjustment;
   return {
    id,label,description:description+
      (adjustment?"; +"+adjustment+" verified credential points":""),
    score:final,baseScore,credentialAdjustment:adjustment,
    credentialBreakdown:adjustment?add.breakdown:[],
    unusedCredentialPoints:baseScore===null?add.points:0,
    sample:selected?.bouts||0,source:selected?.source||"No sourced statistics",
    observedOn:selected?.observedOn||null,
    confidence:selected?.bouts>=8?"moderate":"limited"
   };
  });
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
 const api={normalize:norm,normalizeHistory,recentForm,advancedData,careerData,aggregateRoundPreviews,CREDENTIAL_SCHEDULE,CREDENTIAL_CAP,credentialBonuses,evaluate,evaluateBoxing,boxingPower,level};
 scope.BEFNPowerIndex=api;
 if(typeof module==="object"&&module?.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
