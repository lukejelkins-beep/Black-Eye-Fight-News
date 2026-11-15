import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=load('data/ufc-36-month-roster-approval.json');
const register=load('data/ufc-independent-full-career-verification.json');
const progress=load('data/ufcalendar-rich-progress.json');
const feeder=load('data/ufc-feeder-bout-evidence.json');
const expected=[["2024-02-24","Denys Bondar","win","39038","5e8c710f9f27aff8"],["2024-09-14","Ode Osbourne","win","60221","78b506e5092a27fd"],["2025-03-29","Kevin Borjas","loss","61008","5ba7dd466e30169f"]];
test('Ronaldo Rodriguez complete sourced Octagon career has three unique exact native fights and measured rounds',()=>{
 assert.equal(roster.status,'approved');
 assert.equal(roster.approvedFighters.length,783);
 assert.ok(roster.approvedFighters.includes('ronaldo-rodriguez'));
 const x=register.fighters['ronaldo-rodriguez'];
 assert.equal(x.sourceCoverageAttested,true);
 assert.equal(x.scope,'complete_official_ufc_career');
 assert.equal(x.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(x.officialFighterUrl,'https://www.ufc.com/athlete/luis-rodriguez');
 assert.equal(x.fighterUrl,'https://ufcstats.com/fighter-details/f2900678e98f6d6a');
 assert.deepEqual(x.verifiedNumericFighterIds,['2855']);
 assert.equal(x.officialUfcCareerBoutCount,3);
 assert.equal(x.bouts.length,3);
 assert.equal(new Set(x.bouts.map(b=>b.nativeBoutId)).size,3);
 for(const [date,opponent,result,id,sid] of expected){
  const b=x.bouts.find(x=>x.nativeBoutId===id),n=progress.bouts[id];
  assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+sid,nativeBoutId:id,nativeFighterId:'2855'});
  assert.equal(n.org,'ufc');
  assert.equal(n.status,'completed');
  assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(date))<=86400000);
  const own=n.a?.id==='2855'?n.a:n.b?.id==='2855'?n.b:null;
  const other=n.a?.id==='2855'?n.b:n.a;
  assert.ok(own&&other);
  assert.equal(other.name,opponent);
  assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,result);
  assert.ok(progress.roundDone[id]>0);
 }
});
test('Ronaldo 2020 DWCS loss is source-attested and excluded; Denys Bondar reciprocal result preserved',()=>{
 const r=register.fighters['ronaldo-rodriguez'];
 assert.equal(r.sourceVerifiedExcludedFeederBouts.length,1);
 assert.equal(r.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,'83940');
 assert.ok(!r.bouts.some(x=>x.nativeBoutId==='83940'));
 assert.equal(feeder.bouts.filter(x=>x.fighterSlug==='ronaldo-rodriguez'&&x.boutId==='83940'&&x.sourceUrl==='https://www.ufc.com/athlete/luis-rodriguez').length,1);
 assert.equal(register.fighters['denys-bondar'].bouts.find(x=>x.nativeBoutId==='39038')?.result,'loss');
 assert.equal(r.bouts.find(x=>x.nativeBoutId==='39038')?.result,'win');
 assert.equal(r.bouts.find(x=>x.nativeBoutId==='61008')?.result,'loss');
});
