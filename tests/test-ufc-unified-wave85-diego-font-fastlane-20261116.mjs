import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const cases={
  "diego-ferreira": {
    "name": "Diego Ferreira",
    "count": 18,
    "numeric": "243",
    "record": {
      "wins": 11,
      "losses": 7,
      "draws": 0
    }
  },
  "rob-font": {
    "name": "Rob Font",
    "count": 21,
    "numeric": "237",
    "record": {
      "wins": 12,
      "losses": 9,
      "draws": 0
    }
  }
};
const history=slug=>profiles[slug].recentHistory.filter(x=>x.promotion==='ufc'&&x.source==='native'&&rich.bouts[x.boutId]?.org==='ufc');
const gate=(slug,p)=>{const h=history(slug);return evaluateCareerEvidence(profiles[slug],h,h.map(x=>x.date).sort().at(-1),'2026-11-16',p,rich.bouts,approval.rosterAsOf).independentlyVerified;};
test('wave85 retains exact 783 approved cohort and one canonical proof store',()=>{assert.equal(approval.approvedFighters.length,783);assert.equal(new Set(approval.approvedFighters).size,783);});
for(const [slug,c] of Object.entries(cases)){
 test('wave85 independent Greco/UFC/native full-career identity and measured rounds '+slug,()=>{
  const p=proofs[slug],h=history(slug);
  assert.ok(approval.approvedFighters.includes(slug));
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,c.count);
  assert.equal(p.bouts.length,c.count);
  assert.equal(h.length,c.count);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.numeric]);
  assert.equal(p.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9');
  assert.equal(p.bouts.filter(x=>x.result==='win').length,c.record.wins);
  assert.equal(p.bouts.filter(x=>x.result==='loss').length,c.record.losses);
  assert.equal(p.bouts.filter(x=>x.result==='draw').length,c.record.draws);
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,c.count);
  assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,c.count);
  for(const b of p.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const n=rich.bouts[b.nativeBoutId];
   assert.equal(n?.org,'ufc');
   assert.ok([String(n.a?.id),String(n.b?.id)].includes(c.numeric));
   assert.ok(Number(rich.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(b.date)-Date.parse(b.pinnedSourceEventDate))<=86400000);
   assert.equal(h.filter(x=>x.boutId===b.nativeBoutId&&x.result===b.result).length,1);
  }
  assert.equal(gate(slug,p),true);
 });
 test('wave85 rejects absent, doubled, inverted and fabricated source identities '+slug,()=>{
  const p=proofs[slug];assert.equal(gate(slug,p),true);
  const missing=structuredClone(p);missing.bouts.pop();assert.equal(gate(slug,missing),false);
  const doubled=structuredClone(p);doubled.bouts[0].nativeBoutId=doubled.bouts[1].nativeBoutId;assert.equal(gate(slug,doubled),false);
  const flipped=structuredClone(p);flipped.bouts[0].result=flipped.bouts[0].result==='win'?'loss':'win';assert.equal(gate(slug,flipped),false);
  const fake=structuredClone(p);fake.verifiedNumericFighterIds=['999999'];assert.equal(gate(slug,fake),false);
 });
}
