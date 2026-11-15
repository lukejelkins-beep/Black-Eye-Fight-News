import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const cache=read('ufcalendar-rich-progress.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const register=read('ufc-independent-full-career-verification.json').fighters;
const feeder=read('ufc-feeder-bout-evidence.json');
const source=read('ufc-unified-wave46-bannon-xiao-source-review-20261115.json');
const cases=[
  {
    "slug": "shauna-bannon",
    "name": "Shauna Bannon",
    "nativeId": "49",
    "statsId": "9c442aaf149ea982",
    "official": "https://www.ufc.com/athlete/shauna-bannon",
    "bouts": [
      [
        "2023-07-22",
        "Bruna Brasil",
        "loss",
        "c81d1facf185467d",
        "60113",
        "284"
      ],
      [
        "2024-07-27",
        "Alice Ardelean",
        "win",
        "dff2ef8fdde8c502",
        "61090",
        "45"
      ],
      [
        "2025-03-22",
        "Puja Tomar",
        "win",
        "a693622ad8c0d672",
        "60318",
        "2828"
      ],
      [
        "2025-09-06",
        "Sam Hughes",
        "loss",
        "a38010639e61885c",
        "60483",
        "131"
      ],
      [
        "2026-05-16",
        "Nicolle Caliari",
        "loss",
        "39417b7d07c2fd83",
        "66126",
        "50"
      ]
    ]
  },
  {
    "slug": "xiao-long",
    "name": "Xiao Long",
    "nativeId": "267",
    "statsId": "86bace9e4ad85542",
    "official": "https://www.ufc.com/athlete/xiao-long",
    "bouts": [
      [
        "2024-06-22",
        "ChangHo Lee",
        "loss",
        "c0d6feef69ccb330",
        "38816",
        "417"
      ],
      [
        "2024-11-23",
        "Quang Le",
        "win",
        "f5f28a8b472b8012",
        "38596",
        "227"
      ],
      [
        "2025-08-23",
        "SuYoung You",
        "loss",
        "2f6065fe0804d1d8",
        "65921",
        "266"
      ],
      [
        "2026-03-07",
        "Cody Garbrandt",
        "loss",
        "ecd16d14a138d7fb",
        "60691",
        "465"
      ],
      [
        "2026-08-29",
        "Francesco Nuzzi",
        "loss",
        "636867bbc9f96739",
        "83783",
        "5101"
      ]
    ],
    "feeder": {
      "nativeBoutId": "83857",
      "date": "2021-10-26",
      "opponent": "Cristian Quinonez",
      "result": "loss",
      "event": "Dana White's Contender Series 45",
      "officialSourceUrl": "https://www.ufc.com/athlete/xiao-long",
      "excludedBecause": "UFC official biography explicitly lists 2021-10-26 Cristian Quinonez as DWCS Season 5 episode nine, not an Octagon bout; does not expand five-fight UFC career."
    }
  }
];
const filtered=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc' && h.boutId && h.date<=census.asOf && !(c.feeder && h.boutId===c.feeder.nativeBoutId));
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],filtered(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave46 independently reconciles both complete five-fight UFC careers to ten unique measured original native fights',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b[4]))).size,10);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const p=register[c.slug],s=source.fighters[c.slug],hist=filtered(c);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,5);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);
  assert.equal(p.officialFighterUrl,c.official);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
  assert.equal(hist.length,5);
  assert.equal(s.bouts.length,5);
  assert.equal(p.bouts.length,5);
  for(const [date,opponent,result,fightId,id,otherId] of c.bouts){
   assert.deepEqual(p.bouts.find(b=>b.nativeBoutId===id),{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId:id,nativeFighterId:c.nativeId});
   const b=cache.bouts[id];
   assert.equal(b.org,'ufc');
   assert.equal(b.status,'completed');
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(date))<=86400000);
   assert.ok(Number(cache.roundDone[id])>0);
   const own=b.a.id===c.nativeId?b.a:b.b.id===c.nativeId?b.b:null,other=own===b.a?b.b:b.a;
   assert.equal(own.slug,c.slug);
   assert.equal(other.id,otherId);
   assert.equal(other.name,opponent);
   assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===other.id?'loss':null,result);
   assert.ok(hist.some(h=>h.boutId===id&&h.result===result));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave46 excludes Xiao Long DWCS, but includes officially televised Road to UFC final',()=>{
 const c=cases.find(c=>c.slug==='xiao-long');
 const p=register[c.slug];
 assert.equal(profiles[c.slug].recentHistory.filter(x=>x.promotion==='ufc').length,6);
 assert.equal(cache.bouts['83857'].event,'Dana White\'s Contender Series 45');
 assert.equal(cache.bouts['83857'].result.winnerId,'471');
 assert.equal(feeder.bouts.filter(x=>x.fighterSlug===c.slug&&x.boutId==='83857').length,1);
 assert.equal(feeder.bouts.find(x=>x.fighterSlug===c.slug).sourceUrl,c.official);
 assert.equal(p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,'83857');
 assert.equal(p.bouts.some(x=>x.nativeBoutId==='83857'),false);
 assert.equal(p.bouts.some(x=>x.nativeBoutId==='38816'),true);
 assert.equal(gate(c,p),true);
});
test('wave46 strict gate fails closed on removed bout, native ID alteration and inverted result',()=>{
 for(const c of cases){
  const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
