/**
 * UFC-only period analytics, independently testable offline.
 * Not wired into public V3 profiles or leaderboards until complete UFC careers
 * and the 36-month eligibility roster have passed separate data/QA gates.
 *
 * One verified bout = one unique official UFC bout ID. A missing metric never
 * substitutes an older fight. Each measured metric has its own denominator.
 */
export const PERFORMANCE_PERIODS = Object.freeze([
  Object.freeze({id:"5", label:"Last 5", minFights:5}),
  Object.freeze({id:"10", label:"Last 10", minFights:10}),
  Object.freeze({id:"career", label:"UFC Career", minFights:1}),
]);
export const UFC_V3_HEADLINE_TILES = Object.freeze([
  Object.freeze({id:"record",label:"Record",type:"record"}),
  Object.freeze({id:"ko",label:"KO/TKO wins",type:"count"}),
  Object.freeze({id:"submission",label:"Submission wins",type:"count"}),
  Object.freeze({id:"slpm",label:"Sig. strikes/min",type:"rate"}),
  Object.freeze({id:"diffpm",label:"Net sig. strikes/min",type:"rate"}),
  Object.freeze({id:"kd15",label:"Knockdowns/15",type:"rate"}),
  Object.freeze({id:"td15",label:"Takedowns/15",type:"rate"}),
  Object.freeze({id:"control15",label:"Control time/15",type:"seconds"}),
  Object.freeze({id:"sub15",label:"Submission attempts/15",type:"rate"}),
]);

const isNumber=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
const isSigned=x=>typeof x==="number"&&Number.isFinite(x);
const clean=x=>Math.round(x*1e6)/1e6;
const isDate=x=>{
  if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const d=new Date(x+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
};
const normalizeOutcome=x=>{
  const s=String(x||"").trim().toUpperCase().replaceAll("_"," ");
  return ({WIN:"W",LOSS:"L",DRAW:"D","NO CONTEST":"NC"}[s]||s);
};

/**
 * The input must be a roster-verified fighter's UFC-only career bout history.
 * Non-UFC data cannot be admitted to this function when a promotion is stated.
 */
export function verifiedUfcBouts(bouts){
  if(!Array.isArray(bouts)) return [];
  const seen=new Set(),out=[];
  for(const item of bouts){
    if(!item||typeof item!=="object")continue;
    const id=String(item.boutId??"").trim();
    const outcome=normalizeOutcome(item.outcome??item.result);
    const promotion=String(item.promotion??item.org??"").trim().toUpperCase();
    if(!id||!isDate(item.date)||promotion!=="UFC"||
      !["W","L","D","NC"].includes(outcome)||seen.has(id))continue;
    seen.add(id);
    out.push({...item,boutId:id,outcome});
  }
  return out.sort((a,b)=>b.date.localeCompare(a.date)||a.boutId.localeCompare(b.boutId));
}

export function periodOptions(bouts){
  const total=verifiedUfcBouts(bouts).length;
  return PERFORMANCE_PERIODS.map(p=>({...p,enabled:total>=p.minFights}));
}

export function preferredPeriod(bouts){
  const options=periodOptions(bouts);
  return options.find(o=>o.id==="5"&&o.enabled)?.id||
    options.find(o=>o.id==="career"&&o.enabled)?.id||null;
}

export function selectUfcPeriod(bouts,period){
  const ordered=verifiedUfcBouts(bouts);
  const definition=PERFORMANCE_PERIODS.find(p=>p.id===period);
  if(!definition)throw new RangeError("Unknown UFC performance period: "+period);
  if(ordered.length<definition.minFights){
    return {period,available:false,totalVerifiedUfcBouts:ordered.length,bouts:[]};
  }
  return {period,available:true,totalVerifiedUfcBouts:ordered.length,
    bouts:period==="career"?ordered:ordered.slice(0,definition.minFights)};
}
const mOn=b=>b.stats?.metrics||b.metrics||null;
const secsOn=b=>b.stats?.cageSec??b.cageSec;
const tally=(rows,read,scale=1)=>{
  let sum=0,seconds=0,measured=0;
  for(const row of rows){
    if(!["W","L","D"].includes(row.outcome))continue;
    const sec=secsOn(row),v=read(mOn(row),row);
    if(!isNumber(sec)||sec===0||!isSigned(v))continue;
    seconds+=sec;sum+=v;measured++;
  }
  return measured?{value:clean(sum*scale/seconds),measuredBouts:measured,
    selectedBouts:rows.length,observedSeconds:seconds}:null;
};
const get=(m,key)=>isNumber(m?.[key])?m[key]:null;
const diff=m=>{
  const landed=get(m,"sigLanded"),absorbed=get(m,"sigAbsorbed");
  if(landed!==null&&absorbed!==null)return landed-absorbed;
  return isSigned(m?.sigStrikeDifferential)?m.sigStrikeDifferential:null;
};
const methodLabel=b=>String(b.method||"").toLowerCase();
function finishCount(rows,kind){
  let value=0,measured=0;
  for(const row of rows){
    if(!["W","L","D"].includes(row.outcome))continue;
    const method=methodLabel(row);
    // A win with an unverified method is not silently counted as no finish.
    if(row.outcome==="W"&&!method)continue;
    measured++;
    if(row.outcome==="W"&&(kind==="ko"?/\b(?:ko|tko|knockout)\b/i:
      /\b(?:submission|tap(?:ped)?)\b/i).test(method))value++;
  }
  return measured?{value,measuredBouts:measured,selectedBouts:rows.length}:null;
}
export function computeUfcPeriod(bouts,period){
  const selected=selectUfcPeriod(bouts,period);
  if(!selected.available)return {...selected,record:null,metrics:{}};
  const rows=selected.bouts;
  const wins=rows.filter(b=>b.outcome==="W").length;
  const losses=rows.filter(b=>b.outcome==="L").length;
  const draws=rows.filter(b=>b.outcome==="D").length;
  const noContests=rows.filter(b=>b.outcome==="NC").length;
  const metrics={
    ko:finishCount(rows,"ko"),
    submission:finishCount(rows,"submission"),
    slpm:tally(rows,m=>get(m,"sigLanded"),60),
    diffpm:tally(rows,diff,60),
    kd15:tally(rows,m=>get(m,"knockdowns"),900),
    td15:tally(rows,m=>get(m,"takedowns"),900),
    control15:tally(rows,m=>get(m,"controlSec"),900),
    sub15:tally(rows,m=>get(m,"subAttempts"),900),
  };
  return {...selected,record:{wins,losses,draws,noContests,
    display:[wins,losses,draws].join("-")},metrics};
}
