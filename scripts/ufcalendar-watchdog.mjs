/**
 * GitHub cron only wakes the watchdog; it does not call the paid provider.
 * If the bounded relay stops, re-seed it after inspecting GitHub run state.
 */
import fs from 'node:fs';
import {isNovemberBurst,RESEARCH_CEILING,dispatchRelay} from './ufcalendar-relay.mjs';

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
  if(runs.some(run=>['queued','in_progress','waiting','pending','requested'].includes(run.status)))
    return {restart:false,reason:'Existing UFC collection job active or queued'};
  return {restart:true,reason:'UFC collection stale with no active job'};
}

async function getRuns(token,repository){
  const res=await fetch('https://api.github.com/repos/'+repository+'/actions/workflows/ufcalendar-rich-backfill.yml/runs?per_page=20',{
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
      'X-GitHub-Api-Version':'2022-11-28'}
  });
  if(!res.ok)throw Error('Could not check workflow run state, HTTP '+res.status);
  const body=await res.json();
  if(!Array.isArray(body.workflow_runs))throw Error('Invalid workflow run response');
  return body.workflow_runs;
}
async function main(){
  const token=process.env.GH_TOKEN,repository=process.env.GH_REPOSITORY;
  if(!token||!repository)throw Error('GitHub watchdog credentials unavailable');
  const progress=JSON.parse(fs.readFileSync('data/ufcalendar-rich-progress.json','utf8'));
  const runs=await getRuns(token,repository);
  const choice=shouldRestart({progress,runs});
  console.log('UFCalendar watchdog:',choice.reason);
  if(!choice.restart)return;
  try{
    await dispatchRelay({token,repository,hop:0});
    console.log('UFC research relay restarted at hop 0.');
  }catch(err){
    console.warn('::warning::Failed to restart UFC relay: '+err.message);
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(err=>{console.warn('::warning::UFC watchdog check skipped safely: '+err.message)});
