import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const registry=read('data/ufc-independent-full-career-verification.json');
const approval=read('data/ufc-36-month-roster-approval.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const expected={
 'otari-tanzilovi':{ids:['93201','82830'],outcomes:['win','loss'],excluded:['88275']},
 'rafael-tobias':{ids:['83426','60696'],outcomes:['loss','loss'],excluded:['88286']},
 'regina-tarin':{ids:['83218','60683'],outcomes:['win','win'],excluded:[]},
 'rj-harris':{ids:['93271','83024'],outcomes:['loss','win'],excluded:[]},
 'robert-ruchala':{ids:['60703','60476'],outcomes:['loss','loss'],excluded:[]}
};
test('wave12 independently sourced careers retain ten original UFC bout identities',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 let total=0;
 for(const [slug,ex] of Object.entries(expected)){
  assert.ok(approval.approvedFighters.includes(slug),slug);
  const p=registry.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true,slug);
  assert.equal(p?.scope,'complete_official_ufc_career',slug);
  assert.equal(p?.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(p?.officialUfcCareerBoutCount,2,slug);
  assert.equal(p?.bouts.length,2,slug);
  assert.deepEqual(p.bouts.map(x=>x.nativeBoutId),ex.ids,slug);
  assert.deepEqual(p.bouts.map(x=>x.result),ex.outcomes,slug);
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,2,slug);
  assert.equal(new Set(p.bouts.map(x=>x.nativeFighterId)).size,1,slug);
  assert.ok(p.sourceSnapshot?.fightResultsBlobSha?.match(/^[0-9a-f]{40}$/),slug);
  assert.ok(p.sourceSnapshot?.fighterDetailsBlobSha?.match(/^[0-9a-f]{40}$/),slug);
  assert.ok(p.officialFighterUrl.startsWith('https://www.ufc.com/athlete/'),slug);
  for(const bout of p.bouts)assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/i,slug);
  for(const id of ex.excluded)assert.ok(!p.bouts.some(b=>b.nativeBoutId===id),slug+':'+id);
  total+=p.bouts.length;
 }
 assert.equal(total,10);
});
test('two independently documented DWCS appearances remain feeder-only',()=>{
 for(const [slug,ex] of Object.entries(expected)){
  const actual=feeder.bouts.filter(x=>x.fighterSlug===slug).map(x=>x.boutId);
  assert.deepEqual(actual.sort(),ex.excluded.slice().sort(),slug);
  for(const id of ex.excluded){
   const row=feeder.bouts.find(x=>x.fighterSlug===slug&&x.boutId===id);
   assert.equal(row.sourceUrl,registry.fighters[slug].officialFighterUrl,slug);
   assert.equal(row.event,"Dana White's Contender Series",slug);
  }
 }
});
test('incorrect UFC summary winner badges do not override results or opposite corners',()=>{
 assert.deepEqual(registry.fighters['rj-harris'].bouts.map(x=>x.result),['loss','win']);
 assert.deepEqual(registry.fighters['rafael-tobias'].bouts.map(x=>x.result),['loss','loss']);
 assert.deepEqual(registry.fighters['robert-ruchala'].bouts.map(x=>x.result),['loss','loss']);
 assert.deepEqual(registry.fighters['otari-tanzilovi'].bouts.map(x=>x.result),['win','loss']);
});
