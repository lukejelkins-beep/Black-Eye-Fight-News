/**
 * BEFN Sumo: cache complete historical per-basho records for rolling form.
 * Reuses the approved Sumo API H2H full-bout ledger, so no new provider calls.
 * Source is API-trusted research, not independently JSA-certified. To avoid
 * misleading rates, only consecutive bashos with a complete expected count
 * (15 upper division, 7 lower division) may contribute.
 *
 * Run AFTER scripts/sumo-apply-live-bouts.mjs and after a successful banzuke refresh.
 * Updates only preview-details.json, already committed by the main scheduler.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const BASHO_HISTORY_MAX=30;
export function historicalBashos(currentId, count=BASHO_HISTORY_MAX){
 if(!/^20\d{2}(01|03|05|07|09|11)$/.test(String(currentId||'')))return [];
 const value=String(currentId);
 const dt=new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(4,6))-1,1));
 const result=[];
 for(let i=0;i<count;i++){
  dt.setUTCMonth(dt.getUTCMonth()-2);
  result.push(String(dt.getUTCFullYear())+String(dt.getUTCMonth()+1).padStart(2,'0'));
 }
 return result;
}
// The Sumo API names top-division ranks by title (Yokozuna 1 East,
// Maegashira 12 West), never "Makuuchi N". Missing these silently dropped
// every historical top-division basho from the rolling cache.
const MAKUUCHI_TITLES=new Set(['makuuchi','yokozuna','ozeki','sekiwake','komusubi','maegashira']);
export function divisionFromRank(rank){
 const match=String(rank||'').trim().match(/^(Makuuchi|Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\b/i);
 if(!match)return null;
 const word=match[1].toLowerCase();
 const division=MAKUUCHI_TITLES.has(word)?'Makuuchi':word[0].toUpperCase()+word.slice(1);
 return {division,expected:division==='Makuuchi'||division==='Juryo'?15:7};
}
const validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0;
/** Full old-basho rows only: rejects incomplete, ambiguous or missing match histories. */
export function buildHistoricalFacts({roster,details,career,history,max=BASHO_HISTORY_MAX}={}){
 const target=historicalBashos(details?.bashoId,Math.max(1,Math.min(BASHO_HISTORY_MAX,max)));
 if(!Array.isArray(roster?.rikishi)||roster.rikishi.length<1||!target.length)throw Error('Invalid Sumo cohort or basho');
 if(!history?.pairs||!career?.bySourceId)throw Error('Historical bout and rank caches are missing');
 const ids=new Set(roster.rikishi.map(w=>String(w.sourceId)));
 const wanted=new Set(target);
 const byId=new Map();
 const get=id=>{if(!byId.has(id))byId.set(id,new Map());return byId.get(id);};
 for(const [key,pair] of Object.entries(history.pairs)){
  if(!validId(pair?.a)||!validId(pair?.b)||pair.a===pair.b||!Array.isArray(pair.regular))continue;
  const a=String(pair.a),b=String(pair.b);
  if(!ids.has(a)&&!ids.has(b))continue;
  for(const bout of pair.regular){
   if(!Array.isArray(bout)||!wanted.has(String(bout[0])))continue;
   const basho=String(bout[0]),day=Number(bout[1]),winner=String(bout[2]);
   if(!Number.isInteger(day)||day<1||day>15||![a,b].includes(winner))continue;
   for(const id of [a,b]){
    if(!ids.has(id))continue;
    const map=get(id),record=map.get(basho)||new Map();
    const value=winner===id?'win':'loss';
    // Each wrestler should have at most one regular bout per tournament day.
    if(record.has(day))record.set(day,'conflict');
    else record.set(day,value);
    map.set(basho,record);
   }
  }
 }
 const bySourceId={},summary={};
 let qualified=0;
 for(const person of roster.rikishi){
  const id=String(person.sourceId),entry=career.bySourceId[id];
  const ranks=new Map(Array.isArray(entry?.rank)?entry.rank.filter(r=>r?.basho).map(r=>[String(r.basho),r.rank]):[]);
  const found=byId.get(id)||new Map(),verified={};
  for(const basho of target){
   const level=divisionFromRank(ranks.get(basho));
   const bouts=found.get(basho);
   if(!level||!bouts||bouts.size!==level.expected||[...bouts.values()].some(x=>x==='conflict'))continue;
   const wins=[...bouts.values()].filter(x=>x==='win').length;
   const losses=[...bouts.values()].filter(x=>x==='loss').length;
   if(wins+losses!==level.expected)continue;
   verified[basho]=[wins,losses,level.expected];
  }
  if(Object.keys(verified).length){bySourceId[id]=verified;qualified++;}
 }
 for(const window of [1,2,3,4,5,6,7,8,10,12,15,20,24,30]){
  summary[window]=Object.values(bySourceId).filter(period=>target.slice(0,window-1).every(b=>period[b])).length;
 }
 return {schemaVersion:1,rankParser:2,bashoId:String(details.bashoId),historicalBashos:target,
  bySourceId,coverage:{tracked:ids.size,hasAtLeastOneCompleteHistoricalBasho:qualified,
    qualifyingAcrossPreviousBashos:summary},source:'Sumo API complete cached regular-bout ledger plus dated rank history',
  note:'Only full recorded 15-bout top-two-division or 7-bout lower-division bashos count. Incomplete periods including absences are withheld. Yusho playoffs are excluded. Current basho comes separately from the fresh banzuke.'};
}
async function main(){
 const paths=['data/sumo/rikishi-index.json','data/sumo/preview-details.json','data/sumo/career-history.json','data/sumo/research-h2h-history.json'];
 const [roster,details,career,history]=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
 const rollup=buildHistoricalFacts({roster,details,career,history});
 // Do not leave the last successfully built snapshot in a partially written state.
 const next={...details,funFactsHistory:{...rollup,generatedAt:new Date().toISOString()}};
 const path=paths[1],tmp=path+'.facts.tmp';
 await writeFile(tmp,JSON.stringify(next,null,2)+'\n','utf8');
 await rename(tmp,path);
 console.log(JSON.stringify({status:'ok',basho:rollup.bashoId,
  cachedPastBashos:rollup.historicalBashos.length,coverage:rollup.coverage}));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 main().catch(error=>{console.error('Sumo rolling form cache:',error);process.exitCode=1;});
}
