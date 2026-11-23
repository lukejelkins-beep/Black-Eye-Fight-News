import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

// Research-only proof regression. Only successful exact-HEAD full 783-person Stage3 CI certifies.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cohort=new Set(approval.approvedFighters);
const cases={
 'joselyne-edwards':{count:13,id:'480',wins:9,losses:4,draws:0},
 'rafael-fiziev':{count:13,id:'125',wins:8,losses:5,draws:0},
 'lando-vannata':{count:14,id:'587',wins:4,losses:8,draws:2},
 'virna-jandiroba':{count:14,id:'447',wins:9,losses:5,draws:0},
 'nathaniel-wood':{count:15,id:'444',wins:11,losses:4,draws:0},
 'ricardo-ramos':{count:15,id:'172',wins:8,losses:7,draws:0},
 'roman-dolidze':{count:15,id:'534',wins:9,losses:6,draws:0}
};
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(slug,proof)=>{
 const h=history(slug);
 return evaluateCareerEvidence(profiles[slug],h,h.map(x=>x.date).sort().at(-1),
  '2026-11-15',proof,rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave74 seven remain distinct members of the frozen approved cohort',()=>{
 assert.equal(cohort.size,783);
 assert.equal(Object.keys(cases).length,7);
 for(const slug of Object.keys(cases))assert.ok(cohort.has(slug));
});
for(const [slug,x] of Object.entries(cases)){
 test('wave74 complete independently pinned UFCStats/native career: '+slug,()=>{
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
  for(const bout of proof.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[bout.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id);
   assert.equal(bout.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0,'do not impute missing statistics');
   assert.equal(h.filter(b=>String(b.boutId)===String(bout.nativeBoutId)&&
     b.result===bout.result).length,1);
  }
  assert.equal(gate(slug,proof),true,'full independent Stage3 source/native gate');
 });
 test('wave74 omitted, duplicate, reversed and fabricated proof fails closed: '+slug,()=>{
  const proof=proofs[slug];assert.equal(gate(slug,proof),true);
  const omitted=structuredClone(proof);omitted.bouts.pop();assert.equal(gate(slug,omitted),false);
  const duplicate=structuredClone(proof);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicate),false);
  const inverted=structuredClone(proof);inverted.bouts[0].result=inverted.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,inverted),false);
  const invented=structuredClone(proof);invented.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,invented),false);
 });
}
test('wave74 retains both official UFC draws for Lando Vannata',()=>{
 const proof=proofs['lando-vannata'];
 assert.equal(proof.bouts.filter(b=>b.result==='draw').length,2);
 assert.deepEqual(proof.bouts.filter(b=>b.result==='draw').map(b=>b.opponent).sort(),
  ['King Green','Matt Frevola']);
});
