import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const targets={
  "kai-kamaka-iii": {
    "native": "549",
    "fighterUrl": "eee0ef3e2b14816b",
    "official": "https://www.ufc.com/athlete/kai-kamaka-iii",
    "urls": {
      "59381": "86deadaab9905a03",
      "60710": "a5a749aa0061fdb4",
      "61568": "d72f9b3ac742a9e3",
      "66328": "69397bbebdfa41d9",
      "66360": "4d56bcd82438e632",
      "66445": "930317fde9dbc55e",
      "93199": "e8710a6236db464e"
    },
    "outcomes": {
      "59381": "win",
      "60710": "win",
      "61568": "loss",
      "66328": "draw",
      "66360": "loss",
      "66445": "loss",
      "93199": "loss"
    }
  },
  "malcolm-gordon": {
    "native": "1080",
    "fighterUrl": "dee294e9717012c2",
    "official": "https://www.ufc.com/athlete/malcolm-gordon",
    "urls": {
      "59469": "49876b12d440af40",
      "59663": "6068385c48de6801",
      "59875": "ab105e5a56b5ee90",
      "61222": "1e8c33b1917fe1b7",
      "61633": "1765fc442ea03873",
      "65660": "b9b0da84b243213f",
      "66363": "8868957c1735bcf0"
    },
    "outcomes": {
      "59469": "win",
      "59663": "loss",
      "59875": "loss",
      "61222": "loss",
      "61633": "win",
      "65660": "loss",
      "66363": "loss"
    }
  }
};
const history=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&cache.bouts[h.boutId]?.org==='ufc'&&!/contender series/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,entry)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,entry,cache.bouts,approval.rosterAsOf).independentlyVerified;
test('wave67: both seven-bout official UFC careers are unique source/native identities with measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 for(const [slug,target] of Object.entries(targets)){
  assert.ok(approval.approvedFighters.includes(slug));
  const entry=proofs[slug],rows=history(slug);
  assert.ok(entry);
  assert.equal(entry.scope,'complete_official_ufc_career');
  assert.equal(entry.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(entry.sourceCoverageAttested,true);
  assert.equal(entry.officialFighterUrl,target.official);
  assert.equal(entry.fighterUrl,'https://ufcstats.com/fighter-details/'+target.fighterUrl);
  assert.equal(entry.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(entry.sourceSnapshot.evidenceCutoff,approval.rosterAsOf);
  assert.deepEqual(entry.verifiedNumericFighterIds,[target.native]);
  assert.equal(entry.officialUfcCareerBoutCount,7);
  assert.equal(entry.bouts.length,7);
  assert.equal(rows.length,7);
  assert.deepEqual(entry.bouts.map(x=>x.nativeBoutId).sort(),Object.keys(target.urls).sort());
  assert.deepEqual(rows.map(x=>String(x.boutId)).sort(),Object.keys(target.urls).sort());
  assert.equal(new Set(entry.bouts.map(x=>x.fightUrl)).size,7);
  assert.deepEqual(entry.sourceVerifiedExcludedFeederBouts,[]);
  for(const bout of entry.bouts){
   const b=cache.bouts[bout.nativeBoutId];
   assert.ok(b,'saved native bout must exist');
   assert.equal(b.org,'ufc');
   assert.equal(b.status,'completed');
   assert.ok(Number(cache.roundDone[bout.nativeBoutId])>0,'do not replace missing round statistics with zero');
   assert.equal(bout.fightUrl,'https://ufcstats.com/fight-details/'+target.urls[bout.nativeBoutId]);
   assert.equal(bout.nativeFighterId,target.native);
   assert.equal(bout.result,target.outcomes[bout.nativeBoutId]);
   const own=b.a?.id===target.native?b.a:b.b?.id===target.native?b.b:null;
   const other=own===b.a?b.b:b.a;
   assert.ok(own&&other);
   assert.equal(own.slug,slug);
   assert.equal(other.name.toLowerCase().replace(/[^a-z0-9]/g,''),bout.opponent.toLowerCase().replace(/[^a-z0-9]/g,''));
   const nativeOutcome=b.result?.method==='draw'&&!b.result?.winnerId?'draw':b.result.winnerId===own.id?'win':'loss';
   assert.equal(nativeOutcome,bout.result);
   assert.ok(Math.abs(Date.parse(bout.date+'T00:00:00Z')-Date.parse(b.eventDate+'T00:00:00Z'))<=86400000);
  }
  assert.equal(gate(slug,entry),true,'must pass exact Stage3 source/native/round gate');
 }
});
test('wave67: fail closed on omitted fight, invented ID, duplicated fight, wrong corner, inverted outcome',()=>{
 for(const [slug] of Object.entries(targets)){
  const entry=proofs[slug];
  assert.equal(gate(slug,{...entry,bouts:entry.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...entry,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...entry,bouts:[...entry.bouts,entry.bouts[0]]}),false);
  assert.equal(gate(slug,{...entry,bouts:entry.bouts.map((x,i)=>i?x:{...x,nativeFighterId:'999999'})}),false);
  assert.equal(gate(slug,{...entry,bouts:entry.bouts.map((x,i)=>i?x:{...x,result:x.result==='win'?'loss':'win'})}),false);
 }
});
test('wave67: the majority draw stays a draw and cannot be manufactured from a null winner',()=>{
 const entry=proofs['kai-kamaka-iii'];
 const draw=entry.bouts.find(x=>x.nativeBoutId==='66328');
 assert.equal(draw.result,'draw');
 assert.equal(cache.bouts['66328'].result.method,'draw');
 assert.equal(cache.bouts['66328'].result.winnerId,null);
 assert.equal(gate('kai-kamaka-iii',{...entry,bouts:entry.bouts.map(x=>x.nativeBoutId==='66328'?{...x,result:'loss'}:x)}),false);
});
