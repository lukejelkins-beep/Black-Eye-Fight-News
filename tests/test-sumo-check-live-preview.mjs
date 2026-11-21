import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPreview,previewFreshness} from '../scripts/sumo-check-live-preview.mjs';
const base={schemaVersion:1,cohortSize:190,certified:false,
 datedWeightPoints:418,
 bySourceId:Object.fromEntries(Array.from({length:190},(_,i)=>{
  const id=String(i===0?28:i+1000);
  return [id,{weight:i===0?[
   {basho:'201503',kg:113,source:'https://www.sumo-api.com/api/measurements?rikishiId=28'},
   {basho:'202505',kg:139,source:'https://sumodb.sumogames.de/Rikishi.aspx?r=12226'}
  ]:[]}];
 }))};
const result={status:200,ok:true,headers:{get:()=> 'application/json'}};
test('preview is up to date only when entire exported JSON matches',async()=>{
 const data=JSON.stringify(base);
 const r=await inspectPreview({expectedBody:data,fetchImpl:async()=>({...result,text:async()=>data})});
 assert.equal(r.status,'in-sync');
 assert.equal(r.liveProfiles,190);
 assert.equal(r.sameBytes,true);
 assert.equal(r.sourceResearchOnly,true);
 assert.equal(r.productionAffected,false);
});
test('stale one-person Render cache is explicitly flagged, not silently accepted',async()=>{
 const expectedBody=JSON.stringify(base);
 const earlier=JSON.stringify({schemaVersion:1,bySourceId:{"28":{weight:[{basho:'202611',kg:138,
   source:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/3616/'}]}}});
 const r=await inspectPreview({expectedBody,fetchImpl:async()=>({...result,text:async()=>earlier})});
 assert.equal(r.status,'outdated-preview-data');
 assert.equal(r.liveProfiles,1);
 assert.equal(r.liveHasUndatedJsaCurrentAsHistoricalPoint,true);
 assert.equal(r.sameBytes,false);
});
test('stale or broken preview does not throw and never claims healthy sync',async()=>{
 const r=await inspectPreview({expectedBody:JSON.stringify(base),
  fetchImpl:async()=>{throw Error('Preview not yet deployed')}});
 assert.equal(r.status,'preview-unavailable-or-invalid');
 assert.equal(r.liveProfiles,null);
 assert.match(r.reason,/Preview not yet deployed/);
});
test('preview with certified=true is never treated as an approved research cache',()=>{
 const preview={...base,certified:true};
 assert.equal(previewFreshness(base,preview).status,'unsafe-preview');
});
