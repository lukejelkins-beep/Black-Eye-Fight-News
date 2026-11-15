import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Research-only Wave76; only the successful full 783-fighter strict CI counts certificates.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "conor-mcgregor": {
    "count": 15,
    "id": "2033",
    "wins": 10,
    "losses": 5,
    "draws": 0
  },
  "michelle-waterson-gomez": {
    "count": 15,
    "id": "2466",
    "wins": 6,
    "losses": 9,
    "draws": 0
  },
  "priscila-cachoeira": {
    "count": 15,
    "id": "95",
    "wins": 5,
    "losses": 10,
    "draws": 0
  }
};
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(slug,proof)=>{
 const h=history(slug);
 return evaluateCareerEvidence(profiles[slug],h,h.map(x=>x.date).sort().at(-1),
  '2026-11-16',proof,rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave76 retains one frozen 783 roster and only three new source careers',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,3);
 for(const slug of Object.keys(cases))assert.ok(approval.approvedFighters.includes(slug));
});
for(const [slug,x] of Object.entries(cases)){
 test('wave76 exact source-native full Octagon career: '+slug,()=>{
  const proof=proofs[slug],h=history(slug);
  assert.ok(proof&&profiles[slug]);
  assert.equal(proof.sourceCoverageAttested,true);
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(proof.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(proof.sourceSnapshot?.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(proof.sourceSnapshot?.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.deepEqual(proof.verifiedNumericFighterIds,[x.id]);
  assert.equal(h.length,x.count);
  assert.equal(proof.officialUfcCareerBoutCount,x.count);
  assert.equal(proof.bouts.length,x.count);
  assert.equal(proof.bouts.filter(b=>b.result==='win').length,x.wins);
  assert.equal(proof.bouts.filter(b=>b.result==='loss').length,x.losses);
  assert.equal(proof.bouts.filter(b=>b.result==='draw').length,x.draws);
  assert.equal(proof.bouts.filter(b=>b.result==='no_contest').length,0);
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,x.count);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,x.count);
  for(const b of proof.bouts){
    assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
    const native=rich.bouts[b.nativeBoutId];
    assert.equal(native?.org,'ufc');
    assert.ok(native?.a?.id&&native?.b?.id);
    assert.equal(b.nativeFighterId,x.id);
    assert.ok(Number(rich.roundDone[b.nativeBoutId])>0);
    assert.equal(h.filter(row=>String(row.boutId)===String(b.nativeBoutId)&&row.result===b.result).length,1);
  }
  assert.equal(gate(slug,proof),true);
 });
 test('wave76 refuses omitted, duplicate, flipped and invented source/native identities: '+slug,()=>{
   const source=proofs[slug];
   assert.equal(gate(slug,source),true);
   const missing=structuredClone(source);missing.bouts.pop();assert.equal(gate(slug,missing),false);
   const duplicate=structuredClone(source);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;
   assert.equal(gate(slug,duplicate),false);
   const flipped=structuredClone(source);flipped.bouts[0].result=flipped.bouts[0].result==='win'?'loss':'win';
   assert.equal(gate(slug,flipped),false);
   const invented=structuredClone(source);invented.verifiedNumericFighterIds=['999999'];
   assert.equal(gate(slug,invented),false);
 });
}
test('wave76 preserves Priscila source display-name alias without inventing identities',()=>{
 const proof=proofs['priscila-cachoeira'];
 assert.deepEqual(proof.sourcePresentationAliases,[{
  date:'2022-08-13',sourceOpponent:'Ariane da Silva',nativeOpponent:'Ariane Lipski da Silva'
 }]);
 assert.equal(gate('priscila-cachoeira',proof),true);
});
