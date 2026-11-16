import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const native=read('ufcalendar-rich-progress.json');
const registry=read('ufc-independent-full-career-verification.json').fighters;
const cases={
  'josh-hokit':{count:5,numeric:'105',feeder:'84001'},
  'allan-nascimento':{count:6,numeric:'123',feeder:'84018'},
  'jafel-filho':{count:6,numeric:'170',feeder:'83946'},
  'nikolay-veretennikov':{count:6,numeric:'187',feeder:'88239'},
  'vinicius-oliveira':{count:6,numeric:'501',feeder:'83951'},
  'bo-nickal':{count:7,numeric:'109',feeder:'83978'}
};
const history=slug=>profiles[slug].recentHistory.filter(r=>
 r.source==='native'&&r.promotion==='ufc'&&r.boutId&&
 !/contender series|road to ufc|\bdwcs\b/i.test(native.bouts[r.boutId]?.event||''));
const check=(slug,proof)=>evaluateCareerEvidence(
 profiles[slug],history(slug),
 census.fighters.find(f=>f.slug===slug).lastUfcFight,
 approval.rosterAsOf,proof,native.bouts).independentlyVerified;
test('wave88: six exact independent UFCStats career sources and original two-corner native histories are complete and strictly certified',()=>{
 assert.equal(approval.approvedFighters.length,783);
 for(const [slug,{count,numeric,feeder}] of Object.entries(cases)){
  assert.ok(approval.approvedFighters.includes(slug),slug+' must belong to immutable 783 cohort');
  const p=registry[slug], h=history(slug);
  assert.equal(p?.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,count);
  assert.equal(p.bouts.length,count);
  assert.equal(h.length,count,slug+' complete native official history');
  assert.deepEqual(p.verifiedNumericFighterIds,[numeric]);
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,1);
  assert.equal(p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,feeder);
  assert.match(native.bouts[feeder].event,/contender series|dwcs/i);
  assert.ok(!p.bouts.some(r=>r.nativeBoutId===feeder));
  const unique=new Set();
  for(const bout of p.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!unique.has(bout.fightUrl),'distinct independent bout links');unique.add(bout.fightUrl);
   const b=native.bouts[bout.nativeBoutId];
   assert.equal(b?.org,'ufc');
   assert.equal(bout.nativeFighterId,numeric);
   assert.ok(Number(native.roundDone[bout.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(bout.date))<=86400000);
   const own=b.a.id===numeric?b.a:b.b.id===numeric?b.b:null;
   assert.ok(own,slug+' exact numeric corner');
   const opponent=own===b.a?b.b:b.a;
   assert.equal(opponent.name,bout.opponent);
   const result=b.status==='no_contest'?'no_contest':
    b.status==='draw'||(!b.result?.winnerId&&b.result?.method==='draw')?'draw':
    b.result?.winnerId===own.id?'win':b.result?.winnerId===opponent.id?'loss':null;
   assert.equal(result,bout.result);
  }
  assert.equal(check(slug,p),true,slug+' strict Stage 3 proof gate');
 }
 assert.equal(registry['allan-nascimento'].bouts.find(x=>x.nativeBoutId==='38402').fightUrl,
  registry['jafel-filho'].bouts.find(x=>x.nativeBoutId==='38402').fightUrl,
  'opponents must share the exact same source fight but retain their opposite outcomes');
});
test('wave88: every fighter fails closed for omitted, duplicated, inverted and invented source/native evidence',()=>{
 for(const slug of Object.keys(cases)){
  const p=registry[slug];
  assert.equal(check(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' omitted official fight');
  assert.equal(check(slug,{...p,verifiedNumericFighterIds:['999999']}),false,slug+' invented identity');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false,slug+' wrong outcome');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,fightUrl:p.bouts[1].fightUrl})}),false,slug+' duplicate independent bout');
  assert.equal(check(slug,{...p,bouts:[...p.bouts,{...p.bouts[0],nativeBoutId:p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId, fightUrl:'https://ufcstats.com/fight-details/0000000000000000'}]}),false,slug+' contaminated official UFC proof with DWCS');
 }
});
