import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approved=read('data/ufc-36-month-roster-approval.json');
const register=read('data/ufc-independent-full-career-verification.json');
const source=read('data/ufc-unified-mandel-official-source-review-20261114.json');
const excluded=read('data/ufc-feeder-bout-evidence.json');
test('Mandel Nallo official UFC chronology is two distinct independently source-attested fights',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.ok(approved.approvedFighters.includes('mandel-nallo'));
 assert.equal(source.certificationGranted,false);
 const proof=register.fighters['mandel-nallo'];
 assert.equal(proof.scope,'complete_official_ufc_career');
 assert.equal(proof.sourceCoverageAttested,true);
 assert.equal(proof.officialUfcCareerBoutCount,2);
 assert.deepEqual(proof.verifiedNumericFighterIds,['571']);
 assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/8f4528c10bd34fab');
 assert.deepEqual(proof.bouts.map(r=>[r.date,r.opponent,r.result,r.nativeBoutId,r.nativeFighterId]),[
  ['2026-04-18','Jai Herbert','loss','66091','571'],
  ['2026-10-17','Nate Landwehr','win','83405','571']
 ]);
 assert.equal(new Set(proof.bouts.map(x=>x.fightUrl)).size,2);
 assert.ok(proof.bouts.every(x=>/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/.test(x.fightUrl)));
});
test('one precisely primary-sourced DWCS contest is not counted as a third UFC fight',()=>{
 const x=excluded.bouts.filter(y=>y.fighterSlug==='mandel-nallo'&&y.boutId==='84141');
 assert.equal(x.length,1);
 assert.equal(x[0].date,'2025-09-02');
 assert.equal(x[0].opponent,'Samuel Silva');
 assert.ok(x[0].sourceUrl.startsWith('https://www.ufc.com/news/'));
 assert.ok(!register.fighters['mandel-nallo'].bouts.some(y=>y.nativeBoutId==='84141'));
});
