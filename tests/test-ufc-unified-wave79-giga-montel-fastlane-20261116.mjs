import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave79 is research-only: only exact-SHA, full-cohort Stage 3 GitHub audit can grant certificates.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const proof=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const feeders=read('ufc-feeder-bout-evidence.json').bouts;
const approval=read('ufc-36-month-roster-approval.json');
const cases={
 'giga-chikadze':{count:13,id:'346',wins:8,losses:5,feeder:'84005'},
 'montel-jackson':{count:14,id:'179',wins:10,losses:4,feeder:'84090'}
};
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(slug,p)=>{const h=history(slug);return evaluateCareerEvidence(profiles[slug],h,
 h.map(x=>x.date).sort().at(-1),'2026-11-15',p,rich.bouts,approval.rosterAsOf).independentlyVerified};
test('wave79 retains exactly the frozen 783 approved UFC fighters',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,2);
});
for(const [slug,x] of Object.entries(cases)){
 test('wave79 independent native/source/positive-round complete career: '+slug,()=>{
  assert.ok(approval.approvedFighters.includes(slug));
  const p=proof[slug],h=history(slug);
  assert.ok(p&&profiles[slug]);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.deepEqual(p.verifiedNumericFighterIds,[x.id]);
  assert.equal(h.length,x.count);
  assert.equal(p.officialUfcCareerBoutCount,x.count);
  assert.equal(p.bouts.length,x.count);
  assert.equal(p.bouts.filter(b=>b.result==='win').length,x.wins);
  assert.equal(p.bouts.filter(b=>b.result==='loss').length,x.losses);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,x.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,x.count);
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,1);
  assert.ok(feeders.some(e=>e.fighterSlug===slug&&e.boutId===x.feeder),
   'feeder must be separately source-proven');
  assert.ok(profiles[slug].recentHistory.some(z=>z.boutId===x.feeder),
   'original feeder evidence must be retained unmodified');
  for(const b of p.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[b.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id,'both numeric corners are required');
   assert.equal(b.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[b.nativeBoutId])>0,'never impute missing round metrics');
   assert.equal(h.filter(z=>String(z.boutId)===b.nativeBoutId&&z.result===b.result).length,1);
  }
  assert.equal(gate(slug,p),true);
 });
 test('wave79 omitted, duplicate, inverted, fabricated identities fail closed: '+slug,()=>{
  const p=proof[slug];
  assert.equal(gate(slug,p),true);
  const omitted=structuredClone(p);omitted.bouts.pop();assert.equal(gate(slug,omitted),false);
  const duplicated=structuredClone(p);duplicated.bouts[1].nativeBoutId=duplicated.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicated),false);
  const reversed=structuredClone(p);reversed.bouts[0].result=reversed.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,reversed),false);
  const fabricated=structuredClone(p);fabricated.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,fabricated),false);
 });
}
