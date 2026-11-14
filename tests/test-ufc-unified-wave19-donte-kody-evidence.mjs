import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json'),reg=read('data/ufc-independent-full-career-verification.json'),source=read('data/ufc-unified-wave19-official-source-review-20261114.json'),feed=read('data/ufc-feeder-bout-evidence.json');
const cases={
 'donte-johnson':{fighterId:'418',bouts:[['60426','Sedriques Dumas','win'],['60692','Cody Brundage','win'],['83279','Eric McConico','win']],excluded:'84061'},
 'kody-steele':{fighterId:'548',bouts:[['60988','Rongzhu','loss'],['66075','Dom Mar Fan','win'],['93509','Noah Gugnon','win']],excluded:'84053'}
};
test('unchanged 783-person cohort and six original complete UFC bouts independently source-attested',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(source.nonproduction,true);assert.equal(source.certificationGranted,false);assert.deepEqual(Object.keys(source.fighters),Object.keys(cases));
 for(const [slug,x] of Object.entries(cases)){
  assert.ok(roster.approvedFighters.includes(slug));const a=reg.fighters[slug],s=source.fighters[slug];
  assert.ok(a&&a.sourceCoverageAttested===true,slug);assert.equal(a.scope,'complete_official_ufc_career',slug);
  assert.equal(a.fighterUrl,s.pinnedGrecoFighterUrl,slug);assert.equal(a.officialFighterUrl,s.officialFighterUrl,slug);
  assert.equal(a.officialUfcCareerBoutCount,3,slug);assert.equal(a.bouts.length,3,slug);
  assert.deepEqual(a.verifiedNumericFighterIds,[x.fighterId],slug);
  assert.deepEqual(a.bouts.map(z=>[z.nativeBoutId,z.opponent,z.result]),x.bouts,slug);
  assert.equal(new Set(a.bouts.map(z=>z.nativeBoutId)).size,3,slug);
  assert.equal(a.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da',slug);
  for(const b of a.bouts){assert.equal(b.nativeFighterId,x.fighterId,slug);assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);}
 }
});
test('Donte and Kody each have one and only one source-attested saved DWCS non-UFC bout excluded',()=>{
 for(const [slug,x] of Object.entries(cases)){
  const a=reg.fighters[slug];const f=feed.bouts.filter(z=>z.fighterSlug===slug);
  assert.deepEqual(f.map(z=>z.boutId),[x.excluded],slug);
  assert.equal(f[0].sourceUrl,a.officialFighterUrl,slug);
  assert.ok(!a.bouts.some(z=>z.nativeBoutId===x.excluded),slug);
  assert.deepEqual(a.sourceVerifiedExcludedFeederBouts.map(z=>z.nativeBoutId),[x.excluded]);
 }
});
test('official scorecards control contradictory narrative/UI results without inventing upcoming 14 Nov fight',()=>{
 const d=reg.fighters['donte-johnson'];
 assert.deepEqual(d.bouts.map(z=>z.result),['win','win','win']);
 assert.ok(!d.bouts.some(z=>z.date==='2026-11-14'));
 assert.match(d.sourceScopeVerified,/split decision/);
 assert.ok(d.independentSourceCrosschecks.includes('https://www.ufc.com/news/ufc-326-official-scorecards-holloway-vs-oliveira-2'));
 const k=reg.fighters['kody-steele'];
 assert.deepEqual(k.bouts.map(z=>z.result),['loss','win','win']);
 assert.equal(k.bouts[0].date,'2025-02-08');
 assert.equal(k.bouts[0].opponent,'Rongzhu');
 assert.match(k.sourceScopeVerified,/30-27 unanimous decision/);
 assert.ok(k.independentSourceCrosschecks.includes('https://www.ufc.com/news/official-judges-scorecards-ufc-312-du-plessis-vs-strickland-2-sydney'));
});
