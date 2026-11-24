/**
 * Read-only Render test-site freshness monitor. Compare the public PREVIEW
 * career history against the research export without triggering a deploy.
 * A stale or unreachable preview must not interrupt source collection.
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const SRC='data/sumo/exports/career-history.json';
const DEST='data/sumo/backfill/v1/preview-live-qa.json';
const PREVIEW_URL='https://befn-sumo-preview.onrender.com/data/sumo/career-history.json';
const digest=s=>createHash('sha256').update(s).digest('hex');
const count=d=>Object.keys(d?.bySourceId||{}).length;
const size=d=>Number(d?.datedWeightPoints)||0;
const ura=d=>d?.bySourceId?.['28']?.weight||[];
export function previewFreshness(expected,received){
 const expectedProfiles=count(expected),expectedWeights=size(expected);
 if(expectedProfiles!==190||expected.cohortSize!==190||expected.certified!==false)
  throw Error('Refusing to compare invalid research career export');
 const gotProfiles=count(received),gotWeights=size(received);
 const liveUra=ura(received),expectedUra=ura(expected);
 const invalidLive=received?.certified!==false&&received?.certified!==undefined;
 const sameProfileCounts=gotProfiles===expectedProfiles&&gotWeights===expectedWeights;
 const uraNew=liveUra.some(x=>x.basho==='202611'&&x.source==='https://www.sumo.or.jp/EnSumoDataRikishi/profile/3616/');
 return {status:invalidLive?'unsafe-preview':
    !sameProfileCounts?'outdated-preview-data':
    uraNew?'unsafe-preview':
    'summary-matched',
  expectedProfiles,liveProfiles:gotProfiles,
  expectedDatedWeightPoints:expectedWeights,liveDatedWeightPoints:gotWeights,
  expectedUraDatedPoints:expectedUra.length,liveUraDatedPoints:liveUra.length,
  liveHasUndatedJsaCurrentAsHistoricalPoint:uraNew,
  liveCertified:received?.certified??null};
}
export async function inspectPreview({expectedBody,fetchImpl=fetch,timeoutMs=12000}){
 const expected=JSON.parse(expectedBody);
 let reported,raw=null,httpStatus=null,reason=null;
 try{
  const response=await fetchImpl(PREVIEW_URL,{
   headers:{Accept:'application/json', 'Cache-Control':'no-cache'},
   signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});
  httpStatus=response.status;
  if(!response.ok)throw Error('HTTP '+response.status);
  const type=response.headers?.get?.('content-type')||'';
  if(type&&!/application\/json|text\/plain|octet-stream/i.test(type))
   throw Error('Unexpected content type '+type.slice(0,50));
  raw=await response.text();
  if(raw.length<12||raw.length>12_000_000)throw Error('Invalid preview response size');
  reported=previewFreshness(expected,JSON.parse(raw));
 }catch(e){
  reason=String(e.message||e).slice(0,160);
  reported={status:'preview-unavailable-or-invalid',
   expectedProfiles:count(expected),liveProfiles:null,
   expectedDatedWeightPoints:size(expected),liveDatedWeightPoints:null,
   expectedUraDatedPoints:ura(expected).length,liveUraDatedPoints:null};
 }
 const rawIdentical=raw!==null&&digest(raw)===digest(expectedBody);
 const status=reported.status==='summary-matched'?
   rawIdentical?'in-sync':'needs-complete-json-review':reported.status;
 return {schemaVersion:1,previewUrl:PREVIEW_URL,checkedAt:new Date().toISOString(),
  status,sourceResearchOnly:true,productionAffected:false,
  expectedSha256:digest(expectedBody),liveSha256:raw?digest(raw):null,
  sameBytes:rawIdentical,httpStatus,reason,
  ...reported,status};
}
async function main(){
 const body=await readFile(SRC,'utf8');
 const report=await inspectPreview({expectedBody:body});
 await mkdir(join('data','sumo','backfill','v1'),{recursive:true});
 const output=JSON.stringify(report,null,2)+'\n';
 const current=await readFile(DEST,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(current!==output){const temp=DEST+'.tmp';await writeFile(temp,output);await rename(temp,DEST);}
 console.log(JSON.stringify({status:report.status,remoteProfiles:report.liveProfiles,
  expectedProfiles:report.expectedProfiles,httpStatus:report.httpStatus}));
 // Research is never held hostage by Render auto-deploy state.
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
