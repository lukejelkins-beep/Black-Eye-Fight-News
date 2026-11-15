import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const register=read('ufc-independent-full-career-verification.json').fighters;
const source=read('ufc-unified-wave45-four-careers-source-review-20261115.json');
const feeder=read('ufc-feeder-bout-evidence.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const cases=[
  {
    "slug": "mitch-raposo",
    "name": "Mitch Raposo",
    "native": "124",
    "official": "https://www.ufc.com/athlete/mitch-raposo",
    "stats": "0be6776db31d98ec",
    "fights": [
      [
        "60259",
        "2024-06-01",
        "André Lima",
        "loss",
        "f1d3eec12662d8d7"
      ],
      [
        "60976",
        "2025-04-12",
        "Sumudaerji",
        "loss",
        "fd98843926965cbd"
      ],
      [
        "60469",
        "2025-10-25",
        "Azat Maksum",
        "win",
        "22dd728012944f0a"
      ],
      [
        "66000",
        "2026-06-20",
        "Allan Nascimento",
        "win",
        "3b4803afa824fea3"
      ],
      [
        "93615",
        "2026-11-07",
        "Marcos Degli",
        "win",
        "beda278798850354"
      ]
    ],
    "feeder": {
      "boutId": "83896",
      "date": "2021-10-12",
      "opponent": "Jake Hadley",
      "result": "loss",
      "event": "Dana White's Contender Series 43"
    }
  },
  {
    "slug": "muin-gafurov",
    "name": "Muin Gafurov",
    "native": "492",
    "official": "https://www.ufc.com/athlete/muin-gafurov",
    "stats": "a54660deb6a8489c",
    "fights": [
      [
        "61315",
        "2023-06-03",
        "John Castaneda",
        "loss",
        "c98f62eb74e69bcb"
      ],
      [
        "60001",
        "2023-10-21",
        "Said Nurmagomedov",
        "loss",
        "ed3334d108b257a6"
      ],
      [
        "38814",
        "2024-06-22",
        "Kyung Ho Kang",
        "win",
        "8db5cf5df713a7e9"
      ],
      [
        "60951",
        "2025-01-18",
        "Rinya Nakamura",
        "win",
        "e5e3d396a9b1c5ae"
      ],
      [
        "60736",
        "2026-02-07",
        "Jakub Wiklacz",
        "loss",
        "9d30c887e8bd8824"
      ]
    ],
    "feeder": {
      "boutId": "83961",
      "date": "2021-09-07",
      "opponent": "Chad Anheliger",
      "result": "loss",
      "event": "Dana White's Contender Series 38"
    }
  },
  {
    "slug": "nurullo-aliev",
    "name": "Nurullo Aliev",
    "native": "372",
    "official": "https://www.ufc.com/athlete/nurullo-aliev",
    "stats": "ca28cdf526d6b6e9",
    "fights": [
      [
        "59714",
        "2023-02-25",
        "Rafael Alves",
        "win",
        "02615499125b4b5d"
      ],
      [
        "60354",
        "2025-01-11",
        "Joe Solecki",
        "win",
        "192619174bd1ad77"
      ],
      [
        "60416",
        "2025-11-22",
        "Shem Rock",
        "win",
        "46f81d5ecd974c1c"
      ],
      [
        "82957",
        "2026-07-25",
        "Mike Davis",
        "win",
        "3859314324918eeb"
      ],
      [
        "83683",
        "2026-10-24",
        "Grant Dawson",
        "loss",
        "c70b4b6a8a5a3abb"
      ]
    ],
    "feeder": {
      "boutId": "83945",
      "date": "2022-09-20",
      "opponent": "Josh Wick",
      "result": "win",
      "event": "Dana White's Contender Series 55"
    }
  },
  {
    "slug": "ottman-azaitar",
    "name": "Ottman Azaitar",
    "native": "2718",
    "official": "https://www.ufc.com/athlete/ottman-azaitar",
    "stats": "ee18ff42063174df",
    "fights": [
      [
        "58965",
        "2019-09-07",
        "Teemu Packalen",
        "win",
        "2c7b788effdc1b4c"
      ],
      [
        "61768",
        "2020-09-12",
        "Khama Worthy",
        "win",
        "1ed8776f978a0155"
      ],
      [
        "59799",
        "2022-11-12",
        "Matt Frevola",
        "loss",
        "40707ddc9fdea500"
      ],
      [
        "60117",
        "2023-07-15",
        "Francisco Prado",
        "loss",
        "b52dccbe69864d2a"
      ],
      [
        "60374",
        "2024-12-14",
        "Michael Johnson",
        "loss",
        "9c24c03131d5b49a"
      ]
    ],
    "feeder": null
  }
];
const nativeHistory=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.date<=census.asOf&&(!c.feeder||String(h.boutId)!==c.feeder.boutId));
test('wave45 four independently sourced complete UFC careers match twenty original measured fight IDs',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(cases.reduce((n,c)=>n+c.fights.length,0),20);
 assert.equal(new Set(cases.flatMap(c=>c.fights.map(x=>x[0]))).size,20);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const proof=register[c.slug],review=source.fighters[c.slug],history=nativeHistory(c);
  assert.equal(proof?.sourceCoverageAttested,true);
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(proof.fighterName,c.name);
  assert.equal(proof.officialFighterUrl,c.official);
  assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/'+c.stats);
  assert.equal(proof.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.deepEqual(proof.verifiedNumericFighterIds,[c.native]);
  assert.equal(proof.officialUfcCareerBoutCount,c.fights.length);
  assert.equal(proof.bouts.length,c.fights.length);
  assert.equal(review.bouts.length,c.fights.length);
  assert.equal(history.length,c.fights.length);
  for(const [id,date,opponent,result,fightId] of c.fights){
   const b=proof.bouts.find(x=>x.nativeBoutId===id);
   assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId:id,nativeFighterId:c.native});
   assert.ok(history.some(x=>String(x.boutId)===id&&x.result===result&&Math.abs(Date.parse(x.date)-Date.parse(date))<=86400000));
   const native=cache.bouts[id];
   assert.equal(native?.org,'ufc');
   assert.equal(native?.status,'completed');
   assert.ok(Math.abs(Date.parse(date)-Date.parse(native.eventDate))<=86400000);
   assert.ok(Number(cache.roundDone[id])>0);
   const own=native.a?.id===c.native?native.a:native.b?.id===c.native?native.b:null;
   assert.equal(own?.slug,c.slug);
   const other=own===native.a?native.b:native.a;
   assert.equal(other?.name,opponent);
   assert.equal(native.result?.winnerId===own.id?'win':native.result?.winnerId===other?.id?'loss':null,result);
  }
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  assert.equal(evaluateCareerEvidence(profiles[c.slug],history,last,approval.rosterAsOf,proof,cache.bouts).independentlyVerified,true);
 }
});
test('wave45 all three DWCS feeder bouts are individually source-excluded, not extra UFC fights',()=>{
 for(const c of cases.filter(x=>x.feeder)){
  const raw=profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc');
  assert.equal(raw.length,6);
  const h=raw.find(x=>String(x.boutId)===c.feeder.boutId);
  assert.equal(h?.date,c.feeder.date);
  assert.equal(h?.result,c.feeder.result);
  assert.match(cache.bouts[c.feeder.boutId]?.event||'',/Contender Series/);
  assert.equal(feeder.bouts.filter(x=>x.boutId===c.feeder.boutId&&x.fighterSlug===c.slug&&x.sourceUrl===c.official).length,1);
  assert.equal(register[c.slug].sourceVerifiedExcludedFeederBouts[0].nativeBoutId,c.feeder.boutId);
  assert.equal(register[c.slug].bouts.some(x=>x.nativeBoutId===c.feeder.boutId),false);
 }
});
test('wave45 preserves the documented one-day native UTC shift and reciprocal official losses',()=>{
 const c=cases.find(x=>x.slug==='ottman-azaitar');
 const p=register[c.slug].bouts.find(x=>x.nativeBoutId==='60374');
 assert.equal(p.date,'2024-12-14');
 assert.equal(cache.bouts['60374'].eventDate,'2024-12-15');
 assert.equal(p.result,'loss');
 assert.equal(cache.bouts['60374'].result.winnerId,'464');
 const m=register['muin-gafurov'].bouts.find(x=>x.nativeBoutId==='60736');
 assert.equal(m.result,'loss');
 assert.equal(cache.bouts['60736'].result.winnerId,'205');
});
test('wave45 strict Stage3 gate fails closed for missing bout, altered native fighter ID or changed winner',()=>{
 for(const c of cases){
  const proof=register[c.slug],history=nativeHistory(c);
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=e=>evaluateCareerEvidence(profiles[c.slug],history,last,approval.rosterAsOf,e,cache.bouts).independentlyVerified;
  assert.equal(gate({...proof,bouts:proof.bouts.slice(1)}),false);
  assert.equal(gate({...proof,verifiedNumericFighterIds:['99999999']}),false);
  assert.equal(gate({...proof,bouts:proof.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
