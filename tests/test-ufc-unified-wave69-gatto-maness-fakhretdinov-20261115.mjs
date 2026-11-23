import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const census=read('ufc-36-month-candidates.json');
const approval=read('ufc-36-month-roster-approval.json');
const targets={
  "melissa-gatto": {
    "id": "582",
    "fighterUrl": "a4a80dd7336ffd59",
    "official": "https://www.ufc.com/athlete/melissa-gatto",
    "last": "2026-10-10",
    "w": 3,
    "l": 3,
    "d": 1,
    "urls": {
      "59459": "cce232c1b1b2e4a0",
      "60144": "ea29714dcfb07ce2",
      "60709": "caf13346cbcfdb03",
      "61022": "3aea9c60d25fc93b",
      "61351": "dd552b389152636a",
      "61604": "60d9d50b763adc62",
      "93273": "e556bdf83f767d4b"
    }
  },
  "nate-maness": {
    "id": "719",
    "fighterUrl": "6e9f40c706f91f32",
    "official": "https://www.ufc.com/athlete/nate-maness",
    "last": "2024-06-15",
    "w": 5,
    "l": 2,
    "d": 0,
    "urls": {
      "59399": "6ba9f6a7a9361354",
      "59575": "28bd070f7ab0a0b9",
      "59807": "3adecfc4727a8d73",
      "60027": "eb7b0a6f06dbdb4f",
      "61060": "6f31285305881fe3",
      "61907": "576b795e33ddd62d",
      "66364": "e64d80dcc6853ea0"
    }
  },
  "rinat-fakhretdinov": {
    "id": "244",
    "fighterUrl": "8f765fd5775a8873",
    "official": "https://www.ufc.com/athlete/rinat-fakhretdinov",
    "last": "2025-09-06",
    "w": 6,
    "l": 0,
    "d": 1,
    "urls": {
      "38813": "de1acb6803ab3f14",
      "59992": "b5ea6535748edbce",
      "60147": "962e74250884e4c1",
      "60190": "6114076c689e8457",
      "60482": "d56a59a4c79cf515",
      "61293": "8f00da6ea8186ce2",
      "61478": "a09447d185a62251"
    }
  }
};
const history=s=>profiles[s].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&cache.bouts[h.boutId]?.org==='ufc');
const gate=(s,p)=>evaluateCareerEvidence(profiles[s],history(s),census.fighters.find(x=>x.slug===s)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts,approval.rosterAsOf).independentlyVerified;
test('wave69 three exhaustive seven-bout official UFC careers with pinned paired native evidence and all measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 for(const [slug,t] of Object.entries(targets)){
  assert.ok(approval.approvedFighters.includes(slug));
  const p=proofs[slug],h=history(slug);
  assert.ok(p);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.evidenceCutoff,approval.rosterAsOf);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+t.fighterUrl);
  assert.equal(p.officialFighterUrl,t.official);
  assert.deepEqual(p.verifiedNumericFighterIds,[t.id]);
  assert.equal(p.officialUfcCareerBoutCount,7);
  assert.equal(h.length,7);
  assert.equal(p.bouts.length,7);
  assert.deepEqual(p.bouts.map(x=>x.nativeBoutId).sort(),Object.keys(t.urls).sort());
  assert.deepEqual(h.map(x=>String(x.boutId)).sort(),Object.keys(t.urls).sort());
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,7);
  assert.equal(p.bouts[0].date,t.last);
  assert.equal(p.bouts.filter(x=>x.result==='win').length,t.w);
  assert.equal(p.bouts.filter(x=>x.result==='loss').length,t.l);
  assert.equal(p.bouts.filter(x=>x.result==='draw').length,t.d);
  for(const x of p.bouts){
   const b=cache.bouts[x.nativeBoutId];
   assert.ok(b&&b.org==='ufc'&&b.status==='completed');
   assert.ok(Number(cache.roundDone[x.nativeBoutId])>0,'missing rounds are NEVER zero');
   assert.equal(x.nativeFighterId,t.id);
   assert.equal(x.fightUrl,'https://ufcstats.com/fight-details/'+t.urls[x.nativeBoutId]);
   const own=b.a?.id===t.id?b.a:b.b?.id===t.id?b.b:null,other=own===b.a?b.b:b.a;
   assert.ok(own&&other);
   assert.equal(own.slug,slug);
   assert.equal(other.name,x.opponent);
   const actual=b.result?.method==='draw'&&!b.result?.winnerId?'draw':b.result?.winnerId===own.id?'win':'loss';
   assert.equal(x.result,actual);
   assert.ok(Math.abs(Date.parse(x.date+'T00:00:00Z')-Date.parse(b.eventDate+'T00:00:00Z'))<=86400000);
  }
  assert.equal(gate(slug,p),true,'only strict Stage3 may certify');
 }
});
test('wave69 evidence fails closed on omitted/duplicate bouts, forged identities, incorrect corner and inverted outcome',()=>{
 for(const slug of Object.keys(targets)){
  const p=proofs[slug];
  assert.equal(gate(slug,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...p,bouts:[...p.bouts,p.bouts[0]]}),false);
  assert.equal(gate(slug,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((x,i)=>i?x:{...x,nativeBoutId:'999999'})}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((x,i)=>i?x:{...x,nativeFighterId:'999999'})}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((x,i)=>i?x:{...x,result:x.result==='win'?'loss':'win'})}),false);
 }
});
test('wave69 majority draws and original 2020 local/UTC one-day shifts retained',()=>{
 const g=proofs['melissa-gatto'].bouts.find(x=>x.nativeBoutId==='93273');
 const r=proofs['rinat-fakhretdinov'].bouts.find(x=>x.nativeBoutId==='59992');
 assert.equal(g.result,'draw');assert.equal(r.result,'draw');
 assert.equal(cache.bouts[g.nativeBoutId].result.winnerId,null);
 assert.equal(cache.bouts[r.nativeBoutId].result.winnerId,null);
 assert.equal(gate('melissa-gatto',{...proofs['melissa-gatto'],bouts:proofs['melissa-gatto'].bouts.map(x=>x.nativeBoutId==='93273'?{...x,result:'loss'}:x)}),false);
 assert.equal(gate('rinat-fakhretdinov',{...proofs['rinat-fakhretdinov'],bouts:proofs['rinat-fakhretdinov'].bouts.map(x=>x.nativeBoutId==='59992'?{...x,result:'win'}:x)}),false);
 const n=proofs['nate-maness'].bouts;
 assert.equal(n.find(x=>x.nativeBoutId==='59399').date,'2020-08-01');
 assert.equal(cache.bouts['59399'].eventDate,'2020-08-02');
 assert.equal(n.find(x=>x.nativeBoutId==='66364').date,'2020-11-28');
 assert.equal(cache.bouts['66364'].eventDate,'2020-11-29');
});
