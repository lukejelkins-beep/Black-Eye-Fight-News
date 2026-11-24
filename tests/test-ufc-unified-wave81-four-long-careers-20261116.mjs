import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave81 research-only: strict full-cohort 783-fighter current-data audit required for certification.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "ovince-saint-preux": {
    "count": 28,
    "id": "950",
    "wins": 15,
    "losses": 13
  },
  "angela-hill": {
    "count": 30,
    "id": "73",
    "wins": 14,
    "losses": 16
  },
  "jessica-andrade": {
    "count": 30,
    "id": "695",
    "wins": 17,
    "losses": 13
  },
  "darren-elkins": {
    "count": 31,
    "id": "962",
    "wins": 19,
    "losses": 12
  }
};
const history=s=>(profiles[s]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(s,p)=>{const h=history(s);return evaluateCareerEvidence(profiles[s],h,
 h.map(x=>x.date).sort().at(-1),'2026-11-15',p,rich.bouts,approval.rosterAsOf).independentlyVerified;};
test('wave81 original immutable approved 783 and four distinct pinned career identities',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,4);
});
for(const [slug,x] of Object.entries(cases)){
 test('wave81 complete official Greco/native two-corner results and measured round evidence: '+slug,()=>{
  assert.ok(approval.approvedFighters.includes(slug));
  const p=proofs[slug],h=history(slug);
  assert.ok(p&&profiles[slug]);assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.deepEqual(p.verifiedNumericFighterIds,[x.id]);
  assert.equal(h.length,x.count);assert.equal(p.officialUfcCareerBoutCount,x.count);
  assert.equal(p.bouts.length,x.count);
  assert.equal(p.bouts.filter(b=>b.result==='win').length,x.wins);
  assert.equal(p.bouts.filter(b=>b.result==='loss').length,x.losses);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,x.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,x.count);
  for(const row of p.bouts){
   assert.match(row.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const b=rich.bouts[row.nativeBoutId];assert.equal(b?.org,'ufc');
   assert.ok(b?.a?.id&&b?.b?.id,'original paired numeric identities');
   assert.equal(row.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[row.nativeBoutId])>0,'no missing round zero substitution');
   assert.equal(h.filter(z=>String(z.boutId)===row.nativeBoutId&&z.result===row.result).length,1);
  }
  assert.equal(gate(slug,p),true);
 });
 test('wave81 omission, duplication, inverted outcome, fabricated ID all fail closed: '+slug,()=>{
  const p=proofs[slug];assert.equal(gate(slug,p),true);
  const missing=structuredClone(p);missing.bouts.pop();assert.equal(gate(slug,missing),false);
  const doubled=structuredClone(p);doubled.bouts[1].nativeBoutId=doubled.bouts[0].nativeBoutId;assert.equal(gate(slug,doubled),false);
  const reversed=structuredClone(p);reversed.bouts[0].result=reversed.bouts[0].result==='win'?'loss':'win';assert.equal(gate(slug,reversed),false);
  const invented=structuredClone(p);invented.verifiedNumericFighterIds=['999999'];assert.equal(gate(slug,invented),false);
 });
}
