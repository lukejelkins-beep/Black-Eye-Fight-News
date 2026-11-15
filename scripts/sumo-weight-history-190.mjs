/**
 * Research-only historical weight provenance and coverage audit.
 * No network calls, no published/estimated data, and no source certification.
 * Independent observations are kept separate from raw Sumo API records.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT='data/sumo/backfill/v1';
const VALID_BASHO=/^(18|19|20)\d{2}(01|03|05|07|09|11)$/;
const SUMODB='https://sumodb.sumogames.de/Rikishi.aspx?r=';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const num=v=>typeof v==='number'?v:Number(v);
const validWeight=w=>Number.isFinite(num(w))&&num(w)>=45&&num(w)<=400;
const decode=s=>s.replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v)));
const plain=s=>decode(String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());

/**
 * Parse *dated tournament rows only*. Never treat the undated header
 * "Height and Weight 175 cm 143 kg" as a dated measurement.
 * This function is for locally supplied HTML with separately confirmed
 * source-reuse rights; it performs no HTTP collection.
 */
export function parseSumoDbDatedMeasurements(html){
 if(typeof html!=='string'||html.length>2_000_000)throw Error('Unexpected SumoDB source HTML');
 const rows=html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
 const observations=new Map();
 for(const row of rows){
  const text=plain(row);
  const dates=[...text.matchAll(/\b((?:18|19|20)\d{2})\.(01|03|05|07|09|11)\b/g)];
  if(dates.length!==1)continue;
  const measures=[...text.matchAll(/\b(\d{2,3}(?:\.\d+)?)\s*cm\s+(\d{2,3}(?:\.\d+)?)\s*kg\b/gi)];
  if(measures.length!==1)continue;
  const height=num(measures[0][1]),weight=num(measures[0][2]);
  if(!validWeight(weight)||height<100||height>230)continue;
  const bashoId=dates[0][1]+dates[0][2];
  const prior=observations.get(bashoId);
  const event={bashoId,heightCm:height,weightKg:weight};
  if(prior&&JSON.stringify(prior)!==JSON.stringify(event))
    throw Error('Conflicting SumoDB measurement for '+bashoId);
  observations.set(bashoId,event);
 }
 return [...observations.values()].sort((a,b)=>a.bashoId.localeCompare(b.bashoId));
}
export function reconcileWeightHistory(apiRows,independentRows,sumoDbId){
 const current=new Map();
 for(const m of apiRows||[]){
  const bashoId=String(m.bashoId||''),weight=num(m.weight);
  if(!VALID_BASHO.test(bashoId)||!validWeight(weight))continue;
  if(current.has(bashoId)&&current.get(bashoId).weightKg!==weight)
    throw Error('Conflicting original API measurement in '+bashoId);
  current.set(bashoId,{bashoId,weightKg:weight,heightCm:m.height==null?null:num(m.height)});
 }
 const seen=new Set(),independent=[],overlap=[],additional=[],conflicts=[];
 for(const m of independentRows||[]){
  const bashoId=String(m.bashoId||''),weight=num(m.weightKg);
  if(!VALID_BASHO.test(bashoId)||!validWeight(weight))
    throw Error('Invalid dated independent weight');
  if(seen.has(bashoId))throw Error('Repeated independent tournament '+bashoId);
  seen.add(bashoId);
  if(m.sourceUrl!==SUMODB+sumoDbId)throw Error('Independent source URL/identity mismatch');
  const point={bashoId,weightKg:weight,heightCm:m.heightCm==null?null:num(m.heightCm),
   sourceUrl:m.sourceUrl,independentlyCertified:false};
  independent.push(point);
  const original=current.get(bashoId);
  if(!original)additional.push(point);
  else if(original.weightKg!==weight||
    original.heightCm!=null&&point.heightCm!=null&&original.heightCm!==point.heightCm)
      conflicts.push({bashoId,api:original,independent:point});
  else overlap.push({bashoId,weightKg:weight});
 }
 return {apiDatedPoints:current.size,independentDatedPoints:independent.length,
  additionalDatedPoints:additional.length,matchingOverlaps:overlap.length,
  conflictingOverlaps:conflicts,additional,independent,
  sourceRightsRequired:true,displayableAdditionalPoints:0};
}
export function summarizeWeightCoverage(cohort,apiDocs,sourceDocs){
 if(cohort?.count!==190||cohort?.rikishi?.length!==190)
  throw Error('Expected frozen 190-rikishi cohort');
 const result={schemaVersion:1,scope:'Research-only historical measurement gap analysis; not certified or licensed for production',
  cohortSize:190,rawApiWeightEntries:0,mappedSumoDbRikishi:0,unmappedSumoDbRikishi:[],
  checkedIndependentRikishi:0,independentDatedPoints:0,matchedOverlaps:0,
  independentIdentityBirthDateVerified:0,independentIdentityBirthDatePending:0,
  independentIdentityBirthDateMismatch:0,
  historicalSourceIdentityRechecks:0,corroboratedLegacyWeightObservations:0,
  additionalDatedPoints:0,conflictingOverlaps:0,sourceReusePermissionConfirmed:false,
  publishedAdditionalPoints:0,certifiedWeightHistories:0,entries:[]};
 for(const r of cohort.rikishi){
  const sourceId=Number(r.sourceId),a=apiDocs.get(sourceId);
  if(!a||!Array.isArray(a.data?.measurements))throw Error('Missing cached API weights for '+sourceId);
  const s=sourceDocs.get(sourceId)||null;
  const api=a.data.measurements;result.rawApiWeightEntries+=api.length;
  if(r.sumoDbId)result.mappedSumoDbRikishi++;
  else result.unmappedSumoDbRikishi.push({sourceId,name:r.shikonaEn});
  if(s&&(s.sourceId!==sourceId||Number(s.sumoDbId)!==Number(r.sumoDbId)))
   throw Error('Source ID mapping mismatch for '+sourceId);
  const checked=s?reconcileWeightHistory(api,s.datedEvidence,Number(r.sumoDbId)):null;
  if(checked){
   result.checkedIndependentRikishi++;
   const birthStatus=s.identityRecheck?.identityEvidence?.birthDateStatus||
     s.identityEvidence?.birthDateStatus||null;
   if(s.identityRecheck?.originalEvidencePreserved===true){
    result.historicalSourceIdentityRechecks++;
    result.corroboratedLegacyWeightObservations+=Number(s.identityRecheck.unchangedSavedMeasurements)||0;
   }
   if(birthStatus==='match')result.independentIdentityBirthDateVerified++;
   else if(birthStatus==='mismatch')result.independentIdentityBirthDateMismatch++;
   else result.independentIdentityBirthDatePending++;
   result.independentDatedPoints+=checked.independentDatedPoints;
   result.matchedOverlaps+=checked.matchingOverlaps;
   result.additionalDatedPoints+=checked.additionalDatedPoints;
   result.conflictingOverlaps+=checked.conflictingOverlaps.length;
  }
  result.entries.push({sourceId,name:r.shikonaEn,sumoDbId:r.sumoDbId||null,
   apiWeightEntries:api.length,independentChecked:!!checked,
   independentSourceBirthDateStatus:checked?(
     s.identityRecheck?.identityEvidence?.birthDateStatus||
     s.identityEvidence?.birthDateStatus||'prior-check-needs-birthdate-proof'):null,
   sourceIdentityRechecked:!!s?.identityRecheck?.originalEvidencePreserved,
   sourcedIndependentPoints:checked?.independentDatedPoints||0,
   additionalDatedPoints:checked?.additionalDatedPoints||0,
   conflictingOverlapCount:checked?.conflictingOverlaps.length||0,
   weightTimelineCertified:false});
 }
 result.awaitingIndependentResearch=190-result.checkedIndependentRikishi;
 if(result.independentIdentityBirthDateMismatch>0)
  throw Error('Independent SumoDB birth-date identity mismatch: quarantine before projection');
 result.note='Absence of a dated source observation is not evidence of a weigh-in or permission to interpolate. Undated current profile weights are excluded.';
 return result;
}
async function main(){
 const cohort=await read('data/sumo/rikishi-index.json');
 const docs=new Map(),crosschecks=new Map();
 for(const r of cohort.rikishi){
  docs.set(r.sourceId,await read(join(ROOT,'rikishi',r.sourceId+'.json')));
  const independent=await optional(join(ROOT,'weight-source-crosschecks',r.sourceId+'.json'));
  if(independent)crosschecks.set(r.sourceId,independent);
 }
 const report=summarizeWeightCoverage(cohort,docs,crosschecks);
 const policy=await optional(join(ROOT,'sumodb-use-policy.json'));
 report.sourceReusePermissionConfirmed=policy?.approvedForAutomatedCollection===true;
 report.publicDisplayPermissionConfirmed=policy?.approvedForPublicDisplay===true;
 report.permissionEvidenceBasis=policy?.approvalEvidenceType||null;
 report.note+=' Permission status reflects the owner’s confirmation, not independent review of the original grant.';
 const path=join(ROOT,'weight-source-coverage.json'),before=await optional(path);
 if(JSON.stringify(before)!==JSON.stringify(report)){
  await mkdir(ROOT,{recursive:true});const temp=path+'.tmp';
  await writeFile(temp,JSON.stringify(report,null,2)+'\n');await rename(temp,path);
 }
 console.log(JSON.stringify({api:report.rawApiWeightEntries,independent:report.independentDatedPoints,
  extra:report.additionalDatedPoints,mapped:report.mappedSumoDbRikishi,
  unchecked:report.awaitingIndependentResearch,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
