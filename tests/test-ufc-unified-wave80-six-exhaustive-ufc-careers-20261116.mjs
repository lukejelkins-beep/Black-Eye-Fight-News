import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave80 research-only: no certificates without full 783-person strict Stage3 audit at exact new HEAD.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const proof=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "sean-strickland": {
    "count": 25,
    "id": "2",
    "wins": 18,
    "losses": 7
  },
  "cub-swanson": {
    "count": 26,
    "id": "580",
    "wins": 16,
    "losses": 10
  },
  "vicente-luque": {
    "count": 26,
    "id": "180",
    "wins": 17,
    "losses": 9
  },
  "gerald-meerschaert": {
    "count": 27,
    "id": "391",
    "wins": 12,
    "losses": 15
  },
  "marlon-vera": {
    "count": 27,
    "id": "152",
    "wins": 16,
    "losses": 11
  },
  "brad-tavares": {
    "count": 28,
    "id": "249",
    "wins": 16,
    "losses": 12
  }
};
const history=s=>(profiles[s]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(s,p)=>{const h=history(s);return evaluateCareerEvidence(profiles[s],h,
 h.map(x=>x.date).sort().at(-1),'2026-11-15',p,rich.bouts,approval.rosterAsOf).independentlyVerified;};
test('wave80: unchanged frozen 783 approved UFC fighter roster and six nonduplicated names',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,6);
});
for(const [slug,x] of Object.entries(cases)){
 test('wave80 independently exhaustive original native/pinned source/round gate: '+slug,()=>{
  assert.ok(approval.approvedFighters.includes(slug));
  const p=proof[slug],h=history(slug);
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
  for(const bout of p.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const b=rich.bouts[bout.nativeBoutId];
   assert.equal(b?.org,'ufc');assert.ok(b?.a?.id&&b?.b?.id);
   assert.equal(bout.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0,'no imputed zero missing stats');
   assert.equal(h.filter(z=>String(z.boutId)===bout.nativeBoutId&&z.result===bout.result).length,1);
  }
  assert.equal(gate(slug,p),true,'strict source-native identity gate must pass');
 });
 test('wave80 omitted, doubled, reversed, invented evidence fails closed: '+slug,()=>{
  const p=proof[slug];assert.equal(gate(slug,p),true);
  const miss=structuredClone(p);miss.bouts.pop();assert.equal(gate(slug,miss),false);
  const duplicate=structuredClone(p);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicate),false);
  const invert=structuredClone(p);invert.bouts[0].result=invert.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,invert),false);
  const wrong=structuredClone(p);wrong.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,wrong),false);
 });
}
