import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const inv=read('ufc-official-career-bout-inventory.json');
const approval=read('ufc-36-month-roster-approval.json');
const cert=read('ufc-independent-full-career-verification.json').fighters;
const held={
 'dan-argueta':[['2023-09-23','Miles Johns','b78545b32a97ac44'],['2023-06-17','Ronnie Lawrence','9a2d3ebab827d333']],
 'victor-henry':[['2023-10-21','Javid Basharat','0d1af8c6a5793185']],
 'edgar-chairez':[['2023-09-16','Daniel Lacerda','5d3e046b6bcd49f5']]
};

test('three official UFC no-contest cases (four bouts) are certified as saved-history-gap bouts with exact source links and no made-up numeric stats',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(Object.values(held).reduce((a,x)=>a+x.length,0),4);
 for(const [slug,rows] of Object.entries(held)){
  assert.ok(approval.approvedFighters.includes(slug));
  assert.ok(cert[slug],'certified in the independent register '+slug);
  assert.equal(inv.fighters[slug],undefined,'no longer a source-only inventory gap '+slug);
  const gaps=cert[slug].bouts.filter(b=>b.savedHistoryGap===true);
  assert.equal(gaps.length,rows.length,slug);
  for(const [date,opp,id] of rows){
   const b=gaps.find(x=>x.date===date&&x.opponent===opp);
   assert.ok(b,slug+': '+opp);
   assert.equal(b.result,'no_contest');
   assert.equal(b.fightUrl,'https://ufcstats.com/fight-details/'+id);
   for(const prohibited of ['cachedNativeBoutId','nativeBoutId','nativeFighterId','roundStats','measuredRounds'])
    assert.equal(Object.hasOwn(b,prohibited),false,slug+' cannot invent '+prohibited);
  }
 }
});
