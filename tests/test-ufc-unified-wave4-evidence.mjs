import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const verified=read('data/ufc-independent-full-career-verification.json');
const evidence=read('data/ufc-unified-wave4-official-source-review-20261114.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const normalize=x=>String(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const feederIds={'louis-jourdain':'88288','luis-pajuelo':'83831','luke-fernandez':'88296','magomed-zaynukov':'88292','michael-oliveira':'84106','nick-galanti':'83629'};
test('wave4 eight complete official UFC careers are source-attested with exact fight identity and no recycled debut DWCS bouts',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(evidence.certificationGranted,false);
 assert.equal(evidence.nonproduction,true);
 assert.equal(Object.keys(evidence.fighters).length,8);
 for(const [slug,source] of Object.entries(evidence.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));
  const proof=verified.fighters[slug];
  assert.ok(proof?.sourceCoverageAttested);
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.officialUfcCareerBoutCount,1);
  assert.equal(proof.bouts.length,1);
  assert.equal(proof.fighterUrl,source.pinnedGrecoFighterUrl);
  assert.equal(proof.officialFighterUrl,source.ufcOfficialAthleteUrl);
  assert.equal(proof.verifiedNumericFighterIds.length,1);
  assert.equal(proof.bouts[0].nativeFighterId,proof.verifiedNumericFighterIds[0]);
  const bout=proof.bouts[0],expected=source.bouts[0];
  assert.equal(bout.date,expected.date);
  assert.equal(bout.result,expected.result);
  assert.equal(normalize(bout.opponent),normalize(expected.opponent));
  assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
  assert.match(bout.nativeBoutId,/^[1-9][0-9]*$/);
  assert.ok(proof.independentSourceCrosschecks.includes(source.officialResultSourceUrl));
  if(feederIds[slug]){
   assert.equal(feeder.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===feederIds[slug]).length,1);
   assert.notEqual(bout.nativeBoutId,feederIds[slug]);
  }
 }
});
test('source result outweighs misleading athlete win tile and Tina Black has exact single-bout native alias',()=>{
 for(const slug of ['louis-jourdain','luis-pajuelo','luke-fernandez','melissa-amaya','sebastian-szalay'])
   assert.equal(verified.fighters[slug].bouts[0].result,'loss',slug);
 const t=verified.fighters['melissa-amaya'];
 assert.deepEqual(t.bouts[0].sourceVerifiedNativeOpponentAliases,['Valesca Machado']);
 assert.deepEqual(t.bouts[0].verifiedOpponentNativeFighterIds,['13140']);
 assert.equal(t.sourceVerifiedOfficialOpponentNameAlias.onlyBout,'85938');
 assert.equal(t.sourceVerifiedOfficialOpponentNameAlias.officialSourceUrl,'https://www.ufc.com/athlete/valesca-machado');
 const n=verified.fighters['nick-galanti'];
 assert.equal(n.pinnedSourceName,'Nicholas Galanti');
 assert.equal(n.sourceVerifiedNameMapping.officialName,'Nick Galanti');
 assert.equal(n.sourceVerifiedNameMapping.exactSavedNumericFighterId,'28875');
});
