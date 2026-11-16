import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url)));
const photos=JSON.parse(readFileSync(new URL('../data/sumo/approved-photos.json',import.meta.url))).bySourceId;
const register=JSON.parse(readFileSync(new URL('../data/sumo/official-portrait-research.json',import.meta.url)));
test('official portrait research register is a complete unique mapping of frozen 190-roster',()=>{
 assert.equal(register.records.length,190);
 assert.deepEqual(new Set(register.records.map(r=>r.sourceId)),new Set(roster.rikishi.map(r=>r.sourceId)));
 for(const r of register.records){
   const w=roster.rikishi.find(w=>w.sourceId===r.sourceId);
   assert.equal(r.officialNskId,w.officialNskId);
   assert.equal(r.officialProfileUrl,`https://www.sumo.or.jp/EnSumoDataRikishi/profile/${w.officialNskId}/`);
 }
});
test('unlicensed official images are never presented as reusable',()=>{
 for(const r of register.records){
  assert.equal(r.officialPortraitReuse,'permission-not-established');
  assert.equal(r.officialPortraitImageUrl,null);
  assert.equal(r.officialPortraitStatus,'not-individually-verified');
  assert.ok(!r.approvedLocalPhoto || r.approvedLocalPhoto.path.startsWith('assets/sumo-photos/'));
 }
 assert.equal(register.summary.officialPortraitReuseApproved,0);
});
