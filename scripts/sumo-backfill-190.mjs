/**
 * Research-only, resumable career cache backfill for the frozen 190-rikishi
 * BEFN Sumo preview roster. No certification, scoring, publishing or deployments.
 *
 * A scheduled GitHub Actions runner checks out the dedicated research branch.
 * This script only fetches missing stages/pages and writes source-labelled
 * per-rikishi JSON cache plus a countable progress summary.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE='https://www.sumo-api.com/api';
const DATA_ROOT='data/sumo/backfill/v1';
const RIKISHI_DIR=join(DATA_ROOT,'rikishi');
const SUMMARY_PATH=join(DATA_ROOT,'summary.json');
const ROSTER_PATH='data/sumo/rikishi-index.json';
export const STAGES=['profile','stats','measurements','ranks','shikonas','matches'];
const PAGE_SIZE=200;
// The user approved maximum practical collection. Bound work by the GitHub
// runner window, never by a small arbitrary per-run request quota.
const RUN_SECONDS=Math.min(195,Math.max(30,Number(process.env.SUMO_WORK_SECONDS||165)));
const MIN_INTERVAL_MS=Math.max(150,Number(process.env.SUMO_REQUEST_INTERVAL_MS||300));
const QUICK_STAGES=STAGES.filter(s=>s!=='matches');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let runDeadline=Infinity;
let lastCallStarted=0;
let cooldownUntil=null;
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
export function nextBashoId(value){
  const raw=String(value||'');
  if(!/^\d{4}(01|03|05|07|09|11)$/.test(raw))return null;
  const y=Number(raw.slice(0,4)),m=Number(raw.slice(-2));
  return String(m===11?y+1:y)+String(m===11?1:m+2).padStart(2,'0');
}
/**
 * Source-evidenced unranked debut: a wrestler's first basho includes actual
 * Makushita bouts, but their first published banzuke rank arrives at the NEXT
 * tournament. Do not invent a rank for the debut tournament.
 */
export function unrankedDebutEvidence(doc){
  const debut=String(doc?.data?.profile?.debut||'');
  const firstPublished=doc?.data?.ranks?.map(x=>String(x.bashoId||'')).sort()[0];
  const actual=doc?.data?.ranks?.filter(x=>x.rank!=='Mae-zumo'&&x.rank!=='Banzuke-gai').length;
  const officialTotal=Number(doc?.data?.stats?.basho);
  const hasDebutBouts=doc?.stages?.matches?.complete&&
    doc.data.matches.some(x=>String(x.bashoId)===debut&&x.division==='Makushita');
  if(!hasDebutBouts||!nextBashoId(debut)||firstPublished!==nextBashoId(debut)||
     !Number.isSafeInteger(officialTotal)||officialTotal-actual!==1||
     doc.data.ranks.some(x=>String(x.bashoId)===debut))return null;
  return {bashoId:debut,firstPublishedRankBasho:firstPublished,
    status:'competed-before-first-published-banzuke-rank',
    evidence:'API debut basho, same-basho Makushita bouts, next-basho first rank, career basho count'};
}
export function nextStage(doc){
  return STAGES.find(s=>!doc.stages?.[s]?.complete&&(doc.stages?.[s]?.attempts||0)<3)||null;
}
export function stageStatus(doc){
  if(STAGES.every(s=>doc.stages?.[s]?.complete))return 'collected-not-certified';
  // A failing stage must not prevent collection of all the other fields.
  // Reserve "exception" for a fighter with no more automatically retriable work.
  if(!nextStage(doc)&&STAGES.some(s=>!doc.stages?.[s]?.complete))return 'exception';
  return 'partial';
}
export function endpoint(id,stage,skip=0){
  if(!positive(id))throw Error('Invalid rikishi id');
  if(!STAGES.includes(stage))throw Error('Unexpected research stage');
  const q=new URLSearchParams();
  if(stage==='profile'){
    // Plain profile path is already exercised by the existing Sumo preview.
    // Invalid extra query options previously returned HTTP 400 for all eight pilots.
    // Dedicated endpoints below collect the three histories independently.
    return SOURCE+'/rikishi/'+id;
  }
  if(stage==='stats')return SOURCE+'/rikishi/'+id+'/stats';
  if(stage==='matches')return SOURCE+'/rikishi/'+id+'/matches?limit='+PAGE_SIZE+'&skip='+skip;
  q.set('rikishiId',String(id));
  q.set('limit',String(PAGE_SIZE));
  q.set('skip',String(skip));
  q.set('sortOrder','asc');
  return SOURCE+'/'+stage+'?'+q;
}
export function terminalHistoryEvidence(doc){
  const id=Number(doc?.rikishiId),matches=doc?.data?.matches;
  const stats=doc?.data?.stats,stage=doc?.stages?.matches;
  const debut=String(doc?.data?.profile?.debut||'');
  if(!stage||!Array.isArray(matches)||!matches.length||
     !stage.skip||stage.skip!==matches.length||!stats||!debut||
     !matches.some(m=>String(m.bashoId)===debut))return null;
  const regular=matches.filter(m=>m.division!=='Mae-zumo'&&
    Number.isInteger(Number(m.day))&&Number(m.day)>=1&&Number(m.day)<=15);
  const wins=regular.filter(m=>Number(m.winnerId)===id).length;
  const losses=regular.filter(m=>Number(m.winnerId)!==id).length;
  if(regular.length!==Number(stats.totalMatches)||wins!==Number(stats.totalWins)||
     losses!==Number(stats.totalLosses))return null;
  return {regularBouts:regular.length,rawRows:matches.length,
    earliestBasho:debut,source:'source regular W-L totals and earliest debut match'};
}
export function combinePage(doc,stage,result,id){
  // Confirmed provider response contracts (GitHub runner, Nov 2026):
  // - measurement / rank / shikona change endpoints return bare arrays;
  // - rikishi matches returns {limit,skip,total,records}.
  // Supporting both full envelopes and arrays protects existing test fixtures.
  // The provider sometimes returns records:null at exactly the final
  // out-of-range match page. Treat as exhausted ONLY where every regular
  // career bout and the earliest debut match already reconcile independently.
  if(stage==='matches'&&isObject(result)&&result.records===null&&
     Number.isSafeInteger(Number(result.total))&&Number(result.total)>=0&&
     Number(result.total)<=doc.stages.matches.skip&&
     result.has_more!==true&&result.hasMore!==true&&
     Number.isSafeInteger(Number(result.limit))&&Number(result.limit)>0){
    const proof=terminalHistoryEvidence(doc);
    if(!proof)throw Error('Null matches page without independently reconciled career evidence');
    const state=doc.stages.matches;
    state.complete=true;
    state.terminalEmptyPage=proof;
    state.total=null;
    state.attempts=0;
    state.updatedAt=clock();
    state.source=endpoint(id,stage,state.skip);
    return;
  }
  const direct=Array.isArray(result);
  const collection=stage==='matches'?'records':stage;
  const provided=direct?result:result?.[collection]??(stage==='matches'?result?.matches:undefined);
  // Some empty terminal match pages return records:null instead of [].
  // Accept that only if all saved regular wins and losses *already agree*
  // with the career totals and the provider's reported total is exhausted.
  const stateForPage=doc.stages[stage],statsForPage=doc.data.stats;
  const savedRegular=stage==='matches'?(doc.data.matches||[]).filter(m=>
    m.division!=='Mae-zumo'&&Number(m.day)>=1&&Number(m.day)<=15):[];
  const savedWins=savedRegular.filter(m=>Number(m.winnerId)===Number(id)).length;
  const savedLosses=savedRegular.filter(m=>Number.isSafeInteger(Number(m.winnerId))&&
    Number(m.winnerId)>0&&Number(m.winnerId)!==Number(id)).length;
  const nullTerminalPage=stage==='matches'&&isObject(result)&&provided==null&&
    stateForPage.skip>0&&Number.isSafeInteger(Number(result.total))&&
    Number(result.total)>=0&&Number(result.total)<=stateForPage.skip&&
    statsForPage?.totalMatches!=null&&
    savedRegular.length===Number(statsForPage.totalMatches)&&
    savedWins===Number(statsForPage.totalWins)&&
    savedLosses===Number(statsForPage.totalLosses);
  const items=nullTerminalPage?[]:provided;
  if(!Array.isArray(items)){
    const keys=isObject(result)?Object.keys(result).slice(0,12).join(','):Array.isArray(result)?'array':'non-object';
    const msg=isObject(result)?String(result.message??result.error??'').slice(0,70):'';
    throw Error('Expected '+stage+' collection; shape='+keys+(msg?' detail='+msg:''));
  }
  if(direct&&stage==='matches')throw Error('Match response lacks pagination totals');
  const indicated=direct?null:result.rikishi_id??result.rikishiId;
  if(indicated!=null&&Number(indicated)!==Number(id))throw Error('Mismatched wrestler identity in '+stage);
  for(const item of items){
    if(!isObject(item))throw Error('Malformed '+stage+' item');
    if(item.rikishiId!=null&&Number(item.rikishiId)!==Number(id))throw Error('Cross-wrestler '+stage+' item');
  }
  const state=doc.stages[stage],total=direct?null:result.total==null?null:Number(result.total);
  const next=state.skip+items.length;
  // Some historical list endpoints enforce an undocumented 100-row page,
  // even when limit=200 is requested. For rank history, compare against the
  // fighter's independent career basho count rather than trusting page size.
  const knownBasho=Number(doc.data.stats?.basho)||0;
  const isFormalRank=x=>x.rank!=='Mae-zumo'&&x.rank!=='Banzuke-gai';
  const formalRanks=stage==='ranks'?
    doc.data.ranks.filter(isFormalRank).length+items.filter(isFormalRank).length:0;
  const more=direct?(items.length===PAGE_SIZE||
    (stage==='ranks'&&knownBasho>formalRanks)):
    (result.has_more??result.hasMore??(stage==='matches'
      ?items.length===PAGE_SIZE||(total!==null&&total>next)
      :(total===null?null:next<total)));
  // The match endpoint has been observed to report total=page length
  // (e.g., 200 of Ura's 763 career bouts). A full page is NOT a complete
  // career even if total equals the page size.
  if(direct&&items.length>PAGE_SIZE)throw Error('History API did not respect requested page limit for '+stage);
  // The match API is known to report skip=0 even when a skip query is used.
  // The overlapping-page check below protects against a genuinely ignored
  // cursor without trusting that inaccurate response field.
  if(!direct&&result.skip!=null&&Number(result.skip)!==state.skip&&
     !(stage==='matches'&&Number(result.skip)===0))throw Error('Unexpected '+stage+' page offset');
  if(!direct&&result.count!=null&&Number(result.count)!==items.length)throw Error('Unexpected '+stage+' page count');
  if(total!==null&&(!Number.isSafeInteger(total)||total<0||
      (next>total&&!(stage==='matches'&&total<=PAGE_SIZE))))
    throw Error('Invalid '+stage+' source total');
  if(more!=null&&typeof more!=='boolean')throw Error('Invalid '+stage+' has_more');
  if(items.length===0&&more===true)throw Error('Empty '+stage+' page despite more records');
  if(stage==='matches'&&total===null)throw Error('Missing pagination metadata for '+stage);
  if((total===null&&more===null)||
     (stage==='matches'&&!direct&&total===null&&result.has_more==null&&result.hasMore==null))
    throw Error('Missing pagination metadata for '+stage);
  if(total!==null&&more===false&&next<total)throw Error('Truncated '+stage+' page');
  if(total!==null&&more===true&&next>=total&&stage!=='matches')throw Error('Inconsistent '+stage+' pagination');
  const existing=doc.data[stage];
  const key=x=>x.id!=null?String(x.id):stage==='matches'?
    [x.bashoId,x.day,x.matchNo,x.eastId,x.westId].join(':'):JSON.stringify(x);
  const merged=new Map([...existing,...items].map(x=>[key(x),x]));
  if(state.skip>0&&merged.size<=existing.length&&!nullTerminalPage)
    throw Error('Repeated '+stage+' page; possible ignored skip');
  const complete=more===false;
  if(complete&&total!==null&&stage!=='matches'&&merged.size!==total){
    throw Error('Duplicate/missing records in '+stage+': '+merged.size+'/'+total);
  }
  // Page boundaries alone never establish a complete career; source totals
  // are compared with the career stats by the independent audit.
  if(stage==='matches'&&complete&&Number(doc.data.stats?.totalMatches)>merged.size){
    state.historyShortfall=Number(doc.data.stats.totalMatches)-merged.size;
  }else if(stage==='matches')state.historyShortfall=0;
  if(direct&&complete&&merged.size!==next)throw Error('Duplicate records in '+stage+' unwrapped history');
  // Atomic update: a rejected or duplicate page never moves the cursor.
  doc.data[stage]=[...merged.values()];
  state.skip=next;
  state.total=stage==='matches'&&total!==null&&total<=PAGE_SIZE?null:total;
  if(stage==='matches')state.lastReportedPageTotal=total;
  state.complete=complete;
  state.responseShape=direct?'direct-array':'paginated-envelope';
  state.updatedAt=clock();
  state.attempts=0;
  state.source=endpoint(id,stage,Math.max(0,next-items.length));
}
async function fetchApi(url){
  if(Date.now()>runDeadline)throw Error('GitHub runtime window exhausted');
  const interval=Math.max(0,lastCallStarted+MIN_INTERVAL_MS-Date.now());
  if(interval)await sleep(interval);
  lastCallStarted=Date.now();
  calls++;
  let response;
  try {
    response=await fetch(url,{headers:{'Accept':'application/json, text/plain;q=0.9','User-Agent':'BlackEyeFightNews/1.0 (sumo research; bounded-cache)'},signal:AbortSignal.timeout(TIMEOUT_MS)});
  } catch(err){const e=new Error('Sumo API network error: '+(err?.message||err));e.transient=true;throw e;}
  if(!response.ok){
    const errorBody=(await response.text().catch(()=>'')).
      replace(/[\r\n\t]/g,' ').slice(0,180);
    const e=new Error('Sumo API HTTP '+response.status+(errorBody?' · '+errorBody:''));
    e.transient=response.status===429||response.status>=500||response.status===408;
    e.status=response.status;
    const retryHeader=response.headers?.get('retry-after');
    const retry=retryHeader==null?NaN:Number(retryHeader);
    e.retryAfterSeconds=Number.isFinite(retry)&&retry>=0?Math.min(3600,retry):null;
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
  // One-time requeue for pilot exceptions caused by the old, malformed profile
  // query. Preserve audit error history; never retry it repeatedly each run.
  if(stored.profileRequestContract!==2){
    if(stored.stages.profile?.attempts>=3 &&
       stored.errors?.some(x=>x.stage==='profile'&&x.message==='Sumo API HTTP 400')){
      stored.stages.profile.attempts=0;
      stored.errors.push({at:clock(),stage:'profile',message:'Requeued after correcting unsupported query arguments',transient:false});
    }
    stored.profileRequestContract=2;
  }
  // Repair only known parser-version failures; preserve their error trails.
  if(stored.historyResponseContract!==2){
    for(const stage of ['measurements','ranks','shikonas','matches']){
      if(stored.errors?.some(x=>x.stage===stage&&/Expected paginated .* response/.test(x.message))){
        stored.stages[stage].attempts=0;
        stored.errors.push({at:clock(),stage,message:'Requeued after verifying actual upstream response envelope',transient:false});
      }
    }
    stored.historyResponseContract=2;
  }
  // Safely reopen legacy first pages that were incorrectly marked complete
  // when the upstream claimed total=200 despite much longer career totals.
  if(stored.matchPaginationContract!==3){
    const stage=stored.stages.matches,known=Number(stored.data.stats?.totalMatches)||0;
    if(stage?.complete&&stored.data.matches.length===PAGE_SIZE&&known>PAGE_SIZE){
      stage.complete=false;
      stage.total=null;
      stage.historyShortfall=known-stored.data.matches.length;
      stored.errors.push({at:clock(),stage:'matches',message:'Reopened 200-bout page: career stats indicate more history',transient:false});
    }
    stored.matchPaginationContract=3;
  }
  if(stored.rankPaginationContract!==2){
    const rankStage=stored.stages.ranks;
    const knownBasho=Number(stored.data.stats?.basho)||0;
    const actualRanks=stored.data.ranks||[];
    const formalRankCount=actualRanks.filter(x=>x.rank!=='Mae-zumo'&&x.rank!=='Banzuke-gai').length;
    if(rankStage?.complete&&actualRanks.length===100&&knownBasho>formalRankCount){
      rankStage.complete=false;
      rankStage.total=null;
      rankStage.skip=actualRanks.length;
      stored.errors.push({at:clock(),stage:'ranks',message:'Reopened provider-capped 100-entry ranking history',transient:false});
    }
    stored.rankPaginationContract=2;
  }
  if(stored.rankDebutContract!==1&&stored.stages.matches?.complete){
    const evidence=unrankedDebutEvidence(stored),stage=stored.stages.ranks;
    if(evidence&&!stage.complete){
      stage.complete=true;
      stage.attempts=0;
      stage.unrankedDebut=evidence;
      stored.errors.push({at:clock(),stage:'ranks',message:'Confirmed documented unranked debut tournament; no rank invented',transient:false});
    }
    stored.rankDebutContract=1;
    if(evidence)await saveJson(filePath(w.sourceId),stored);
  }
  if(stored.matchTerminalContract!==1){
    const stage=stored.stages.matches;
    const evidence=terminalHistoryEvidence(stored);
    const hasTerminalResponse=stored.errors?.some(x=>x.stage==='matches'&&
      /Expected matches collection; shape=limit,skip,total,records/.test(x.message));
    if(!stage.complete&&hasTerminalResponse&&evidence){
      stage.complete=true;
      stage.attempts=0;
      stage.total=null;
      stage.terminalEmptyPage=evidence;
      stored.errors.push({at:clock(),stage:'matches',
        message:'Terminal null records page accepted after strict regular W-L and debut-source reconciliation',transient:false});
      await saveJson(filePath(w.sourceId),stored);
    }
    stored.matchTerminalContract=1;
  }
  return stored;
}
async function summary(roster){
  const counts={pending:0,partial:0,exception:0,collected:0};
  const examples={partial:[],exception:[]};
  let requestsRequired=0,weightSnapshots=0,rankEntries=0,matchEntries=0;
  const stageTotals=Object.fromEntries(STAGES.map(s=>[s,{completed:0,blocked:0}]));
  for(const w of roster){
    const doc=await readJson(filePath(w.sourceId));
    if(!doc){counts.pending++;requestsRequired+=STAGES.length;continue;}
    const state=stageStatus(doc);
    if(state==='collected-not-certified')counts.collected++;
    else if(state==='exception'){counts.exception++;if(examples.exception.length<12)examples.exception.push(w.shikonaEn);}
    else {counts.partial++;if(examples.partial.length<12)examples.partial.push(w.shikonaEn);}
    for(const stage of STAGES){
      if(doc.stages?.[stage]?.complete)stageTotals[stage].completed++;
      else if((doc.stages?.[stage]?.attempts||0)>=3)stageTotals[stage].blocked++;
      else requestsRequired++;
    }
    weightSnapshots+=doc.data?.measurements?.length||0;
    rankEntries+=doc.data?.ranks?.length||0;
    matchEntries+=doc.data?.matches?.length||0;
  }
  return {
    schemaVersion:1,cohortSize:roster.length,scope:'Frozen November 2026 BEFN top-three banzuke roster',
    status:'research-data-only',certified:0,counts,weightSnapshots,rankEntries,matchEntries,
    outstandingStages:requestsRequired,stageTotals,exceptions:examples.exception,partialExamples:examples.partial,
    lastCheckedAt:clock(),source:SOURCE,maximumCallsPerScheduledRun:null,
    note:'Collected means API pagination completed. It does not imply historical accuracy, JSA agreement, official weight confirmation, copyright permission for photos, or certification.'
  };
}
/**
 * One coordinated writer, two independent queues:
 *  - quick: profile, stats, rankings, weights and shikona
 *  - history: remaining pages of every fighter's complete bout record
 * No duplicated requests for completed stages. A failing stage is retried at
 * most once in a run, while other fighters continue making progress.
 */
export function chooseWork(roster,docs,lane,attempted=new Set()){
  const stages=lane==='quick'?QUICK_STAGES:lane==='history'?['matches']:null;
  if(!stages)throw Error('Unsupported collection lane '+lane);
  const choices=[];
  for(const w of roster){
    const d=docs.get(w.sourceId)||newCache(w);
    if(lane==='history'&&(!d.stages.profile.complete||!d.stages.stats.complete))continue;
    const stage=stages.find(k=>!d.stages[k].complete&&d.stages[k].attempts<3&&!attempted.has(w.sourceId+':'+k));
    if(!stage)continue;
    choices.push({w,doc:d,stage,progress:lane==='history'?
      d.stages.matches.skip||0:QUICK_STAGES.filter(s=>d.stages[s].complete).length});
  }
  choices.sort((a,b)=>b.progress-a.progress||a.w.sourceId-b.w.sourceId);
  return choices[0]||null;
}
async function main(){
  const frozen=await readJson(ROSTER_PATH);
  if(frozen?.count!==190||frozen.rikishi?.length!==190)throw Error('Frozen 190-rikishi cohort unavailable');
  const roster=[...frozen.rikishi].sort((a,b)=>a.sourceId-b.sourceId);
  if(new Set(roster.map(x=>x.sourceId)).size!==190)throw Error('Duplicate rikishi source IDs');
  const prior=await readJson(SUMMARY_PATH);
  if(prior?.cooldownUntil&&Date.parse(prior.cooldownUntil)>Date.now()){
    console.log(JSON.stringify({status:'provider-cooldown',until:prior.cooldownUntil,apiCalls:0,certified:0}));
    return;
  }
  await mkdir(RIKISHI_DIR,{recursive:true});
  const docs=new Map();
  for(const w of roster)docs.set(w.sourceId,await ensureCache(w));
  const attempted=new Set(),changed=new Set();
  const runStart=Date.now();
  runDeadline=runStart+RUN_SECONDS*1000;
  const laneCalls={quick:0,history:0};
  const exceptions=[];
  let finished=false;
  while(Date.now()+TIMEOUT_MS+1500<runDeadline){
    // Two source requests for basic profile coverage per one request for
    // deeper history. When either queue empties, use all capacity on the other.
    const preferred=calls%3===2?'history':'quick';
    let selected=chooseWork(roster,docs,preferred,attempted);
    let lane=preferred;
    if(!selected){lane=preferred==='quick'?'history':'quick';selected=chooseWork(roster,docs,lane,attempted);}
    if(!selected){finished=true;break;}
    const {w,doc,stage}=selected,key=w.sourceId+':'+stage;
    try {
      await fillStage(doc,stage);
      changed.add(w.sourceId);
      laneCalls[lane]++;
      // Completed stage is never called again; a non-final match page may be
      // paged again in this run, with exact persisted skip.
      if(!doc.stages[stage].complete && stage!=='matches')attempted.add(key);
    }catch(err){
      const detail=String(err?.message||err).slice(0,220);
      doc.errors.push({at:clock(),stage,message:detail,transient:!!err.transient});
      doc.errors=doc.errors.slice(-12);
      if(!err.transient)doc.stages[stage].attempts++;
      attempted.add(key);
      changed.add(w.sourceId);
      exceptions.push({rikishiId:w.sourceId,stage,error:detail});
      if(err.transient){
        stoppedReason=detail;
        const seconds=err.retryAfterSeconds??(err.status===429?300:180);
        cooldownUntil=new Date(Date.now()+Math.max(60,seconds)*1000).toISOString();
        break;
      }
    }
  }
  for(const id of changed)await saveJson(filePath(id),docs.get(id));
  const report=await summary(roster);
  report.maximumCallsPerScheduledRun=null;
  report.requestPolicy='Maximize within the GitHub runner window; one source writer, paced, stop on 429/5xx, honor Retry-After';
  report.targetRunSeconds=RUN_SECONDS;
  report.requestIntervalMs=MIN_INTERVAL_MS;
  report.cooldownUntil=cooldownUntil;
  report.lastRun={
    at:clock(),elapsedSeconds:Math.round((Date.now()-runStart)/1000),
    apiCalls:calls,updatedRikishi:changed.size,laneCalls,
    failures:exceptions.slice(-16),stoppedReason,queuesExhausted:finished
  };
  // Keep latest operational report deterministic except a genuine run.
  await saveJson(SUMMARY_PATH,report);
  console.log(JSON.stringify({status:cooldownUntil?'rate-limited':'ok',
    requests:calls,changed:changed.size,elapsed:report.lastRun.elapsedSeconds,
    queues:laneCalls,counts:report.counts,remaining:report.outstandingStages,
    cooldownUntil,certified:0}));
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(err=>{console.error('Sumo backfill fatal: '+err.message);process.exitCode=1;});
}
