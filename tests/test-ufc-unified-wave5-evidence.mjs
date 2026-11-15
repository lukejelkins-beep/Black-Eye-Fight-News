import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approved=read('data/ufc-36-month-roster-approval.json');
const source=read('data/ufc-unified-wave5-official-source-review-20261114.json');
const proof=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const normalize=x=>String(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
test('six distinct wave5 full UFC careers have source-linked paired native identities without manufacturing RTU fight',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(Object.keys(source.fighters).length,7);
 const clear=Object.keys(source.fighters).filter(s=>s!=='zhu-kangjie');
 assert.equal(clear.length,6);
 for(const slug of clear){
  assert.ok(approved.approvedFighters.includes(slug));
  const attest=proof.fighters[slug],original=source.fighters[slug];
  assert.ok(attest?.sourceCoverageAttested===true,slug);
  assert.equal(attest.officialUfcCareerBoutCount,original.officialUfcCareerCount,slug);
  assert.equal(attest.fighterUrl,original.pinnedGrecoFighterUrl,slug);
  assert.equal(attest.bouts.length,original.bouts.length,slug);
  assert.equal(new Set(attest.bouts.map(x=>x.nativeBoutId)).size,attest.bouts.length,slug);
  assert.equal(new Set(attest.bouts.map(x=>x.fightUrl)).size,attest.bouts.length,slug);
  for(const target of original.bouts){
   const matching=attest.bouts.filter(x=>x.date===target.date&&
    x.result===target.result&&normalize(x.opponent)===normalize(target.opponent));
   assert.equal(matching.length,1,slug+':'+target.date);
   assert.match(matching[0].fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(attest.verifiedNumericFighterIds.includes(matching[0].nativeFighterId));
  }
 }
 // Official UFC.com lists the missing May 2025 RTU final, but pinned Greco
 // and saved native caches do not support full strict source certification.
 assert.equal(proof.fighters['zhu-kangjie'],undefined);
 assert.equal(source.fighters['zhu-kangjie'].officialUfcCareerCount,2);
 assert.equal(source.fighters['zhu-kangjie'].bouts[0].opponent,'Bin Xie');
});
test('Tina Black is specifically source-linked as Valesca Machado, not generically fuzzy-matched',()=>{
 const p=proof.fighters['valesca-machado'];
 assert.equal(p.fighterName,'Valesca Machado');
 assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/a1a91dbf41a029c4');
 assert.equal(p.bouts[0].nativeBoutId,'85938');
 assert.equal(p.verifiedNumericFighterIds.length,1);
 assert.ok(feeder.bouts.some(x=>x.fighterSlug==='valesca-machado'&&x.boutId==='83900'));
});
