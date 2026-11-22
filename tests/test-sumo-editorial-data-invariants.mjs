import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const baseline=JSON.parse(readFileSync(new URL('./fixtures/sumo-editorial-baseline.json',import.meta.url),'utf8'));
function gitBlobSha(bytes){
 const header=Buffer.from('blob '+bytes.length+'\0','utf8');
 return createHash('sha1').update(header).update(bytes).digest('hex');
}
test('the isolated editorial redesign does not edit any frozen Sumo cache or evidence file',()=>{
 assert.equal(baseline.baseSha,'922062b48a6853bc3643973b557b70e96667297f');
 assert.equal(baseline.protectedFiles.length,10);
 // Files the scheduled live updater rewrites on purpose (results, rosters, career
 // and head-to-head ledgers). They are checked for consistency below, not frozen.
 // Everything else here (photos, style evidence, photo import status) stays frozen.
 const liveFiles=new Set([
   'data/sumo/preview-details.json','data/sumo/rikishi-index.json','data/sumo/research-h2h-history.json',
   'data/sumo/research-h2h-opponents.json','data/sumo/research-h2h-summary.json','data/sumo/api-trusted-status.json','data/sumo/career-history.json'
 ]);
 const liveSnapshot='data/sumo/preview-details.json';
 const protectedFiles=baseline.protectedFiles.filter(file=>!liveFiles.has(file.path));
 assert.equal(protectedFiles.length,3);
 for(const {path,gitBlobSha:expected,size} of protectedFiles){
   const bytes=readFileSync(new URL('../'+path,import.meta.url));
   assert.equal(bytes.length,size,path+' length changed during UX-only work');
   assert.equal(gitBlobSha(bytes),expected,path+' content changed: review source update separately, never silently restore historical fixture');
 }
 const read=f=>JSON.parse(readFileSync(new URL('../data/sumo/'+f+'.json',import.meta.url),'utf8'));
 const roster=read('rikishi-index'),summary=read('research-h2h-summary'),opponents=read('research-h2h-opponents'),history=read('research-h2h-history');
 const size=roster.rikishi.length;
 assert.equal(roster.count,size);
 for(const file of [summary,opponents,history])assert.equal(file.cohortSize,size);
 for(const r of roster.rikishi){
   assert.ok(summary.profiles[r.sourceId],'no career summary for '+r.shikonaEn);
   assert.ok(opponents.profiles[r.sourceId],'no opponent list for '+r.shikonaEn);
 }
 const daily=JSON.parse(readFileSync(new URL('../'+liveSnapshot,import.meta.url),'utf8'));
 assert.equal(daily.schemaVersion,1);
 assert.equal(daily.bashoId,'202611');
 assert.deepEqual(daily.trackedDivisions,['Makuuchi','Juryo','Makushita']);
 for(const division of daily.trackedDivisions){
   assert.equal(daily.banzuke[division]?.status,'available');
   assert.ok(Array.isArray(daily.banzuke[division]?.data?.east));
   assert.ok(Array.isArray(daily.banzuke[division]?.data?.west));
 }
});
