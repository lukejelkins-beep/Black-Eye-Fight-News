/* BEFN evidence-index model. These are descriptive indices, not predictions or
   medical/performance measurements. Missing evidence is never scored as zero. */
(function (scope) {
  "use strict";
  const normalize = s => String(s || "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const finite = (x, min, max) => typeof x === "number" && Number.isFinite(x) &&
    x >= min && x <= max ? x : null;
  const clamp = x => Math.min(100,Math.max(0,x));
  const scale = (v,low,high) => clamp(100*(v-low)/(high-low));
  const rating = parts => {
    const eligible=parts.filter(x=>x[0]!==null);
    if (!eligible.length) return null;
    const weight=eligible.reduce((sum,x)=>sum+x[1],0);
    return Math.round(eligible.reduce((sum,x)=>sum+x[0]*x[1],0)/weight);
  };
  function statsFor(profile) {
    const d=profile && profile.stats || {};
    // Require at least two recorded fights and a dated statistical observation.
    const observed=Number(profile?.recent?.fights||0)>=2 && !!d.observedOn;
    if (!observed) return {striking:null,grappling:null,defence:null};
    const slpm=finite(d.slpm,0,15),acc=finite(d.strAcc,0,100),
      td=finite(d.tdAvg,0,12),sub=finite(d.subAvg,0,10),
      sapm=finite(d.sapm,0,15),def=finite(d.strDef,0,100);
    return {
      striking:rating([
        [slpm===null?null:scale(slpm,1,6.5),.75],
        [acc===null?null:scale(acc,25,65),.25]
      ]),
      grappling:rating([
        [td===null?null:scale(td,0,5),.70],
        [sub===null?null:scale(sub,0,2.5),.30]
      ]),
      defence:rating([
        [sapm===null?null:scale(sapm,6,1),.75],
        [def===null?null:scale(def,35,75),.25]
      ])
    };
  }
  function normalizeHistory(input) {
    const seen=new Set();
    // Profile archives and provider histories are already most-recent-first.
    // Preserve that order rather than lexically sorting human-readable dates.
    return (Array.isArray(input)?input:[])
      .filter(x=>x && /^(win|loss|draw|w|l|d)$/i.test(String(x.result||x.outcome||"").trim()))
      .filter(x=>{
        const key=normalize(x.opponent)+":"+String(x.date||"");
        if(seen.has(key))return false;
        seen.add(key);return true;
      }).slice(0,5);
  }
  function recentForm(recent) {
    const results=normalizeHistory(recent).slice(0,3);
    if(results.length<2)return null;
    const weights=[3,2,1];
    let total=2,points=1; // two notional neutral results shrink tiny samples toward 50
    results.forEach((item,i)=>{
      const r=String(item.result||item.outcome||"").toLowerCase();
      const value=r==="w"||r==="win"?1:r==="d"||r==="draw"?.5:0;
      points+=value*weights[i];
      total+=weights[i];
    });
    return Math.round(100*points/total);
  }
  function cardioPace(evidence) {
    // Requires two independently observed bouts, each with significant-strike
    // pace in both early and round 3+ phases. A decision alone is not cardio data.
    const bouts=Array.isArray(evidence)?evidence:[];
    const eligible=bouts.filter(x=>x && finite(x.earlySigPerMinute,.1,20)!==null &&
      finite(x.lateSigPerMinute,0,20)!==null && Number(x.lateRound)>=3);
    if(eligible.length<2)return null;
    const ratios=eligible.map(x=>x.lateSigPerMinute/x.earlySigPerMinute);
    return Math.round(scale(ratios.reduce((a,b)=>a+b,0)/ratios.length,.5,1.15));
  }
  function evaluate(profile,history,paceEvidence) {
    const stats=statsFor(profile);
    return [
      {id:"striking",label:"Striking",score:stats.striking,description:"Significant strikes landed per minute; accuracy when available"},
      {id:"grappling",label:"Grappling",score:stats.grappling,description:"Takedown and submission activity; not overall ground skill"},
      {id:"defence",label:"Defence",score:stats.defence,description:"Strikes absorbed per minute; striking defence when available"},
      {id:"cardio",label:"Cardio",score:cardioPace(paceEvidence),description:"Late-round striking pace retained across at least two fights"},
      {id:"form",label:"Recent form",score:recentForm(history),description:"Recency-weighted results from up to three verified fights"}
    ];
  }
  function boxingPower(profile) {
    // KO win ratio is a measurable finishing proxy, NOT a punch-force test.
    const record=String(profile?.record||"");
    const m=record.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})(?:\s*[-–]\s*\d{1,3})?\s*\((\d{1,3})\s*KOs?\)/i);
    if(!m)return null;
    const wins=Number(m[1]),knockouts=Number(m[3]);
    if(wins<8||knockouts>wins)return null;
    return Math.round(100*knockouts/wins);
  }
  function evaluateBoxing(profile) {
    return [
      {id:"power",label:"Power",score:boxingPower(profile),description:"KO victories divided by total wins; finishing rate, not measured punch force"},
      {id:"defence",label:"Defence",score:null,description:"Requires consistent verified defensive statistics"},
      {id:"iq",label:"Fight IQ",score:null,description:"Cannot reliably quantify decision-making from a win-loss ledger"},
      {id:"footwork",label:"Footwork",score:null,description:"Requires validated technical scouting"},
      {id:"chin",label:"Chin",score:null,description:"Requires comprehensive knockdown/stoppage evidence"}
    ];
  }
  function level(n){
    if(n===null)return "unrated";
    if(n<35)return "red";
    if(n<55)return "orange";
    if(n<75)return "gold";
    return "green";
  }
  const api={normalize,normalizeHistory,recentForm,cardioPace,statsFor,evaluate,evaluateBoxing,boxingPower,level};
  scope.BEFNPowerIndex=api;
  if(typeof module==="object" && module && module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
