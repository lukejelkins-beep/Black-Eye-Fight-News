import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,source=read('ufc-unified-wave53-morales-mariscal-nunes-source-review-20261115.json');
const cases=[
  {
    "slug": "joseph-morales",
    "name": "Joseph Morales",
    "nativeId": "433",
    "statsId": "2fe9032955c2e013",
    "official": "https://www.ufc.com/athlete/joseph-morales",
    "bouts": [
      {
        "date": "2017-08-05",
        "opponent": "Robert Sanchez",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/a3723f0f672b0912",
        "nativeBoutId": "58609",
        "nativeFighterId": "433",
        "originalOpponentNumericId": "2602"
      },
      {
        "date": "2018-02-04",
        "opponent": "Deiveson Figueiredo",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/1fd5bf36c42ff1a2",
        "nativeBoutId": "65447",
        "nativeFighterId": "433",
        "originalOpponentNumericId": "52"
      },
      {
        "date": "2018-11-10",
        "opponent": "Eric Shelton",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/3210723fbb018fa7",
        "nativeBoutId": "62292",
        "nativeFighterId": "433",
        "originalOpponentNumericId": "2581"
      },
      {
        "date": "2025-08-16",
        "opponent": "Alibi Idiris",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/68c423c7119004f3",
        "nativeBoutId": "60507",
        "nativeFighterId": "433",
        "originalOpponentNumericId": "482"
      },
      {
        "date": "2025-11-08",
        "opponent": "Matt Schnell",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/f7e9bd2d6f81aeae",
        "nativeBoutId": "65900",
        "nativeFighterId": "433",
        "originalOpponentNumericId": "86"
      },
      {
        "date": "2026-09-12",
        "opponent": "Brandon Moreno",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/1aa008d8597a73b8",
        "nativeBoutId": "83215",
        "nativeFighterId": "433",
        "originalOpponentNumericId": "362"
      }
    ]
  },
  {
    "slug": "chepe-mariscal",
    "name": "Chepe Mariscal",
    "nativeId": "390",
    "statsId": "e0c6edcb5b5d0b90",
    "official": "https://www.ufc.com/athlete/chepe-mariscal",
    "bouts": [
      {
        "date": "2023-06-24",
        "opponent": "Trevor Peek",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/f18d44292036d5de",
        "nativeBoutId": "60163",
        "nativeFighterId": "390",
        "originalOpponentNumericId": "2772"
      },
      {
        "date": "2023-09-09",
        "opponent": "Jack Jenkins",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/09a7f0979a58e6ea",
        "nativeBoutId": "60059",
        "nativeFighterId": "390",
        "originalOpponentNumericId": "213"
      },
      {
        "date": "2024-04-06",
        "opponent": "Morgan Charriere",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/32375b4435fea5e6",
        "nativeBoutId": "61251",
        "nativeFighterId": "390",
        "originalOpponentNumericId": "342"
      },
      {
        "date": "2024-08-10",
        "opponent": "Damon Jackson",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/e72a2130e7387637",
        "nativeBoutId": "60239",
        "nativeFighterId": "390",
        "originalOpponentNumericId": "639"
      },
      {
        "date": "2025-03-01",
        "opponent": "Ricardo Ramos",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/dd1df7f5a54fd9fc",
        "nativeBoutId": "60337",
        "nativeFighterId": "390",
        "originalOpponentNumericId": "172"
      },
      {
        "date": "2025-11-15",
        "opponent": "Pat Sabatini",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/e3cbd663732f4a98",
        "nativeBoutId": "38205",
        "nativeFighterId": "390",
        "originalOpponentNumericId": "21"
      }
    ]
  },
  {
    "slug": "josiane-nunes",
    "name": "Josiane Nunes",
    "nativeId": "1189",
    "statsId": "68d35296f566792b",
    "official": "https://www.ufc.com/athlete/josiane-nunes",
    "bouts": [
      {
        "date": "2021-08-21",
        "opponent": "Bea Malecki",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/92d39a17e34cf581",
        "nativeBoutId": "59422",
        "nativeFighterId": "1189",
        "originalOpponentNumericId": "2694"
      },
      {
        "date": "2022-02-26",
        "opponent": "Ramona Pascual",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/f087a10a6f2bcc99",
        "nativeBoutId": "61388",
        "nativeFighterId": "1189",
        "originalOpponentNumericId": "1190"
      },
      {
        "date": "2023-01-21",
        "opponent": "Zarah Fairn",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/fcf385ae75191b57",
        "nativeBoutId": "59728",
        "nativeFighterId": "1189",
        "originalOpponentNumericId": "2698"
      },
      {
        "date": "2024-03-16",
        "opponent": "Chelsea Chandler",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/711ec0545552455b",
        "nativeBoutId": "61243",
        "nativeFighterId": "1189",
        "originalOpponentNumericId": "96"
      },
      {
        "date": "2024-08-24",
        "opponent": "Jacqueline Cavalcanti",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/903d588b30a471e8",
        "nativeBoutId": "60236",
        "nativeFighterId": "1189",
        "originalOpponentNumericId": "42"
      },
      {
        "date": "2025-03-15",
        "opponent": "Priscila Cachoeira",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/1c62a7444808d97f",
        "nativeBoutId": "60366",
        "nativeFighterId": "1189",
        "originalOpponentNumericId": "95"
      }
    ]
  }
];
const history=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],history(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave53 independently proves all 18 original fights across three frozen-approved complete six-fight UFC careers',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b.nativeBoutId))).size,18);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug),'must be in 783 frozen approved cohort '+c.slug);
  const p=register[c.slug],s=source.fighters[c.slug];
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,6);assert.equal(p.bouts.length,6);assert.equal(s.bouts.length,6);
  assert.equal(history(c).length,6);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);assert.equal(p.officialFighterUrl,c.official);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
  for(const b of c.bouts){
   const {originalOpponentNumericId:oppId,...cert}=b;
   assert.deepEqual(p.bouts.find(x=>x.nativeBoutId===b.nativeBoutId),cert);
   const x=cache.bouts[b.nativeBoutId];assert.equal(x.org,'ufc');assert.equal(x.status,'completed');assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(x.eventDate)-Date.parse(b.date))<=86400000);
   const own=x.a.id===c.nativeId?x.a:x.b.id===c.nativeId?x.b:null,other=own===x.a?x.b:x.a;
   assert.equal(own.slug,c.slug);assert.equal(other.id,oppId);assert.equal(other.name,b.opponent);
   assert.equal(x.result.winnerId===own.id?'win':x.result.winnerId===other.id?'loss':null,b.result);
   assert.ok(history(c).some(h=>h.boutId===b.nativeBoutId&&h.result===b.result&&Math.abs(Date.parse(h.date)-Date.parse(b.date))<=86400000));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave53 preserves historical gap, TUF33 official finale and source-anchored opponent aliases',()=>{
 const j=register['joseph-morales'],m=register['chepe-mariscal'],n=register['josiane-nunes'];
 assert.equal(j.bouts[0].date,'2017-08-05');
 assert.equal(j.bouts.find(x=>x.nativeBoutId==='60507').opponent,'Alibi Idiris');
 assert.equal(j.bouts.some(x=>x.opponent==='Imanol Rodriguez'),false);
 assert.equal(j.bouts.find(x=>x.nativeBoutId==='58609').opponent,'Robert Sanchez');
 assert.equal(j.bouts.find(x=>x.nativeBoutId==='83215').result,'loss');
 assert.equal(m.bouts.find(x=>x.nativeBoutId==='60059').result,'win');
 assert.equal(m.bouts.find(x=>x.nativeBoutId==='38205').result,'loss');
 assert.deepEqual(n.bouts.map(x=>x.result),['win','win','win','loss','loss','loss']);
});
test('wave53 fail-closed mutations: omitted source fight, inconsistent native fighter ID and inverted result',()=>{
 for(const c of cases){
  const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
