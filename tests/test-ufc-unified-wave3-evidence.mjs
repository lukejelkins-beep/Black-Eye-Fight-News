import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approved=read('data/ufc-36-month-roster-approval.json');
const source=read('data/ufc-unified-wave3-official-source-review-20261114.json');
const register=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const normalized=x=>String(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const feederIds={'alberto-montes':'84029','andreas-gustafsson':'84109','angel-pacheco':'83949'};
test('eight wave3 source-attested careers preserve immutable approved cohort, exact native references and all 19 official fights',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.equal(new Set(approved.approvedFighters).size,783);
 assert.equal(source.nonproduction,true);
 assert.equal(source.certificationGranted,false);
 assert.equal(Object.keys(source.fighters).length,8);
 let bouts=0;
 for(const [slug,verified] of Object.entries(source.fighters)){
  assert.ok(approved.approvedFighters.includes(slug));
  const proof=register.fighters[slug];
  assert.equal(proof.sourceCoverageAttested,true,slug);
  assert.equal(proof.scope,'complete_official_ufc_career',slug);
  assert.equal(proof.officialUfcCareerBoutCount,verified.officialUfcCareerCount,slug);
  assert.equal(proof.bouts.length,verified.bouts.length,slug);
  assert.equal(new Set(proof.bouts.map(x=>x.nativeBoutId)).size,proof.bouts.length,slug);
  assert.deepEqual(new Set(proof.bouts.map(x=>x.nativeFighterId)),new Set(proof.verifiedNumericFighterIds),slug);
  assert.equal(proof.fighterUrl,verified.pinnedGrecoFighterUrl,slug);
  assert.equal(proof.officialFighterUrl,verified.officialAthleteUrl,slug);
  assert.ok(proof.sourceResearchRunUrl.includes('/43571182442'),slug);
  for(const x of verified.bouts){
   const rows=proof.bouts.filter(r=>r.date===x.date&&r.result===x.result&&
    (normalized(r.opponent)===normalized(x.opponent)||
     slug==='alice-pereira'&&x.date==='2025-09-13'&&r.opponent==='Montse Rendon'&&x.opponent==='Montserrat Rendon'));
   assert.equal(rows.length,1,slug+':'+x.date);
   assert.match(rows[0].fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.match(rows[0].nativeBoutId,/^[1-9][0-9]*$/);
  }
  if(feederIds[slug]){
    const excludes=feeder.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===feederIds[slug]);
    assert.equal(excludes.length,1,slug);
    assert.ok(excludes[0].sourceUrl.startsWith('https://www.ufc.com/'));
    assert.equal(proof.bouts.some(x=>x.nativeBoutId===feederIds[slug]),false,slug);
  }
  bouts+=proof.bouts.length;
 }
 assert.equal(bouts,19);
});
test('Alice Pereira opponent name variation requires pinned primary-source disambiguation, not fuzzy matching',()=>{
 const x=register.fighters['alice-pereira'].sourceVerifiedOfficialOpponentNameAlias;
 assert.equal(x.officialFullName,'Montserrat Rendon');
 assert.equal(x.ufcShortName,'Montse Rendon');
 assert.equal(x.appliesOnlyToNativeBoutId,'38233');
 assert.equal(x.officialUfcNameEvidence,'https://www.ufc.com/athlete/montserrat-rendon');
});
