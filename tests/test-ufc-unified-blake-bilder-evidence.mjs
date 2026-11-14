import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json'),register=read('data/ufc-independent-full-career-verification.json'),feed=read('data/ufc-feeder-bout-evidence.json');
test('Blake Bilder unique 3-bout complete official UFC history preserved on exactly one approved 783-cohort register',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.ok(roster.approvedFighters.includes('blake-bilder'));
 const b=register.fighters['blake-bilder'];
 assert.equal(b.sourceCoverageAttested,true);
 assert.equal(b.scope,'complete_official_ufc_career');
 assert.equal(b.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(b.fighterName,'Blake Bilder');
 assert.equal(b.fighterUrl,'https://ufcstats.com/fighter-details/5095b0920a3602aa');
 assert.equal(b.officialFighterUrl,'https://www.ufc.com/athlete/blake-bilder');
 assert.equal(b.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
 assert.deepEqual(b.verifiedNumericFighterIds,['2779']);
 assert.equal(b.officialUfcCareerBoutCount,3);
 assert.deepEqual(b.bouts.map(x=>[x.date,x.opponent,x.result,x.nativeBoutId,x.nativeFighterId]),[
 ['2023-02-11','Shane Young','win','59741','2779'],
 ['2023-06-10','Kyle Nelson','loss','61340','2779'],
 ['2024-02-03','JeongYeong Lee','loss','59860','2779']]);
 assert.equal(new Set(b.bouts.map(x=>x.nativeBoutId)).size,3);
 assert.equal(new Set(b.bouts.map(x=>x.fightUrl)).size,3);
 for(const x of b.bouts)assert.match(x.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/);
});
test('source-excluded Blake Bilder DWCS bout exact native 88258 kept out of official UFC career',()=>{
 const b=register.fighters['blake-bilder'];
 assert.ok(!b.bouts.some(x=>x.nativeBoutId==='88258'));
 const records=feed.bouts.filter(x=>x.fighterSlug==='blake-bilder'&&x.boutId==='88258');
 assert.equal(records.length,1);
 assert.equal(records[0].date,'2022-08-30');
 assert.equal(records[0].opponent,'Alex Morgan');
 assert.equal(records[0].result,'win');
 assert.equal(records[0].sourceUrl,'https://www.ufc.com/athlete/blake-bilder');
 assert.deepEqual(b.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),['88258']);
 assert.match(b.sourceScopeVerified,/DWCS/);
});
