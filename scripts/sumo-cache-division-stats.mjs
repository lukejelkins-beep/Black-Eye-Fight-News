/**
 * One-off, responsibly paced preview cache of source-listed division records.
 * Fetches one Sumo API stats response per approved rikishi. No paid API,
 * invented 0-0 totals, production/main access, or unrelated source changes.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createSumoClient} from './sumo-api-source.mjs';

const roster=JSON.parse(await readFile('data/sumo/rikishi-index.json','utf8'));
if(roster.count!==190||roster.rikishi?.length!==190||roster.trackedDivisions?.join(',')!=='Makuuchi,Juryo,Makushita'){
  throw new Error('The Sumo preview roster differs from the approved 190-person cohort');
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const divisions=new Set(['Makuuchi','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi']);
function validMap(src){
  if(!src||typeof src!=='object'||Array.isArray(src))throw new Error('Division result map missing');
  const output={};
  for(const [division,value] of Object.entries(src)){
    if(!divisions.has(division)||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid source division record: '+division);
    output[division]=value;
  }
  return output;
}
function validated(raw){
  if(!raw||typeof raw!=='object')throw new Error('Empty stats API response');
  const winsByDivision=validMap(raw.winsByDivision);
  const lossByDivision=validMap(raw.lossByDivision);
  for(const division of new Set([...Object.keys(winsByDivision),...Object.keys(lossByDivision)])){
    if(!(division in winsByDivision)||!(division in lossByDivision))throw new Error('Incomplete W/L pair for '+division);
  }
  if(!Object.keys(winsByDivision).length)throw new Error('No source-listed division W/L');
  return {winsByDivision,lossByDivision,basho:raw.basho??null};
}
const bySourceId={};
const failures=[];
let requests=0;
for(let batch=0;batch<roster.rikishi.length;batch+=55){
  const client=createSumoClient({maxCalls:80,timeoutMs:16000});
  for(const w of roster.rikishi.slice(batch,batch+55)){
    let source=null,lastReason='not fetched';
    for(let attempt=1;attempt<=2;attempt++){
      try{
        source=validated(await client.stats(w.sourceId));
        break;
      }catch(error){
        lastReason=String(error?.message||error).slice(0,160);
        if(attempt<2)await sleep(1400);
      }
      await sleep(650);
    }
    requests+=source?1:2;
    if(source){
      bySourceId[String(w.sourceId)]={sourceId:w.sourceId,shikonaEn:w.shikonaEn,status:'available',stats:source};
    }else{
      failures.push({sourceId:w.sourceId,name:w.shikonaEn,reason:lastReason});
      bySourceId[String(w.sourceId)]={sourceId:w.sourceId,shikonaEn:w.shikonaEn,status:'unavailable',reason:lastReason};
    }
    // Deliberately low request rate: the upstream Sumo API is free to use but asks for care.
    await sleep(650);
  }
}
const available=Object.values(bySourceId).filter(row=>row.status==='available');
if(available.length<180)throw new Error('Only '+available.length+'/190 source division records available: refusing incomplete refresh');
const output={
  schemaVersion:1,source:'https://www.sumo-api.com/api',previewOnly:true,certified:false,
  collectedAt:new Date().toISOString(),cohortSize:roster.count,availableCount:available.length,
  unavailableCount:failures.length,
  note:'Historical division W/L totals as returned by Sumo API; incomplete or missing division records are not represented as zero. The current-basho record is shown separately from the live banzuke snapshot.',
  bySourceId
};
const path='data/sumo/division-stats.json',temp=path+'.tmp';
await writeFile(temp,JSON.stringify(output,null,2)+'\n','utf8');
await rename(temp,path);
console.log(JSON.stringify({
  result:'ok',cohort:roster.count,available:available.length,unavailable:failures.length,
  unavailableNames:failures.map(f=>f.name),
  sample:available.filter(x=>['Tokihayate','Daiseizan','Onosato'].includes(x.shikonaEn))
    .map(x=>({name:x.shikonaEn,makushita:x.stats.winsByDivision.Makushita+'-'+x.stats.lossByDivision.Makushita,
      makuuchi:x.stats.winsByDivision.Makuuchi+'-'+x.stats.lossByDivision.Makuuchi}))
}));
