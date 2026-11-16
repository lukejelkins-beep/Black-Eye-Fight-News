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
 // The current basho snapshot is intentionally refreshed after published
 // results and next-day torikumi; protect all nine genuinely frozen caches.
 const liveSnapshot='data/sumo/preview-details.json';
 const protectedFiles=baseline.protectedFiles.filter(file=>file.path!==liveSnapshot);
 assert.equal(protectedFiles.length,9);
 for(const {path,gitBlobSha:expected,size} of protectedFiles){
   const bytes=readFileSync(new URL('../'+path,import.meta.url));
   assert.equal(bytes.length,size,path+' length changed during UX-only work');
   assert.equal(gitBlobSha(bytes),expected,path+' content changed: review source update separately, never silently restore historical fixture');
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
