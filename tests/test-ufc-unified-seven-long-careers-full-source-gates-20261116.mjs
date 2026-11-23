import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// No certificate is awarded by this file alone. Exact-SHA, complete 783-person Stage3 CI is mandatory.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "song-yadong": {
    "count": 18,
    "id": "51",
    "wins": 13,
    "losses": 4,
    "draws": 1,
    "noContests": 0
  },
  "derrick-lewis": {
    "count": 32,
    "id": "106",
    "wins": 20,
    "losses": 12,
    "draws": 0,
    "noContests": 0
  },
  "michael-johnson": {
    "count": 32,
    "id": "464",
    "wins": 16,
    "losses": 16,
    "draws": 0,
    "noContests": 0
  },
  "edson-barboza": {
    "count": 33,
    "id": "358",
    "wins": 18,
    "losses": 15,
    "draws": 0,
    "noContests": 0
  },
  "max-holloway": {
    "count": 33,
    "id": "462",
    "wins": 24,
    "losses": 9,
    "draws": 0,
    "noContests": 0
  },
  "rafael-dos-anjos": {
    "count": 37,
    "id": "1109",
    "wins": 21,
    "losses": 16,
    "draws": 0,
    "noContests": 0
  },
  "neil-magny": {
    "count": 38,
    "id": "211",
    "wins": 25,
    "losses": 13,
    "draws": 0,
    "noContests": 0
  }
};
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(x=>
 x.promotion==='ufc'&&x.source==='native'&&rich.bouts[x.boutId]?.org==='ufc');
const gate=(slug,evidence)=>{const h=history(slug);return evaluateCareerEvidence(profiles[slug],h,
 h.map(x=>x.date).sort().at(-1),'2026-11-15',evidence,rich.bouts,approval.rosterAsOf).independentlyVerified};
test('independent long-career wave: frozen approved cohort and seven distinct attested fighters',()=>{
 assert.equal(approval.status,'approved');assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,7);
 assert.equal(Object.values(cases).reduce((s,v)=>s+v.count,0),223);
});
for(const [slug,expected] of Object.entries(cases)){
 test('independent long-career source-native exact mapping and rounds: '+slug,()=>{
  assert.ok(approval.approvedFighters.includes(slug));
  const p=proofs[slug],h=history(slug);assert.ok(p&&profiles[slug]);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.deepEqual(p.verifiedNumericFighterIds,[expected.id]);
  assert.equal(h.length,expected.count);
  assert.equal(p.officialUfcCareerBoutCount,expected.count);
  assert.equal(p.bouts.length,expected.count);
  assert.equal(p.bouts.filter(b=>b.result==='win').length,expected.wins);
  assert.equal(p.bouts.filter(b=>b.result==='loss').length,expected.losses);
  assert.equal(p.bouts.filter(b=>b.result==='draw').length,expected.draws);
  assert.equal(p.bouts.filter(b=>b.result==='no_contest').length,expected.noContests);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,expected.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,expected.count);
  for(const b of p.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[b.nativeBoutId];
   assert.equal(native?.org,'ufc');assert.ok(native?.a?.id&&native?.b?.id);
   assert.equal(b.nativeFighterId,expected.id);
   assert.ok(Number(rich.roundDone[b.nativeBoutId])>0,'genuine positive measured rounds required');
   assert.equal(h.filter(x=>String(x.boutId)===b.nativeBoutId&&x.result===b.result).length,1);
  }
  assert.equal(gate(slug,p),true);
 });
 test('independent long-career fail-closed absent duplicate inverted or fake identity: '+slug,()=>{
  const p=proofs[slug];assert.equal(gate(slug,p),true);
  const absent=structuredClone(p);absent.bouts.pop();assert.equal(gate(slug,absent),false);
  const duplicated=structuredClone(p);duplicated.bouts[1].nativeBoutId=duplicated.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicated),false);
  const flipped=structuredClone(p);flipped.bouts[0].result=flipped.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,flipped),false);
  const fake=structuredClone(p);fake.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,fake),false);
 });
}
