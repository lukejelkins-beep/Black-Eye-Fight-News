import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json'),data=read('data/ufc-independent-full-career-verification.json'),evidence=read('data/ufc-unified-wave16-official-source-review-20261114.json'),feeder=read('data/ufc-feeder-bout-evidence.json');
const cases={
 'yaroslav-amosov':{id:'14',b:[['60653','Neil Magny','win'],['66056','Joel Alvarez','win']]},
 'yuneisy-duben':{id:'98',b:[['60367','Carli Judice','loss'],['66016','Jeisla Chaves','loss']],excluded:'83888'},
 'alex-reyes':{id:'2681',b:[['58567','Mike Perry','loss'],['60051','Charlie Campbell','loss'],['65954','Tom Nolan','loss']]},
 'anshul-jubli':{id:'2782',b:[['59748','Jeka Saragih','win'],['60006','Mike Breeden','loss'],['60990','Quillan Salkilld','loss']]},
 'ante-delija':{id:'265',b:[['60478','Marcin Tybura','win'],['60419','Waldo Cortes Acosta','loss'],['60662','Serghei Spivac','loss']]},
 'bassil-hafez':{id:'2820',b:[['60116','Jack Della Maddalena','loss'],['60257','Mickey Gall','win'],['60391','Oban Elliott','loss']]}
};
test('frozen 783 cohort and full independently sourced UFC career exact native-fight IDs across six previously uncertified fighters',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(evidence.nonproduction,true);assert.equal(evidence.certificationGranted,false);assert.equal(evidence.rosterSize,783);
 assert.deepEqual(Object.keys(evidence.fighters),Object.keys(cases));
 let total=0;
 for(const [slug,x] of Object.entries(cases)){
   assert.ok(roster.approvedFighters.includes(slug),slug);
   const r=data.fighters[slug],s=evidence.fighters[slug];
   assert.ok(r&&r.sourceCoverageAttested===true,slug);
   assert.equal(r.scope,'complete_official_ufc_career',slug);
   assert.equal(r.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
   assert.equal(r.sourceSnapshot.sourceCommit,evidence.pinnedSource.sourceCommit,slug);
   assert.equal(r.officialFighterUrl,s.officialFighterUrl,slug);
   assert.equal(r.fighterUrl,s.pinnedGrecoFighterUrl,slug);
   assert.equal(r.officialUfcCareerBoutCount,x.b.length,slug);
   assert.deepEqual(r.verifiedNumericFighterIds,[x.id],slug);
   assert.deepEqual(r.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result]),x.b,slug);
   assert.equal(new Set(r.bouts.map(b=>b.nativeBoutId)).size,x.b.length,slug);
   for(const b of r.bouts){
     assert.equal(b.nativeFighterId,x.id,slug);
     assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/i,slug);
     assert.equal(s.bouts.filter(j=>j.date===b.date&&j.opponent===b.opponent&&j.result===b.result).length,1,slug);
   }
   total+=r.bouts.length;
 }
 assert.equal(total,16);
});
test('Yuneisy DWCS win excluded and UFC loss mirrors certified Jeisla opposing corner precisely',()=>{
 const y=data.fighters['yuneisy-duben'],j=data.fighters['jeisla-chaves'];
 const f=feeder.bouts.filter(z=>z.fighterSlug==='yuneisy-duben'&&z.boutId==='83888');
 assert.equal(f.length,1);assert.equal(f[0].date,'2024-09-03');assert.equal(f[0].opponent,'Shannon Clark');
 assert.equal(f[0].result,'win');assert.equal(f[0].sourceUrl,y.officialFighterUrl);
 assert.ok(!y.bouts.some(x=>x.nativeBoutId==='83888'));
 assert.deepEqual(y.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),['83888']);
 const loss=y.bouts.find(x=>x.nativeBoutId==='66016'),win=j.bouts.find(x=>x.nativeBoutId==='66016');
 assert.ok(loss&&win);assert.equal(loss.nativeFighterId,'98');assert.equal(win.nativeFighterId,'97');
 assert.equal(loss.result,'loss');assert.equal(win.result,'win');assert.equal(loss.fightUrl,win.fightUrl);
});
test('Road to UFC final included exactly once, prior qualifying semi excluded without invented ID',()=>{
 const a=data.fighters['anshul-jubli'];
 assert.equal(a.bouts.length,3);
 assert.equal(a.bouts[0].date,'2023-02-04');assert.equal(a.bouts[0].nativeBoutId,'59748');
 assert.equal(a.bouts[0].opponent,'Jeka Saragih');assert.equal(a.bouts[0].result,'win');
 assert.ok(!a.bouts.some(x=>x.opponent==='KyeongPyo Kim'));
 assert.match(a.sourceScopeVerified,/no fabricated feeder native ID/);
});
test('historical 2017 Alex Reyes debut preserved; official losses override summary Win tiles',()=>{
 const x=data.fighters['alex-reyes'];
 assert.equal(x.bouts[0].date,'2017-09-16');
 for(const slug of ['alex-reyes','yuneisy-duben'])assert.equal(data.fighters[slug].bouts.every(x=>x.result==='loss'),true,slug);
 assert.deepEqual(data.fighters['ante-delija'].bouts.map(x=>x.result),['win','loss','loss']);
 assert.deepEqual(data.fighters['bassil-hafez'].bouts.map(x=>x.result),['loss','win','loss']);
});
