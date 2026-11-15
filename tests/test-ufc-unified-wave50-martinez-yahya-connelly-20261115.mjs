import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,source=read('ufc-unified-wave50-martinez-yahya-connelly-source-review-20261115.json');
const cases=[
  {
    "slug": "melissa-martinez",
    "name": "Melissa Martinez",
    "nativeId": "2754",
    "statsId": "3f4c3bc822bea45d",
    "official": "https://www.ufc.com/athlete/melissa-martinez",
    "note": "Official UFC.com narrative verifies 2022 Reed loss, 2024 Ardelean win and 2025 Kline loss despite all-Win graphical fight-history tiles; 2025-07-12 local event date rolls to 2025-07-13 UTC in untouched native cache. Not to be confused with Melissa Amaya or other Martinez athletes.",
    "bouts": [
      [
        "2022-09-10",
        "Elise Reed",
        "loss",
        "a5cf273faa3982b7",
        "59837",
        "1223"
      ],
      [
        "2024-10-19",
        "Alice Ardelean",
        "win",
        "4277b02a4dadac40",
        "65943",
        "45"
      ],
      [
        "2025-07-12",
        "Fatima Kline",
        "loss",
        "120d66cb0da0f3c3",
        "60840",
        "389"
      ]
    ]
  },
  {
    "slug": "mohammad-yahya",
    "name": "Mohammad Yahya",
    "nativeId": "2837",
    "statsId": "3753714927f18437",
    "official": "https://www.ufc.com/athlete/mohammad-yahya",
    "note": "Official dated Octagon narrative verifies three losses to Trevor Peek, Kaue Fernandes and Steven Nguyen (not UFC.com graphical Win badges). Native identities disambiguated from Rani Yahya. UFC.com narrative accents Kauê; pinned Greco and native fight ID use Kaue.",
    "bouts": [
      [
        "2023-10-21",
        "Trevor Peek",
        "loss",
        "3c6fb6bf9b7afd40",
        "60003",
        "2772"
      ],
      [
        "2024-08-03",
        "Kaue Fernandes",
        "loss",
        "1cd63899011c4bf6",
        "61098",
        "247"
      ],
      [
        "2025-07-26",
        "Steven Nguyen",
        "loss",
        "23ddf51ce630028d",
        "60827",
        "2849"
      ]
    ]
  },
  {
    "slug": "tristan-connelly",
    "name": "Tristan Connelly",
    "nativeId": "963",
    "statsId": "2ebfbe72ed703925",
    "official": "https://www.ufc.com/athlete/tristan-connelly",
    "note": "Official full UFC history covers win over Michel Pereira in 2019 and losses to Pat Sabatini in 2021 and Darren Elkins in 2022. UFC.com current Octagon Debut date text of September 2026 contradicts its own dated career biography; full fight history plus pinned Greco/native event IDs establish the correct 2019 debut.",
    "bouts": [
      [
        "2019-09-14",
        "Michel Pereira",
        "win",
        "dadaee9624256e07",
        "65627",
        "128"
      ],
      [
        "2021-04-24",
        "Pat Sabatini",
        "loss",
        "6a7347d1da8a2b87",
        "61750",
        "21"
      ],
      [
        "2022-04-30",
        "Darren Elkins",
        "loss",
        "760e3f292b834637",
        "59609",
        "962"
      ]
    ]
  }
];
const history=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],history(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave50 independently verifies nine completed fights across three official complete UFC careers',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b[4]))).size,9);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const p=register[c.slug],s=source.fighters[c.slug];
  assert.ok(p);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,3);
  assert.equal(p.bouts.length,3);
  assert.equal(s.bouts.length,3);
  assert.equal(history(c).length,3);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);
  assert.equal(p.officialFighterUrl,c.official);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
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
   assert.ok(history(c).some(h=>h.boutId===id&&h.result===result&&Math.abs(Date.parse(h.date)-Date.parse(date))<=86400000));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave50 official full narratives correct misleading UFC visual win badges and one-day UTC shift',()=>{
 const m=register['melissa-martinez'],y=register['mohammad-yahya'],t=register['tristan-connelly'];
 assert.deepEqual(m.bouts.map(x=>x.result),['loss','win','loss']);
 assert.deepEqual(y.bouts.map(x=>x.result),['loss','loss','loss']);
 assert.deepEqual(t.bouts.map(x=>x.result),['win','loss','loss']);
 assert.equal(m.bouts.find(x=>x.nativeBoutId==='60840').date,'2025-07-12');
 assert.equal(cache.bouts['60840'].eventDate,'2025-07-13');
 assert.equal(t.earliestOfficialUfcBout,'2019-09-14');
 assert.equal(gate(cases[0],m),true);
 assert.equal(gate(cases[1],y),true);
 assert.equal(gate(cases[2],t),true);
});
test('wave50 fail-closed for missing bout, swapped source numeric identity and wrong final result',()=>{
 for(const c of cases){const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((z,i)=>i===0?{...z,result:z.result==='win'?'loss':'win'}:z)}),false);
 }
});
