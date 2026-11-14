/**
 * Research-only, resumable career cache backfill for the frozen 190-rikishi
 * BEFN Sumo preview roster. No certification, scoring, publishing or deployments.
 *
 * A scheduled GitHub Actions runner checks out the dedicated research branch.
 * This script only fetches missing stages/pages and writes source-labelled
 * per-rikishi JSON cache plus a countable progress summary.
 */
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE='https://www.sumo-api.com/api';
const DATA_ROOT='data/sumo/backfill/v1';
const RIKISHI_DIR=join(DATA_ROOT,'rikishi');
const SUMMARY_PATH=join(DATA_ROOT,'summary.json');
const ROSTER_PATH='data/sumo/rikishi-index.json';
export const STAGES=['profile','stats','measurements','ranks','shikonas','matches'];
const PAGE_SIZE=200;
const REQUEST_LIMIT=Math.min(8,Math.max(1,Number(process.env.SUMO_REQUEST_BUDGET||8)));
const MAX_FIGHTERS=Math.min(3,Math.max(1,Number(process.env.SUMO_FIGHTERS_PER_RUN||2)));
const TIMEOUT_MS=18_000;
let calls=0;
let stoppedReason=null;
const clock=()=>new Date().toISOString();
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const filePath=id=>join(RIKISHI_DIR,String(id)+'.json');
export async function readJson(path,fallback=null){
  try {return JSON.parse(await readFile(path,'utf8'));}
  catch(e){if(e?.code==='ENOENT')return fallback;throw e;}
}
async function saveJson(path,value){
  await mkdir(RIKISHI_DIR,{recursive:true});
  const temp=path+'.tmp';
  await writeFile(temp,JSON.stringify(value,null,2)+'\n');
  await rename(temp,path);
}
const stageInit=()=>({complete:false,skip:0,total:null,attempts:0,updatedAt:null});
export function newCache(r){
  return {
    schemaVersion:1,rikishiId:r.sourceId,nskId:r.officialNskId??null,
    sumoDbId:r.sumoDbId??null,shikonaEn:r.shikonaEn,source:SOURCE,
    researchOnly:true,certification:'not-started',
    stages:Object.fromEntries(STAGES.map(s=>[s,stageInit()])),
    data:{profile:null,stats:null,measurements:[],ranks:[],shikonas:[],matches:[]},
    errors:[]
  };
}
export function stageStatus(doc){
  if(STAGES.every(s=>doc.stages?.[s]?.complete))return 'collected-not-certified';
  if(STAGES.some(s=>(doc.stages?.[s]?.attempts||0)>=3))return 'exception';
  return 'partial';
}
export function endpoint(id,stage,skip=0){
  if(!positive(id))throw Error('Invalid rikishi id');
  if(!STAGES.includes(stage))throw Error('Unexpected research stage');
  const q=new URLSearchParams();
  if(stage==='profile'){
    q.set('includeMeasurements','true');
    q.set('includeRanks','true');
    q.set('includeShikonas','true');
    q.set('sortOrder','asc');
    return SOURCE+'/rikishi/'+id+'?'+q;
  }
  if(stage==='stats')return SOURCE+'/rikishi/'+id+'/stats';
  if(stage==='matches')return SOURCE+'/rikishi/'+id+'/matches?limit='+PAGE_SIZE+'&skip='+skip;
  q.set('rikishiId',String(id));
  q.set('limit',String(PAGE_SIZE));
  q.set('skip',String(skip));
  q.set('sortOrder','asc');
  return SOURCE+'/'+stage+'?'+q;
}
export function combinePage(doc,stage,result,id){
  const name=stage==='shikonas'?'shikonas':stage;
  if(!isObject(result)||!Array.isArray(result[name]))throw Error('Expected paginated '+stage+' response');
  const indicated=result.rikishi_id??result.rikishiId;
  if(indicated!=null&&Number(indicated)!==Number(id))throw Error('Mismatched wrestler identity in '+stage);
  for(const x of result[name]){
    if(!isObject(x))throw Error('Malformed '+stage+' item');
    if(x.rikishiId!=null&&Number(x.rikishiId)!==Number(id))throw Error('Cross-wrestler '+stage+' item');
  }
  const state=doc.stages[stage];
  const items=result[name];
  const total=result.total==null?null:Number(result.total);
  const more=result.has_more??result.hasMore;
  const next=state.skip+items.length;
  if(total!==null&&(!Number.isSafeInteger(total)||total<0||next>total))throw Error('Invalid '+stage+' source total');
  if(more!=null&&typeof more!=='boolean')throw Error('Invalid '+stage+' has_more');
  if(items.length===0&&more===true)throw Error('Empty '+stage+' page despite has_more');
  if(total===null&&more==null)throw Error('Missing pagination metadata for '+stage);
  if(total!==null&&more===false&&next<total)throw Error('Truncated '+stage+' page');
  if(total!==null&&more===true&&next>=total)throw Error('Inconsistent '+stage+' pagination');
  const existing=doc.data[stage];
  // The upstream supplies a stable source ID; fall back to the complete raw
  // object when IDs are absent. Never collapse bouts solely by basho.
  const key=x=>x.id==null?JSON.stringify(x):String(x.id);
  const merged=new Map([...existing,...items].map(x=>[key(x),x]));
  doc.data[stage]=[...merged.values()];
  state.skip=next;
  state.total=total;
  state.complete=more===false||(total!==null&&next===total&&more!==true);
  if(state.complete&&total!==null&&doc.data[stage].length!==total){
    throw Error('Duplicate/missing records in '+stage+': '+doc.data[stage].length+'/'+total);
  }
  state.updatedAt=clock();
  state.attempts=0;
  state.source=endpoint(id,stage,Math.max(0,next-items.length));
}
async function fetchApi(url){
  if(calls>=REQUEST_LIMIT)throw Error('Per-run request budget exhausted');
  calls++;
  let response;
  try {
    response=await fetch(url,{headers:{'Accept':'application/json, text/plain;q=0.9','User-Agent':'BlackEyeFightNews/1.0 (sumo research; bounded-cache)'},signal:AbortSignal.timeout(TIMEOUT_MS)});
  } catch(err){const e=new Error('Sumo API network error: '+(err?.message||err));e.transient=true;throw e;}
  if(!response.ok){
    const e=new Error('Sumo API HTTP '+response.status);
    e.transient=response.status===429||response.status>=500||response.status===408;
    throw e;
  }
  const raw=await response.text();
  if(raw.length>6_000_000||raw.length===0)throw Error('Invalid API response byte length');
  try {return JSON.parse(raw);}catch{throw Error('API did not return JSON');}
}
export async function fillStage(doc,stage,fetcher=fetchApi){
  const id=doc.rikishiId,state=doc.stages[stage],url=endpoint(id,stage,state.skip);
  const result=await fetcher(url);
  if(stage==='profile'){
    if(!isObject(result)||Number(result.id)!==id)throw Error('Profile identity mismatch');
    if(doc.nskId!=null&&result.nskId!=null&&Number(result.nskId)!==Number(doc.nskId))throw Error('Official JSA identity mismatch');
    doc.data.profile=result;
    state.complete=true;
  }else if(stage==='stats'){
    if(!isObject(result)||Array.isArray(result)||(!('totalMatches' in result)&&!('totalWins' in result)&&!('rikishi_id' in result)))throw Error('Invalid career totals response');
    if(result.rikishi_id!=null&&Number(result.rikishi_id)!==id)throw Error('Stats identity mismatch');
    doc.data.stats=result;
    state.complete=true;
  }else combinePage(doc,stage,result,id);
  state.updatedAt=clock();
  state.attempts=0;
  state.source=url;
}
async function ensureCache(w){
  const stored=await readJson(filePath(w.sourceId));
  if(!stored)return newCache(w);
  if(stored.schemaVersion!==1||Number(stored.rikishiId)!==w.sourceId||(stored.nskId!=null&&w.officialNskId!=null&&Number(stored.nskId)!==Number(w.officialNskId)))throw Error('Saved cache identity/schema conflict for '+w.shikonaEn);
  return stored;
}
async function summary(roster){
  const counts={pending:0,partial:0,exception:0,collected:0};
  const examples={partial:[],exception:[]};
  let requestsRequired=0,weightSnapshots=0,rankEntries=0,matchEntries=0;
  for(const w of roster){
    const doc=await readJson(filePath(w.sourceId));
    if(!doc){counts.pending++;requestsRequired+=STAGES.length;continue;}
    const state=stageStatus(doc);
    if(state==='collected-not-certified')counts.collected++;
    else if(state==='exception'){counts.exception++;if(examples.exception.length<12)examples.exception.push(w.shikonaEn);}
    else {counts.partial++;if(examples.partial.length<12)examples.partial.push(w.shikonaEn);}
    requestsRequired+=STAGES.filter(s=>!doc.stages?.[s]?.complete&&(doc.stages?.[s]?.attempts||0)<3).length;
    weightSnapshots+=doc.data?.measurements?.length||0;
    rankEntries+=doc.data?.ranks?.length||0;
    matchEntries+=doc.data?.matches?.length||0;
  }
  return {
    schemaVersion:1,cohortSize:roster.length,scope:'Frozen November 2026 BEFN top-three banzuke roster',
    status:'research-data-only',certified:0,counts,weightSnapshots,rankEntries,matchEntries,
    outstandingStages:requestsRequired,exceptions:examples.exception,partialExamples:examples.partial,
    lastCheckedAt:clock(),source:SOURCE,maximumCallsPerScheduledRun:REQUEST_LIMIT,
    note:'Collected means API pagination completed. It does not imply historical accuracy, JSA agreement, official weight confirmation, copyright permission for photos, or certification.'
  };
}
async function main(){
  const r=await readJson(ROSTER_PATH);
  if(r?.count!==190||!Array.isArray(r.rikishi)||r.rikishi.length!==190)throw Error('Refusing to run: frozen 190-rikishi roster unavailable');
  const roster=[...r.rikishi].sort((a,b)=>a.sourceId-b.sourceId);
  const first=roster.findIndex(x=>x.sourceId===28);
  if(first>=0)roster.unshift(roster.splice(first,1)[0]); // Ura test case first
  if(new Set(roster.map(x=>x.sourceId)).size!==190)throw Error('Duplicate source IDs in the approved cohort');
  await mkdir(RIKISHI_DIR,{recursive:true});
  let touched=0,processed=0;
  for(const w of roster){
    if(calls>=REQUEST_LIMIT||processed>=MAX_FIGHTERS||stoppedReason)break;
    const doc=await ensureCache(w);
    if(stageStatus(doc)==='collected-not-certified'||stageStatus(doc)==='exception')continue;
    processed++;
    let changed=false;
    while(calls<REQUEST_LIMIT){
      const stage=STAGES.find(s=>!doc.stages[s].complete&&doc.stages[s].attempts<3);
      if(!stage)break;
      try {
        await fillStage(doc,stage);
        changed=true;
        // A separate data request must never monopolise the free API.
        await new Promise(ok=>setTimeout(ok,650));
      }catch(err){
        const detail=String(err.message||err).slice(0,220);
        const transient=Boolean(err.transient);
        doc.errors.push({at:clock(),stage,message:detail,transient});
        doc.errors=doc.errors.slice(-12);
        if(!transient)doc.stages[stage].attempts++;
        changed=true;
        if(transient){stoppedReason=detail;break;}
        // A deterministic error is retried in a later scheduled run, not
        // repeatedly hammered in this run.
        break;
      }
    }
    if(changed){await saveJson(filePath(w.sourceId),doc);touched++;}
  }
  const report=await summary(roster);
  const prior=await readJson(SUMMARY_PATH);
  if(!prior||touched||JSON.stringify(report.counts)!==JSON.stringify(prior.counts)){
    await saveJson(SUMMARY_PATH,report);
  }
  console.log(JSON.stringify({status:'ok',calls,processed,updatedFiles:touched,stoppedReason,progress:report.counts,rankEntries:report.rankEntries,weightSnapshots:report.weightSnapshots,matchEntries:report.matchEntries}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(err=>{console.error('Sumo backfill fatal: '+err.message);process.exitCode=1;});
}
