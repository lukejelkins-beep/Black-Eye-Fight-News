import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approved=read('data/ufc-36-month-roster-approval.json');
const source=read('data/ufc-unified-wave6-official-source-review-20261114.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
test('all six two-bout official UFC career attestations retain exact unique native/source proof',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.equal(new Set(approved.approvedFighters).size,783);
 assert.equal(source.nonproduction,true);
 assert.equal(source.certificationGranted,false);
 assert.equal(Object.keys(source.fighters).length,6);
 let total=0;
 for(const [slug,official] of Object.entries(source.fighters)){
  assert.ok(approved.approvedFighters.includes(slug),slug);
  const proof=registry.fighters[slug];
  assert.ok(proof?.sourceCoverageAttested===true,slug);
  assert.equal(proof.scope,'complete_official_ufc_career',slug);
  assert.equal(proof.officialUfcCareerBoutCount,2,slug);
  assert.equal(proof.bouts.length,2,slug);
  assert.equal(proof.fighterUrl,official.pinnedGrecoFighterUrl,slug);
  assert.equal(proof.officialFighterUrl,official.ufcOfficialAthleteUrl,slug);
  assert.equal(new Set(proof.bouts.map(r=>r.fightUrl)).size,2,slug);
  assert.equal(new Set(proof.bouts.map(r=>r.nativeBoutId)).size,2,slug);
  assert.equal(new Set(proof.bouts.map(r=>r.nativeFighterId)).size,1,slug);
  assert.deepEqual(new Set(proof.verifiedNumericFighterIds),new Set(proof.bouts.map(r=>r.nativeFighterId)));
  for(const row of official.bouts){
   const attested=proof.bouts.filter(r=>r.date===row.date&&r.result===row.result&&
    norm(r.opponent)===norm(row.opponent));
   assert.equal(attested.length,1,slug+':'+row.date);
   assert.match(attested[0].fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i);
   assert.match(String(attested[0].nativeBoutId),/^[1-9]\d*$/);
  }
  total+=proof.bouts.length;
 }
 assert.equal(total,12);
});
test('Charalampos and Ding DWCS feeder bouts are uniquely source-attested and never inserted into UFC career',()=>{
 for(const [slug,boutId] of [['charalampos-grigoriou','84027'],['ding-meng','83989']]){
  const rows=feeder.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===boutId);
  assert.equal(rows.length,1,slug);
  assert.ok(rows[0].sourceUrl.startsWith('https://www.ufc.com/'));
  assert.ok(!registry.fighters[slug].bouts.some(x=>x.nativeBoutId===boutId));
 }
});
test('Ding native opponent aliases are limited to exact dates, bout IDs and numeric opposite corners',()=>{
 const x=registry.fighters['ding-meng'];
 assert.equal(x.verifiedNumericFighterIds[0],'67');
 const byId=Object.fromEntries(x.bouts.map(y=>[y.nativeBoutId,y]));
 assert.deepEqual(byId['66109'].sourceVerifiedNativeOpponentAliases,['Jose Henrique']);
 assert.deepEqual(byId['66109'].verifiedOpponentNativeFighterIds,['286']);
 assert.equal(byId['66109'].sourceVerifiedAliasPrimaryUfcFighterUrl,'https://www.ufc.com/athlete/jose-souza');
 assert.deepEqual(byId['83785'].sourceVerifiedNativeOpponentAliases,['Cameron Nelson']);
 assert.deepEqual(byId['83785'].verifiedOpponentNativeFighterIds,['53075']);
 assert.equal(byId['83785'].sourceVerifiedAliasPrimaryUfcFighterUrl,'https://www.ufc.com/athlete/cam-nelson');
});
