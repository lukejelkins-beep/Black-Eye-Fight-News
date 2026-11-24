import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const inventory=JSON.parse(readFileSync(new URL('../data/ufc-official-career-bout-inventory.json',import.meta.url),'utf8'));
const missing=new Map([
  ['mason-jones',['2021-06-05','Alan Patrick','9cdfcd164b48f55e']],
  ['brian-ortega',['2014-07-26','Mike De La Torre','fe6b45e7210bfa8e']],
  ['nicolas-dalby',['2020-07-25','Jesse Ronson','407e1c6850e7022c']],
  ['yair-rodriguez',['2019-09-21','Jeremy Stephens','62acea88e628c3ca']],
  ['jamahal-hill',['2020-05-30','Klidson Abreu','0fcf42b68f2f0fa3']]
]);

const cert=JSON.parse(readFileSync(new URL('../data/ufc-independent-full-career-verification.json',import.meta.url),'utf8')).fighters;

// Certified 2026-11-23 under the owner-approved savedHistoryGap rule (17 Nov): each no-contest is a gap bout in the
// independent register with its UFCStats fight link. No native UFC bout id or round data is invented for it.
test('five official full-career no-contests are certified as saved-history-gap bouts, not invented native UFC rounds',()=>{
 assert.equal(inventory.scope,'ufc-official-career-bout-inventory');
 assert.equal(inventory.rosterAsOf,'2026-11-14');
 for(const [slug,[date,opponent,sourceFightId]] of missing){
   assert.equal(inventory.fighters[slug],undefined,slug+' is no longer a source-only inventory gap');
   assert.ok(cert[slug],slug+' has an independent register entry');
   const gaps=cert[slug].bouts.filter(b=>b.savedHistoryGap===true);
   assert.equal(gaps.length,1,slug);
   const b=gaps[0];
   assert.equal(b.date,date,slug);
   assert.equal(b.result,'no_contest',slug);
   assert.equal(b.fightUrl,'https://ufcstats.com/fight-details/'+sourceFightId,slug);
   assert.equal(b.opponent.toLowerCase(),opponent.toLowerCase(),slug);
   for(const prohibited of ['cachedNativeBoutId','nativeBoutId','nativeFighterId','roundStats','measuredRounds']){
     assert.equal(Object.hasOwn(b,prohibited),false,slug+': '+prohibited+' must not be invented');
   }
 }
});
