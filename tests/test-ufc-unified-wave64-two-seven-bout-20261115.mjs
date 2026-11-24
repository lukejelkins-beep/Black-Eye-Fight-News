import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read = name => JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const registry=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const targets={'carlos-hernandez':['1071',['60850','38594','61052','59946','60174','59762','61392']],
 'jaqueline-amorim':['76',['66113','60470','60885','61113','61246','60086','53837']]};
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const history=slug=>profiles[slug].recentHistory.filter(x=>x.promotion==='ufc'&&x.boutId&&cache.bouts[x.boutId]?.org==='ufc'&&!/contender series/i.test(cache.bouts[x.boutId]?.event||''));
const gate=(slug,e)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,e,cache.bouts,approval.rosterAsOf).independentlyVerified;

test('wave64 seven-bout fighters retain exact fourteen source/native/paired-corner identities and measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 const distinct=[];
 for(const [slug,[numericId,ids]] of Object.entries(targets)){
  assert.ok(approval.approvedFighters.includes(slug));
  const e=registry[slug],hist=history(slug);
  assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.officialUfcCareerBoutCount,7);
  assert.equal(e.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(e.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.deepEqual(e.verifiedNumericFighterIds,[numericId]);
  assert.equal(e.bouts.length,7);assert.equal(hist.length,7);
  assert.deepEqual(e.bouts.map(b=>b.nativeBoutId).sort(),ids.slice().sort());
  for(const b of e.bouts){
   const saved=cache.bouts[b.nativeBoutId];
   assert.ok(saved);assert.equal(saved.org,'ufc');assert.equal(saved.status,'completed');
   assert.equal(saved.eventDate,b.date);assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   const own=saved.a.id===numericId?saved.a:saved.b,other=own===saved.a?saved.b:saved.a;
   assert.equal(own.slug,slug);assert.equal(b.nativeFighterId,numericId);
   assert.equal(norm(other.name),norm(b.opponent));
   assert.equal(saved.result.winnerId===own.id?'win':'loss',b.result);
   assert.ok(hist.some(x=>x.boutId===b.nativeBoutId&&x.date===b.date&&x.result===b.result));
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   distinct.push(b);
  }
  assert.equal(gate(slug,e),true);
 }
 assert.equal(new Set(distinct.map(x=>x.nativeBoutId)).size,14);
 assert.equal(new Set(distinct.map(x=>x.fightUrl)).size,14);
});
test('wave64 missing bout, wrong numeric fighter ID and inverted winner are never certifiable',()=>{
 for(const slug of Object.keys(targets)){
  const e=registry[slug];
  assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
