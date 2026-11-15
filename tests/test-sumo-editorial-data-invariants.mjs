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
 assert.equal(baseline.baseSha,'c99a3ff1664d32e3699e14204f2e78dfa73712b5');
 assert.equal(baseline.protectedFiles.length,10);
 for(const {path,gitBlobSha:expected,size} of baseline.protectedFiles){
   const bytes=readFileSync(new URL('../'+path,import.meta.url));
   assert.equal(bytes.length,size,path+' length changed during UX-only work');
   assert.equal(gitBlobSha(bytes),expected,path+' content changed: review source update separately, never silently restore historical fixture');
 }
});
