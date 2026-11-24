import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave84: research-only, 783 immutable approved cohort, zero provider calls.
const read = n => JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval = read('ufc-36-month-roster-approval.json');
const proofs = read('ufc-independent-full-career-verification.json').fighters;
const profiles = read('ufcalendar-fighter-research.json').profiles;
const rich = read('ufcalendar-rich-progress.json');
const cases = {
  "christos-giagos": {
    "name": "Christos Giagos",
    "count": 14,
    "numeric": "718",
    "wins": 6,
    "losses": 8,
    "draws": 0
  },
  "kyle-nelson": {
    "name": "Kyle Nelson",
    "count": 13,
    "numeric": "155",
    "wins": 5,
    "losses": 7,
    "draws": 1
  },
  "amanda-lemos": {
    "name": "Amanda Lemos",
    "count": 16,
    "numeric": "224",
    "wins": 9,
    "losses": 7,
    "draws": 0
  }
};
const history = slug => profiles[slug].recentHistory.filter(h => h.promotion === 'ufc' && h.source === 'native' && rich.bouts[h.boutId]?.org === 'ufc' && !/contender series|road to ufc/i.test(rich.bouts[h.boutId].event||''));
const gate = (slug,proof) => {
 const h=history(slug);
 return evaluateCareerEvidence(profiles[slug],h,h.map(b=>b.date).sort().at(-1),'2026-11-16',proof,rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave84 preserves the frozen source-corroborated 783 UFC fighter cohort',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,3);
});
for(const [slug,c] of Object.entries(cases)){
 test('wave84 independently sourced full native UFC career with measured rounds: '+slug,()=>{
  assert.ok(approval.approvedFighters.includes(slug));
  const p=proofs[slug],h=history(slug);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,c.count);
  assert.equal(p.bouts.length,c.count);
  assert.equal(h.length,c.count);
  assert.equal(p.fighterName,c.name);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.numeric]);
  assert.equal(p.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9');
  assert.equal(p.bouts.filter(b=>b.result==='win').length,c.wins);
  assert.equal(p.bouts.filter(b=>b.result==='loss').length,c.losses);
  assert.equal(p.bouts.filter(b=>b.result==='draw').length,c.draws);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,c.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,c.count);
  for(const bout of p.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/);
   const n=rich.bouts[bout.nativeBoutId];
   assert.equal(n?.org,'ufc');
   assert.ok(n.a?.id&&n.b?.id);
   assert.ok([String(n.a.id),String(n.b.id)].includes(c.numeric));
   assert.equal(bout.nativeFighterId,c.numeric);
   assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0,'must have real saved measured rounds');
   assert.equal(h.filter(x=>String(x.boutId)===String(bout.nativeBoutId)&&x.result===bout.result).length,1);
   assert.ok(Math.abs(Date.parse(bout.date)-Date.parse(bout.pinnedSourceEventDate))<=86400000);
  }
  assert.equal(gate(slug,p),true);
 });
 test('wave84 omitted, duplicated, inverted result, invented native identity all fail closed: '+slug,()=>{
  const p=proofs[slug];assert.equal(gate(slug,p),true);
  const missing=structuredClone(p);missing.bouts.pop();assert.equal(gate(slug,missing),false);
  const doubled=structuredClone(p);doubled.bouts[1].nativeBoutId=doubled.bouts[0].nativeBoutId;assert.equal(gate(slug,doubled),false);
  const flipped=structuredClone(p);flipped.bouts[0].result=flipped.bouts[0].result==='win'?'loss':'win';assert.equal(gate(slug,flipped),false);
  const invented=structuredClone(p);invented.verifiedNumericFighterIds=['999999'];assert.equal(gate(slug,invented),false);
 });
}
test('wave84 preserves a genuine Kyle Nelson draw instead of zero-imputing or silently discarding it',()=>{
 const p=proofs['kyle-nelson'];
 assert.equal(p.bouts.filter(b=>b.result==='draw').length,1);
 const d=p.bouts.find(b=>b.result==='draw');
 assert.equal(d.opponent,'Dooho Choi');
 assert.equal(rich.bouts[d.nativeBoutId].result?.method,'draw');
 assert.ok(Number(rich.roundDone[d.nativeBoutId])>0);
 assert.equal(gate('kyle-nelson',p),true);
});
