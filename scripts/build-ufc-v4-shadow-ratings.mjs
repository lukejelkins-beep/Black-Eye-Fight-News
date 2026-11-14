#!/usr/bin/env node
/**
 * BEFN V4 experimental UFC-only SHADOW performance ratings (model v4-shadow-0.1).
 * Inputs are previously archived observations. NO API calls, credentials,
 * live leaderboards, automatic publication, betting claims or tuned bonuses.
 *
 * Trial weights/scales are explicitly uncalibrated. Use walk-forward tests
 * before proposing any public classification/score migration.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const MODEL_VERSION="ufc-v4-shadow-0.1";
const SCORE_WEIGHTS=Object.freeze({striking:0.30,defence:0.22,
 wrestling:0.17,grappling:0.11,form:0.20});
const MIN_BOUTS=3;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const round=n=>Number.isFinite(n)?Math.round(n*1e4)/1e4:null;
const integer=n=>Number.isInteger(n)&&n>=0?n:null;
const signed=n=>Number.isInteger(n)?n:null;
const day=n=>/^\d{4}-\d{2}-\d{2}$/.test(String(n||""))?n:null;
const score=(v,lo,hi,invert=false)=>Number.isFinite(v)?
  clamp((invert?hi-v:v-lo)*100/(hi-lo),0,100):null;
const mul=(value,weight)=>({value,weight});
const weighted=values=>{
 let a=0,b=0;
 for(const {value,weight} of values){
  if(value===null||!Number.isFinite(value))return null;
  a+=value*weight;b+=weight;
 }
 return b?clamp(a/b,0,100):null;
};
function winsBefore(rows,asOf){
 const past=rows.filter(b=>day(b.date)&&b.date<asOf&&
  ["W","L","D"].includes(b.outcome));
 const wins=past.filter(b=>b.outcome==="W").length;
 const draws=past.filter(b=>b.outcome==="D").length;
 return {quality:(wins+0.5*draws+2)/(past.length+4),observations:past.length};
}
function priorOppStrength(b,allRows){
 const slug=String(b?.opponentSlug||"");
 if(!slug||!allRows.has(slug))return {quality:0.5,known:false};
 const t=winsBefore(allRows.get(slug),b.date);
 return {quality:t.observations>=2?t.quality:0.5,
  known:t.observations>=2};
}
function timeWeight(b,asOf){
 const age=(Date.parse(asOf+"T00:00:00Z")-Date.parse(b.date+"T00:00:00Z"))/86400000;
 if(!Number.isFinite(age)||age<=0)return 0;
 return Math.pow(0.5,age/(365.25*2));
}
function boutDimensions(b){
 const m=b.metrics||{},sec=integer(b.cageSec);
 if(!sec||sec>1500)return null;
 const n=k=>integer(m[k]),sg=signed(m.sigStrikeDifferential),
  ctl=signed(m.controlDifferentialSec);
 const strikes=n("sigLanded"),attempts=n("sigAttempted"),
  absorbed=n("sigAbsorbed"),knockdowns=n("knockdowns"),
  takedowns=n("takedowns"),tdAttempts=n("takedownAttempts"),
  subs=n("subAttempts"),reversals=n("reversals");
 const perMin=k=>k===null?null:k*60/sec;
 const per15=k=>k===null?null:k*900/sec;
 const accuracy=strikes!==null&&attempts>0&&strikes<=attempts?
  100*strikes/attempts:null;
 const tdAccuracy=takedowns!==null&&tdAttempts>0&&takedowns<=tdAttempts?
  100*takedowns/tdAttempts:tdAttempts===0&&takedowns===0?50:null;
 const striking=weighted([
  mul(score(perMin(sg),-3,3),0.40),
  mul(score(perMin(strikes),0.5,6.5),0.30),
  mul(score(accuracy,20,65),0.20),
  mul(score(per15(knockdowns),0,1.5),0.10)]);
 const wrestling=weighted([
  mul(score(per15(takedowns),0,5),0.40),
  mul(score(tdAccuracy,0,75),0.25),
  mul(score(per15(ctl),-300,350),0.35)]);
 const grappling=weighted([
  mul(score(per15(subs),0,2.5),0.70),
  mul(score(per15(reversals),0,1.4),0.30)]);
 const defence=weighted([
  mul(score(perMin(absorbed),0.8,6.5,true),0.55),
  mul(score(perMin(sg),-3,3),0.25),
  mul(score(per15(ctl),-300,350),0.20)]);
 return {striking,wrestling,grappling,defence};
}
function adjustForOpponent(value,quality){
 if(value===null)return null;
 const effect=(quality-0.5)*0.3;
 const scale=value>=50?1+effect:1-effect;
 return clamp(50+(value-50)*scale,0,100);
}
/** Ratings are provisional measures, NOT objectively certified skills. */
export function scoreFighter(rows,allRows,asOf,limit=5){
 if(!day(asOf)||!Array.isArray(rows)||!Number.isInteger(limit)||limit<3)
  throw Error("Valid UFC bouts, asOf date and horizon required");
 // The last 5/10 windows refer to the actual chronological UFC fights.
 // An NC must occupy its true position, NOT be replaced by an older decision.
 const chronological=rows.filter(b=>day(b.date)&&b.date<asOf&&
  String(b.boutId||""))
  .sort((a,b)=>b.date.localeCompare(a.date)||b.boutId.localeCompare(a.boutId))
  .slice(0,limit);
 const eligible=chronological.filter(b=>["W","L","D"].includes(b.outcome)&&
  integer(b.cageSec)>0);
 if(eligible.length<MIN_BOUTS)return {
  status:"insufficient_sample",bouts:eligible.length,
  fightsInChronologicalWindow:chronological.length,
  noContestsInWindow:chronological.filter(b=>b.outcome==="NC").length,
  overall:null,skills:null,effectiveBouts:0};
 const dimensions=["striking","wrestling","grappling","defence","form"];
 const accum=Object.fromEntries(dimensions.map(d=>[d,[]]));
 let seenStrong=0,weightedCount=0,weightSquares=0;
 for(const b of eligible){
  const w=timeWeight(b,asOf);if(!w)continue;
  const opponent=priorOppStrength(b,allRows);
  if(opponent.known)seenStrong++;
  const d=boutDimensions(b);
  if(!d)continue;
  for(const k of Object.keys(d))
   if(d[k]!==null)accum[k].push({value:adjustForOpponent(d[k],opponent.quality),weight:w});
  const raw=b.outcome==="W"?100:b.outcome==="D"?50:0;
  accum.form.push({value:adjustForOpponent(raw,opponent.quality),weight:w});
  weightedCount+=w;weightSquares+=w*w;
 }
 const effective=weightSquares>0?weightedCount*weightedCount/weightSquares:0;
 const skills={};
 for(const k of dimensions){
  const values=accum[k];
  if(values.length<MIN_BOUTS){skills[k]=null;continue;}
  const mean=weighted(values);
  const confidence=effective/(effective+6);
  skills[k]=mean===null?null:round(50+(mean-50)*confidence);
 }
 const complete=dimensions.every(k=>skills[k]!==null);
 const overall=complete?round(weighted(Object.entries(SCORE_WEIGHTS)
  .map(([k,weight])=>mul(skills[k],weight)))):null;
 return {status:complete?"provisional_ufc_only":"missing_technical_evidence",
  bouts:eligible.length,fightsInChronologicalWindow:chronological.length,
  noContestsInWindow:chronological.filter(b=>b.outcome==="NC").length,
  effectiveBouts:round(effective),
  opponentsWithPriorUfcResults:seenStrong,skills,overall,
  externalCredentialBonus:0};
}
function listBySlug(postfight){
 const all=new Map();
 for(const [slug,f] of Object.entries(postfight.fighters||{})){
  if(!Array.isArray(f?.careerBouts))continue;
  const rows=f.careerBouts.filter(x=>day(x.date)&&x.boutId&&
   x.metrics&&integer(x.cageSec)>0)
   .sort((a,b)=>b.date.localeCompare(a.date));
  if(new Set(rows.map(x=>x.boutId)).size!==rows.length)
   throw Error("Repeated UFC native bout ID for "+slug);
  all.set(slug,rows);
 }
 return all;
}
export function walkForwardBacktest(allRows,{from="2022-01-01"}={}){
 const seen=new Set(),byYear={},diagnostics={qualified:0,unqualified:0,
  incompletePair:0},observations=[];
 for(const [slug,rows] of allRows){
  for(const b of rows){
   if(!day(b.date)||b.date<from||seen.has(b.boutId))continue;
   seen.add(b.boutId);
   if(!["W","L"].includes(b.outcome))continue;
   const opponent=allRows.get(b.opponentSlug);
   const other=opponent?.find(x=>x.boutId===b.boutId);
   if(!other||other.opponentSlug!==slug||other.date!==b.date||
    other.outcome!==(b.outcome==="W"?"L":"W")){
    diagnostics.incompletePair++;continue;
   }
   const a=scoreFighter(rows,allRows,b.date,5);
   const c=scoreFighter(opponent,allRows,b.date,5);
   if(a.overall===null||c.overall===null){diagnostics.unqualified++;continue;}
   const probability=1/(1+Math.exp(-(a.overall-c.overall)/18));
   const actual=b.outcome==="W"?1:0,year=b.date.slice(0,4);
   const error=Math.pow(probability-actual,2);
   if(!byYear[year])byYear[year]={n:0,brierSum:0,correct:0};
   byYear[year].n++;byYear[year].brierSum+=error;
   byYear[year].correct+=(probability>=0.5)===(actual===1)?1:0;
   diagnostics.qualified++;
   observations.push({boutId:b.boutId,date:b.date,predicted:round(probability),
    actual,scoreA:a.overall,scoreB:c.overall});
  }
 }
 const years=Object.fromEntries(Object.entries(byYear).map(([k,v])=>
  [k,{n:v.n,brier:round(v.brierSum/v.n),
   accuracy:round(v.correct/v.n)}]));
 const total=Object.values(byYear).reduce((a,x)=>({
  n:a.n+x.n,brierSum:a.brierSum+x.brierSum,correct:a.correct+x.correct
 }),{n:0,brierSum:0,correct:0});
 return {scope:"strictly_pre_fight_UFC_observations",
  referenceBrier:0.25,
  fightsWithBothPrefightRatings:total.n,
  brier:total.n?round(total.brierSum/total.n):null,
  accuracy:total.n?round(total.correct/total.n):null,
  byYear:years,diagnostics,
  // No per-athlete rankings or individual betting-prediction feed.
  note:"Walk-forward descriptive evaluation, not fitted calibration; no future fight outcomes or later opponent records enter predictions. A 0.5 flat prediction has Brier 0.25. Review time-era and class biases before release."};
}
export function buildShadowRatings(approval,foundation,postfight,{asOf}={}){
 if(approval?.status!=="approved"||
   !Array.isArray(approval.approvedFighters)||approval.approvedFighters.length!==783||
   new Set(approval.approvedFighters).size!==783||
   foundation?.scope!=="ufc-only-v4-stat-foundation"||
   foundation.population!==783||
   postfight?.scope!=="ufc-only")
  throw Error("Approved V4 UFC-only source snapshots required");
 const date=asOf||foundation.asOf;
 const allRows=listBySlug(postfight),fighters={},
  summary={approved:783,fullyKnownCareerMatched:0,scoredLast5:0,
   scoredLast10:0,scoredCareer:0,insufficientSamples:0,
   excludedHistoryDiscrepancies:0,historicalCareersCertified:0};
 for(const slug of approval.approvedFighters){
  const f=foundation.fighters?.[slug];
  if(!f)throw Error("Missing approved UFC fighter "+slug);
  const rows=allRows.get(slug)||[];
  const matched=rows.length===f.knownCareerBouts&&
   f.windows?.career?.linkedMeasuredBouts===f.knownCareerBouts;
  if(matched)summary.fullyKnownCareerMatched++;
  else summary.excludedHistoryDiscrepancies++;
  if(f.ufcTimelineCertified||f.independentlyCertifiedCareer)summary.historicalCareersCertified++;
  const windows={};
  for(const [label,limit] of [["last5",5],["last10",10],["knownCareer",1000]]){
   const valid=matched?scoreFighter(rows,allRows,date,limit):
    {status:"historical_data_mismatch",overall:null,skills:null,
     bouts:rows.length,effectiveBouts:0};
   windows[label]=valid;
   if(valid.overall!==null)summary[label==="knownCareer"?"scoredCareer":
    label==="last5"?"scoredLast5":"scoredLast10"]++;
  }
  if(windows.last5.overall===null)summary.insufficientSamples++;
  fighters[slug]={name:f.name,slug,fullCareerCertified:!!(f.ufcTimelineCertified||
   f.independentlyCertifiedCareer),
   knownCareerBouts:f.knownCareerBouts,windows};
 }
 return {schema:1,scope:"ufc-only-shadow-ratings",version:MODEL_VERSION,
  status:"experimental_not_calibrated_not_public",
  asOf:date,externalCredentialBonusesApplied:false,
  summary,backtest:walkForwardBacktest(allRows),fighters,
  note:"Preliminary descriptive scores with deliberately uncalibrated weights, shrinkage and opponent priors. Never publish, change a prospect/contender classification, or feed production leaderboards until walk-forward evidence and owner approval."};
}
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
export function main(){
 const r=buildShadowRatings(
  read("data/ufc-36-month-roster-approval.json"),
  read("qa/ufc-v4-stat-foundation.json"),
  read("data/ufc-postfight-metrics.json"));
 fs.writeFileSync(path.join(root,"qa/ufc-v4-shadow-ratings.json"),
  JSON.stringify(r,null,2)+"\n");
 console.log("BEFN_V4_SHADOW_RATINGS "+JSON.stringify({
  ...r.summary,backtest:{fights:r.backtest.fightsWithBothPrefightRatings,
   brier:r.backtest.brier,flatBaseline:r.backtest.referenceBrier,
   accuracy:r.backtest.accuracy,byYear:r.backtest.byYear}}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
