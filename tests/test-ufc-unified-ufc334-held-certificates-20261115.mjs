import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const json=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const review=json('data/ufc-334-held-certificates-recheck-20261115.json');
const native=json('data/ufcalendar-rich-progress.json');
const research=json('data/ufcalendar-fighter-research.json');
const independent=json('data/ufc-independent-full-career-verification.json');
const expectedIds=['93108','93111','93616','93620','93621','93780'];
const expectedSlugs=['bia-mesquita','cesar-almeida','chris-duncan','donte-johnson','evan-elder','heili-alateng','juan-diaz','melquizael-costa'];
const getOutcome=(bout,slug)=>String(bout.winnerNumericFighterId)===String(bout.a.slug===slug?bout.a.nativeFighterId:bout.b.nativeFighterId)?'win':'loss';

test('Six UFC 334 fight IDs are distinct and precisely cover eight held fighters',()=>{
 assert.equal(review.certificationGranted,false);
 assert.equal(review.readOnlyResearch,true);
 assert.equal(review.cohortSize,783);
 assert.equal(review.uniqueNewBouts,6);
 assert.deepEqual(review.newBouts.map(b=>b.nativeBoutId).sort(),expectedIds);
 assert.deepEqual([...review.heldFighterSlugs].sort(),expectedSlugs);
 const affected=new Set(review.newBouts.flatMap(b=>[b.a.slug,b.b.slug]).filter(s=>expectedSlugs.includes(s)));
 assert.deepEqual([...affected].sort(),expectedSlugs);
});

test('All six source-reviewed outcomes match each native ID, corner, date and measured-round status',()=>{
 for(const b of review.newBouts){
  const n=native.bouts[b.nativeBoutId];
  assert.ok(n,'native fight '+b.nativeBoutId+' missing');
  assert.equal(n.id,String(b.nativeBoutId));
  assert.equal(n.org,'ufc');
  assert.equal(n.status,'completed');
  assert.equal(n.eventDate,review.eventDate);
  assert.equal(n.a.slug,b.a.slug);
  assert.equal(String(n.a.id),b.a.nativeFighterId);
  assert.equal(n.b.slug,b.b.slug);
  assert.equal(String(n.b.id),b.b.nativeFighterId);
  assert.equal(String(n.result?.winnerId),b.winnerNumericFighterId);
  assert.equal(n.result?.method,b.method);
  assert.equal(native.roundDone[b.nativeBoutId],b.savedMeasuredRoundCount);
  assert.equal(b.sourceCheckedOutcome,true);
  assert.equal(b.independentUfcStatsFightUrl,null);
  assert.equal(b.strictFullCareerCertified,false);
 }
});

test('Every UFC334 held review now has either strict source-linked new bout evidence or retains the earlier hold',()=>{
 for(const slug of expectedSlugs){
  const eventBout=review.newBouts.find(b=>b.a.slug===slug||b.b.slug===slug);
  assert.ok(eventBout,slug+' is not affected');
  const prior=independent.fighters[slug];
  assert.ok(prior,'prior independent career proof missing: '+slug);
  const refreshed=prior.bouts.filter(x=>String(x.nativeBoutId)===eventBout.nativeBoutId);
  assert.equal(refreshed.length,1,'new source attached to exactly one official fight: '+slug);
  assert.equal(refreshed[0].date,'2026-11-14');
  assert.match(refreshed[0].fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
  assert.equal(prior.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f',slug);
  if(slug==='heili-alateng'){
   assert.equal(prior.bouts.length,11);
   assert.equal(refreshed[0].fightUrl,'https://ufcstats.com/fight-details/93d70d9869c66ed1');
   assert.deepEqual(prior.sourceVerifiedNativeNameAliases,['Heili Alateng']);
   assert.equal(prior.disambiguation.verifiedUfcStatsFighterId,'1897b7b913736a7c');
  }
  const profile=research.profiles[slug];
  assert.ok(profile,'saved profile missing: '+slug);
  const matches=(profile.recentHistory||[]).filter(x=>String(x.boutId)===eventBout.nativeBoutId&&x.promotion==='ufc');
  assert.equal(matches.length,1,'missing/duplicate native history: '+slug);
  assert.equal(matches[0].result,getOutcome(eventBout,slug));
  assert.equal(matches[0].date,review.eventDate);
 }
});
