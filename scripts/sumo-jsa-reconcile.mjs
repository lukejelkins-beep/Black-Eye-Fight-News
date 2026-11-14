/**
 * Independently reconcile public JSA spot-check facts with API cache.
 * Reports field-level agreement only. This does not certify an entire career.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT='data/sumo/backfill/v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const numberOrNull=x=>x==null?null:Number(x);
export function compareOfficialSpotcheck(official,cached){
  const expectedId=Number(official?.sumoApiId),jId=Number(official?.officialNskId);
  if(!Number.isSafeInteger(expectedId)||expectedId<1||!Number.isSafeInteger(jId)||jId<1)
    throw Error('Official spotcheck missing valid source identity');
  const checks=[
    {field:'sumoApiId',official:expectedId,api:numberOrNull(cached?.rikishiId)},
    {field:'officialNskId',official:jId,api:numberOrNull(cached?.data?.profile?.nskId)},
    {field:'name',official:official.name,api:cached?.data?.profile?.shikonaEn},
    {field:'currentRank',official:official.currentRank,api:cached?.data?.profile?.currentRank},
    {field:'stable',official:official.stable,api:cached?.data?.profile?.heya},
    {field:'heightCm',official:official.heightCm,api:numberOrNull(cached?.data?.profile?.height)},
    {field:'weightKg',official:official.weightKg,api:numberOrNull(cached?.data?.profile?.weight)},
    {field:'careerWins',official:official.record?.wins,api:numberOrNull(cached?.data?.stats?.totalWins)},
    {field:'careerLosses',official:official.record?.losses,api:numberOrNull(cached?.data?.stats?.totalLosses)},
    {field:'careerAbsences',official:official.record?.absences,api:numberOrNull(cached?.data?.stats?.totalAbsences)}
  ];
  const fields=checks.map(({field,official:source,api})=>{
    const expected=source===undefined?null:source;
    const state=expected==null||api==null?'not-comparable':expected===api?'match':'discrepancy';
    return {field,official:expected,api:api??null,state};
  });
  const counts={matched:fields.filter(x=>x.state==='match').length,discrepant:fields.filter(x=>x.state==='discrepancy').length,unavailable:fields.filter(x=>x.state==='not-comparable').length};
  return {sumoApiId:expectedId,name:official.name,officialAsOf:official.officialAsOf,officialProfileUrl:official.officialProfileUrl,
    status:counts.discrepant?'requires-reconciliation':counts.unavailable?'incomplete-evidence':'public-fields-agree',
    fieldCounts:counts,fields,careerCertified:false,
    notes:counts.discrepant?'Do not overwrite conflicting values without source time alignment.':'Basic fields only. Bout-by-bout history, historical measurements and photographs remain separate gates.'};
}
async function main(){
  const refs=await read(join(ROOT,'jsa-spotchecks.json'));
  if(refs?.schemaVersion!==1||!refs.bySourceId)throw Error('No official spotcheck evidence available');
  const bySourceId={};
  for(const [id,o] of Object.entries(refs.bySourceId)){
    if(String(o.sumoApiId)!==id)throw Error('JSA spotcheck key and source ID mismatch');
    const cached=await optional(join(ROOT,'rikishi',id+'.json'));
    bySourceId[id]=compareOfficialSpotcheck(o,cached);
  }
  const summaries=Object.values(bySourceId);
  const report={schemaVersion:1,scope:'Published JSA field spotchecks only; not full-career certifications',publishedAsOf:refs.retrievedDate,
    checkedProfiles:summaries.length,fullyMatchingPublicFields:summaries.filter(x=>x.status==='public-fields-agree').length,
    discrepancies:summaries.filter(x=>x.status==='requires-reconciliation').length,certifiedCareers:0,bySourceId};
  const p=join(ROOT,'jsa-reconciliation.json'),existing=await optional(p);
  if(JSON.stringify(existing)!==JSON.stringify(report)){
    await mkdir(ROOT,{recursive:true});
    const tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(report,null,2)+'\n');await rename(tmp,p);
  }
  console.log(JSON.stringify({spotchecks:report.checkedProfiles,publicFieldsAgreed:report.fullyMatchingPublicFields,discrepancies:report.discrepancies,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error(e);process.exitCode=1;});
}