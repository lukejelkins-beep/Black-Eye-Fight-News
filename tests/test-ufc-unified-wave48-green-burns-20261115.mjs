import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,feeder=read('ufc-feeder-bout-evidence.json'),source=read('ufc-unified-wave48-green-burns-source-review-20261115.json');
const cases=[
  {
    "slug": "gabe-green",
    "name": "Gabe Green",
    "statsId": "5eb50529a8418b77",
    "nativeId": "967",
    "official": "https://www.ufc.com/athlete/gabe-green",
    "bouts": [
      [
        "2020-05-30",
        "Daniel Rodriguez",
        "loss",
        "767819f321431bed",
        "66188",
        "761"
      ],
      [
        "2021-02-13",
        "Phil Rowe",
        "win",
        "357c5b86ec83b826",
        "61926",
        "408"
      ],
      [
        "2022-04-30",
        "Yohan Lainesse",
        "win",
        "5b731da9e4be4391",
        "59613",
        "968"
      ],
      [
        "2022-07-02",
        "Ian Machado Garry",
        "loss",
        "4d8d1701c43c5fea",
        "61487",
        "387"
      ],
      [
        "2023-05-13",
        "Bryan Battle",
        "loss",
        "81fda78adcaedbc7",
        "61305",
        "757"
      ],
      [
        "2025-05-17",
        "Matheus Camilo",
        "win",
        "a9a6cca4bbf7a5db",
        "60845",
        "304"
      ]
    ],
    "note": "UFC official biography says Philip Rowe; pinned Greco/native fighter is Phil Rowe; Feb 13 local vs Feb 14 native UTC."
  },
  {
    "slug": "herbert-burns",
    "name": "Herbert Burns",
    "statsId": "4f140403000158b5",
    "nativeId": "2702",
    "official": "https://www.ufc.com/athlete/herbert-burns",
    "bouts": [
      [
        "2020-01-25",
        "Nate Landwehr",
        "win",
        "901dbd1e6463c4ba",
        "59224",
        "581"
      ],
      [
        "2020-06-06",
        "Evan Dunham",
        "win",
        "20ba608a6e717f05",
        "62016",
        "1714"
      ],
      [
        "2020-08-15",
        "Daniel Pineda",
        "loss",
        "0d9e9127c62811f9",
        "59374",
        "1939"
      ],
      [
        "2022-07-16",
        "Bill Algeo",
        "loss",
        "4dd2bcd2b025204e",
        "61511",
        "1128"
      ],
      [
        "2024-03-30",
        "Julio Arce",
        "loss",
        "976abc27a4e5e26a",
        "38987",
        "1042"
      ],
      [
        "2024-08-17",
        "Jack Jenkins",
        "loss",
        "bfff6cf22c1c569c",
        "65953",
        "213"
      ]
    ],
    "feeder": {
      "nativeBoutId": "88222",
      "date": "2019-08-06",
      "opponent": "Darrick Minner",
      "result": "win",
      "event": "Dana White's Contender Series Season 3 Episode 7",
      "officialSourceUrl": "https://www.ufc.com/athlete/herbert-burns",
      "excludedBecause": "Official UFC.com identifies 2019 appearance as DWCS rather than six-fight Octagon career; already tracked as native 88222 in canonical source-exclusion register."
    },
    "note": "Official UFC.com biography misspells Evan Dunham as Evan Durham; independent Greco and original native corner confirm Dunham; Aug 15 local vs Aug 16 native UTC."
  }
];
const hist=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf&&!(c.feeder&&h.boutId===c.feeder.nativeBoutId));
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],hist(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave48 source-crosschecks all twelve unique complete Octagon bout IDs, both corners and original measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b[4]))).size,12);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const p=register[c.slug],s=source.fighters[c.slug];
  assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,6);assert.equal(p.bouts.length,6);assert.equal(s.bouts.length,6);assert.equal(hist(c).length,6);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);
  assert.equal(p.officialFighterUrl,c.official);assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
  for(const [date,opponent,result,fightId,id,otherId] of c.bouts){
   assert.deepEqual(p.bouts.find(b=>b.nativeBoutId===id),{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId:id,nativeFighterId:c.nativeId});
   const b=cache.bouts[id];assert.equal(b.org,'ufc');assert.equal(b.status,'completed');
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(date))<=86400000);assert.ok(Number(cache.roundDone[id])>0);
   const own=b.a.id===c.nativeId?b.a:b.b.id===c.nativeId?b.b:null,other=own===b.a?b.b:b.a;
   assert.equal(own.slug,c.slug);assert.equal(other.id,otherId);assert.equal(other.name,opponent);
   assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===other.id?'loss':null,result);
   assert.ok(hist(c).some(h=>h.boutId===id&&h.result===result&&Math.abs(Date.parse(h.date)-Date.parse(date))<=86400000));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave48 uses existing one-off official DWCS exclusion, exact Dunham identity, and legitimate one-day UTC shifts',()=>{
 const b=cases.find(c=>c.slug==='herbert-burns'),g=cases.find(c=>c.slug==='gabe-green');
 assert.equal(feeder.bouts.filter(x=>x.fighterSlug===b.slug&&x.boutId==='88222').length,1);
 assert.equal(feeder.bouts.find(x=>x.fighterSlug===b.slug).sourceUrl,b.official);
 assert.equal(cache.bouts['88222'],undefined);
 assert.equal(register[b.slug].sourceVerifiedExcludedFeederBouts[0].nativeBoutId,'88222');
 assert.equal(register[b.slug].bouts.some(x=>x.nativeBoutId==='88222'),false);
 assert.equal(register[b.slug].bouts.find(x=>x.nativeBoutId==='62016').opponent,'Evan Dunham');
 assert.equal(register[b.slug].bouts.find(x=>x.nativeBoutId==='59374').date,'2020-08-15');
 assert.equal(cache.bouts['59374'].eventDate,'2020-08-16');
 assert.equal(register[g.slug].bouts.find(x=>x.nativeBoutId==='61926').date,'2021-02-13');
 assert.equal(cache.bouts['61926'].eventDate,'2021-02-14');
 assert.equal(gate(b,register[b.slug]),true);
});
test('wave48 fail-closed mutations: removed bout, wrong numeric source/native fighter identity, inverted winner',()=>{
 for(const c of cases){const p=register[c.slug];
 assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
 assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
 assert.equal(gate(c,{...p,bouts:p.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
