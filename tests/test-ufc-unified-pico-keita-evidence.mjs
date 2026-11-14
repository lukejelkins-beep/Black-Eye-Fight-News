import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const register=read('data/ufc-independent-full-career-verification.json');
const native=read('data/ufcalendar-rich-progress.json');
const research=read('data/ufcalendar-fighter-research.json');
const review=read('data/ufc-unified-pico-keita-source-review-20261114.json');
const ids={'aaron-pico':'576','losene-keita':'529'};
const results={
 'aaron-pico':[['60497','Lerone Murphy','loss','9fa6a029f7f8241c'],['65990','Patricio Pitbull','win','10ab34056720b6b4'],['93414','Losene Keita','win','8271c52b2987e021']],
 'losene-keita':[['60566','Nathaniel Wood','loss','3b9f50f07d9a1601'],['83646','Muhammad Naimov','win','b90b099c1f47bb93'],['93414','Aaron Pico','loss','8271c52b2987e021']]
};
const norm=x=>String(x||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
test('exact approved cohort and complete independent three-fight source histories for Pico and Keita',()=>{
 assert.equal(roster.status,'approved'); assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(review.certificationGranted,false);assert.equal(review.nonproduction,true);
 assert.equal(review.officialFighterBoutLinks,6);
 for(const [slug,expected] of Object.entries(results)){
  assert.ok(roster.approvedFighters.includes(slug));
  const e=register.fighters[slug],p=research.profiles[slug],s=review.fighters[slug];
  assert.ok(e&&p&&s);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.officialUfcCareerBoutCount,3);
  assert.equal(e.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(e.fighterUrl,s.pinnedGrecoFighterUrl);assert.equal(e.officialFighterUrl,s.officialFighterUrl);
  assert.deepEqual(e.verifiedNumericFighterIds,[ids[slug]]);
  assert.equal(e.bouts.length,3);assert.equal(s.bouts.length,3);
  const saved=(p.recentHistory||[]).filter(x=>x.promotion==='ufc');
  assert.equal(saved.length,3,'native-cache UFC career is not exactly three bouts '+slug);
  assert.deepEqual(e.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result,b.fightUrl.slice(-16)]),expected);
  for(const [boutId,opponent,result,urlId] of expected){
   const row=e.bouts.find(b=>b.nativeBoutId===boutId);
   assert.equal(row.fightUrl,'https://ufcstats.com/fight-details/'+urlId);
   const h=saved.find(h=>String(h.boutId)===boutId);
   assert.ok(h);assert.equal(norm(h.opponent),norm(opponent));assert.equal(h.result,result);
   assert.ok(Math.abs(Date.parse(h.date)-Date.parse(row.date))<=86400000);
   const fight=native.bouts[boutId]; assert.ok(fight);
   assert.equal(fight.org,'ufc');assert.equal(fight.status,'completed');
   assert.ok(!/contender series|road to ufc|\\bdwcs\\b/i.test(fight.event));
   const own=[fight.a,fight.b].find(x=>x.slug===slug);
   const other=[fight.a,fight.b].find(x=>x.slug!==slug);
   assert.equal(String(own?.id),ids[slug]);assert.equal(norm(other?.name),norm(opponent));
   assert.equal(String(fight.result.winnerId)===ids[slug]?'win':'loss',result);
  }
 }
});
test('shared UFC 333 fight is one distinct native bout, opposite outcomes, no fictitious extra UFC fight',()=>{
 const pico=register.fighters['aaron-pico'],keita=register.fighters['losene-keita'];
 const a=pico.bouts.find(x=>x.nativeBoutId==='93414');
 const b=keita.bouts.find(x=>x.nativeBoutId==='93414');
 assert.equal(a.fightUrl,b.fightUrl);
 assert.equal(a.result,'win');assert.equal(b.result,'loss');
 assert.equal(native.bouts['93414'].a.id,'576');
 assert.equal(native.bouts['93414'].b.id,'529');
 assert.equal(String(native.bouts['93414'].result.winnerId),'576');
 assert.equal(new Set([...pico.bouts,...keita.bouts].map(x=>x.nativeBoutId)).size,5);
 assert.equal(pico.sourceVerifiedExcludedFeederBouts.length,0);
 assert.equal(keita.sourceVerifiedExcludedFeederBouts.length,0);
 assert.ok(!pico.bouts.some(x=>x.date>'2026-11-14'));
 assert.ok(!keita.bouts.some(x=>x.date>'2026-11-14'));
});
