import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

// One existing research source register; these checks do NOT bypass full 783-fighter CI.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const proof=read('ufc-independent-full-career-verification.json').fighters['heili-alateng'];
const profile=profiles['heili-alateng'];
const history=profile.recentHistory.filter(h=>h.promotion==='ufc'&&h.source==='native'&&
 rich.bouts[h.boutId]?.org==='ufc'&&!/contender series|road to ufc/i.test(rich.bouts[h.boutId].event||''));
const gate=(p,bouts=rich.bouts)=>evaluateCareerEvidence(profile,history,
 '2026-11-14','2026-11-15',p,bouts,approval.rosterAsOf).independentlyVerified;

// Exact source fight-detail IDs from Greco1899 UFCStats history commit
// 96adace863c0a793579cc06d27d468797545607f (14 Nov 2026 cutoff).
const source=[
 ['93780','2026-11-14','Juan Díaz','loss','93d70d9869c66ed1','32'],
 ['85944','2026-09-26','John Castaneda','win','577011f3bbcf7f91','568'],
 ['60883','2025-04-26',"Da'Mon Blackshear",'loss','7d51649373d42571','2752'],
 ['61025','2024-05-18','Kleydson Rodrigues','win','63605e9f3e71d738','957'],
 ['60019','2023-10-14','Chris Gutierrez','loss','a74a8c1e0a49070d','191'],
 ['59836','2022-09-10','Chad Anheliger','win','6010f681e54ba2cd','1155'],
 ['61528','2022-04-16','Kevin Croom','win','fb7ebdda8658fa05','1033'],
 ['61915','2021-09-18','Gustavo Lopez','draw','178756c3cb23b884','731'],
 ['66257','2020-10-03','Casey Kenney','loss','ac6b2a5f24c2b8bd','2670'],
 ['61973','2019-12-21','Ryan Benoit','win','15aa55a91cf848cf','2347'],
 ['58979','2019-08-31','Batgerel Danaa','win','2e001d8c2f6106fc','651']
];

test('Alatengheili original roster identity and independently pinned source snapshot',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.ok(approval.approvedFighters.includes('heili-alateng'));
 assert.equal(profile.name,'Heili Alateng');
 assert.equal(proof.fighterName,'Alatengheili');
 assert.equal(proof.officialFighterUrl,'https://www.ufc.com/athlete/heili-alateng');
 assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/1897b7b913736a7c');
 assert.deepEqual(proof.verifiedNumericFighterIds,['7566']);
 assert.deepEqual(proof.sourceVerifiedNativeNameAliases,['Heili Alateng']);
 assert.equal(proof.disambiguation.verifiedUfcStatsFighterId,'1897b7b913736a7c');
 assert.equal(proof.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
 assert.equal(proof.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
 assert.equal(proof.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
 assert.equal(proof.sourceSnapshot.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9');
});

test('eleven real native UFC identities match eleven independent exact source fights and positive rounds',()=>{
 assert.equal(proof.sourceCoverageAttested,true);
 assert.equal(proof.scope,'complete_official_ufc_career');
 assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(proof.officialUfcCareerBoutCount,11);
 assert.equal(proof.bouts.length,11);
 assert.equal(history.length,11);
 assert.equal(new Set(source.map(x=>x[0])).size,11);
 assert.equal(new Set(proof.bouts.map(x=>x.nativeBoutId)).size,11);
 assert.equal(new Set(proof.bouts.map(x=>x.fightUrl)).size,11);
 for(const [id,dt,opp,outcome,sourceId,otherNumeric] of source){
   const row=proof.bouts.find(x=>x.nativeBoutId===id);
   const native=rich.bouts[id];
   assert.ok(row&&native,id);
   assert.equal(row.date,dt,id);
   assert.equal(row.opponent,opp,id);
   assert.equal(row.result,outcome,id);
   assert.equal(row.fightUrl,'https://ufcstats.com/fight-details/'+sourceId,id);
   assert.equal(row.nativeFighterId,'7566',id);
   assert.equal(native.org,'ufc',id);
   assert.equal(native.status,'completed',id);
   assert.equal(native.a.id==='7566'?native.b.id:native.b.id==='7566'?native.a.id:null,otherNumeric,id);
   assert.ok(Number(rich.roundDone[id])>0,'must retain actual measured rounds '+id);
   assert.equal(history.filter(x=>x.boutId===id&&x.result===outcome).length,1,id);
 }
 assert.equal(proof.verifiedUfcRecord.wins,6);
 assert.equal(proof.verifiedUfcRecord.losses,4);
 assert.equal(proof.verifiedUfcRecord.draws,1);
 assert.equal(gate(proof),true);
});

test('Nov14 UFC334 outcome remains an actual loss against Juan Diaz',()=>{
 const row=proof.bouts[0],native=rich.bouts['93780'];
 assert.equal(row.nativeBoutId,'93780');
 assert.equal(row.independentEventUrl,'https://ufcstats.com/event-details/402ea3b5ee233852');
 assert.equal(row.pinnedSourceEventDate,'2026-11-14');
 assert.equal(native.result.winnerId,'32');
 assert.equal(native.result.method,'decision_unanimous');
 assert.equal(row.result,'loss');
 assert.equal(row.originalOpponentNumericId,'32');
 assert.equal(Number(rich.roundDone['93780']),3);
});

test('Gustavo Lopez 2021 official majority draw is not converted to a decision win or loss',()=>{
 const row=proof.bouts.find(x=>x.nativeBoutId==='61915'),native=rich.bouts['61915'];
 assert.equal(row.result,'draw');
 assert.equal(native.status,'completed');
 assert.equal(native.result.method,'draw');
 assert.equal(native.result.winnerId,null);
 assert.equal(history.find(x=>x.boutId==='61915').result,'draw');
 const changed={...rich.bouts,['61915']:{...native,result:{...native.result,method:'decision_unanimous'}}};
 assert.equal(gate(proof,changed),false,'fake decision or missing actual draw must fail');
});

test('omitted, duplicated, inverted and fabricated source-native records all fail closed',()=>{
 const clone=()=>structuredClone(proof);
 const absent=clone();absent.bouts.shift();assert.equal(gate(absent),false);
 const duplicated=clone();duplicated.bouts[0].nativeBoutId=duplicated.bouts[1].nativeBoutId;
 assert.equal(gate(duplicated),false);
 const flipped=clone();flipped.bouts[0].result='win';assert.equal(gate(flipped),false);
 const fake=clone();fake.verifiedNumericFighterIds=['999999'];assert.equal(gate(fake),false);
 const fakeUfcStatsId=clone();fakeUfcStatsId.disambiguation.verifiedUfcStatsFighterId='0000000000000000';
 assert.equal(gate(fakeUfcStatsId),false);
 const fakeAlias=clone();fakeAlias.sourceVerifiedNativeNameAliases=['Another Fighter'];
 assert.equal(gate(fakeAlias),false);
 const badOfficial=clone();badOfficial.officialFighterUrl='https://example.invalid';
 assert.equal(gate(badOfficial),false);
});

test('the pinned 2026 Nov14 source identity and opposing native corner cannot be reassigned',()=>{
 assert.equal(proof.sourceSnapshot.cutoffLastEvent,'2026-11-14');
 assert.equal(proof.sourceSnapshot.evidenceCutoff,'2026-11-14');
 const row=proof.bouts.find(x=>x.nativeBoutId==='93780');
 assert.equal(row.pinnedSourceOpponentName,'Juan Diaz');
 assert.equal(row.originalOpponentNumericId,'32');
 assert.equal(rich.bouts['93780'].a.id,'7566');
 assert.equal(rich.bouts['93780'].b.id,'32');
 const changed=structuredClone(proof);
 changed.bouts[0].nativeFighterId='32';
 assert.equal(gate(changed),false);
 const wrongAlias=structuredClone(proof);
 wrongAlias.disambiguation.verifiedUfcStatsFighterId='0000000000000000';
 assert.equal(gate(wrongAlias),false);
});
