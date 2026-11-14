/**
 * Independent BEFN Sumo research-cache integrity gate.
 * This is NOT external historical verification or JSA certification.
 * Produces a stable, testable report from downloaded source pages only.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const ROOT='data/sumo/backfill/v1';
const REQUIRED=['profile','stats','measurements','ranks','shikonas','matches'];
const banzuke=/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\s+[1-9]\d{0,2}\s+(East|West)$/;
const basho=/^(18|19|20)\d{2}(01|03|05|07|09|11)$/;
const read=async (file,fallback=null)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export function auditRikishi(w,cache){
  if(!cache)return {sourceId:w.sourceId,name:w.shikonaEn,status:'not-attempted',readyForExternalCrosscheck:false,errors:[],warnings:[]};
  const errors=[],warnings=[],id=Number(w.sourceId);
  if(cache.rikishiId!==id)errors.push('cache-identity');
  if(w.officialNskId&&cache.nskId&&Number(cache.nskId)!==Number(w.officialNskId))errors.push('nsk-identity');
  if(cache.certification!=='not-started')errors.push('unexpected-certification-status');
  if(!cache.researchOnly)errors.push('missing-research-only-guard');
  for(const s of REQUIRED){
    if(!cache.stages?.[s])errors.push('missing-stage-'+s);
    if(cache.stages?.[s]?.complete===false&&(cache.stages[s].attempts||0)>=3)warnings.push('blocked-stage-'+s);
  }
  const allComplete=REQUIRED.every(s=>cache.stages?.[s]?.complete===true);
  const profile=cache.data?.profile,stats=cache.data?.stats;
  if(cache.stages?.profile?.complete){
    if(!profile||Number(profile.id)!==id)errors.push('source-profile-identity');
    if(w.officialNskId&&profile?.nskId&&Number(profile.nskId)!==Number(w.officialNskId))errors.push('profile-official-identity');
    if(profile?.currentRank&&w.currentRank&&profile.currentRank!==w.currentRank)warnings.push('current-banzuke-snapshot-drift');
  }
  if(cache.stages?.stats?.complete){
    if(!stats||Number(stats.rikishi_id)!==id)errors.push('source-career-totals-identity');
    if(stats?.totalWins!=null&&stats?.totalLosses!=null&&stats?.totalMatches!=null&&
       Number(stats.totalWins)+Number(stats.totalLosses)!==Number(stats.totalMatches))warnings.push('career-total-reconciliation');
  }
  for(const stage of ['measurements','ranks','shikonas','matches']){
    const arr=cache.data?.[stage];
    if(!Array.isArray(arr)){errors.push(stage+'-array-missing');continue;}
    if(cache.stages?.[stage]?.complete&&cache.stages[stage].total!==null&&arr.length!==cache.stages[stage].total){
      errors.push(stage+'-pagination-count-mismatch');
    }
    const ids=new Set(),dated=new Set();
    for(const item of arr){
      if(item.rikishiId!=null&&Number(item.rikishiId)!==id)errors.push(stage+'-wrong-rikishi-id');
      const key=item.id!=null?String(item.id):
        stage==='matches'?[item.bashoId,item.day,item.matchNo,item.eastId,item.westId].join(':'):
        JSON.stringify(item);
      if(ids.has(key))errors.push(stage+'-duplicate-record');
      ids.add(key);
      if(stage!=='matches'){
        if(!basho.test(String(item.bashoId||'')))errors.push(stage+'-invalid-basho-date');
        else if(dated.has(item.bashoId))errors.push(stage+'-duplicate-basho');
        dated.add(item.bashoId);
      } else {
        if(!basho.test(String(item.bashoId||'')))warnings.push('match-date-format');
        if(item.eastId!=null&&item.westId!=null&&Number(item.eastId)!==id&&Number(item.westId)!==id)
          errors.push('match-opponent-identity');
      }
      if(stage==='ranks'&&!banzuke.test(String(item.rank||'')))errors.push('malformed-rank-value');
      if(stage==='measurements'&&item.weight!=null&&(!Number.isFinite(Number(item.weight))||Number(item.weight)<=0))errors.push('invalid-historical-weight');
      if(stage==='measurements'&&item.height!=null&&(!Number.isFinite(Number(item.height))||Number(item.height)<=0))errors.push('invalid-historical-height');
    }
    if(allComplete&&stage==='ranks'&&!arr.length)errors.push('rank-history-empty');
    if(allComplete&&stage==='matches'&&!arr.length&&Number(stats?.totalMatches)>0)errors.push('match-history-empty');
  }
  const uniqueErrors=[...new Set(errors)],uniqueWarnings=[...new Set(warnings)];
  const status=!allComplete?'still-collecting':uniqueErrors.length?'source-integrity-exception':'source-collected-needs-independent-verification';
  return {
    sourceId:id,name:w.shikonaEn,status,readyForExternalCrosscheck:allComplete&&!uniqueErrors.length,
    errors:uniqueErrors,warnings:uniqueWarnings,stagesCompleted:REQUIRED.filter(s=>cache.stages?.[s]?.complete).length,
    counts:{weights:cache.data?.measurements?.length||0,ranks:cache.data?.ranks?.length||0,matches:cache.data?.matches?.length||0}
  };
}
async function main(){
  const cohort=await read('data/sumo/rikishi-index.json');
  if(cohort?.count!==190||cohort.rikishi?.length!==190)throw Error('Frozen 190-rikishi cohort mismatch');
  const audited=[];
  for(const w of cohort.rikishi){
    audited.push(auditRikishi(w,await read(join(ROOT,'rikishi',w.sourceId+'.json'))));
  }
  const overview={
    schemaVersion:1,scope:'Research API response integrity only — NEVER a JSA or full-career certificate',
    cohortSize:190,certified:0,
    notAttempted:audited.filter(x=>x.status==='not-attempted').length,
    collecting:audited.filter(x=>x.status==='still-collecting').length,
    integrityException:audited.filter(x=>x.status==='source-integrity-exception').length,
    sourceReady:audited.filter(x=>x.readyForExternalCrosscheck).length,
    records:{weight:audited.reduce((a,b)=>a+b.counts.weights,0),rank:audited.reduce((a,b)=>a+b.counts.ranks,0),matches:audited.reduce((a,b)=>a+b.counts.matches,0)},
    pendingExternalChecks:['JSA identity/current profile','JSA/independent chronological career crosscheck',
      'Published height and weight provenance','Cross-source fight-history totals','Photo licensing'],
    cases:audited.filter(x=>x.errors.length||x.warnings.length||x.readyForExternalCrosscheck).slice(0,190)
  };
  const path=join(ROOT,'audit.json'),before=await read(path);
  if(JSON.stringify(before)!==JSON.stringify(overview)){
    await mkdir(ROOT,{recursive:true});
    const tmp=path+'.tmp';
    await writeFile(tmp,JSON.stringify(overview,null,2)+'\n');
    await rename(tmp,path);
  }
  console.log(JSON.stringify({sourceReady:overview.sourceReady,collecting:overview.collecting,notAttempted:overview.notAttempted,integrityException:overview.integrityException,records:overview.records,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error(e);process.exitCode=1;});
}
