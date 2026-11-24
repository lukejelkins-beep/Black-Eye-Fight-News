import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const rd = name => JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approved = rd('ufc-36-month-roster-approval.json');
const census = rd('ufc-36-month-candidates.json');
const registry = rd('ufc-independent-full-career-verification.json').fighters;
const profiles = rd('ufcalendar-fighter-research.json').profiles;
const native = rd('ufcalendar-rich-progress.json');
const targets = {
  'mariya-agapova':['634',['61074','61187','61401','61697','66229','66307']],
  'talita-alencar':['302',['93262','66088','60430','60307','60247','59947']],
  'victor-altamirano':['1094',['38711','39039','61310','59651','59850','61392']]
};
const norm = v => String(v||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const hist = slug => profiles[slug].recentHistory.filter(h =>
  h.promotion==='ufc' && h.boutId && native.bouts[h.boutId]?.org==='ufc' &&
  !/contender series/i.test(native.bouts[h.boutId]?.event||''));
const gate = (slug,proof) => evaluateCareerEvidence(
  profiles[slug],hist(slug),
  census.fighters.find(x=>x.slug===slug)?.lastUfcFight,
  approved.rosterAsOf,proof,native.bouts,approved.rosterAsOf
).independentlyVerified;

test('wave63: all 18 pinned fight IDs match the exact six completed official UFC Octagon histories',()=>{
  assert.equal(approved.approvedFighters.length,783);
  const allBouts=[];
  for (const [slug,[nativeId,ids]] of Object.entries(targets)) {
    assert.ok(approved.approvedFighters.includes(slug));
    const e=registry[slug],saved=hist(slug);
    assert.equal(e.scope,'complete_official_ufc_career');
    assert.equal(e.sourceCoverageAttested,true);
    assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
    assert.equal(e.officialUfcCareerBoutCount,6);
    assert.equal(e.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
    assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
    assert.equal(e.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
    assert.deepEqual(e.verifiedNumericFighterIds,[nativeId]);
    assert.equal(saved.length,6);assert.equal(e.bouts.length,6);
    assert.deepEqual(e.bouts.map(x=>x.nativeBoutId),ids);
    for (const b of e.bouts) {
      const n=native.bouts[b.nativeBoutId];
      assert.ok(n);assert.equal(n.org,'ufc');assert.equal(n.status,'completed');
      assert.equal(n.eventDate,b.date);assert.ok(Number(native.roundDone[b.nativeBoutId])>0);
      const own=n.a.id===nativeId?n.a:n.b,other=own===n.a?n.b:n.a;
      assert.equal(own.slug,slug);assert.equal(own.id,b.nativeFighterId);
      assert.equal(norm(other.name),norm(b.opponent));
      assert.equal(n.result.winnerId===own.id?'win':'loss',b.result);
      assert.ok(saved.some(h=>h.boutId===b.nativeBoutId&&h.date===b.date&&h.result===b.result));
      assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
      allBouts.push(b);
    }
    assert.equal(gate(slug,e),true);
  }
  assert.equal(new Set(allBouts.map(b=>b.nativeBoutId)).size,18);
  assert.equal(new Set(allBouts.map(b=>b.fightUrl)).size,18);
});

test('wave63: independent strict gate fails closed on missing UFC bout, fabricated numeric identity and inverted result',()=>{
  for (const slug of Object.keys(targets)) {
    const entry=registry[slug];
    assert.equal(gate(slug,{...entry,bouts:entry.bouts.slice(1)}),false);
    assert.equal(gate(slug,{...entry,verifiedNumericFighterIds:['999999']}),false);
    assert.equal(gate(slug,{...entry,bouts:entry.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
  }
});
