import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const registry=read('ufc-independent-full-career-verification.json');
const cache=read('ufcalendar-rich-progress.json');
const research=read('ufcalendar-fighter-research.json');
const roster=read('ufc-36-month-roster-approval.json');

const expected={
  'loik-radzhabov':{
    fighter:'8c169fbe1ac33637',native:'2766',
    bouts:{'59693':['ee2354d638c078fd','win'],'60160':['8b296724a6844865','loss'],'61271':['ba8f219260e212f8','win'],'65931':['b3f1253d0a991791','loss']}
  },
  'melissa-croden':{
    fighter:'51e2f44a8dbf6984',native:'139',
    bouts:{'38154':['dec301fd5e99ca46','win'],'60656':['ceb5b0f1f6daddf6','loss'],'66097':['bae4de7ef8c0769e','win'],'83623':['f07778a744322922','loss']}
  },
  'mizuki':{
    fighter:'43a59ce3bb40449e',native:'301',
    bouts:{'58974':['5f900e4437e079b3','win'],'66231':['0a3e48cdd97267f4','loss'],'60040':['adb411b0f418ce33','win'],'60470':['ef1519c8c1d20977','win']}
  },
  'ravena-oliveira':{
    fighter:'4948e412fa6ab67d',native:'145',
    bouts:{'60016':['5b7b5b01f4dcbd9c','loss'],'38152':['8d9458121f0c4b95','loss'],'60571':['216bc9b661485017','loss'],'83258':['d463229133909215','loss']}
  }
};

test('wave35 preserves four unique already-approved UFC full careers in ONE canonical evidence register',()=>{
  assert.equal(roster.approvedFighters.length,783);
  assert.equal(new Set(Object.keys(registry.fighters)).size,Object.keys(registry.fighters).length);
  for(const [slug,spec] of Object.entries(expected)){
    assert.ok(roster.approvedFighters.includes(slug),slug);
    const evidence=registry.fighters[slug];
    assert.equal(evidence?.scope,'complete_official_ufc_career',slug);
    assert.equal(evidence?.sourceCoverageAttested,true,slug);
    assert.equal(evidence?.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
    assert.equal(evidence?.fighterUrl,'https://ufcstats.com/fighter-details/'+spec.fighter);
    assert.match(evidence.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
    assert.deepEqual(evidence.verifiedNumericFighterIds,[spec.native]);
    assert.equal(evidence.bouts.length,4);
    assert.equal(new Set(evidence.bouts.map(b=>b.nativeBoutId)).size,4);
    assert.equal(new Set(evidence.bouts.map(b=>b.fightUrl)).size,4);
    assert.equal(evidence.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
    assert.equal(evidence.sourceSnapshot?.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
    assert.equal(evidence.sourceVerifiedExcludedFeederBouts.length,0);
    for(const row of evidence.bouts){
      const [id,result]=spec.bouts[row.nativeBoutId]||[];
      assert.ok(id,slug+' unexpected native bout '+row.nativeBoutId);
      assert.equal(row.fightUrl,'https://ufcstats.com/fight-details/'+id);
      assert.equal(row.nativeFighterId,spec.native);
      assert.equal(row.result,result);
      const native=cache.bouts[row.nativeBoutId];
      assert.equal(native?.org,'ufc');
      assert.equal(native?.status,'completed');
      assert.doesNotMatch(native.event,/contender series|road to ufc|exhibition/i);
      const own=native.a?.slug===slug?native.a:native.b?.slug===slug?native.b:null;
      const other=own===native.a?native.b:native.a;
      assert.equal(own?.id,spec.native);
      assert.ok(other?.id&&other?.name);
      assert.equal(row.opponent,other.name);
      assert.ok(Math.abs(Date.parse(row.date)-Date.parse(native.eventDate))<=86400000);
      const nativeResult=native.result?.winnerId===own.id?'win':native.result?.winnerId===other.id?'loss':null;
      assert.equal(nativeResult,row.result);
      assert.ok(Number(cache.roundDone[row.nativeBoutId])>0);
      assert.ok(research.profiles[slug].recentHistory.some(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId===row.nativeBoutId&&h.result===row.result));
    }
  }
});
test('wave35 verifies all 16 complete native fight links, and cannot promote evidence-only without the strict Stage3 gate',()=>{
  assert.equal(Object.keys(expected).reduce((n,slug)=>n+registry.fighters[slug].bouts.length,0),16);
  for(const slug of Object.keys(expected)){
    const native=research.profiles[slug].recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc');
    assert.deepEqual(new Set(native.map(h=>h.boutId)),new Set(Object.keys(expected[slug].bouts)));
  }
});
