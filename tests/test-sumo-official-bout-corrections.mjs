import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyOfficialBoutCorrections} from '../scripts/sumo-official-bout-corrections.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const manifest=read('data/sumo/backfill/v1/official-bout-corrections.json');
const raw=read('data/sumo/backfill/v1/rikishi/242.json');
const roster=read('data/sumo/rikishi-index.json');
const w=roster.rikishi.find(x=>x.sourceId===242);
const counts=matches=>{
 const regular=matches.filter(m=>m.division!=='Mae-zumo'&&Number(m.day)>=1&&Number(m.day)<=15);
 return {wins:regular.filter(m=>m.winnerId===242).length,losses:regular.filter(m=>m.winnerId!==242).length};
};
test('JSA official Obara default-loss correction reconciles W-L, never modifies raw source',()=>{
 const before=JSON.stringify(raw.data.matches);
 const out=applyOfficialBoutCorrections(w,raw,manifest);
 assert.deepEqual(out.errors,[]);
 assert.equal(out.applied.length,1);
 assert.deepEqual(counts(raw.data.matches),{wins:250,losses:208});
 assert.deepEqual(counts(out.matches),{wins:249,losses:209});
 assert.equal(JSON.stringify(raw.data.matches),before);
 assert.equal(out.applied[0].bashoId,'202207');
 const bout=out.matches.find(m=>m.bashoId==='202207'&&m.day===12);
 assert.equal(bout.winnerId,213);
 assert.equal(bout.officialResultCorrection.rawWinnerId,242);
 assert.equal(bout.officialResultCorrection.careerCertified,false);
});
test('correction is denied when raw source, opposite wrestler or JSA identity changes',()=>{
 const copy=structuredClone(manifest);
 copy.bySourceId['242'][0].expectedRawWinnerId=213;
 const rejected=applyOfficialBoutCorrections(w,raw,copy);
 assert.equal(rejected.applied.length,0);
 assert.equal(rejected.errors.length,1);
 assert.deepEqual(counts(rejected.matches),{wins:250,losses:208});
 copy.bySourceId['242'][0].expectedRawWinnerId=242;
 copy.bySourceId['242'][0].officialNskId=9999;
 const wrong=applyOfficialBoutCorrections(w,raw,copy);
 assert.equal(wrong.applied.length,0);
 assert.equal(wrong.errors.length,1);
});
test('unlisted wrestlers retain unmodified historic bout rows',()=>{
 const ura=read('data/sumo/backfill/v1/rikishi/28.json');
 const rw=roster.rikishi.find(x=>x.sourceId===28);
 const out=applyOfficialBoutCorrections(rw,ura,manifest);
 assert.equal(out.applied.length,0);
 assert.equal(out.errors.length,0);
 assert.deepEqual(out.matches,ura.data.matches);
});
