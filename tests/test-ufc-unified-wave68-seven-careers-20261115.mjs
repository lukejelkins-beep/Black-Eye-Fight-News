import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const proofs=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const targets={
  "marcus-mcghee": {
    "n": "296",
    "sourceId": "c0ac37a4a1133da9",
    "official": "https://www.ufc.com/athlete/marcus-mcghee",
    "wins": 6,
    "losses": 1,
    "last": "2026-10-03",
    "urls": {
      "53872": "88a63555728c2025",
      "59920": "03de7404decde12f",
      "60082": "2c160a1d1fdbf0b0",
      "60386": "2a930e2d7e1f87a9",
      "60818": "d4d4ee045b0ca695",
      "66473": "90940d93d6e0998f",
      "93300": "041f9b7dd3542fa6"
    },
    "results": {
      "53872": "win",
      "59920": "win",
      "60082": "win",
      "60386": "win",
      "60818": "loss",
      "66473": "win",
      "93300": "win"
    }
  },
  "myktybek-orolbai": {
    "n": "380",
    "sourceId": "bf2c8e01b07d3eb1",
    "official": "https://www.ufc.com/athlete/myktybek-orolbai",
    "wins": 5,
    "losses": 2,
    "last": "2026-08-15",
    "urls": {
      "59978": "b210b99d9c1c9196",
      "60185": "919e3c5cc6999cb3",
      "60274": "36ec204f47e4d613",
      "60407": "8ed609d80e135d94",
      "60717": "f26c0bdf7689aea2",
      "60923": "8a121f9c48f3773c",
      "82950": "d5ebdf462c9b59b3"
    },
    "results": {
      "59978": "win",
      "60185": "loss",
      "60274": "win",
      "60407": "win",
      "60717": "win",
      "60923": "win",
      "82950": "loss"
    }
  },
  "nursulton-ruziboev": {
    "n": "2822",
    "sourceId": "49d2a08964c5eb11",
    "official": "https://www.ufc.com/athlete/nursulton-ruziboev",
    "wins": 5,
    "losses": 2,
    "last": "2026-09-05",
    "urls": {
      "38538": "e9dfc2f009a77a8d",
      "38982": "e30250daa73005a8",
      "60146": "288f7fb936c1523c",
      "60843": "b3044bf646306e7f",
      "60930": "b78a222fb448aed4",
      "66368": "5e7f4ba1210f433d",
      "83069": "c23197c7e4f2fd9d"
    },
    "results": {
      "38538": "win",
      "38982": "win",
      "60146": "win",
      "60843": "win",
      "60930": "loss",
      "66368": "win",
      "83069": "loss"
    }
  },
  "reinier-de-ridder": {
    "n": "161",
    "sourceId": "d549cefc7c54ab78",
    "official": "https://www.ufc.com/athlete/reinier-de-ridder",
    "wins": 5,
    "losses": 2,
    "last": "2026-08-22",
    "urls": {
      "38142": "d61373d9fdf01a12",
      "60687": "d564db29997e1371",
      "60792": "380242601a2c5991",
      "60817": "6b8be0ee3e569ad2",
      "60945": "69d63c057aebffaf",
      "65824": "154138c8fc89c315",
      "82989": "0eba299c9b6760fa"
    },
    "results": {
      "38142": "loss",
      "60687": "loss",
      "60792": "win",
      "60817": "win",
      "60945": "win",
      "65824": "win",
      "82989": "win"
    }
  },
  "shavkat-rakhmonov": {
    "n": "1072",
    "sourceId": "01afe0916a40c7c5",
    "official": "https://www.ufc.com/athlete/shavkat-rakhmonov",
    "wins": 7,
    "losses": 0,
    "last": "2024-12-07",
    "urls": {
      "59478": "086c2a0cae0835c4",
      "59572": "3c98739eb42f96bf",
      "59682": "22fc6b3f4e48cfa3",
      "59927": "1efc813ccd7a5aba",
      "60778": "1569186ee820ea87",
      "61623": "6b4c2cc27855506a",
      "61814": "5b062be91c65fb73"
    },
    "results": {
      "59478": "win",
      "59572": "win",
      "59682": "win",
      "59927": "win",
      "60778": "win",
      "61623": "win",
      "61814": "win"
    }
  },
  "william-gomis": {
    "n": "22",
    "sourceId": "e1d40e8782d80bc2",
    "official": "https://www.ufc.com/athlete/william-gomis",
    "wins": 5,
    "losses": 2,
    "last": "2026-05-09",
    "urls": {
      "38702": "19706d8ba0edf9cd",
      "60069": "1c29c53ff032c5c1",
      "60334": "0dfdc94c1da32e20",
      "60476": "b53031bf4bd0a330",
      "61169": "398db40015b3c81c",
      "61281": "a941c4e25ddddfff",
      "66060": "303018d7459323b4"
    },
    "results": {
      "38702": "win",
      "60069": "win",
      "60334": "loss",
      "60476": "win",
      "61169": "win",
      "61281": "win",
      "66060": "loss"
    }
  },
  "shara-magomedov": {
    "n": "285",
    "sourceId": "06734ca9d88dec3a",
    "official": "https://www.ufc.com/athlete/shara-magomedov",
    "wins": 6,
    "losses": 1,
    "last": "2026-06-27",
    "urls": {
      "38809": "fbbf5391ea25521b",
      "60009": "539732694ab2c8d6",
      "60182": "108434acbbd75d26",
      "60819": "582d66ce97309e29",
      "61092": "b38450d9aa0f52b8",
      "66128": "012c307c9d446c4d",
      "66435": "426e7a3de68117b0"
    },
    "results": {
      "38809": "win",
      "60009": "win",
      "60182": "win",
      "60819": "win",
      "61092": "win",
      "66128": "win",
      "66435": "loss"
    }
  }
};
const history=s=>profiles[s].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&rich.bouts[h.boutId]?.org==='ufc'&&!/contender series/i.test(rich.bouts[h.boutId]?.event||''));
const gate=(s,p)=>evaluateCareerEvidence(profiles[s],history(s),census.fighters.find(x=>x.slug===s)?.lastUfcFight,approval.rosterAsOf,p,rich.bouts,approval.rosterAsOf).independentlyVerified;
test('wave68 seven complete UFC careers and 49 exact independently pinned source-to-native bout identities',()=>{
 assert.equal(approval.approvedFighters.length,783);
 for(const [slug,t] of Object.entries(targets)){
  const p=proofs[slug],h=history(slug);
  assert.ok(approval.approvedFighters.includes(slug));
  assert.ok(p);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.officialFighterUrl,t.official);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+t.sourceId);
  assert.deepEqual(p.verifiedNumericFighterIds,[t.n]);
  assert.equal(p.officialUfcCareerBoutCount,7);
  assert.equal(p.bouts.length,7);
  assert.equal(h.length,7);
  assert.deepEqual(p.bouts.map(x=>x.nativeBoutId).sort(),Object.keys(t.urls).sort());
  assert.deepEqual(h.map(x=>String(x.boutId)).sort(),Object.keys(t.urls).sort());
  assert.equal(p.bouts[0].date,t.last);
  assert.equal(p.bouts.filter(x=>x.result==='win').length,t.wins);
  assert.equal(p.bouts.filter(x=>x.result==='loss').length,t.losses);
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,7);
  for(const r of p.bouts){
   const b=rich.bouts[r.nativeBoutId];
   assert.ok(b);
   assert.equal(b.org,'ufc');
   assert.equal(b.status,'completed');
   assert.ok(Number(rich.roundDone[r.nativeBoutId])>0,'rounds must really be measured; never substitute zero');
   assert.equal(r.nativeFighterId,t.n);
   assert.equal(r.fightUrl,'https://ufcstats.com/fight-details/'+t.urls[r.nativeBoutId]);
   assert.equal(r.result,t.results[r.nativeBoutId]);
   const own=b.a?.id===t.n?b.a:b.b?.id===t.n?b.b:null,other=own===b.a?b.b:b.a;
   assert.ok(own&&other);
   assert.equal(own.slug,slug);
   assert.equal(other.name,r.opponent);
   assert.equal(r.result,b.result.winnerId===own.id?'win':'loss');
   assert.ok(Math.abs(Date.parse(r.date+'T00:00:00Z')-Date.parse(b.eventDate+'T00:00:00Z'))<=86400000);
  }
  assert.equal(gate(slug,p),true,'full 783-person strict Stage3 gate is authoritative');
 }
});
test('wave68 mutation regressions fail closed on omitted duplicate forged or inverted bout evidence',()=>{
 for(const slug of Object.keys(targets)){
  const p=proofs[slug];
  assert.equal(gate(slug,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...p,bouts:[...p.bouts,p.bouts[0]]}),false);
  assert.equal(gate(slug,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((x,i)=>i?x:{...x,nativeFighterId:'999999'})}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((x,i)=>i?x:{...x,nativeBoutId:'999999'})}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((x,i)=>i?x:{...x,result:x.result==='win'?'loss':'win'})}),false);
 }
});
test('wave68: no booked or post-source-cutoff fight is treated as completed',()=>{
 for(const [slug,t] of Object.entries(targets)){
  const p=proofs[slug];
  assert.deepEqual(p.sourceVerifiedExcludedFeederBouts,[]);
  assert.ok(p.bouts.every(x=>x.date<='2026-11-14'));
  assert.equal(p.bouts[0].date,t.last);
 }
 assert.ok(!proofs['shara-magomedov'].bouts.some(x=>x.date==='2026-12-05'));
});
