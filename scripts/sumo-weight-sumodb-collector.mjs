/**
 * Optional SumoDB historical-weight research collector.
 * DISABLED unless documented provider permission exists in the research
 * policy file. Never publish these source facts or rewrite API records.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseSumoDbDatedMeasurements,reconcileWeightHistory} from './sumo-weight-history-190.mjs';
const ROOT='data/sumo/backfill/v1';
const POLICY=join(ROOT,'sumodb-use-policy.json');
const URL='https://sumodb.sumogames.de/Rikishi.aspx?r=';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const write=async(p,value)=>{
 await mkdir(join(ROOT,'weight-source-crosschecks'),{recursive:true});
 const tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n');
 await rename(tmp,p);
};
export function permissionAllowsCollection(policy){
 return policy?.approvedForAutomatedCollection===true&&
  typeof policy.approvalEvidence==='string'&&policy.approvalEvidence.length>=12&&
  Number.isFinite(Number(policy.allowedRequestsPerMinute))&&
  Number(policy.allowedRequestsPerMinute)>0&&Number(policy.allowedRequestsPerMinute)<=6;
}
export function conservativeRobotsAllow(robots,path='/Rikishi.aspx'){
 if(typeof robots!=='string'||robots.length>100000)return false;
 // Refuse unknown or ambiguous user-agent instructions, and any Disallow
 // applying to a shared "*" group or the BEFN collector. This is stricter
 // than the RFC rather than risking accidental noncompliance.
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
async function checkedFetch(url){
 const r=await fetch(url,{headers:{Accept:'text/html','User-Agent':'BEFNResearchBot/1.0 (source-authorised historical-weight research; contact admin@blackeyefightnews.com.au)'},
  redirect:'manual',signal:AbortSignal.timeout(18000)});
 if(r.status===301||r.status===302||r.status===307||r.status===308)
   throw Error('Redirect requires review (not followed)');
 if(!r.ok)throw Error('Source HTTP '+r.status);
 return r.text();
}
async function main(){
 const policy=await optional(POLICY);
 if(!permissionAllowsCollection(policy)){
   console.log(JSON.stringify({status:'permission-pending',requests:0,
     note:'No automatic SumoDB requests until documented source-owner approval'}));return;
 }
 const robots=await fetch('https://sumodb.sumogames.de/robots.txt',{
   headers:{'User-Agent':'BEFNResearchBot/1.0 (permissions-first)'},
   redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(![200,404,410].includes(robots.status))throw Error('Robots unavailable/blocked: HTTP '+robots.status);
 if(robots.status===200&&!conservativeRobotsAllow(await robots.text()))
   throw Error('robots.txt disallows or ambiguously defines the SumoDB route');
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)throw Error('Cohort changed; do not automatically enumerate');
 const cadence=Math.max(12000,Math.ceil(60000/Number(policy.allowedRequestsPerMinute)));
 const batchLimit=Math.min(4,Math.max(1,Math.floor(Number(process.env.SUMODB_MAX_PER_RUN||3))));
 let requests=0,updated=0,exceptions=[],lastStarted=0;
 for(const w of roster.rikishi){
  if(requests>=batchLimit)break;
  if(!Number.isSafeInteger(Number(w.sumoDbId))||Number(w.sumoDbId)<=0)continue;
  const dest=join(ROOT,'weight-source-crosschecks',w.sourceId+'.json');
  if(await optional(dest))continue; // never overwrite completed source evidence
  const delay=Math.max(0,lastStarted+cadence-Date.now());if(delay)await sleep(delay);
  lastStarted=Date.now();requests++;
  try{
   const html=await checkedFetch(URL+w.sumoDbId);
   if(html.length<400||html.length>2_000_000)throw Error('Unexpected source response length');
   const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
       .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
   // SumoDB often appends a wrestler's real name to the ring name.
   const sourceName=String(w.shikonaEn).toLowerCase();
   if(!plain.toLowerCase().includes(sourceName)||!html.includes('Rikishi'))
     throw Error('Source identity not supported by page content');
   const rows=parseSumoDbDatedMeasurements(html);
   const raw=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
   const datedEvidence=rows.map(x=>({...x,sourceUrl:URL+w.sumoDbId,independentlyCertified:false}));
   const coverage=reconcileWeightHistory(raw.data.measurements,datedEvidence,Number(w.sumoDbId));
   const doc={schemaVersion:1,scope:'SumoDB independent dated weight history, research only',
     sourceId:w.sourceId,officialNskId:w.officialNskId,sumoDbId:Number(w.sumoDbId),
     rikishi:w.shikonaEn,reviewedAt:new Date().toISOString(),
     sourcePageUrl:URL+w.sumoDbId,rawHtmlSha256:createHash('sha256').update(html).digest('hex'),
     datedEvidence,
     coverage:{datedApiPoints:coverage.apiDatedPoints,datedIndependentPoints:coverage.independentDatedPoints,
       additionalDatedPoints:coverage.additionalDatedPoints,matchingOverlaps:coverage.matchingOverlaps,
       conflicts:coverage.conflictingOverlaps},
     rightsRecord:{collectionApprovalReference:policy.approvalEvidence,
       publicDisplayApproved:policy.approvedForPublicDisplay===true},
     certification:'not-started',publiclyReleased:false};
   await write(dest,doc);updated++;
  }catch(e){
   exceptions.push({sourceId:w.sourceId,issue:String(e.message||e).slice(0,150)});
   // Abort on permission, server, or connection failure; no evasive retry.
   if(/HTTP (403|429|5\d\d)|Redirect|timeout|fetch failed/i.test(String(e.message||e)))break;
  }
 }
 console.log(JSON.stringify({status:exceptions.length?'review-required':'ok',
   requests,updated,exceptions,certified:0,published:0}));
 if(exceptions.length)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error('SumoDB research worker: '+String(e.message||e));process.exitCode=1;});
