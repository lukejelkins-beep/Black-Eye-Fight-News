/**
 * Materialize display-ready research-only rikishi facts from completed API
 * source caches. This NEVER changes the BEFN website or issues a certificate.
 * Full match event history stays in the original raw JSON, without duplication.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {ordinalRank} from '../assets/sumo-career.mjs';
import {auditRikishi} from './sumo-verify-190.mjs';
import {applyOfficialBoutCorrections} from './sumo-official-bout-corrections.mjs';
const DIR='data/sumo/backfill/v1';
const read=async(p,fallback=null)=>{try{return JSON.parse(await readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const num=x=>Number.isSafeInteger(Number(x))?Number(x):null;
const dateId=x=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(x||''));
const matchKey=m=>[m.bashoId,m.day,m.matchNo,m.eastId,m.westId].join(':');
const sortedBouts=list=>[...list].sort((a,b)=>String(b.bashoId).localeCompare(String(a.bashoId))||Number(b.day)-Number(a.day)||Number(b.matchNo)-Number(a.matchNo));
const add=(obj,key)=>{obj[key]=(obj[key]||0)+1};
export function buildResearchProfile(w,cache,correctionManifest=null){
  const aud=auditRikishi(w,cache,correctionManifest);
  if(!aud.readyForExternalCrosscheck)return {status:'not-ready',sourceId:w.sourceId,problems:aud.errors||[],warnings:aud.warnings||[]};
  const id=Number(w.sourceId),details=cache.data?.profile,stats=cache.data?.stats;
  if(!details||!stats)throw Error('Missing cached profile or statistics');
  const sourceCorrection=applyOfficialBoutCorrections(w,cache,correctionManifest);
  if(sourceCorrection.errors.length)return {status:'official-correction-exception',sourceId:id,
    problems:sourceCorrection.errors,certified:false};
  const all=sortedBouts(sourceCorrection.matches);
  const regular=all.filter(m=>m.division!=='Mae-zumo'&&Number(m.day)>=1&&Number(m.day)<=15);
  const special=all.filter(m=>m.division==='Mae-zumo'||Number(m.day)>15);
  const record={wins:regular.filter(m=>Number(m.winnerId)===id).length,
    losses:regular.filter(m=>Number(m.winnerId)!==id).length};
  if(regular.length!==Number(stats.totalMatches)||record.wins!==Number(stats.totalWins)||record.losses!==Number(stats.totalLosses)){
    return {status:'stat-reconciliation-exception',sourceId:id,regularBouts:regular.length,
      sourceTotal:stats.totalMatches,rawWins:record.wins,rawLosses:record.losses,sourceWins:stats.totalWins,sourceLosses:stats.totalLosses};
  }
  const rankEvents=[...(cache.data.ranks||[])].filter(x=>dateId(x.bashoId));
  const weightEvents=[...(cache.data.measurements||[])].filter(x=>dateId(x.bashoId)&&num(x.weight)>0);
  const ringNames=[...(cache.data.shikonas||[])].filter(x=>dateId(x.bashoId));
  const formal=rankEvents.map(x=>({...x,metric:ordinalRank(x.rank)})).filter(x=>x.metric!==null);
  formal.sort((a,b)=>a.metric-b.metric||String(a.bashoId).localeCompare(String(b.bashoId)));
  const topRank=formal[0]||null;
  const h2h=new Map(),basho=new Map(),winTech={},lossTech={};
  for(const m of regular){
    const victory=Number(m.winnerId)===id;
    const opponent=id===Number(m.eastId)?Number(m.westId):Number(m.eastId);
    if(!Number.isSafeInteger(opponent)||opponent<1)throw Error('Opponent identity missing for '+id+' '+matchKey(m));
    const opponentName=id===Number(m.eastId)?m.westShikona:m.eastShikona;
    if(!h2h.has(opponent))h2h.set(opponent,{opponentId:opponent,opponentName:opponentName||null,wins:0,losses:0,regularBouts:0,
      meetings:[],playoffsAndTrialBouts:[],techniqueKnown:0,forfeitCount:0,techniqueMissing:0,
      historicalSourceStatus:'full-cached-API-career-not-JSA-certified'});
    const pair=h2h.get(opponent);pair.regularBouts++;pair[victory?'wins':'losses']++;
    // Retain EVERY bout in the source ledger, with winner/kimarite and
    // source provenance; an aggregate W-L is not a historical H2H timeline.
    const kimarite=typeof m.kimarite==='string'&&m.kimarite.trim()?m.kimarite.trim():null;
    const resultKind=kimarite===null?'technique-not-recorded':/^fusen/i.test(kimarite)?'forfeit':'kimarite';
    if(resultKind==='technique-not-recorded')pair.techniqueMissing++;
    else if(resultKind==='forfeit')pair.forfeitCount++;
    else pair.techniqueKnown++;
    pair.meetings.push({bashoId:String(m.bashoId),day:Number(m.day),
      matchNo:Number.isSafeInteger(Number(m.matchNo))?Number(m.matchNo):null,
      division:m.division||null,eastId:Number(m.eastId),westId:Number(m.westId),
      winnerId:Number(m.winnerId),opponentId:opponent,
      outcome:victory?'win':'loss',kimarite,resultKind,
      sourceMatchKey:matchKey(m),
      officialCorrection:m.officialResultCorrection||null});
    if(m.kimarite&&m.kimarite!=='fusen')add(victory?winTech:lossTech,m.kimarite);
    const b=String(m.bashoId);
    if(!basho.has(b))basho.set(b,{bashoId:b,division:m.division||null,wins:0,losses:0,scheduledBoutRows:0});
    const entry=basho.get(b);entry.scheduledBoutRows++;entry[victory?'wins':'losses']++;
  }
  // Playoffs and Mae-zumo are authentic meetings but excluded from ordinary
  // W-L and regular head-to-head totals; keep them visibly separate.
  for(const m of special){
    const opponent=id===Number(m.eastId)?Number(m.westId):Number(m.eastId);
    if(!Number.isSafeInteger(opponent)||opponent<1)continue;
    const opponentName=id===Number(m.eastId)?m.westShikona:m.eastShikona;
    if(!h2h.has(opponent))h2h.set(opponent,{opponentId:opponent,opponentName:opponentName||null,wins:0,losses:0,regularBouts:0,
      meetings:[],playoffsAndTrialBouts:[],techniqueKnown:0,forfeitCount:0,techniqueMissing:0,
      historicalSourceStatus:'full-cached-API-career-not-JSA-certified'});
    h2h.get(opponent).playoffsAndTrialBouts.push({bashoId:String(m.bashoId),
      day:Number(m.day),matchNo:Number.isSafeInteger(Number(m.matchNo))?Number(m.matchNo):null,
      division:m.division||null,winnerId:Number(m.winnerId)||null,
      kimarite:typeof m.kimarite==='string'&&m.kimarite.trim()?m.kimarite.trim():null,
      outcome:Number(m.winnerId)===id?'win':'loss',
      eventType:m.division==='Mae-zumo'?'mae-zumo':'playoff',
      countedInRegularHeadToHead:false,sourceMatchKey:matchKey(m)});
  }
  const h2hSorted=[...h2h.values()].sort((a,b)=>b.regularBouts-a.regularBouts||a.opponentId-b.opponentId);
  const bashoSorted=[...basho.values()].sort((a,b)=>String(a.bashoId).localeCompare(String(b.bashoId)));
  const sortTech=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([kimarite,count])=>({kimarite,count}));
  const specialEvents=special.map(m=>({bashoId:m.bashoId,day:m.day,division:m.division,
    opponentId:Number(m.eastId)===id?m.westId:m.eastId,
    outcome:Number(m.winnerId)===id?'win':'loss',kimarite:m.kimarite||null,
    sourceMatchKey:matchKey(m)}));
  return {
    schemaVersion:1,sourceId:id,officialNskId:w.officialNskId,shikonaEn:w.shikonaEn,
    previewOnly:true,certification:'not-started',
    status:'source-regular-bouts-reconciled-external-verification-pending',
    sourceUrl:'https://www.sumo-api.com/api/rikishi/'+id,
    jsaUrl:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/',
    identity:{shikonaEn:details.shikonaEn,shikonaJp:details.shikonaJp,
      stable:details.heya,birthplace:details.shusshin,birthDate:details.birthDate,
      debutBasho:details.debut},
    current:{rank:w.currentRank,weightKg:details.weight,heightCm:details.height},
    career:{
      wins:stats.totalWins,losses:stats.totalLosses,absences:stats.totalAbsences,
      basho:stats.basho,yusho:stats.yusho,yushoByDivision:stats.yushoByDivision,
      sansho:stats.sansho,careerHigh:topRank?{rank:topRank.rank,bashoId:topRank.bashoId}:null
    },
    measurements:weightEvents.map(m=>({bashoId:m.bashoId,heightCm:m.height,weightKg:m.weight,source:'Sumo API historical change'})),
    rankTimeline:rankEvents.map(m=>({bashoId:m.bashoId,rank:m.rank,rankValue:m.rankValue??null})),
    rankHistoryGaps:cache.stages?.ranks?.unrankedDebut
      ?[{...cache.stages.ranks.unrankedDebut,rank:null,independentlyCertified:false}]
      :[],
    rankAvailability:{
      evidencedUnrankedDebutBasho:cache.stages.ranks.unrankedDebut?.bashoId??null,
      note:cache.stages.ranks.unrankedDebut?
        'Debut bouts documented before first published banzuke rank; no rank assigned for the debut basho':
        'Published historical ranks only; do not infer missing tournament measurements or ranks'
    },
    ringNameHistory:ringNames.map(m=>({bashoId:m.bashoId,shikonaEn:m.shikonaEn,shikonaJp:m.shikonaJp})),
    boutHistory:{rawCachePath:'data/sumo/backfill/v1/rikishi/'+id+'.json',
      regularBouts:regular.length,otherBouts:special.length,totalRawBouts:all.length,
      regularWins:record.wins,regularLosses:record.losses,
      earliestBasho:all.at(-1)?.bashoId||null,latestBasho:all[0]?.bashoId||null,
      fullPagination:true,comparison:'Regular bouts reconciled to API career stats, including JSA official correction overlays',
      officialBoutCorrections:sourceCorrection.applied,
      rawSourceImmutable:true},
    specialBouts:specialEvents,perBasho:bashoSorted,headToHead:h2hSorted,
    kimarite:{wins:sortTech(winTech),losses:sortTech(lossTech)},
    recentPerformance:regular.slice(0,10).map(m=>({bashoId:m.bashoId,day:m.day,
      opponentId:Number(m.eastId)===id?m.westId:m.eastId,
      opponentName:Number(m.eastId)===id?m.westShikona:m.eastShikona,
      outcome:Number(m.winnerId)===id?'win':'loss',kimarite:m.kimarite||null})),
    releaseGates:{independentJsaRecord:false,fullHistoricCrosscheck:false,
      historicMeasurementProvenance:false,photoRights:false,certified:false}
  };
}
async function main(){
  const roster=await read('data/sumo/rikishi-index.json');
  if(roster?.count!==190||roster.rikishi.length!==190)throw Error('Frozen 190-rikishi cohort mismatch');
  const outDir=join(DIR,'profile-ready');
  await mkdir(outDir,{recursive:true});
  const correctionManifest=await read(join(DIR,'official-bout-corrections.json'),{bySourceId:{}});
  let ready=0,exceptions=0,unchanged=0;
  for(const w of roster.rikishi){
    const source=await read(join(DIR,'rikishi',w.sourceId+'.json'),null);
    if(!source)continue;
    const p=buildResearchProfile(w,source,correctionManifest);
    if(p.status==='not-ready')continue;
    if(p.status==='stat-reconciliation-exception'||p.status==='official-correction-exception'){
      exceptions++;console.warn(w.shikonaEn+': source W-L disagreement or invalid official correction');continue;
    }
    const dest=join(outDir,w.sourceId+'.json'),prev=await read(dest,null);
    if(JSON.stringify(prev)===JSON.stringify(p)){ready++;unchanged++;continue;}
    const tmp=dest+'.tmp';
    await writeFile(tmp,JSON.stringify(p,null,2)+'\n');
    await rename(tmp,dest);
    ready++;
  }
  console.log(JSON.stringify({profileReadModels:ready,unchanged,statReconciliationExceptions:exceptions,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(err=>{console.error(err);process.exitCode=1;});
}