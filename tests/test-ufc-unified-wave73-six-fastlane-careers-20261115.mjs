import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

// Research-only: successful exact-HEAD 783-person CI is the only certification authority.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const source=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const feeders=read('ufc-feeder-bout-evidence.json').bouts;
const inventory=read('ufc-official-career-bout-inventory.json');
const cohort=new Set(approval.approvedFighters);
const cases={
  'jamie-pickett':{count:9,id:'1129',wins:2,losses:7,draws:0,feeder:3},
  'dustin-stoltzfus':{count:11,id:'241',wins:4,losses:7,draws:0,feeder:1},
  'billy-quarantillo':{count:12,id:'1207',wins:6,losses:6,draws:0,feeder:1},
  'joaquim-silva':{count:12,id:'225',wins:7,losses:5,draws:0,feeder:0},
  'matt-frevola':{count:12,id:'149',wins:5,losses:6,draws:1,feeder:1},
  'amanda-ribas':{count:13,id:'931',wins:7,losses:6,draws:0,feeder:0}
};
const officialHistory=slug=>(profiles[slug]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=(slug,proof)=>{const h=officialHistory(slug);
 return evaluateCareerEvidence(profiles[slug],h,h.map(x=>x.date).sort().at(-1),
  '2026-11-15',proof,rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave73 is limited to six distinct frozen-roster fast-lane careers',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(cohort.size,783);
 assert.equal(Object.keys(cases).length,6);
 assert.equal(new Set(Object.keys(cases)).size,6);
});
for(const [slug,x] of Object.entries(cases)){
 test('wave73 independent exhaustive source-native career: '+slug,()=>{
  assert.ok(cohort.has(slug),'never edit the approved 783 cohort');
  const proof=source[slug],h=officialHistory(slug);
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
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,x.count);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,x.count);
  assert.equal(proof.sourceVerifiedExcludedFeederBouts?.length||0,x.feeder);
  const excluded=(profiles[slug].recentHistory||[]).filter(b=>b.promotion==='ufc'&&
   !rich.bouts[b.boutId]&&feeders.some(e=>e.fighterSlug===slug&&e.boutId===b.boutId&&e.date===b.date));
  assert.equal(excluded.length,x.feeder,'feeder exclusion needs preserved native row and primary-source classification');
  for(const bout of proof.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[bout.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id,'both original numeric fighter corners required');
   assert.equal(bout.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0,'never replace missing statistics with zero');
   assert.equal(h.filter(b=>String(b.boutId)===String(bout.nativeBoutId)&&
    b.result===bout.result).length,1);
  }
  assert.equal(gate(slug,proof),true,'strict independent source-native pre-gate must pass');
 });
 test('wave73 missing, duplicated, inverted and invented evidence fails closed: '+slug,()=>{
  const proof=source[slug];assert.equal(gate(slug,proof),true);
  const missing=structuredClone(proof);missing.bouts.pop();assert.equal(gate(slug,missing),false);
  const duplicate=structuredClone(proof);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicate),false);
  const wrong=structuredClone(proof);wrong.bouts[0].result=wrong.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,wrong),false);
  const invented=structuredClone(proof);invented.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,invented),false);
 });
}
test('wave73 Roberts remains uncertified: the official 2020 Kevin Croom NC is absent from cached native UFC history',()=>{
 const slug='roosevelt-roberts';
 assert.ok(cohort.has(slug));
 assert.equal(source[slug],undefined,'no unsupported certificate for Roberts');
 const h=officialHistory(slug);
 assert.equal(h.length,9,'nine preserved official UFC native fight IDs');
 assert.equal(h.some(x=>x.opponent==='Kevin Croom'),false,'official 2020 NC must not be invented');
 const confirmed=inventory.fighters?.[slug];
 assert.equal(confirmed?.sourceUrl,'https://www.ufc.com/athlete/roosevelt-roberts');
 assert.equal(confirmed?.bouts?.length,1);
 assert.deepEqual([confirmed.bouts[0].date,confirmed.bouts[0].opponent,confirmed.bouts[0].result],
  ['2020-09-12','Kevin Croom','no_contest']);
 assert.equal(confirmed.bouts[0].independentUfcStatsFightUrl,
  'https://ufcstats.com/fight-details/e1bb0b615c02d715');
 assert.equal(gate(slug,source[slug]),false);
});
