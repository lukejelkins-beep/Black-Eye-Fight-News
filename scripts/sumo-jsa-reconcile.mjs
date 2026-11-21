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
export function compareOfficialSpotcheck(official,cached,cutoff=null){
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
  // A JSA profile may label itself "Day 7" while its bout-row shows Day 7
  // pending. Verify the API's resolved Day 7 result, then compare equivalent
  // cutoffs. Never mutate either original record.
  const apiBout=(cached?.data?.matches||[]).filter(m=>
    String(m.bashoId)===String(cutoff?.bashoId)&&Number(m.day)===Number(cutoff?.apiCompletedDay)&&
    (Number(m.eastId)===expectedId||Number(m.westId)===expectedId));
  const resolvedBout=apiBout.length===1?apiBout[0]:null;
  const result=resolvedBout?(Number(resolvedBout.winnerId)===expectedId?'win':'loss'):null;
  const subset=fields.filter(x=>x.state==='discrepancy').map(x=>x.field);
  const expectedDifference=Object.entries(cutoff?.expectedDelta||{}).filter(([_,n])=>Number(n)!==0);
  const validCutoff=!!cutoff&&
    Number(cutoff.sumoApiId)===expectedId&&Number(cutoff.officialNskId)===jId&&
    cutoff.sourceUrl===official.officialProfileUrl&&cutoff.officialDay7ResultStatus==='not yet recorded'&&
    Number(cutoff.officialTournamentCompletedThroughDay)+1===Number(cutoff.apiCompletedDay)&&
    result===cutoff.apiDay7Outcome&&expectedDifference.length>0&&
    subset.length===expectedDifference.length&&
    subset.every(k=>k==='careerWins'||k==='careerLosses')&&
    Number(cached?.data?.stats?.totalWins)-Number(cutoff.expectedDelta.wins||0)===Number(official.record?.wins)&&
    Number(cached?.data?.stats?.totalLosses)-Number(cutoff.expectedDelta.losses||0)===Number(official.record?.losses);
  const cutoffAlignment=cutoff?{
    source:cutoff.sourceUrl,bashoId:cutoff.bashoId,
    jsaLatestCompletedDay:cutoff.officialTournamentCompletedThroughDay,
    apiLatestCompletedDay:cutoff.apiCompletedDay,
    apiBoutOutcome:result,aligned:validCutoff,
    note:validCutoff?'The JSA source has a pending Day 7 bout. Removing the API Day 7 result reconciles the records at the same cutoff; historical certification is still outstanding.':'Source-cutoff explanation not fully validated.'
  }:null;
  return {sumoApiId:expectedId,name:official.name,officialAsOf:official.officialAsOf,officialProfileUrl:official.officialProfileUrl,
    status:counts.discrepant?(validCutoff?'explained-source-cutoff':'requires-reconciliation'):counts.unavailable?'incomplete-evidence':'public-fields-agree',
    fieldCounts:counts,fields,cutoffAlignment,careerCertified:false,
    notes:counts.discrepant?'Do not overwrite conflicting values without source time alignment.':'Basic fields only. Bout-by-bout history, historical measurements and photographs remain separate gates.'};
}
async function main(){
  const refs=await read(join(ROOT,'jsa-spotchecks.json'));
  if(refs?.schemaVersion!==1||!refs.bySourceId)throw Error('No official spotcheck evidence available');
  const cutoffs=await optional(join(ROOT,'jsa-cutoff-evidence.json'));
  const bySourceId={};
  for(const [id,o] of Object.entries(refs.bySourceId)){
    if(String(o.sumoApiId)!==id)throw Error('JSA spotcheck key and source ID mismatch');
    const cached=await optional(join(ROOT,'rikishi',id+'.json'));
    bySourceId[id]=compareOfficialSpotcheck(o,cached,cutoffs?.bySourceId?.[id]||null);
  }
  const summaries=Object.values(bySourceId);
  const report={schemaVersion:1,scope:'Published JSA field spotchecks only; not full-career certifications',publishedAsOf:refs.retrievedDate,
    checkedProfiles:summaries.length,fullyMatchingPublicFields:summaries.filter(x=>x.status==='public-fields-agree').length,
    discrepancies:summaries.filter(x=>x.fieldCounts.discrepant>0).length,
    explainedCutoffDifferences:summaries.filter(x=>x.status==='explained-source-cutoff').length,
    unexplainedDifferences:summaries.filter(x=>x.status==='requires-reconciliation').length,
    certifiedCareers:0,bySourceId};
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