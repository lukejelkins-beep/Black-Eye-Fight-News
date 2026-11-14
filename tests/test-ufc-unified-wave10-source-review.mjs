import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=read('data/ufc-36-month-roster-approval.json');
const source=read('data/ufc-unified-wave10-official-source-review-20261114.json');
const ledger=read('data/ufc-independent-full-career-verification.json');
const slugs=['lance-gibson-jr','lawrence-lui','leon-shahbazyan','lerryan-douglas','levi-rodrigues-jr','lucas-fernando','lucas-rocha'];
test('freeze one 783-person cohort and seven separate source-only athlete histories',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(source.rosterSize,783);
 assert.equal(source.nonproduction,true);
 assert.equal(source.certificationGranted,false);
 assert.deepEqual(Object.keys(source.fighters),slugs);
 for(const s of slugs){
   assert.ok(approval.approvedFighters.includes(s),s);
   assert.equal(ledger.fighters[s]?.sourceCoverageAttested===true,false,s);
   assert.equal(source.fighters[s].officialUfcCareerCount,2,s);
   assert.equal(source.fighters[s].bouts.length,2,s);
   assert.match(source.fighters[s].pinnedGrecoFighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]{16}$/);
   assert.match(source.fighters[s].officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
 }
});
test('primary review records corrected official losses and independently separate qualifiers',()=>{
 for(const name of ['lance-gibson-jr','lawrence-lui','leon-shahbazyan','lerryan-douglas','levi-rodrigues-jr','lucas-rocha']){
   assert.ok(source.fighters[name].bouts.some(x=>x.result==='loss'),name);
 }
 assert.equal(source.fighters['lucas-fernando'].bouts.every(x=>x.result==='win'),true);
 assert.ok(/Road to UFC/i.test(source.fighters['lawrence-lui'].reviewNote));
 assert.equal(source.pinnedSource.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
});
