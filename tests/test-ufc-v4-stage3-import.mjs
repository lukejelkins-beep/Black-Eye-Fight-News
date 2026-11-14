import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const evidence=read('data/ufc-independent-full-career-verification.json');
const manifest=read('data/ufc-stage3-v4-consolidation-manifest-20261114.json');
const fnv32=s=>{
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0');
};

test('keep frozen, uniquely approved 783-fighter roster; do not silently add a name',()=>{
  assert.equal(roster.status,'approved');
  assert.equal(roster.rosterAsOf,'2026-11-14');
  assert.equal(roster.approvedFighters.length,783);
  assert.equal(new Set(roster.approvedFighters).size,783);
  assert.equal(evidence.scope,'ufc-independent-full-career-verification');
  assert.equal(evidence.rosterAsOf,roster.rosterAsOf);
  assert.equal(manifest.rosterAsOf,roster.rosterAsOf);
  assert.equal(manifest.productionReleaseAuthorized,false);
  const known=new Set(roster.approvedFighters);
  assert.ok(Object.keys(evidence.fighters).every(slug=>known.has(slug)));
});

test('reconcile 66 original and 147 V4 records into 153 distinct nonduplicated fighter proofs',()=>{
  const fromMain=Object.keys(manifest.originalMainFighterFingerprintsFnv32);
  const imported=manifest.importedV4OnlySlugs;
  const shared=manifest.existingMainOverlapSlugs;
  const mainOnly=manifest.existingMainOnlySlugs;
  assert.equal(fromMain.length,66);
  assert.equal(imported.length,87);
  assert.equal(shared.length,60);
  assert.equal(mainOnly.length,6);
  assert.ok(Object.keys(evidence.fighters).length>=153,'later valid fighter evidence must be allowed');
  assert.equal(manifest.after.canonicalStage3EvidenceEntries,153);
  assert.equal(manifest.before.v4EvidenceEntries,147);
  assert.equal(new Set([...fromMain,...imported]).size,153);
  assert.ok(imported.every(slug=>!fromMain.includes(slug)));
  assert.ok([...imported,...fromMain].every(slug=>Boolean(evidence.fighters[slug])));
  assert.equal(new Set([...shared,...mainOnly]).size,66);
  assert.equal(manifest.priorV4StrictPass.certifiedOnThenCurrentV4,147);
  assert.equal(manifest.priorV4StrictPass.remaining,636);
  assert.match(manifest.certificationStandard,/not new certification/i);
});

test('all preexisting 66 main Stage3 source proofs remain byte-equivalent in JSON serialization',()=>{
  for(const [slug,hash] of Object.entries(manifest.originalMainFighterFingerprintsFnv32)){
    if(process.env.GITHUB_HEAD_REF==='research/ufc-unified-stage3-v4-evidence-20261114')
      assert.equal(fnv32(JSON.stringify(evidence.fighters[slug])),hash,slug+' original Stage3 proof changed during import PR');
    assert.equal(evidence.fighters[slug].importedV4Evidence,undefined,slug+' unexpected V4 overwrite');
  }
  for(const slug of manifest.existingMainOnlySlugs) assert.ok(evidence.fighters[slug]);
});

test('each of the 87 V4-only source proofs is individually cross-gated; no silent certification',()=>{
  const all=manifest.importedV4OnlySlugs;
  const greco=manifest.sourceGrecoCommit;
  for(const slug of all){
    const item=evidence.fighters[slug];
    assert.equal(item.sourceCoverageAttested,true,slug);
    assert.equal(item.scope,'complete_official_ufc_career',slug);
    assert.equal(item.verifiedAt,'2026-11-14',slug);
    assert.equal(item.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
    assert.match(item.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
    assert.match(item.fighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]{16}$/i,slug);
    assert.equal(item.sourceSnapshot.sourceCommit,greco,slug);
    assert.match(item.sourceSnapshot.fightResultsBlobSha,/^[a-f0-9]{40}$/i,slug);
    assert.match(item.sourceSnapshot.fighterDetailsBlobSha,/^[a-f0-9]{40}$/i,slug);
    assert.ok(['requires_independent_main_stage3_gate','passed_independent_main_stage3_gate'].includes(item.importedV4Evidence.status),slug);
    assert.equal(item.importedV4Evidence.originalSourceSha,manifest.originalV4EvidenceBlobSha,slug);
    assert.equal(item.bouts.length,item.officialUfcCareerBoutCount,slug);
    assert.ok(item.bouts.length>0,slug);
    const ids=new Set(),urls=new Set();
    for(const fight of item.bouts){
      assert.match(fight.nativeBoutId,/^[1-9]\d*$/,slug);
      assert.equal(fight.nativeFighterId,item.verifiedNumericFighterIds[0],slug);
      assert.match(fight.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i,slug);
      assert.match(fight.date,/^\d{4}-\d{2}-\d{2}$/,slug);
      assert.ok(fight.opponent&&fight.result,slug);
      assert.ok(!ids.has(fight.nativeBoutId),slug+' duplicate native ID');
      assert.ok(!urls.has(fight.fightUrl),slug+' duplicate source URL');
      ids.add(fight.nativeBoutId);urls.add(fight.fightUrl);
    }
  }
});

test('source consolidation does not create a second paid collector or public release',()=>{
  const w=readFileSync(new URL('../.github/workflows/audit-ufc-research-pipeline.yml',import.meta.url),'utf8');
  assert.match(w,/node scripts\/ufc-36-month-stage3-progress\.mjs/);
  assert.match(w,/node scripts\/ufc-v4-certification-queue\.mjs/);
  assert.match(w,/node --test tests\/test-ufc-v4-stage3-import\.mjs/);
  assert.equal(manifest.mainRegistryIsCanonical,true);
  assert.equal(manifest.productionReleaseAuthorized,false);
});
