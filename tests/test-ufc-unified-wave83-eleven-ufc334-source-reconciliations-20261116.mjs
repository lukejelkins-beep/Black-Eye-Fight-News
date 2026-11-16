import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave83 research only; retain original 783-roster and all earlier source evidence.
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const cert=read('ufc-independent-full-career-verification.json').fighters;
const profile=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "caio-borralho": {
    "count": 10,
    "id": "93104",
    "sourceUrl": "https://ufcstats.com/fight-details/b8e1d974531a3d86",
    "nativeId": "253",
    "opponentId": "137",
    "result": "win",
    "alias": null
  },
  "cesar-almeida": {
    "count": 7,
    "id": "93616",
    "sourceUrl": "https://ufcstats.com/fight-details/2a4b33c38e7b16b0",
    "nativeId": "348",
    "opponentId": "418",
    "result": "win",
    "alias": null
  },
  "chris-duncan": {
    "count": 9,
    "id": "93108",
    "sourceUrl": "https://ufcstats.com/fight-details/f11b0e41c0c97900",
    "nativeId": "368",
    "opponentId": "148",
    "result": "win",
    "alias": null
  },
  "melquizael-costa": {
    "count": 11,
    "id": "93620",
    "sourceUrl": "https://ufcstats.com/fight-details/9dbb5ad42f7801f9",
    "nativeId": "28",
    "opponentId": "18",
    "result": "win",
    "alias": null
  },
  "kayla-harrison": {
    "count": 4,
    "id": "93103",
    "sourceUrl": "https://ufcstats.com/fight-details/32112fd0aaf7fba2",
    "nativeId": "2845",
    "opponentId": "1133",
    "result": "win",
    "alias": null
  },
  "juan-diaz": {
    "count": 2,
    "id": "93780",
    "sourceUrl": "https://ufcstats.com/fight-details/93d70d9869c66ed1",
    "nativeId": "32",
    "opponentId": "7566",
    "result": "win",
    "alias": "Heili Alateng"
  },
  "bia-mesquita": {
    "count": 4,
    "id": "93111",
    "sourceUrl": "https://ufcstats.com/fight-details/f24ca8e51be2ba77",
    "nativeId": "174",
    "opponentId": "190",
    "result": "win",
    "alias": null
  },
  "donte-johnson": {
    "count": 4,
    "id": "93616",
    "sourceUrl": "https://ufcstats.com/fight-details/2a4b33c38e7b16b0",
    "nativeId": "418",
    "opponentId": "348",
    "result": "loss",
    "alias": null
  },
  "yousri-belgaroui": {
    "count": 4,
    "id": "93104",
    "sourceUrl": "https://ufcstats.com/fight-details/b8e1d974531a3d86",
    "nativeId": "137",
    "opponentId": "253",
    "result": "loss",
    "alias": null
  },
  "evan-elder": {
    "count": 6,
    "id": "93621",
    "sourceUrl": "https://ufcstats.com/fight-details/aad8a97d1a0852a0",
    "nativeId": "982",
    "opponentId": "33315",
    "result": "win",
    "alias": null
  },
  "luis-gurule": {
    "count": 6,
    "id": "93106",
    "sourceUrl": "https://ufcstats.com/fight-details/fdefe4d1a8ef2997",
    "nativeId": "48",
    "opponentId": "52597",
    "result": "win",
    "alias": null
  }
};
const history=s=>profile[s].recentHistory.filter(h=>h.promotion==='ufc'&&h.source==='native'&&
 rich.bouts[h.boutId]?.org==='ufc'&&!/contender series|road to ufc/i.test(rich.bouts[h.boutId].event||''));
const gate=(s,p)=>evaluateCareerEvidence(profile[s],history(s),'2026-11-14','2026-11-16',p,rich.bouts,approval.rosterAsOf).independentlyVerified;
test('wave83 unchanged frozen 783 and eleven distinct original cases',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,11);
 for(const slug of Object.keys(cases))assert.ok(approval.approvedFighters.includes(slug));
});
for(const [slug,c] of Object.entries(cases)){
 test('wave83 complete historical source-to-native proof incl Nov 14: '+slug,()=>{
  const p=cert[slug],h=history(slug);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9');
  assert.deepEqual(p.verifiedNumericFighterIds.map(String),[c.nativeId]);
  assert.equal(p.officialUfcCareerBoutCount,c.count);
  assert.equal(p.bouts.length,c.count);
  assert.equal(h.length,c.count);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,c.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,c.count);
  const last=p.bouts.find(b=>b.nativeBoutId===c.id);
  assert.ok(last);
  assert.equal(last.fightUrl,c.sourceUrl);
  assert.equal(last.pinnedSourceEventDate,'2026-11-14');
  assert.equal(last.independentEventUrl,'https://ufcstats.com/event-details/402ea3b5ee233852');
  assert.equal(last.result,c.result);
  assert.equal(last.originalOpponentNumericId,c.opponentId);
  if(c.alias){
   assert.deepEqual(last.sourceVerifiedNativeOpponentAliases,[c.alias]);
   assert.deepEqual(last.verifiedOpponentNativeFighterIds,[c.opponentId]);
   assert.equal(last.pinnedSourceOpponentName,'Alatengheili');
  }
  for(const row of p.bouts){
   assert.match(row.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const b=rich.bouts[row.nativeBoutId];
   assert.equal(b?.org,'ufc');
   assert.ok(b.a?.id&&b.b?.id);
   assert.ok(Number(rich.roundDone[row.nativeBoutId])>0,'no imputed zero rounds');
   assert.equal(h.filter(x=>x.boutId===row.nativeBoutId&&x.result===row.result).length,1);
  }
  assert.equal(gate(slug,p),true);
 });
 test('wave83 rejects omitted, duplicated, reversed, invented native source: '+slug,()=>{
  const p=cert[slug];assert.equal(gate(slug,p),true);
  const omit=structuredClone(p);omit.bouts.pop();assert.equal(gate(slug,omit),false);
  const dup=structuredClone(p);dup.bouts.at(-1).nativeBoutId=dup.bouts[0].nativeBoutId;assert.equal(gate(slug,dup),false);
  const flip=structuredClone(p);flip.bouts.at(-1).result=flip.bouts.at(-1).result==='win'?'loss':'win';assert.equal(gate(slug,flip),false);
  const fake=structuredClone(p);fake.verifiedNumericFighterIds=['999999'];assert.equal(gate(slug,fake),false);
 });
}
test('wave83 keeps conflicting Park and Heili historical/alias identities held',()=>{
 const park=cert['park-hyun-sung'],heili=cert['heili-alateng'];
 assert.equal(park.bouts.length,5);
 assert.equal(heili.bouts.length,10);
 assert.equal(gate('park-hyun-sung',park),false);
 assert.equal(gate('heili-alateng',heili),false);
});

test('wave83 reciprocal UFC 334 source/native pairs are identical fights, never double counted',()=>{
 const pairs=[
  ['caio-borralho','yousri-belgaroui','93104'],
  ['cesar-almeida','donte-johnson','93616'],
  ['luis-gurule','bilal-hasan','93106']
 ];
 for(const [a,b,id] of pairs){
  const x=cert[a]?.bouts?.filter(row=>row.nativeBoutId===id)||[];
  const y=cert[b]?.bouts?.filter(row=>row.nativeBoutId===id)||[];
  assert.equal(x.length,1,a+': exact one official result');
  assert.equal(y.length,1,b+': exact one opposing result');
  assert.equal(x[0].fightUrl,y[0].fightUrl);
  assert.equal(x[0].pinnedSourceEventDate,'2026-11-14');
  assert.equal(y[0].pinnedSourceEventDate,'2026-11-14');
  assert.equal(x[0].nativeFighterId,y[0].originalOpponentNumericId);
  assert.equal(y[0].nativeFighterId,x[0].originalOpponentNumericId);
  assert.notEqual(x[0].result,y[0].result);
  assert.ok(Number(rich.roundDone[id])>0);
 }
});
