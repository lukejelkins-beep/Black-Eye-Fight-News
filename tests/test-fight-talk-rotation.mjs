import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSocialWatchlist,rollingSocialBatch,scopedSocialConfig,ROLLING_BATCH_SIZE} from '../scripts/fight-talk-rotation.mjs';
const config=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8'));
const directory=buildSocialWatchlist(config);
assert(directory.length>=400,'Keep the existing verified cross-platform account directory');
assert.equal(new Set(directory.map(x=>x.key)).size,directory.length,'Deduplicate platform profiles');
for(const e of directory)assert(e.username&&e.platform&&e.source.sport);
const five=5*60*1000;
const baseline=Date.parse('2026-11-11T00:00:00.000Z');
const cycle=Math.ceil(directory.length/ROLLING_BATCH_SIZE);
const scanned=new Set();
for(let i=0;i<cycle;i++){
 const batch=rollingSocialBatch(directory,baseline+i*five);
 assert(batch.entries.length<=84&&batch.entries.length>0);
 assert.equal(batch.cycleMinutes,cycle*5);
 const scoped=scopedSocialConfig(config,batch);
 assert.equal(scoped.sources.length,batch.entries.filter(e=>e.platform==='Bluesky').length);
 assert.equal(scoped.platforms.Instagram.accounts.length,batch.entries.filter(e=>e.platform==='Instagram').length);
 assert.equal(scoped.platforms.X.accounts.length,batch.entries.filter(e=>e.platform==='X').length);
 assert.equal(scoped.threads.accounts.length,batch.entries.filter(e=>e.platform==='Threads').length);
 for(const p of batch.entries){
  assert(!scanned.has(p.key),'Do not scan a source twice within one rolling cycle');
  scanned.add(p.key);
 }
}
assert.equal(scanned.size,directory.length,'Entire current directory covered within one cycle');
const synthetic=Array.from({length:1000},(_,i)=>({key:'bluesky:actor'+i,platform:'Bluesky',username:'actor'+i,source:{sport:'boxing'}}));
const scanned1000=new Set();
for(let i=0;i<12;i++){
 const batch=rollingSocialBatch(synthetic,baseline+i*five);
 assert.equal(batch.batchCount,12);
 assert.equal(batch.cycleMinutes,60);
 assert(batch.scheduled<=84&&batch.scheduled>0);
 for(const x of batch.entries){
  assert(!scanned1000.has(x.key));
  scanned1000.add(x.key);
 }
}
assert.equal(scanned1000.size,1000);
assert.deepEqual(rollingSocialBatch(synthetic,baseline).entries.map(x=>x.key),
 rollingSocialBatch(synthetic,baseline+60*five).entries.map(x=>x.key),'Next hour restarts at first shard');
assert.equal(rollingSocialBatch(synthetic,baseline+oneMinute()).batchIndex,rollingSocialBatch(synthetic,baseline).batchIndex);
function oneMinute(){return 60_000;}
console.log('Rolling Fight Talk scheduler passed:',directory.length,'deduplicated sources;',cycle*5,'minute current cycle; 1000 within 60 minutes.');
