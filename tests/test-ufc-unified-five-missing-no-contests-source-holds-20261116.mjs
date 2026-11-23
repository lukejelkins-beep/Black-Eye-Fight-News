import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {auditOfficialCareerInventory} from '../scripts/ufc-36-month-stage3-progress.mjs';

const inventory=JSON.parse(readFileSync(new URL('../data/ufc-official-career-bout-inventory.json',import.meta.url),'utf8'));
const missing=new Map([
  ['mason-jones',['2021-06-05','Alan Patrick','9cdfcd164b48f55e']],
  ['brian-ortega',['2014-07-26','Mike De La Torre','fe6b45e7210bfa8e']],
  ['nicolas-dalby',['2020-07-25','Jesse Ronson','407e1c6850e7022c']],
  ['yair-rodriguez',['2019-09-21','Jeremy Stephens','62acea88e628c3ca']],
  ['jamahal-hill',['2020-05-30','Klidson Abreu','0fcf42b68f2f0fa3']]
]);

test('five official full-career no-contests remain research-only gaps, not invented native UFC rounds',()=>{
 assert.equal(inventory.scope,'ufc-official-career-bout-inventory');
 assert.equal(inventory.rosterAsOf,'2026-11-14');
 for(const [slug,[date,opponent,sourceFightId]] of missing){
   const f=inventory.fighters[slug];
   assert.equal(f.status,'source_confirmed_missing_native_no_contest_not_certified',slug);
   assert.equal(f.reviewedOn,'2026-11-16',slug);
   assert.match(f.sourceUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
   assert.equal(f.bouts.length,1,slug);
   const b=f.bouts[0];
   assert.equal(b.date,date,slug);
   assert.equal(b.opponent,opponent,slug);
   assert.equal(b.result,'no_contest',slug);
   assert.equal(b.independentUfcStatsFightUrl,'https://ufcstats.com/fight-details/'+sourceFightId,slug);
   assert.match(b.officialNoContestSourceUrl,/^https:\/\/www\.ufc\.com\//,slug);
   for(const prohibited of ['cachedNativeBoutId','nativeBoutId','nativeFighterId','roundStats','measuredRounds']){
     assert.equal(Object.hasOwn(b,prohibited),false,slug+': '+prohibited+' must not be invented');
   }
 }
});

test('source-only NC evidence detects missing original UFC identities without awarding certification',()=>{
 const subset={...inventory,fighters:Object.fromEntries([...missing.keys()].map(slug=>[slug,inventory.fighters[slug]]))};
 const report=auditOfficialCareerInventory(subset,[...missing.keys()],{
   asOf:'2026-11-14',fighters:[] 
 },{},{}); // No original native UFC bout may be fabricated by the source inventory.
 assert.equal(report.totalSourceBouts,5);
 assert.equal(report.sourceMissingSaved,5);
 assert.equal(report.matchedSaved,0);
 assert.deepEqual(report.cases.map(x=>x.slug).sort(),[...missing.keys()].sort());
 assert.ok(report.cases.every(x=>x.officialOutcome==='no_contest'));
 assert.ok(report.cases.every(x=>x.cachedFightCandidates.length===0));
});
