/**
 * SumoDB weight history collection — approved by the owner on 2026-11-15.
 * Research branch only. Existing source data is never rewritten.
 * Requires recorded permission plus robots/access checks on every new run.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseSumoDbDatedMeasurements,reconcileWeightHistory} from './sumo-weight-history-190.mjs';
const ROOT='data/sumo/backfill/v1';
const POLICY=join(ROOT,'sumodb-use-policy.json');
const STATUS=join(ROOT,'sumodb-collection-status.json');
const SOURCE_URL='https://sumodb.sumogames.de/Rikishi.aspx?r=';
const BOT='BEFNResearchBot/1.0 (authorised historical-weight research; admin@blackeyefightnews.com.au)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=async(path,value)=>{
 await mkdir(ROOT,{recursive:true});
 await mkdir(join(ROOT,'weight-source-crosschecks'),{recursive:true});
 const tmp=path+'.tmp';
 await writeFile(tmp,JSON.stringify(value,null,2)+'\n');
 await rename(tmp,path);
};
export function permissionAllowsCollection(policy){
 return policy?.approvedForAutomatedCollection===true&&
  typeof policy.approvalEvidence==='string'&&policy.approvalEvidence.length>=12&&
  Number.isFinite(Number(policy.allowedRequestsPerMinute))&&
  Number(policy.allowedRequestsPerMinute)>0&&Number(policy.allowedRequestsPerMinute)<=6;
}
export function conservativeRobotsAllow(robots,path='/Rikishi.aspx'){
 if(typeof robots!=='string'||robots.length>100000)return false;
 const lines=robots.split(/\r?\n/).map(x=>x.replace(/#.*$/,'').trim()).filter(Boolean);
 let agents=[],directives=[],groups=[];
 const flush=()=>{if(agents.length)groups.push({agents:[...agents],directives:[...directives]});agents=[];directives=[];};
 for(const line of lines){
  const sep=line.indexOf(':');if(sep<0)continue;
  const key=line.slice(0,sep).trim().toLowerCase(),value=line.slice(sep+1).trim();
  if(key==='user-agent'){
   if(directives.length)flush();
   agents.push(value.toLowerCase());
  }else if(key==='disallow'||key==='allow'){
   if(!agents.length)return false;
   directives.push({key,value});
  }
 }
 flush();
 const applicable=groups.filter(g=>g.agents.some(a=>a==='*'||a==='befnresearchbot'));
 for(const g of applicable){
  for(const d of g.directives){
   if(d.key==='disallow'&&d.value&&
    (d.value==='/'||path.startsWith(d.value.replace(/\*.*$/,''))))
     return false;
  }
 }
 return true;
}
export function recoveryCooldown(error){
 const s=String(error||'');
 if(/robots|HTTP (403|429|451)/i.test(s))return 24*3600;
 if(/HTTP 5\d\d|network|timeout|fetch failed/i.test(s))return 3600;
 return 0;
}
async function fetchHtml(url){
 const r=await fetch(url,{headers:{Accept:'text/html', 'User-Agent':BOT},
   redirect:'manual',signal:AbortSignal.timeout(18000)});
 if([301,302,303,307,308].includes(r.status))throw Error('Redirect requires review (not followed)');
 if(!r.ok)throw Error('Source HTTP '+r.status);
 const type=r.headers.get('content-type')||'';
 if(!/text\/html|application\/xhtml\+xml/i.test(type))throw Error('Unexpected source content-type '+type.slice(0,60));
 return r.text();
}
async function main(){
 const p=await optional(POLICY);
 if(!permissionAllowsCollection(p)){
  console.log(JSON.stringify({status:'permission-pending',requests:0,certified:0}));
  return;
 }
 const prior=await optional(STATUS)||{};
 if(prior.nextAllowedAt&&Date.parse(prior.nextAllowedAt)>Date.now()){
  console.log(JSON.stringify({status:'provider-cooldown',nextAllowedAt:prior.nextAllowedAt,requests:0}));
  return;
 }
 let error=null,cooldown=0,updated=0,requests=0;
 const failed=[];
 try{
  const robots=await fetch('https://sumodb.sumogames.de/robots.txt',{
   headers:{'User-Agent':BOT},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(![200,404,410].includes(robots.status))
   throw Error('robots access unavailable HTTP '+robots.status);
  if(robots.status===200&&!conservativeRobotsAllow(await robots.text()))
   throw Error('robots rules disallow or ambiguously restrict Rikishi.aspx');
 }catch(e){
  error='Robots preflight: '+String(e.message||e).slice(0,160);
  cooldown=24*3600;
 }
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)throw Error('Frozen cohort mismatch');
 const interval=Math.max(12000,Math.ceil(60000/Number(p.allowedRequestsPerMinute)));
 const limit=Math.min(8,Math.max(1,Number(process.env.SUMODB_MAX_PER_RUN||8)));
 let lastAt=0;
 if(!cooldown){
  for(const w of roster.rikishi){
   if(requests>=limit)break;
   if(!Number.isSafeInteger(Number(w.sumoDbId))||Number(w.sumoDbId)<=0)continue;
   const dest=join(ROOT,'weight-source-crosschecks',w.sourceId+'.json');
   if(await optional(dest))continue;
   // Do not repeatedly request an already-known irreconcilable identity/page.
   if((prior.reviewCases||[]).some(x=>x.sourceId===w.sourceId&&x.permanent))continue;
   const delay=Math.max(0,lastAt+interval-Date.now());
   if(delay)await sleep(delay);
   lastAt=Date.now();requests++;
   try{
    const html=await fetchHtml(SOURCE_URL+w.sumoDbId);
    if(html.length<400||html.length>2_000_000)throw Error('Unexpected source HTML length');
    const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    const name=String(w.shikonaEn||'').toLowerCase();
    if(!clean.toLowerCase().includes(name)||!/\bRikishi\b/i.test(clean))
      throw Error('Wrestler identity not evidenced in source page');
    const rows=parseSumoDbDatedMeasurements(html);
    if(!rows.length)throw Error('No dated measurement rows found (parser/source review)');
    const raw=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
    const datedEvidence=rows.map(x=>({...x,sourceUrl:SOURCE_URL+w.sumoDbId,independentlyCertified:false}));
    const check=reconcileWeightHistory(raw.data.measurements,datedEvidence,Number(w.sumoDbId));
    const doc={
     schemaVersion:1,scope:'Authorised research-only SumoDB historical weight evidence',
     sourceId:w.sourceId,officialNskId:w.officialNskId,sumoDbId:Number(w.sumoDbId),
     rikishi:w.shikonaEn,reviewedAt:now(),sourcePageUrl:SOURCE_URL+w.sumoDbId,
     rawHtmlSha256:createHash('sha256').update(html).digest('hex'),
     datedEvidence,coverage:{
       datedApiPoints:check.apiDatedPoints,datedIndependentPoints:check.independentDatedPoints,
       additionalDatedPoints:check.additionalDatedPoints,
       matchingOverlaps:check.matchingOverlaps,conflicts:check.conflictingOverlaps},
     rightsRecord:{collectionApprovalReference:p.approvalEvidence,
       approvalBasis:p.approvalEvidenceType||'user-reported',
       publicDisplayApproved:p.approvedForPublicDisplay===true},
     certification:'not-started',publiclyReleased:false
    };
    await save(dest,doc);updated++;
   }catch(e){
    const msg=String(e.message||e).slice(0,180);
    const wait=recoveryCooldown(msg);
    if(wait){
     error=msg;cooldown=wait;break;
    }
    failed.push({sourceId:w.sourceId,name:w.shikonaEn,issue:msg,permanent:true});
   }
  }
 }
 const reviews=[...(prior.reviewCases||[])];
 for(const f of failed)if(!reviews.some(x=>x.sourceId===f.sourceId))reviews.push(f);
 const result={schemaVersion:1,scope:'Research-only SumoDB collection progress',
  lastRunAt:now(),source:'https://sumodb.sumogames.de',
  permission:'user-reported-confirmation',requestsThisRun:requests,updatedThisRun:updated,
  cooldownReason:error,nextAllowedAt:cooldown?
    new Date(Date.now()+cooldown*1000).toISOString():null,
  reviewCases:reviews,certifiedWeightHistories:0,productionPublished:0};
 await save(STATUS,result);
 console.log(JSON.stringify({status:cooldown?'cooldown':failed.length?'needs-manual-review':'ok',
  requests,updated,reviewCases:reviews.length,nextAllowedAt:result.nextAllowedAt,
  error,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error('SumoDB collector: '+String(e.message||e));process.exitCode=1;});
