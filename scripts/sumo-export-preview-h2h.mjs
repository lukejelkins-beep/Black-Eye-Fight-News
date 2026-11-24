/**
 * Deterministic, non-production H2H export for the isolated BEFN Sumo preview.
 * Works from full career research projections, without new API calls.
 * A small summary is loaded with the preview; the complete bout chronology
 * is only fetched when a visitor opens a dedicated head-to-head page.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT='data/sumo/backfill/v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
export const keyFor=(a,b)=>[Number(a),Number(b)].sort((x,y)=>x-y).join(':');
const recentFirst=(a,b)=>String(b[0]).localeCompare(String(a[0]))||Number(b[1])-Number(a[1])||Number(b[5])-Number(a[5]);
function normalize(m,a,b,special=false){
  if(!/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(m.bashoId))||
     !Number.isInteger(Number(m.day))||Number(m.day)<1||Number(m.day)>16||
     ![a,b].includes(Number(m.winnerId)))throw Error('Invalid source meeting in '+a+':'+b);
  const kimarite=typeof m.kimarite==='string'&&m.kimarite.trim()?m.kimarite.trim():null;
  return [String(m.bashoId),Number(m.day),Number(m.winnerId),kimarite,
    String(m.division||''),Number(m.matchNo)||0,special?String(m.eventType||'special'):'regular'];
}
const comparable=rows=>JSON.stringify(rows.map(x=>x.slice(0,7)).sort(recentFirst));
export function createPreviewH2h(profiles,rosterIds,asOf){
  const cohort=new Set(rosterIds.map(Number));
  if(cohort.size!==190||profiles.length!==190)throw Error('Expected frozen 190 career projections');
  const pairs=new Map(),summaryProfiles={},opponentProfiles={};
  for(const p of profiles){
    const a=Number(p.sourceId);
    if(!cohort.has(a)||p.certification!=='not-started'||
       p.status!=='source-regular-bouts-reconciled-external-verification-pending')
       throw Error('Ineligible H2H source projection '+a);
    const opponentSummaries=[];
    let matched=0;
    for(const opponent of p.headToHead||[]){
      const b=Number(opponent.opponentId),key=keyFor(a,b),lo=Math.min(a,b),hi=Math.max(a,b);
      if(!positive(b)||b===a||!Array.isArray(opponent.meetings)||
         opponent.meetings.length!==opponent.regularBouts)throw Error('Incomplete opponent history '+key);
      const regular=opponent.meetings.map(m=>normalize(m,lo,hi)).sort(recentFirst);
      const special=(opponent.playoffsAndTrialBouts||[]).map(m=>normalize({...m,
        winnerId:m.winnerId??(m.outcome==='win'?a:m.outcome==='loss'?b:null)},lo,hi,true)).sort(recentFirst);
      const winsA=regular.filter(m=>m[2]===lo).length,winsB=regular.length-winsA;
      if(regular.filter(m=>m[2]===a).length!==opponent.wins||
         regular.filter(m=>m[2]===b).length!==opponent.losses)
         throw Error('Inconsistent source H2H totals '+key);
      matched+=regular.length;
      opponentSummaries.push({id:b,name:opponent.opponentName||null,wins:opponent.wins,
        losses:opponent.losses,meetings:regular.length,extraMeetings:special.length});
      if(pairs.has(key)){
        const seen=pairs.get(key);
        if(comparable(seen.regular)!==comparable(regular))throw Error('Contradictory opponent results '+key);
        seen.sources.push(a);
        // Extra bouts are tracked independently. Some provider perspectives
        // omit playoff/makushita trials, so do not invent symmetry.
        if(special.length>seen.special.length)seen.special=special;
      }else pairs.set(key,{a:lo,b:hi,regular,special,winsA,winsB,sources:[a]});
    }
    if(matched!==p.boutHistory.regularBouts)throw Error('Incomplete profile H2H ledger '+a);
    summaryProfiles[String(a)]={
      name:p.shikonaEn,careerWins:p.career.wins,careerLosses:p.career.losses,
      careerHigh:p.career.careerHigh?.rank||null,
      reconciledAggregateLag:p.career.sourceSummaryLagReconciled===true,
      recentPerformance:(p.recentPerformance||[]).slice(0,10),
      kimarite:p.kimarite||{wins:[],losses:[]},
      opponentCount:opponentSummaries.length
    };
    opponentProfiles[String(a)]=opponentSummaries.sort((a,b)=>b.meetings-a.meetings||a.id-b.id);
  }
  const summaryPairs={},fullPairs={};
  for(const [key,p] of [...pairs].sort((a,b)=>a[0].localeCompare(b[0]))){
    const recent=p.regular.slice(0,5);
    if(cohort.has(p.a)&&cohort.has(p.b)){
      summaryPairs[key]={a:p.a,b:p.b,winsA:p.winsA,winsB:p.winsB,
        total:p.regular.length,latest:recent};
    }
    fullPairs[key]={a:p.a,b:p.b,winsA:p.winsA,winsB:p.winsB,
      regular:p.regular,special:p.special};
  }
  const common={schemaVersion:1,previewOnly:true,certified:false,
    source:'Sumo API historical cache; JSA complete-history certification pending',
    sourceAsOf:asOf,cohortSize:190};
  return {
    summary:{...common,profileCount:profiles.length,profiles:summaryProfiles,
      activePairs:summaryPairs,activePairCount:Object.keys(summaryPairs).length},
    history:{...common,pairCount:pairs.size,pairs:fullPairs},
    opponents:{...common,profileCount:profiles.length,profiles:opponentProfiles}
  };
}
async function save(path,value){
  await mkdir('data/sumo/exports',{recursive:true});
  const temp=path+'.tmp';
  await writeFile(temp,JSON.stringify(value)+'\n','utf8');await rename(temp,path);
}
async function main(){
  const roster=await read('data/sumo/rikishi-index.json');
  const coverage=await read(join(ROOT,'h2h-chronology-coverage.json'));
  if(roster.count!==190||coverage.profilesChecked!==190||
     coverage.counterpartConflicts!==0||coverage.counterpartGaps!==0||
     coverage.profilesNotYetCrosscheckReady!==0)throw Error('H2H export blocked by incomplete 190-source audit');
  const profiles=[];
  for(const w of roster.rikishi){
    profiles.push(await read(join(ROOT,'profile-ready',w.sourceId+'.json')));
  }
  const {summary,history,opponents}=createPreviewH2h(profiles,roster.rikishi.map(w=>w.sourceId),roster.collectedAt||'November 2026');
  await save('data/sumo/exports/h2h-summary.json',summary);
  await save('data/sumo/exports/h2h-opponents.json',opponents);
  await save('data/sumo/exports/h2h-history.json',history);
  console.log(JSON.stringify({profiles:summary.profileCount,
    activePairs:summary.activePairCount,fullPairIndex:history.pairCount,
    cachedRegularBouts:Object.values(history.pairs).reduce((a,p)=>a+p.regular.length,0),
    certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
}
