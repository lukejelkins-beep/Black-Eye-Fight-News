import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approved=read('data/ufc-36-month-roster-approval.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const original=read('data/ufc-unified-wave9-jose-henrique-official-source-review-20261114.json');
const jose=registry.fighters['jose-henrique'];
const jonny=registry.fighters['jonny-parsons'];

test('one immutable roster, canonical source register, primary evidence is source-only',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.equal(new Set(approved.approvedFighters).size,783);
 assert.ok(approved.approvedFighters.includes('jose-henrique'));
 assert.equal(original.nonproduction,true);
 assert.equal(original.certificationGranted,false);
 assert.equal(jose?.sourceCoverageAttested,true);
 assert.equal(jose?.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(jose?.officialUfcCareerBoutCount,2);
});

test('José Souza official name exactly anchored to original native José Henrique ID 286',()=>{
 assert.equal(jose.fighterName,'Jose Souza');
 assert.equal(jose.fighterUrl,original.pinnedGrecoFighterUrl);
 assert.equal(jose.officialFighterUrl,original.officialFighterUrl);
 assert.deepEqual(jose.sourceVerifiedNativeNameAliases,['Jose Henrique']);
 assert.equal(jose.disambiguation.verifiedUfcStatsFighterId,'20a0e4cc5227c117');
 assert.equal(jose.sourceSnapshot.sourceCommit,original.sourceCommit);
 assert.deepEqual(jose.verifiedNumericFighterIds,['286']);
 assert.deepEqual(jose.bouts.map(x=>[x.nativeBoutId,x.nativeFighterId,x.date,x.opponent,x.result]),[
  ['66109','286','2026-05-30','Ding Meng','win'],
  ['93282','286','2026-11-07','Jonny Parsons','win']
 ]);
 assert.equal(new Set(jose.bouts.map(x=>x.fightUrl)).size,2);
 for (const b of jose.bouts)
  assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
});
test('mirrored historic native bout is one contest, not separate or duplicated',()=>{
 const joseBout=jose.bouts.find(x=>x.nativeBoutId==='93282');
 const jonnyBout=jonny.bouts.find(x=>x.nativeBoutId==='93282');
 assert.ok(joseBout&&jonnyBout);
 assert.equal(joseBout.result,'win');
 assert.equal(jonnyBout.result,'loss');
 assert.equal(jonnyBout.nativeFighterId,'2818');
 assert.deepEqual(jonnyBout.verifiedOpponentNativeFighterIds,['286']);
 assert.equal(joseBout.fightUrl,jonnyBout.fightUrl);
 assert.equal(joseBout.date,jonnyBout.date);
});
test('distinct 2022 DWCS bout source-excluded from UFC-only career',()=>{
 const f=feeder.bouts.filter(x=>x.fighterSlug==='jose-henrique'&&x.boutId==='88254');
 assert.equal(f.length,1);
 assert.equal(f[0].date,'2022-08-30');
 assert.equal(f[0].opponent,'Yusaku Kinoshita');
 assert.equal(f[0].sourceUrl,'https://www.ufc.com/athlete/jose-souza');
 assert.ok(!jose.bouts.some(x=>x.nativeBoutId==='88254'));
});
