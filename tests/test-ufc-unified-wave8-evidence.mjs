import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approved=read('data/ufc-36-month-roster-approval.json');
const source=read('data/ufc-unified-wave8-official-source-review-20261114.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const feeders=read('data/ufc-feeder-bout-evidence.json');
const pinned='c742842f29466758fedc3906dbad28d6d320a8da';
const six=['gable-steveson','gianni-vazquez','harry-hardwick','imanol-rodriguez','javier-reyes','jeisla-chaves'];
const expectedFeederIds={'imanol-rodriguez':'88294','javier-reyes':'88285','jeisla-chaves':'88284'};
const norm=x=>String(x||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

test('immutable 783-person roster and separate source-only review retained',()=>{
  assert.equal(approved.approvedFighters.length,783);
  assert.equal(new Set(approved.approvedFighters).size,783);
  assert.equal(source.nonproduction,true);
  assert.equal(source.certificationGranted,false);
  assert.equal(Object.keys(source.fighters).length,7);
});

test('six fighters retain exact independently pinned native UFC career identities',()=>{
  const globalIds=new Set();
  for(const slug of six){
    assert.ok(approved.approvedFighters.includes(slug));
    const src=source.fighters[slug],e=registry.fighters[slug];
    assert.ok(src&&e,slug);
    assert.equal(e.sourceCoverageAttested,true,slug);
    assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
    assert.equal(e.sourceSnapshot.sourceCommit,pinned,slug);
    assert.equal(e.fighterUrl,src.pinnedGrecoFighterUrl,slug);
    assert.equal(e.officialFighterUrl,src.officialFighterUrl,slug);
    assert.equal(e.officialUfcCareerBoutCount,src.officialUfcCareerCount,slug);
    assert.equal(e.bouts.length,2,slug);
    assert.equal(new Set(e.bouts.map(x=>String(x.nativeBoutId))).size,2,slug);
    assert.equal(new Set(e.verifiedNumericFighterIds).size,1,slug);
    for(const bout of e.bouts){
      const native=String(bout.nativeBoutId);
      assert.match(native,/^[1-9][0-9]+$/,slug);
      assert.ok(!globalIds.has(native),slug+' duplicate native bout '+native);
      globalIds.add(native);
      assert.equal(String(bout.nativeFighterId),e.verifiedNumericFighterIds[0],slug);
      assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/,slug);
      const official=src.bouts.filter(x=>x.date===bout.date&&norm(x.opponent)===norm(bout.opponent)&&x.result===bout.result);
      assert.equal(official.length,1,slug+' missing exact official bout '+native);
    }
  }
  assert.equal(globalIds.size,12);
});

test('three specific cached DWCS appearances remain source excluded',()=>{
  for(const [slug,boutId] of Object.entries(expectedFeederIds)){
    const row=feeders.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===boutId);
    assert.equal(row.length,1,slug);
    assert.match(row[0].sourceUrl,/^https:\/\/www\.ufc\.com\/athlete\//,slug);
    assert.ok(!registry.fighters[slug].bouts.some(x=>String(x.nativeBoutId)===boutId),slug);
  }
});

test('Jonny Parsons stays uncertified until source-proven opponent alias resolves',()=>{
  assert.equal(registry.fighters['jonny-parsons']?.sourceCoverageAttested===true,false);
  assert.equal(source.fighters['jonny-parsons'].officialUfcCareerCount,2);
});
