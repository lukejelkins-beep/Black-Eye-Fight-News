import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave77 research-only source attestations; no certification unless the exact-HEAD full 783-person strict audit PASSES.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "carla-esparza": {
    "count": 16,
    "id": "947",
    "wins": 10,
    "losses": 6,
    "draws": 0,
    "noContests": 0
  },
  "michel-pereira": {
    "count": 16,
    "id": "128",
    "wins": 10,
    "losses": 6,
    "draws": 0,
    "noContests": 0
  },
  "warlley-alves": {
    "count": 16,
    "id": "2329",
    "wins": 8,
    "losses": 8,
    "draws": 0,
    "noContests": 0
  },
  "brian-kelleher": {
    "count": 17,
    "id": "1114",
    "wins": 8,
    "losses": 9,
    "draws": 0,
    "noContests": 0
  },
  "jj-aldrich": {
    "count": 18,
    "id": "559",
    "wins": 11,
    "losses": 7,
    "draws": 0,
    "noContests": 0
  },
  "alexander-volkanovski": {
    "count": 19,
    "id": "327",
    "wins": 16,
    "losses": 3,
    "draws": 0,
    "noContests": 0
  },
  "bryan-barberena": {
    "count": 19,
    "id": "1177",
    "wins": 9,
    "losses": 10,
    "draws": 0,
    "noContests": 0
  },
  "israel-adesanya": {
    "count": 19,
    "id": "523",
    "wins": 13,
    "losses": 6,
    "draws": 0,
    "noContests": 0
  },
  "raquel-pennington": {
    "count": 19,
    "id": "725",
    "wins": 13,
    "losses": 6,
    "draws": 0,
    "noContests": 0
  }
};
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(slug,proof)=>{
 const h=history(slug);
 return evaluateCareerEvidence(profiles[slug],h,h.map(x=>x.date).sort().at(-1),
  '2026-11-16',proof,rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave77 preserves the approved 783 and nine distinct nonduplicated source careers',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,9);
 for(const slug of Object.keys(cases))assert.ok(approval.approvedFighters.includes(slug));
});
for(const [slug,x] of Object.entries(cases)){
 test('wave77 complete independent source-to-native chronology: '+slug,()=>{
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
  assert.equal(proof.bouts.filter(b=>b.result==='no_contest').length,x.noContests);
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,x.count);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,x.count);
  for(const bout of proof.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[bout.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id);
   assert.equal(bout.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0);
   assert.equal(h.filter(row=>String(row.boutId)===String(bout.nativeBoutId)&&row.result===bout.result).length,1);
  }
  assert.equal(gate(slug,proof),true);
 });
 test('wave77 fail-closed: missing, duplicate, flipped, fabricated native ID '+slug,()=>{
  const source=proofs[slug];assert.equal(gate(slug,source),true);
  const omitted=structuredClone(source);omitted.bouts.pop();assert.equal(gate(slug,omitted),false);
  const duplicated=structuredClone(source);duplicated.bouts[1].nativeBoutId=duplicated.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicated),false);
  const flipped=structuredClone(source);flipped.bouts[0].result=flipped.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,flipped),false);
  const invented=structuredClone(source);invented.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,invented),false);
 });
}
test('wave77 retains source-display Ariane alias without inventing a new fighter',()=>{
 assert.deepEqual(proofs['jj-aldrich'].sourcePresentationAliases,[{
  date:'2025-02-22',sourceOpponent:'Ariane da Silva',nativeOpponent:'Ariane Lipski da Silva'
 }]);
 assert.equal(gate('jj-aldrich',proofs['jj-aldrich']),true);
});
