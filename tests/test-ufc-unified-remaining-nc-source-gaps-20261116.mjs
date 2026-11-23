import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// These nineteen fighters each have one or two official no-contests that saved UFC history lacks.
// Since 2026-11-23 they are certified under the owner-approved savedHistoryGap rule (17 Nov): each
// no-contest is listed in the independent register as a gap bout with its UFCStats fight link.
// No numeric native bout, round data or collector cache entry is invented for them.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const inventory=read('ufc-official-career-bout-inventory.json');
const approval=read('ufc-36-month-roster-approval.json');
const native=read('ufcalendar-rich-progress.json');
const independent=read('ufc-independent-full-career-verification.json').fighters;
const expected={
 'nassourdine-imavov':[['2023-06-10','Chris Curtis','96eaf07b34538b8b']],
 'daniel-pineda':[['2021-06-26','Andre Fili','4622ec182e7fed6b']],
 'kyung-ho-kang':[['2013-03-02','Alex Caceres','be70a2f68f6ad3e7']],
 'jared-gordon':[['2023-04-22','King Green','640d52630f4f8a61']],
 'eryk-anders':[['2021-03-13','Darren Stewart','dc48627a5f2daba9']],
 'pedro-munhoz':[['2022-07-02',"Sean O'Malley",'39dccca8e8083072'],['2014-10-04','Jerrod Sanders','1cad3dc6d7eccdfb']],
 'rani-yahya':[['2014-04-11','Johnny Bedford','ceac6997d22f2f3b']],
 'curtis-blaydes':[['2017-02-04','Adam Milstead','74256b4e8d0b1de6']],
 'alex-morono':[['2017-02-04','Niko Price','48e51d4e7172048e']],
 'jon-jones':[['2017-07-29','Daniel Cormier','5ab286735ccee803']],
 'andre-fili':[['2021-06-26','Daniel Pineda','4622ec182e7fed6b']],
 'drew-dober':[['2015-03-21','Leandro Silva','b068a4ee6d842606']],
 'alex-caceres':[['2013-03-02','Kyung Ho Kang','be70a2f68f6ad3e7']],
 'tim-means':[['2016-12-30','Alex Oliveira','9d4b2767f6630fc9']],
 'dustin-poirier':[['2017-05-13','Eddie Alvarez','6fe9729cee57c680']],
 'king-green':[['2023-04-22','Jared Gordon','640d52630f4f8a61']],
 'jeremy-stephens':[['2019-09-21','Yair Rodriguez','62acea88e628c3ca']],
 'charles-oliveira':[['2011-06-26','Nik Lentz','91daeeeea0a83e49']],
 'jim-miller':[['2013-04-27','Pat Healy','bb59b82bddc96cca']]
};
const keys=Object.keys(expected);
const gapRow=(slug,id)=>(independent[slug]?.bouts||[]).find(b=>b.fightUrl==='https://ufcstats.com/fight-details/'+id);
test('nineteen 783-roster fighters have twenty no-contests, all certified as saved-history-gap bouts',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(keys.length,19);
 assert.equal(Object.values(expected).reduce((n,v)=>n+v.length,0),20);
 for(const slug of keys){
  assert.ok(approval.approvedFighters.includes(slug),slug);
  assert.ok(independent[slug],'certified in the independent register '+slug);
  assert.equal(inventory.fighters[slug],undefined,'no longer a source-only inventory gap '+slug);
  const gaps=independent[slug].bouts.filter(b=>b.savedHistoryGap===true);
  assert.equal(gaps.length,expected[slug].length,slug);
  for(const [date,opp,id] of expected[slug]){
   const row=gapRow(slug,id);
   assert.ok(row,'missing gap bout '+slug+': '+date+' / '+opp);
   assert.equal(row.savedHistoryGap,true,slug);
   assert.equal(row.result,'no_contest',slug);
   assert.equal(row.date,date,slug);
   for(const invented of ['nativeBoutId','cachedNativeBoutId','nativeFighterId','roundStats','measuredRounds']){
    assert.equal(Object.hasOwn(row,invented),false,'no invented native '+slug+': '+invented);
   }
  }
 }
});
test('paired fighter source results are one original NC identity each, not two separate fights',()=>{
 const pairs=[
  ['daniel-pineda','andre-fili','4622ec182e7fed6b'],
  ['kyung-ho-kang','alex-caceres','be70a2f68f6ad3e7'],
  ['jared-gordon','king-green','640d52630f4f8a61']
 ];
 for(const [a,b,id] of pairs){
  assert.equal(gapRow(a,id)?.savedHistoryGap,true);
  assert.equal(gapRow(b,id)?.savedHistoryGap,true);
 }
 const urls=keys.flatMap(k=>independent[k].bouts.filter(b=>b.savedHistoryGap===true).map(b=>b.fightUrl));
 assert.equal(urls.length,20);
 assert.equal(new Set(urls).size,17);
});
