import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=read('data/ufc-36-month-roster-approval.json');
const register=read('data/ufc-independent-full-career-verification.json');
const review=read('data/ufc-unified-wave10-official-source-review-20261114.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const seven=['lance-gibson-jr','lawrence-lui','leon-shahbazyan','lerryan-douglas','levi-rodrigues-jr','lucas-fernando','lucas-rocha'];
const expectedFeeders={'leon-shahbazyan':'88225','lerryan-douglas':'83910','levi-rodrigues-jr':'84103','lucas-fernando':'83866','lucas-rocha':'84102'};
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
test('one unchanged 783-fighter roster with seven source-attested full UFC histories',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(review.nonproduction,true);
 assert.equal(review.certificationGranted,false);
 assert.deepEqual(Object.keys(review.fighters),seven);
 for(const slug of seven){
   assert.ok(approval.approvedFighters.includes(slug));
   const s=review.fighters[slug],e=register.fighters[slug];
   assert.ok(s&&e&&e.sourceCoverageAttested===true,slug);
   assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
   assert.equal(e.officialUfcCareerBoutCount,2,slug);
   assert.equal(e.bouts.length,2,slug);
   assert.equal(e.sourceSnapshot.sourceCommit,review.pinnedSource.sourceCommit,slug);
   assert.equal(e.fighterUrl,s.pinnedGrecoFighterUrl,slug);
   assert.equal(e.officialFighterUrl,s.officialFighterUrl,slug);
   assert.equal(new Set(e.bouts.map(b=>b.nativeBoutId)).size,2,slug);
   for(const b of e.bouts){
     assert.match(b.nativeBoutId,/^[1-9][0-9]+$/,slug);
     assert.match(b.nativeFighterId,/^[1-9][0-9]+$/,slug);
     assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i,slug);
     assert.equal(s.bouts.filter(x=>x.date===b.date&&norm(x.opponent)===norm(b.opponent)&&x.result===b.result).length,1,slug);
   }
 }
});
test('five distinct DWCS native records remain individually source excluded',()=>{
 for(const [slug,id] of Object.entries(expectedFeeders)){
   const entries=feeder.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===id);
   assert.equal(entries.length,1,slug);
   assert.match(entries[0].sourceUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
   assert.ok(!register.fighters[slug].bouts.some(x=>x.nativeBoutId===id),slug);
 }
});
test('Liu Ce / Ce Liu is proven from exact independently certified opposing corner, no fuzzy name guessing',()=>{
 const levi=register.fighters['levi-rodrigues-jr'];
 const opposite=register.fighters['ce-liu'];
 const loss=levi.bouts.find(x=>x.nativeBoutId==='83813');
 const win=opposite.bouts.find(x=>x.nativeBoutId==='83813');
 assert.ok(loss&&win);
 assert.equal(loss.nativeFighterId,'34004');
 assert.equal(win.nativeFighterId,'55924');
 assert.equal(loss.result,'loss');
 assert.equal(win.result,'win');
 assert.equal(loss.fightUrl,win.fightUrl);
 assert.equal(loss.opponent,'Liu Ce');
 assert.deepEqual(loss.sourceVerifiedNativeOpponentAliases,['Ce Liu']);
 assert.deepEqual(loss.verifiedOpponentNativeFighterIds,['55924']);
 assert.equal(levi.disambiguation.sameIndependentUfcStatsBoutUrl,win.fightUrl);
});
test('Lawrence Lui Road to UFC final included as UFC 325, qualifier claims excluded',()=>{
 const lui=register.fighters['lawrence-lui'];
 const final=lui.bouts.find(x=>x.nativeBoutId==='65859');
 assert.ok(final);
 assert.equal(final.date,'2026-01-31');
 assert.equal(final.opponent,'Sulangrangbo');
 assert.equal(final.result,'win');
 assert.ok(!lui.bouts.some(x=>x.date==='2025-08-22'||x.date==='2025-05-23'));
});
