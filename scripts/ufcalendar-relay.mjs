/**
 * UFCalendar Nov 2026: bounded follow-up runs using GitHub workflow_dispatch.
 * GitHub's cron has been dropping five-minute schedules; workflow_dispatch is
 * explicitly supported with the repository's GITHUB_TOKEN.
 *
 * Each chain has a hard 72-run/6-hour maximum, and the watchdog can seed a
 * fresh chain if a run stops. No PAT, paid Render cron, or new provider needed.
 * This module intentionally never reads or prints API credentials.
 */
import fs from 'node:fs';

export const INTERVAL_MS = 5 * 60_000;
export const RESEARCH_CEILING = 27_000;
export const MAX_RELAY_HOP = 71; // 72 total runs, watchdog recovers later.

const int = x => Number.isSafeInteger(Number(x)) ? Number(x) : NaN;
const yes = x => x === true || String(x).toLowerCase() === 'true';
export function isNovemberBurst(now) {
  return now.getUTCFullYear() === 2026 && now.getUTCMonth() === 10;
}

export function planRelay({now = new Date(), eventName='', inputs={}, progress={}, startedAt=0}={}) {
  if(!isNovemberBurst(now))return {enabled:false,reason:'November 2026 burst not active'};
  if(progress.status !== 'connected')return {enabled:false,reason:'Collector not connected or budget guard active'};
  const used=int(progress.provider?.usedAtStart),calls=int(progress.lastCalls);
  if(!Number.isFinite(used)||!Number.isFinite(calls))
    return {enabled:false,reason:'Usage state missing'};
  if(used+calls>=RESEARCH_CEILING)
    return {enabled:false,reason:'Research budget ceiling reached'};
  const continuous=eventName==='push'||(eventName==='workflow_dispatch'&&yes(inputs.continuous));
  if(!continuous)return {enabled:false,reason:'One-time/manual/maintenance run'};
  const hop=eventName==='push'?0:int(inputs.hop??0);
  if(!Number.isInteger(hop)||hop<0||hop>MAX_RELAY_HOP)
    return {enabled:false,reason:'Invalid or completed bounded chain'};
  if(hop===MAX_RELAY_HOP)
    return {enabled:false,reason:'Six-hour maximum reached; watchdog will recover if needed'};
  const startSec=int(startedAt);
  // If processing took longer than five minutes, dispatch immediately.
  // Waiting is bounded so an unusually slow run cannot be stranded here.
  const delayMs=Number.isFinite(startSec)&&startSec>0?
    Math.max(0,Math.min(INTERVAL_MS,startSec*1000+INTERVAL_MS-now.getTime())):0;
  return {enabled:true,hop:hop+1,delayMs,reason:'Five-minute bounded follow-up'};
}

export async function dispatchRelay({token,repository,hop,fetcher=fetch}){
  if(!token||!/^[-\w]+\/[-.\w]+$/.test(repository||''))
    throw Error('GitHub Actions dispatch unavailable');
  const url='https://api.github.com/repos/'+repository+'/actions/workflows/ufcalendar-rich-backfill.yml/dispatches';
  const res=await fetcher(url,{method:'POST',headers:{
    Accept:'application/vnd.github+json',
    Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28',
    'Content-Type':'application/json'
  },body:JSON.stringify({ref:'main',inputs:{continuous:'true',hop:String(hop)}})});
  if(res.status!==204)throw Error('GitHub dispatch returned HTTP '+res.status);
}

async function main(){
  const progress=JSON.parse(fs.readFileSync('data/ufcalendar-rich-progress.json','utf8'));
  let inputs={};
  try{inputs=JSON.parse(fs.readFileSync(process.env.GH_EVENT_PATH,'utf8')).inputs||{}}catch{}
  const plan=planRelay({
    eventName:process.env.GH_EVENT_NAME||'',inputs,progress,
    startedAt:process.env.BEFN_RELAY_STARTED_AT
  });
  console.log('UFCalendar relay:',plan.reason);
  if(!plan.enabled)return;
  if(plan.delayMs){
    console.log('Waiting '+Math.round(plan.delayMs/1000)+'s to target the next five-minute slot.');
    await new Promise(resolve=>setTimeout(resolve,plan.delayMs));
  }
  try{
    await dispatchRelay({token:process.env.GH_TOKEN,repository:process.env.GH_REPOSITORY,hop:plan.hop});
    console.log('Scheduled bounded UFC research relay hop '+plan.hop+'/'+MAX_RELAY_HOP+'.');
  }catch(err){
    // Do not create failure emails for a handoff; separate scheduled watchdog
    // can safely recover after 20 minutes if dispatch failed.
    console.warn('::warning::UFC relay handoff failed; watchdog fallback remains active: '+err.message);
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(err=>{console.error('::warning::Relay check unavailable: '+err.message) });
