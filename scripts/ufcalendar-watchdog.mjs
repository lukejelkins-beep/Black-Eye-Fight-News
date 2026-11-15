/**
 * GitHub cron only wakes the watchdog; it does not call the paid provider.
 * If the bounded relay stops, re-seed it after inspecting GitHub run state.
 */
import fs from 'node:fs';
import {isNovemberBurst,RESEARCH_CEILING,dispatchRelay,getCollectorRuns,activeCollectorRun} from './ufcalendar-relay.mjs';

export const STALE_MS = 20*60_000;
export function shouldRestart({now=new Date(),progress={},runs=[]}={}){
  if(!isNovemberBurst(now))return {restart:false,reason:'November burst not active'};
  if(progress.status!=='connected')return {restart:false,reason:'Collector not connected'};
  const used=Number(progress.provider?.usedAtStart);
  const calls=Number(progress.lastCalls);
  if(!Number.isFinite(used)||!Number.isFinite(calls)||used+calls>=RESEARCH_CEILING)
    return {restart:false,reason:'Monthly research ceiling or unknown usage'};
  const last=Date.parse(progress.lastRun||'');
  if(Number.isFinite(last)&&now.getTime()-last<STALE_MS)
    return {restart:false,reason:'Recent collected data exists'};
  if(activeCollectorRun(runs))
    return {restart:false,reason:'Existing UFC collection job active or queued'};
  return {restart:true,reason:'UFC collection stale with no active job'};
}

async function main(){
  const token=process.env.GH_TOKEN,repository=process.env.GH_REPOSITORY;
  if(!token||!repository)throw Error('GitHub watchdog credentials unavailable');
  const progress=JSON.parse(fs.readFileSync('data/ufcalendar-rich-progress.json','utf8'));
  const runs=await getCollectorRuns({token,repository});
  const choice=shouldRestart({progress,runs});
  console.log('UFCalendar watchdog:',choice.reason);
  if(!choice.restart)return;
  try{
    await dispatchRelay({token,repository,hop:0,sourceRunId:process.env.GH_RUN_ID,checkpointSha:process.env.GH_SHA});
    console.log('UFC research relay restarted at hop 0.');
  }catch(err){
    console.warn('::warning::Failed to restart UFC relay: '+err.message);
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(err=>{console.warn('::warning::UFC watchdog check skipped safely: '+err.message)});
