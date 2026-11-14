import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const load=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const registry=load('data/ufc-independent-full-career-verification.json');
const feeder=load('data/ufc-feeder-bout-evidence.json');
const approval=load('data/ufc-36-month-roster-approval.json');
const expected={
 'steven-koslow':{ids:['83814','61235'],results:['win','loss'],dwcs:[]},
 'steven-nguyen':{ids:['60827','39001'],results:['win','loss'],dwcs:['84121','88240','83881']},
 'theodor-berggren':{ids:['93263','82870'],results:['loss','loss'],dwcs:[]}
};
test('wave14 preserves six independent exact UFC bout source-to-native identities',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 let n=0;
 for(const [slug,ex] of Object.entries(expected)){
  assert.ok(approval.approvedFighters.includes(slug),slug);
  const p=registry.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true,slug);
  assert.equal(p.scope,'complete_official_ufc_career',slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(p.officialUfcCareerBoutCount,2,slug);
  assert.deepEqual(p.bouts.map(x=>x.nativeBoutId),ex.ids,slug);
  assert.deepEqual(p.bouts.map(x=>x.result),ex.results,slug);
  assert.equal(new Set(p.bouts.map(x=>x.nativeFighterId)).size,1,slug);
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,2,slug);
  assert.match(p.fighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]{16}$/i,slug);
  assert.match(p.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
  assert.match(p.sourceSnapshot?.fightResultsBlobSha||'',/^[a-f0-9]{40}$/i,slug);
  for(const x of p.bouts)assert.match(x.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i,slug);
  n+=p.bouts.length;
 }
 assert.equal(n,6);
});
test('Steven Nguyen retains all three distinct DWCS appearances outside UFC career',()=>{
 const p=registry.fighters['steven-nguyen'];
 const rows=feeder.bouts.filter(x=>x.fighterSlug==='steven-nguyen').map(x=>x.boutId);
 assert.deepEqual(rows.sort(),['84121','88240','83881'].sort());
 assert.equal(new Set(rows).size,3);
 for(const id of rows){
  const e=feeder.bouts.find(x=>x.fighterSlug==='steven-nguyen'&&x.boutId===id);
  assert.equal(e.sourceUrl,p.officialFighterUrl);
  assert.equal(e.event,"Dana White's Contender Series");
  assert.ok(!p.bouts.some(b=>b.nativeBoutId===id));
 }
});
test('dated official UFC outcomes override misleading summary tiles',()=>{
 assert.deepEqual(registry.fighters['steven-koslow'].bouts.map(x=>x.result),['win','loss']);
 assert.deepEqual(registry.fighters['steven-nguyen'].bouts.map(x=>x.result),['win','loss']);
 assert.deepEqual(registry.fighters['theodor-berggren'].bouts.map(x=>x.result),['loss','loss']);
});
