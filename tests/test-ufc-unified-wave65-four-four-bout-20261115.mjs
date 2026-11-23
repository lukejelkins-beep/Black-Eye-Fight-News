import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const registry=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const targets={
  "cam-rowston": {
    "numericId": "215",
    "sourceFighterId": "8ebc3a8da015d70c",
    "ids": {
      "38215": "93a0a19c2c1cfe66",
      "65853": "47362cae6ba0e077",
      "66069": "46181797eb543a0b",
      "83735": "69aec85e917d47e6"
    }
  },
  "kevin-vallejos": {
    "numericId": "347",
    "sourceFighterId": "239d8e5359022f3b",
    "ids": {
      "60360": "36db86c39ed09997",
      "60648": "24bb03f0a3415fbe",
      "60711": "f594fc5c2bc6237e",
      "60757": "111e66eb922449e4"
    }
  },
  "marco-tulio": {
    "numericId": "20",
    "sourceFighterId": "9384e71bca6c409d",
    "ids": {
      "60348": "8d68863242695224",
      "60977": "b87d6f71d901355b",
      "65903": "ac4343150638b635",
      "66059": "9d35723a53749931"
    }
  },
  "nicolle-caliari": {
    "numericId": "50",
    "sourceFighterId": "fc0a4053eb8a3a59",
    "ids": {
      "60351": "b33e3a6d15700bb1",
      "60816": "a602c68147b752b2",
      "66126": "39417b7d07c2fd83",
      "93510": "4081a5fe66569321"
    }
  }
};
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
function hist(slug){return profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&cache.bouts[h.boutId]?.org==='ufc'&&!/contender series/i.test(cache.bouts[h.boutId]?.event||''));}
function gate(slug,e){return evaluateCareerEvidence(profiles[slug],hist(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,e,cache.bouts,approval.rosterAsOf).independentlyVerified;}
test('wave65 four UFC careers preserve 16 exact pinned fighter/fight IDs, both original corners, outcomes and measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 const fightURLs=[];
 for(const [slug,target] of Object.entries(targets)){
  assert.ok(approval.approvedFighters.includes(slug));
  const e=registry[slug],history=hist(slug);
  assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(e.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+target.sourceFighterId);
  assert.deepEqual(e.verifiedNumericFighterIds,[target.numericId]);
  assert.equal(e.officialUfcCareerBoutCount,4);
  assert.equal(e.bouts.length,4);assert.equal(history.length,4);
  assert.deepEqual(e.bouts.map(x=>x.nativeBoutId).sort(),Object.keys(target.ids).sort());
  for(const proof of e.bouts){
   const b=cache.bouts[proof.nativeBoutId],own=b?.a?.id===target.numericId?b.a:b?.b?.id===target.numericId?b.b:null,other=own===b?.a?b?.b:b?.a;
   assert.ok(b&&own&&other);assert.equal(b.org,'ufc');assert.equal(b.status,'completed');
   assert.equal(proof.nativeFighterId,target.numericId);assert.equal(own.slug,slug);
   assert.equal(norm(proof.opponent),norm(other.name));
   assert.equal(proof.fightUrl,'https://ufcstats.com/fight-details/'+target.ids[proof.nativeBoutId]);
   assert.ok(Number(cache.roundDone[proof.nativeBoutId])>0);
   const expectedUtcShift=new Set(['38215','60757','65903','60816']);
   const actualShift=(Date.parse(b.eventDate+'T00:00:00Z')-Date.parse(proof.date+'T00:00:00Z'))/86400000;
   assert.equal(actualShift,expectedUtcShift.has(proof.nativeBoutId)?1:0,'expected exact source/native UTC-to-local date shift for '+proof.nativeBoutId);
   assert.equal(proof.result,b.result.winnerId===own.id?'win':'loss');
   assert.ok(history.some(h=>h.boutId===proof.nativeBoutId&&h.date===proof.date&&h.result===proof.result));
   fightURLs.push(proof.fightUrl);
  }
  assert.equal(gate(slug,e),true,'strict career proof failed for '+slug);
 }
 assert.equal(fightURLs.length,16);assert.equal(new Set(fightURLs).size,16);
});
test('wave65 any missing, duplicated, inverted or wrong-corner UFC evidence fails closed',()=>{
 for(const slug of Object.keys(targets)){
  const e=registry[slug];
  assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...e,bouts:[...e.bouts,e.bouts[0]]}),false);
  assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
