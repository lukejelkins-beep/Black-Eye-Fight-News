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
// Owner, 23 Nov 2026: a Road to UFC final counts as a UFC career bout. Owner, 24 Nov 2026: it is certified as a
// result-only gap bout cited to UFC.com. The finals leave the inventory and enter the register; still nothing invented.
test('three official Road to UFC finals are result-only register gap bouts, never silently excluded',()=>{
 for(const [slug,date,opponent,result,url] of fighters){
  assert.ok(approved.approvedFighters.includes(slug),slug);
  assert.equal(inv.fighters[slug],undefined,'left the inventory with its register entry: '+slug);
  const finals=cert[slug].bouts.filter(b=>b.roadToUfcFinal===true);
  assert.equal(finals.length,1,slug);
  const source=finals[0];
  assert.equal(source.date,date,slug);
  assert.equal(source.opponent,opponent,slug);
  assert.equal(source.result,result,slug);
  assert.equal(source.savedHistoryGap,true,slug);
  assert.match(source.officialUfcSourceUrl,/^https:\/\/www\.ufc\.com\//);
  assert.ok(source.officialUfcSourceQuote.includes(opponent.split(' ')[0]),slug);
  assert.equal(cert[slug].officialFighterUrl,url,slug);
  for(const key of ['fightUrl','cachedNativeBoutId','nativeBoutId','nativeFighterId','roundStats','measuredRounds','rounds'])
   assert.equal(Object.hasOwn(source,key),false,'never invent missing '+key+': '+slug);
 }
});
test('original numeric UFC caches cannot substitute different bouts or cancelled/feeder rows for the three finals',()=>{
 const expected={ 'zhu-kangjie':1, 'yizha':4, 'rei-tsuruya':4 };
 for(const [slug,count] of Object.entries(expected)){
  const ns=Object.values(rich.bouts).filter(b=>b.org==='ufc'&&b.status==='completed'&&
   (b.a?.slug===slug||b.b?.slug===slug));
  assert.equal(ns.length,count,'original saved UFC completed bouts unchanged: '+slug);
  const final=cert[slug].bouts.find(b=>b.roadToUfcFinal===true);
  assert.ok(!ns.some(b=>b.eventDate===final.date));
  assert.equal(cert[slug].bouts.length,count+1,'saved UFC bouts plus the one final: '+slug);
 }
 assert.equal(rich.bouts['66105'].status,'cancelled','Zhu cancelled bout never substitutes for RTU final');
 assert.equal(rich.bouts['66111'].status,'cancelled','Rei cancelled bout never substitutes for RTU final');
});
