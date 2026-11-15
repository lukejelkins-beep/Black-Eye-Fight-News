/**
 * Project already-reconciled research profile timelines into the isolated Sumo
 * PREVIEW only. No new API requests or production publication.
 *
 * Crucially, current listed weight is not a dated weigh-in. Only explicit
 * tournament-dated observations from the research profile's measurements
 * collection may become graph dots.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {ordinalRank} from '../assets/sumo-career.mjs';
const ROOT='data/sumo/backfill/v1';
const TARGET='data/sumo/exports/career-history.json';
const bashoId=x=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(x||''));
const goodWeight=x=>Number.isFinite(Number(x))&&Number(x)>=45&&Number(x)<=400;
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const sourceUrl=u=>typeof u==='string'&&/^https:\/\/(sumodb\.sumogames\.de|www\.sumo-api\.com|www\.sumo\.or\.jp)\//.test(u);
export function createPreviewCareer(roster,profiles,asOf){
 if(roster?.count!==190||roster?.rikishi?.length!==190||profiles?.length!==190)
  throw Error('Expected frozen 190-rikishi cohort and 190 research profiles');
 const ids=new Set(),bySourceId={};
 let datedWeightPoints=0,sourceExtraPoints=0,rankPoints=0,withIndependentWeights=0;
 for(const w of roster.rikishi){
  const p=profiles.find(x=>Number(x.sourceId)===Number(w.sourceId));
  if(!p||p.officialNskId!==w.officialNskId||p.certification!=='not-started'||
     p.releaseGates?.certified!==false||
     p.status!=='source-regular-bouts-reconciled-external-verification-pending')
    throw Error('Unready, misidentified or certified source projection '+w.sourceId);
  if(ids.has(w.sourceId))throw Error('Duplicate source rikishi '+w.sourceId);
  ids.add(w.sourceId);
  const weights=new Map();
  for(const m of p.measurements||[]){
   if(!bashoId(m.bashoId)||!goodWeight(m.weightKg)||
      !sourceUrl(m.sourceUrl)||
      !['Sumo API historical change','SumoDB dated tournament measurement'].includes(m.source))
    throw Error('Undated or unverified-source measurement in '+w.sourceId);
   if(weights.has(m.bashoId))throw Error('Duplicate historical weigh-in at '+m.bashoId+' for '+w.sourceId);
   weights.set(m.bashoId,{
    basho:m.bashoId,kg:Number(m.weightKg),
    heightCm:Number.isFinite(Number(m.heightCm))&&Number(m.heightCm)>0?
      Number(m.heightCm):null,
    source:m.sourceUrl,
    evidenceSource:m.source,
    status:'dated source record; full history not independently certified',
    independentlyCertified:false
   });
  }
  const weight=[...weights.values()].sort((a,b)=>a.basho.localeCompare(b.basho));
  const ranks=new Map();
  for(const r of p.rankTimeline||[]){
   if(!bashoId(r.bashoId)||ordinalRank(r.rank)===null)continue;
   if(ranks.has(r.bashoId))throw Error('Duplicate ranked basho '+r.bashoId+' for '+w.sourceId);
   ranks.set(r.bashoId,{basho:r.bashoId,rank:r.rank});
  }
  const rank=[...ranks.values()].sort((a,b)=>a.basho.localeCompare(b.basho));
  if(!rank.length)throw Error('Rikishi missing every historical rank '+w.sourceId);
  // Never add p.current or p.currentOfficialMeasurement to weight[].
  const currentOfficial=p.currentOfficialMeasurement;
  if(currentOfficial&&
    (currentOfficial.measurementDateKnown!==false||
     currentOfficial.snapshotType!=='current-listed-weight-not-dated-weigh-in'))
    throw Error('Current listed weight must remain undated '+w.sourceId);
  bySourceId[String(w.sourceId)]={
   sumoApiId:w.sourceId,officialNskId:w.officialNskId,
   name:w.shikonaEn,weight,rank,
   weightSource:weight.find(m=>m.evidenceSource==='SumoDB dated tournament measurement')?.source||
     weight[0]?.source||null,
   rankSource:'https://www.sumo-api.com/api/ranks?rikishiId='+w.sourceId+'&limit=200&skip=0&sortOrder=asc',
   independentRankReference:'https://sumodb.sumogames.de/Rikishi.aspx?r='+w.sumoDbId,
   rankCrosscheck:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/',
   currentListedWeight:currentOfficial?{
     kg:currentOfficial.weightKg,
     heightCm:currentOfficial.heightCm,
     source:currentOfficial.sourceUrl,
     officialAsOf:currentOfficial.officialAsOf,
     datedMeasurement:false
   }:null,
   bestRank:p.career?.careerHigh?.rank||null,
   weightResearchStatus:p.measurementCoverage?.status||'api-only',
   datedWeightSourceComplete:false,
   independentHistoricalRankCertification:false,
   certified:false,
   milestones:[]
  };
  datedWeightPoints+=weight.length;rankPoints+=rank.length;
  sourceExtraPoints+=Number(p.measurementCoverage?.extraPoints||0);
  if(p.measurementCoverage?.independentPoints>0)withIndependentWeights++;
 }
 return {schemaVersion:1,description:'BEFN Sumo PREVIEW only — source-labelled dated weights and per-basho historical ranks',
  cohortSize:190,sourceAsOf:asOf||null,certified:false,productionPublished:false,
  datedWeightPoints,rankedBashoPoints:rankPoints,
  rikishiWithIndependentWeightEvidence:withIndependentWeights,
  independentAdditionalDatedWeightPoints:sourceExtraPoints,
  note:'Current listed weights are separate from historical points. No inferred per-basho weigh-ins, careers not certified.',
  bySourceId};
}
async function main(){
 const roster=await read('data/sumo/rikishi-index.json');
 const summary=await read(join(ROOT,'summary.json'));
 const profiles=[];
 for(const w of roster.rikishi)profiles.push(await read(join(ROOT,'profile-ready',w.sourceId+'.json')));
 const exportData=createPreviewCareer(roster,profiles,summary.lastCheckedAt||null);
 await mkdir('data/sumo/exports',{recursive:true});
 const out=await readFile(TARGET,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const text=JSON.stringify(exportData,null,2)+'\n';
 if(out!==text){const temp=TARGET+'.tmp';await writeFile(temp,text);await rename(temp,TARGET);}
 console.log(JSON.stringify({previewOnly:true,profiles:190,weightDots:exportData.datedWeightPoints,
  extra:exportData.independentAdditionalDatedWeightPoints,ranks:exportData.rankedBashoPoints,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
