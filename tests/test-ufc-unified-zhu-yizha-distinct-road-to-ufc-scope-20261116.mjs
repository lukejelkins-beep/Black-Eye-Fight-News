import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditOfficialCareerInventory} from '../scripts/ufc-36-month-stage3-progress.mjs';

// Exact original UFC native fight/round data remains a strict prerequisite.
// Road-to-UFC finals in official UFC athlete histories cannot be silently discarded.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approved=read('ufc-36-month-roster-approval.json');
const cert=read('ufc-independent-full-career-verification.json').fighters;
const wave5=read('ufc-unified-wave5-official-source-review-20261114.json');
const rei=read('ufc-unified-rei-tsuruya-official-source-review-20261115.json');
const inv=read('ufc-official-career-bout-inventory.json');
const rich=read('ufcalendar-rich-progress.json');
const fighters=[
 ['zhu-kangjie','2025-05-23','Bin Xie','win','https://www.ufc.com/athlete/zhu-kangjie'],
 ['yizha','2024-02-03','Kaiwen','win','https://www.ufc.com/athlete/yi-zha'],
 ['rei-tsuruya','2024-02-03','Jiniushiyue','win','https://www.ufc.com/athlete/rei-tsuruya']
];
test('frozen 783 cohort and earlier Zhu and Rei official UFC source findings remain binding',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.equal(new Set(approved.approvedFighters).size,783);
 assert.equal(wave5.fighters['zhu-kangjie'].officialUfcCareerCount,2);
 assert.equal(wave5.fighters['zhu-kangjie'].bouts[0].opponent,'Bin Xie');
 assert.equal(wave5.fighters['zhu-kangjie'].bouts[0].date,'2025-05-23');
 assert.equal(rei.officialUfcCareerBoutCount,5);
 assert.equal(rei.officialCareer[0].opponent,'Jiniushiyue');
 assert.equal(rei.officialCareer[0].classification,'official_road_to_ufc_tournament_final');
});
test('three official Road to UFC finals are independently dated source gaps, never silently excluded',()=>{
 for(const [slug,date,opponent,result,url] of fighters){
  assert.ok(approved.approvedFighters.includes(slug),slug);
  assert.equal(cert[slug],undefined,'refuse incomplete full-career proof for '+slug);
  const item=inv.fighters[slug];
  assert.ok(item,slug);
  assert.equal(item.status,'source_confirmed_missing_original_road_to_ufc_final_not_certified');
  assert.equal(item.sourceUrl,url,slug);
  assert.equal(item.bouts.length,1);
  const source=item.bouts[0];
  assert.equal(source.date,date,slug);
  assert.equal(source.opponent,opponent,slug);
  assert.equal(source.result,result,slug);
  assert.match(source.officialFinalSourceUrl,/^https:\/\/www\.ufc\.com\//);
  assert.equal(source.nativeRecoveryStatus,'no_matching_original_ufc_native_fight_in_saved_cache');
  assert.equal(source.independentUfcStatsFightUrl,undefined,'not invented UFCStats identity');
  for(const key of ['cachedNativeBoutId','nativeBoutId','nativeFighterId','roundStats','measuredRounds'])
   assert.equal(Object.hasOwn(source,key),false,'never invent missing '+key+': '+slug);
 }
});
test('original numeric UFC caches cannot substitute different bouts or cancelled/feeder rows for the three missing finals',()=>{
 const expected={ 'zhu-kangjie':1, 'yizha':4, 'rei-tsuruya':4 };
 for(const [slug,count] of Object.entries(expected)){
  const ns=Object.values(rich.bouts).filter(b=>b.org==='ufc'&&b.status==='completed'&&
   (b.a?.slug===slug||b.b?.slug===slug));
  assert.equal(ns.length,count,'original saved UFC completed bouts unchanged: '+slug);
  assert.ok(!ns.some(b=>inv.fighters[slug].bouts.some(s=>b.eventDate===s.date)));
 }
 assert.equal(rich.bouts['66105'].status,'cancelled','Zhu cancelled bout never substitutes for RTU final');
 assert.equal(rich.bouts['66111'].status,'cancelled','Rei cancelled bout never substitutes for RTU final');
});
test('missing RTU finals enter the existing inventory exception gate, not an independent certification',()=>{
 const slugs=fighters.map(x=>x[0]);
 const sub={...inv,fighters:Object.fromEntries(slugs.map(k=>[k,inv.fighters[k]]))};
 const out=auditOfficialCareerInventory(sub,slugs,{asOf:'2026-11-14',fighters:[]},{},rich.bouts);
 assert.equal(out.totalSourceBouts,3);
 assert.equal(out.sourceMissingSaved,3);
 assert.equal(out.matchedSaved,0);
 assert.deepEqual(new Set(out.cases.map(x=>x.slug)),new Set(slugs));
});
