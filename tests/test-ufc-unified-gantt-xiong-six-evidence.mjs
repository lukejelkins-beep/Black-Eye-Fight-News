import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const a=read('data/ufc-36-month-roster-approval.json'),r=read('data/ufc-independent-full-career-verification.json'),s=read('data/ufc-unified-next6-gantt-xiong-official-source-review-20261114.json'),f=read('data/ufc-feeder-bout-evidence.json');
const e={
 'thomas-gantt':{id:'40',b:[['66131','Artur Minev','win'],['92964','Drakkar Klose','win']],feed:['88279']},
 'torrez-finney':{id:'320',b:[['60301','Robert Valentin','win'],['65854','Jacob Malkoun','loss']],feed:['84031','84112','84100']},
 'ty-miller':{id:'307',b:[['60646','Adam Fugitt','win'],['83256','Billy Ray Goff','win']],feed:['84073']},
 'tyrell-fortune':{id:'516',b:[['60631','Marcin Tybura','win'],['82600','Rizvan Kuniev','loss']],feed:[]},
 'uran-satybaldiev':{id:'143',b:[['60306','Martin Buday','loss'],['65922','Diyar Nurgozhay','win']],feed:[]},
 'xiong-jing-nan':{id:'4680',b:[['66112','Angela Hill','loss'],['83411','Julia Polastri','loss']],feed:[]}
};
test('unchanged 783 approved fighters, six complete 2-bout full Octagon career proofs with exact native IDs',()=>{
 assert.equal(a.status,'approved');assert.equal(a.approvedFighters.length,783);assert.equal(new Set(a.approvedFighters).size,783);
 assert.equal(s.nonproduction,true);assert.equal(s.certificationGranted,false);assert.deepEqual(Object.keys(s.fighters),Object.keys(e));
 for(const [slug,x] of Object.entries(e)){
  assert.ok(a.approvedFighters.includes(slug));const p=r.fighters[slug];
  assert.ok(p&&p.sourceCoverageAttested===true,slug);assert.equal(p.scope,'complete_official_ufc_career',slug);
  assert.equal(p.officialUfcCareerBoutCount,2,slug);assert.equal(p.bouts.length,2,slug);
  assert.deepEqual(p.verifiedNumericFighterIds,[x.id],slug);
  assert.deepEqual(p.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result]),x.b,slug);
  assert.equal(p.sourceSnapshot.sourceCommit,s.pinnedSource.sourceCommit,slug);
  assert.equal(p.officialFighterUrl,s.fighters[slug].officialFighterUrl,slug);
  for(const z of p.bouts){assert.equal(z.nativeFighterId,x.id,slug);assert.match(z.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/,slug);}
 }
});
test('five independently sourced DWCS appearances are preserved but not counted as official UFC career',()=>{
 for(const [slug,x] of Object.entries(e)){
  const p=r.fighters[slug];const actual=f.bouts.filter(b=>b.fighterSlug===slug);
  assert.deepEqual(actual.map(b=>b.boutId).sort(),x.feed.slice().sort(),slug);
  for(const id of x.feed){
   const rows=actual.filter(y=>y.boutId===id);assert.equal(rows.length,1);
   assert.equal(rows[0].sourceUrl,p.officialFighterUrl);
   assert.ok(!p.bouts.some(y=>y.nativeBoutId===id));
  }
  if(x.feed.length)assert.deepEqual(p.sourceVerifiedExcludedFeederBouts.map(z=>z.nativeBoutId).sort(),x.feed.slice().sort());
 }
});
test('Thomas/Tommy Gantt official source alias is exact and independently identity-pinned',()=>{
 const x=r.fighters['thomas-gantt'];
 assert.equal(x.fighterName,'Tommy Gantt');assert.deepEqual(x.sourceVerifiedNativeNameAliases,['Thomas Gantt']);
 assert.equal(x.disambiguation.verifiedUfcStatsFighterId,'de83f920fd302871');
 assert.equal(x.officialFighterUrl,'https://www.ufc.com/athlete/thomas-gantt');
});
test('Xiong Jingnan native name spacing, winners and upcoming Uran bout remain correct',()=>{
 const x=r.fighters['xiong-jing-nan'];
 assert.deepEqual(x.bouts.map(y=>y.result),['loss','loss']);
 assert.deepEqual(x.verifiedNumericFighterIds,['4680']);
 assert.equal(r.fighters['uran-satybaldiev'].bouts.every(y=>y.date<'2026-11-14'),true);
 assert.ok(!r.fighters['uran-satybaldiev'].bouts.some(y=>y.date==='2026-12-05'));
});
