import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditOfficialCareerInventory} from '../scripts/ufc-36-month-stage3-progress.mjs';

// Source-only negative cases: DO NOT change collector cache or award certificates.
// Original UFC numeric bout identity and genuinely measured round data remain required.
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
test('nineteen 783-roster fighters have twenty pinned original no-contests, zero premature certificates',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(keys.length,19);
 assert.equal(Object.values(expected).reduce((n,v)=>n+v.length,0),20);
 for(const slug of keys){
  assert.ok(approval.approvedFighters.includes(slug),slug);
  assert.equal(independent[slug],undefined,'no incomplete independent full-career certificate '+slug);
  const item=inventory.fighters[slug];
  assert.equal(item.status,'source_confirmed_missing_native_no_contest_not_certified',slug);
  assert.equal(item.reviewedOn,'2026-11-16',slug);
  assert.equal(item.sourceUrl,'https://www.ufc.com/athlete/'+slug);
  assert.equal(item.sourceEvidence.sourceCommit,'96adace863c0a793579cc06d27d468797545607f',slug);
  assert.equal(item.sourceEvidence.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6',slug);
  assert.equal(item.sourceEvidence.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9',slug);
  assert.equal(item.bouts.length,expected[slug].length,slug);
  for(const [date,opp,sourceId] of expected[slug]){
   const row=item.bouts.find(b=>b.date===date&&b.opponent===opp);
   assert.ok(row,'missing exact source '+slug+': '+date+' / '+opp);
   assert.equal(row.result,'no_contest',slug);
   assert.equal(row.pinnedSourceFinalOutcome,'NC/NC',slug);
   assert.equal(row.independentUfcStatsFightUrl,'https://ufcstats.com/fight-details/'+sourceId,slug);
   assert.equal(row.nativeRecoveryStatus,'no_matching_original_ufc_native_fight_in_saved_cache',slug);
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
  assert.equal(inventory.fighters[a].bouts.length,1);
  assert.equal(inventory.fighters[b].bouts.length,1);
  assert.equal(inventory.fighters[a].bouts[0].independentUfcStatsFightUrl,'https://ufcstats.com/fight-details/'+id);
  assert.equal(inventory.fighters[b].bouts[0].independentUfcStatsFightUrl,'https://ufcstats.com/fight-details/'+id);
 }
 assert.equal(inventory.fighters['jeremy-stephens'].bouts[0].independentUfcStatsFightUrl,
  inventory.fighters['yair-rodriguez'].bouts[0].independentUfcStatsFightUrl);
 const rows=keys.flatMap(k=>inventory.fighters[k].bouts);
 assert.equal(new Set(rows.map(r=>r.independentUfcStatsFightUrl)).size,17);
});
test('official NC source inventory records 20 missing identities, never supplies a substitute numeric cache ID',()=>{
 const subset={...inventory,fighters:Object.fromEntries(keys.map(k=>[k,inventory.fighters[k]]))};
 const out=auditOfficialCareerInventory(subset,keys,{asOf:'2026-11-14',fighters:[]},{},native.bouts);
 assert.equal(out.totalSourceBouts,20);
 assert.equal(out.sourceMissingSaved,20);
 assert.equal(out.matchedSaved,0);
 assert.equal(out.conflicts.length,0);
 assert.ok(out.cases.every(x=>x.officialOutcome==='no_contest'));
 assert.ok(out.cases.every(x=>x.cachedFightCandidates.length===0));
 assert.deepEqual(new Set(out.cases.map(x=>x.slug)),new Set(keys));
});
