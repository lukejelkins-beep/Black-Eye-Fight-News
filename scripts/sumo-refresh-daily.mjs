/**
 * Refresh only the published daily Sumo data in the isolated BEFN preview.
 * Public source: sumo-api.com; never modifies roster, career history or main.
 * Requires an independently announced day-specific torikumi for upcoming bouts.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createSumoClient} from './sumo-api-source.mjs';
import {TRACKED_DIVISIONS,trackedBanzukeCohort,announcedTorikumiMatches,lastCompletedBashoDay,dayMatchups} from '../assets/sumo-data.mjs';

const PATH='data/sumo/preview-details.json';
const ROSTER='data/sumo/rikishi-index.json';
const now=new Date();
const capturedAt=now.toISOString();
const client=createSumoClient({maxCalls:8,timeoutMs:15000});
const [details,roster]=await Promise.all([PATH,ROSTER].map(async path=>JSON.parse(await readFile(path,'utf8'))));
const bashoId=String(details.bashoId||'');
if (!/^20[0-9]{4}$/.test(bashoId) || !Array.isArray(roster.rikishi) || roster.rikishi.length!==190 ||
    !TRACKED_DIVISIONS.every(d=>details.banzuke?.[d]?.status==='available')){
  throw new Error('Existing approved preview dataset is incomplete; refusing refresh');
}
function japanDay(iso){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw new Error('Invalid basho day dates');
  return Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(iso+'T00:00:00Z'))/86400000)+1;
}
const startDate=String(details.basho?.data?.startDate||'').slice(0,10);
const today=japanDay(startDate);
const nextDay=today+1;
const newBanzuke={};
for(const d of TRACKED_DIVISIONS){
  const fresh=await client.banzuke(bashoId,d);
  if(!Array.isArray(fresh?.east)||!Array.isArray(fresh?.west)||!fresh.east.length||!fresh.west.length)
    throw new Error('Unusable current banzuke from provider: '+d);
  newBanzuke[d]=fresh;
}
const validated=trackedBanzukeCohort(roster.rikishi,newBanzuke);
if(validated.count!==roster.count||TRACKED_DIVISIONS.some(d=>validated.divisionCounts[d]!==roster.divisionCounts[d]))
  throw new Error('Updated source banzuke changes the frozen preview roster; refusing refresh');
const nextDetails={...details,banzuke:{...details.banzuke}};
for(const d of TRACKED_DIVISIONS){
  const previous=details.banzuke[d].data;
  const newDay=lastCompletedBashoDay(newBanzuke[d]);
  const previousDay=lastCompletedBashoDay(previous);
  const newTotal=Array.from({length:15},(_,i)=>dayMatchups(newBanzuke[d],i+1).length).reduce((a,b)=>a+b,0);
  const oldTotal=Array.from({length:15},(_,i)=>dayMatchups(previous,i+1).length).reduce((a,b)=>a+b,0);
  if(newDay<previousDay||newTotal<oldTotal)
    throw new Error('Provider regressed published '+d+' results ('+newDay+'/'+newTotal+' vs '+previousDay+'/'+oldTotal+'); refusing refresh');
  nextDetails.banzuke[d]={status:'available',data:newBanzuke[d]};
}
// Poll the next JAPAN-local day only; never infer pairs from future banzuke slots.
const nextTorikumi={};
let scheduleCount=0;
if(nextDay>=1&&nextDay<=15){
  for(const division of TRACKED_DIVISIONS){
    try{
      const source=await client.torikumi(bashoId,division,nextDay);
      const rows=announcedTorikumiMatches(source,{bashoId,division,day:nextDay});
      if(rows.length){
        nextTorikumi[division]={status:'available',data:source};
        scheduleCount+=rows.length;
      }else nextTorikumi[division]={status:'unavailable',data:null,reason:'No confirmed next-day torikumi in current API response'};
    }catch(error){
      nextTorikumi[division]={status:'unavailable',data:null,reason:'Next-day schedule source temporarily unavailable'};
      console.warn(division+' day '+nextDay+' torikumi not yet available: '+String(error.message).slice(0,140));
    }
  }
}
nextDetails.announcedDay=scheduleCount?nextDay:null;
nextDetails.torikumi=nextTorikumi;
nextDetails.dailyCollectedAt=capturedAt;
nextDetails.dailyJstDay=(today>=1&&today<=15)?today:null;
nextDetails.dailyScheduleCount=scheduleCount;
nextDetails.dailySource='https://www.sumo-api.com/api';
nextDetails.dailyStatus=scheduleCount?'next-day-torikumi-published':'next-day-torikumi-not-yet-published';
const temp=PATH+'.tmp';
await writeFile(temp,JSON.stringify(nextDetails,null,2)+'\n','utf8');
await rename(temp,PATH);
console.log(JSON.stringify({
  status:'ok',bashoId,capturedAt,japanDay:today,nextDay,upcomingBouts:scheduleCount,
  completedThrough:Object.fromEntries(TRACKED_DIVISIONS.map(d=>[d,lastCompletedBashoDay(newBanzuke[d])])),
  torikumi:Object.fromEntries(TRACKED_DIVISIONS.map(d=>[d,nextTorikumi[d]?.data?.torikumi?.length||0]))
}));
