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
 'jack-jenkins':{count:7,numeric:'213',feeder:'83980'},
 'payton-talbott':{count:7,numeric:'364',feeder:'83869'},
 'carlos-prates':{count:8,numeric:'402',feeder:'84164'},
 'gabriel-bonfim':{count:8,numeric:'78',feeder:'84048'}
};
const history=slug=>profiles[slug].recentHistory.filter(r=>r.source==='native'&&
 r.promotion==='ufc'&&r.boutId&&
 !/contender series|\bdwcs\b|road to ufc/i.test(native.bouts[r.boutId]?.event||''));
const check=(slug,proof)=>evaluateCareerEvidence(
 profiles[slug],history(slug),
 census.fighters.find(f=>f.slug===slug).lastUfcFight,
 approval.rosterAsOf,proof,native.bouts).independentlyVerified;
test('wave89 four exhaustively source-attested 7/8-bout UFC careers match native ids, two fighter corners, results and positive measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 for(const [slug,{count,numeric,feeder}] of Object.entries(cases)){
  assert.ok(approval.approvedFighters.includes(slug));
  const p=registry[slug],h=history(slug),unique=new Set();
  assert.equal(p?.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,count);
  assert.equal(p.bouts.length,count);
  assert.equal(h.length,count);
  assert.deepEqual(p.verifiedNumericFighterIds,[numeric]);
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,1);
  assert.equal(p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,feeder);
  assert.match(native.bouts[feeder].event,/contender series|dwcs/i);
  assert.ok(!p.bouts.some(b=>b.nativeBoutId===feeder));
  for(const x of p.bouts){
   assert.match(x.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!unique.has(x.fightUrl));unique.add(x.fightUrl);
   const b=native.bouts[x.nativeBoutId];
   assert.equal(b?.org,'ufc');assert.equal(x.nativeFighterId,numeric);
   assert.ok(Number(native.roundDone[x.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(x.date))<=86400000);
   const own=b.a.id===numeric?b.a:b.b.id===numeric?b.b:null;
   assert.ok(own,slug+' paired own numeric fighter id');
   const other=own===b.a?b.b:b.a;
   assert.equal(other.name,x.opponent);
   const outcome=b.status==='no_contest'?'no_contest':
    b.status==='draw'||(!b.result?.winnerId&&b.result?.method==='draw')?'draw':
    b.result?.winnerId===own.id?'win':b.result?.winnerId===other.id?'loss':null;
   assert.equal(outcome,x.result);
  }
  assert.equal(check(slug,p),true,slug+' complete independent Stage3');
 }
});
test('wave89 refuses partial source career, duplicated bout URLs, inverted result and invented fighter id',()=>{
 for(const slug of Object.keys(cases)){
  const p=registry[slug];
  assert.equal(check(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' missing fight');
  assert.equal(check(slug,{...p,verifiedNumericFighterIds:['999999']}),false,slug+' wrong identity');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false,slug+' inverted result');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,fightUrl:p.bouts[1].fightUrl})}),false,slug+' duplicated fight');
  assert.equal(check(slug,{...p,bouts:[...p.bouts,{...p.bouts[0],nativeBoutId:p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,fightUrl:'https://ufcstats.com/fight-details/0000000000000000'}]}),false,slug+' feeder incorrectly added');
 }
});
