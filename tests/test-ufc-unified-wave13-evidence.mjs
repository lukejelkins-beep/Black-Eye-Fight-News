import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const proof=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const roster=read('data/ufc-36-month-roster-approval.json');
const expected={
 'roberto-romero':{ids:['60886','60388'],result:['loss','loss'],feed:[]},
 'saygid-izagakhmaev':{ids:['83100','60411'],result:['loss','loss'],feed:[]},
 'shanelle-dyer':{ids:['82994','60571'],result:['win','win'],feed:['83913']},
 'shem-rock':{ids:['60570','60416'],result:['loss','loss'],feed:[]}
};
test('wave13 retains four exact complete UFC careers with eight source-linked fights',()=>{
 assert.equal(roster.status,'approved');
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 let boutTotal=0;
 for(const [slug,e] of Object.entries(expected)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const r=proof.fighters[slug];
  assert.equal(r?.sourceCoverageAttested,true,slug);
  assert.equal(r.scope,'complete_official_ufc_career',slug);
  assert.equal(r.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(r.officialUfcCareerBoutCount,2,slug);
  assert.deepEqual(r.bouts.map(b=>b.nativeBoutId),e.ids,slug);
  assert.deepEqual(r.bouts.map(b=>b.result),e.result,slug);
  assert.equal(new Set(r.bouts.map(b=>b.nativeFighterId)).size,1,slug);
  assert.equal(new Set(r.bouts.map(b=>b.fightUrl)).size,2,slug);
  assert.match(r.fighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]{16}$/i,slug);
  assert.match(r.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
  assert.match(r.sourceSnapshot?.fightResultsBlobSha||'',/^[a-f0-9]{40}$/i,slug);
  for(const row of r.bouts)assert.match(row.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i,slug);
  for(const id of e.feed)assert.ok(!r.bouts.some(b=>b.nativeBoutId===id),slug+':'+id);
  boutTotal+=r.bouts.length;
 }
 assert.equal(boutTotal,8);
});
test('Shanelle Dyer 2025 DWCS loss stays excluded with its original native ID',()=>{
 const rows=feeder.bouts.filter(x=>x.fighterSlug==='shanelle-dyer');
 assert.equal(rows.length,1);
 assert.equal(rows[0].boutId,'83913');
 assert.equal(rows[0].opponent,'Carol Foro');
 assert.equal(rows[0].date,'2025-09-09');
 assert.equal(rows[0].event,"Dana White's Contender Series");
 assert.match(rows[0].sourceUrl,/^https:\/\/www\.ufc\.com\/news\//);
 assert.ok(!proof.fighters['shanelle-dyer'].bouts.some(b=>b.nativeBoutId==='83913'));
});
test('official documented outcomes override misleading UFC summary winner tiles',()=>{
 for(const [slug,e] of Object.entries(expected))
  assert.deepEqual(proof.fighters[slug].bouts.map(b=>b.result),e.result,slug);
});
