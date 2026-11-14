import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const a=read('data/ufc-36-month-roster-approval.json'),r=read('data/ufc-independent-full-career-verification.json'),s=read('data/ufc-unified-wave12-official-source-review-20261114.json'),f=read('data/ufc-feeder-bout-evidence.json');
const expected={
 'pedro-falcao':{id:'2846',b:[['61257','Victor Hugo','loss'],['60305','Victor Henry','loss']],feeder:'83903'},
 'roberto-romero':{id:'2859',b:[['60388','David Onama','loss'],['60886','Timmy Cuamba','loss']]},
 'rodrigo-sezinando':{id:'142',b:[['38234','Daniil Donchenko','loss'],['93263','Theodor Berggren','win']]},
 'saygid-izagakhmaev':{id:'376',b:[['60411','Nicolas Dalby','loss'],['83100','Abubakar Vagaev','loss']]},
 'shanelle-dyer':{id:'512',b:[['60571','Ravena Oliveira','win'],['82994','Elise Reed','win']],feeder:'83913'},
 'shem-rock':{id:'369',b:[['60416','Nurullo Aliev','loss'],['60570','Abdul-Kareem Al-Selwady','loss']]}
};
test('six independent complete UFC careers are evidence-attested for unchanged 783-person roster',()=>{
 assert.equal(a.status,'approved');assert.equal(a.approvedFighters.length,783);assert.equal(new Set(a.approvedFighters).size,783);
 assert.equal(s.nonproduction,true);assert.equal(s.certificationGranted,false);assert.equal(s.rosterSize,783);
 assert.deepEqual(Object.keys(s.fighters),Object.keys(expected));
 for(const [slug,x] of Object.entries(expected)){
  assert.ok(a.approvedFighters.includes(slug));const p=r.fighters[slug],o=s.fighters[slug];
  assert.equal(p.sourceCoverageAttested,true,slug);assert.equal(p.scope,'complete_official_ufc_career',slug);
  assert.equal(p.sourceSnapshot.sourceCommit,s.pinnedSource.sourceCommit,slug);
  assert.equal(p.fighterUrl,o.pinnedGrecoFighterUrl,slug);assert.equal(p.officialFighterUrl,o.officialFighterUrl,slug);
  assert.deepEqual(p.verifiedNumericFighterIds,[x.id],slug);assert.equal(p.officialUfcCareerBoutCount,2,slug);
  assert.equal(p.bouts.length,2,slug);assert.deepEqual(p.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result]),x.b,slug);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,2,slug);
  for(const bout of p.bouts){assert.equal(bout.nativeFighterId,x.id,slug);assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i,slug);assert.equal(o.bouts.filter(z=>z.date===bout.date&&z.opponent===bout.opponent&&z.result===bout.result).length,1,slug);}
 }
});
test('exact source-identified DWCS bouts excluded, original native history untouched',()=>{
 for(const [slug,x] of Object.entries(expected)){
  if(!x.feeder)continue;
  const z=f.bouts.filter(y=>y.fighterSlug===slug&&y.boutId===x.feeder);
  assert.equal(z.length,1,slug);assert.match(z[0].sourceUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
  assert.ok(!r.fighters[slug].bouts.some(b=>b.nativeBoutId===x.feeder),slug);
  assert.deepEqual(r.fighters[slug].sourceVerifiedExcludedFeederBouts.map(b=>b.nativeBoutId),[x.feeder],slug);
 }
});
test('dated official outcomes supersede misleading graphical Win badges and TUF final is counted',()=>{
 for(const slug of ['pedro-falcao','roberto-romero','saygid-izagakhmaev','shem-rock'])assert.equal(r.fighters[slug].bouts.every(b=>b.result==='loss'),true,slug);
 assert.equal(r.fighters['shanelle-dyer'].bouts.every(b=>b.result==='win'),true);
 const rodrigo=r.fighters['rodrigo-sezinando'];
 assert.deepEqual(rodrigo.bouts.map(x=>x.result),['loss','win']);assert.equal(rodrigo.bouts[0].date,'2025-09-13');
 assert.match(rodrigo.sourceScopeVerified,/The Ultimate Fighter final/);
});
