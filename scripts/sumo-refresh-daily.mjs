/**
 * Refresh only the published daily Sumo data in the isolated BEFN preview.
 * Results/banzuke: sumo-api.com. Matchups (torikumi): the Japan Sumo Association's
 * own pages, read by scripts/sumo-jsa-scrape.mjs into data/sumo/jsa-torikumi.json.
 * Never modifies roster, career history or main.
 * Requires an independently announced day-specific torikumi for upcoming bouts.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createSumoClient} from './sumo-api-source.mjs';
import {jsaToTorikumiSource} from '../assets/sumo-jsa.mjs';
import {TRACKED_DIVISIONS,trackedBanzukeCohort,announcedTorikumiMatches,lastCompletedBashoDay,dayMatchups} from '../assets/sumo-data.mjs';

const PATH='data/sumo/preview-details.json';
const ROSTER='data/sumo/rikishi-index.json';
const now=new Date();
const capturedAt=now.toISOString();
const client=createSumoClient({maxCalls:8,timeoutMs:15000});
const JSA_PATH='data/sumo/jsa-torikumi.json';
const jsa=await readFile(JSA_PATH,'utf8').then(JSON.parse).catch(()=>null);
const [details,roster]=await Promise.all([PATH,ROSTER].map(async path=>JSON.parse(await readFile(path,'utf8'))));
const bashoId=String(details.bashoId||'');
if (!/^20[0-9]{4}$/.test(bashoId) || !Array.isArray(roster.rikishi) || roster.rikishi.length<100 ||
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
      const page=jsa?.bashoId===bashoId?jsa.pages?.[division]?.[nextDay]:null;
      const converted=page?.status==='available'
        ?jsaToTorikumiSource({rows:page.rows,roster:roster.rikishi,bashoId,division,day:nextDay}):null;
      if(converted?.dropped)console.warn(division+' day '+nextDay+': '+converted.dropped+' JSA bout(s) skipped (wrestler not in tracked roster)');
      const source=converted?converted.source:null;
      const rows=announcedTorikumiMatches(source,{bashoId,division,day:nextDay});
      if(rows.length){
        nextTorikumi[division]={status:'available',data:source};
        scheduleCount+=rows.length;
      }else nextTorikumi[division]={status:'unavailable',data:null,reason:'No confirmed next-day torikumi on the JSA page yet'};
    }catch(error){
      nextTorikumi[division]={status:'unavailable',data:null,reason:'Next-day schedule source temporarily unavailable'};
      console.warn(division+' day '+nextDay+' torikumi not yet available: '+String(error.message).slice(0,140));
    }
  }
}
// Preserve published current-day pairings until all bouts are complete.
// Some providers announce tomorrow's schedule only late in today's basho.
let selectedDay=scheduleCount?nextDay:null;
let selectedTorikumi=nextTorikumi;
if(!nextTorikumi.Makuuchi?.data && Number(details.announcedDay)===today){
  const retained={};
  let retainedCount=0;
  for(const division of TRACKED_DIVISIONS){
    const prior=details.torikumi?.[division]?.data;
    const rows=announcedTorikumiMatches(prior,{bashoId,division,day:today});
    if(rows.length){
      retained[division]={status:'available',data:prior};
      retainedCount+=rows.length;
    }
  }
  if(retained.Makuuchi?.data || (!scheduleCount&&retainedCount)){
    selectedDay=today;
    selectedTorikumi=retained;
    scheduleCount=retainedCount;
  }
}
nextDetails.announcedDay=selectedDay;
nextDetails.torikumi=selectedTorikumi;
nextDetails.dailyCollectedAt=capturedAt;
nextDetails.dailyJstDay=(today>=1&&today<=15)?today:null;
nextDetails.dailyScheduleCount=scheduleCount;
nextDetails.dailySource='https://www.sumo.or.jp/EnHonbashoMain/torikumi/';
nextDetails.dailyStatus=selectedDay===nextDay?'next-day-torikumi-published':selectedDay===today?'current-day-torikumi-retained':'next-day-torikumi-not-yet-published';
const temp=PATH+'.tmp';
await writeFile(temp,JSON.stringify(nextDetails,null,2)+'\n','utf8');
await rename(temp,PATH);
console.log(JSON.stringify({
  status:'ok',bashoId,capturedAt,japanDay:today,nextDay,upcomingBouts:scheduleCount,
  completedThrough:Object.fromEntries(TRACKED_DIVISIONS.map(d=>[d,lastCompletedBashoDay(newBanzuke[d])])),
  torikumi:Object.fromEntries(TRACKED_DIVISIONS.map(d=>[d,selectedTorikumi[d]?.data?.torikumi?.length||0]))
}));
