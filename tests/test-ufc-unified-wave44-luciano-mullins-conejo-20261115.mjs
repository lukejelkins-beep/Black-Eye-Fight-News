import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const register=read('ufc-independent-full-career-verification.json').fighters;
const source=read('ufc-unified-wave44-luciano-mullins-conejo-source-review-20261115.json');
const feeder=read('ufc-feeder-bout-evidence.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const cases=[
  {
    "slug": "stephanie-luciano",
    "name": "Stephanie Luciano",
    "native": "160",
    "official": "https://www.ufc.com/athlete/stephanie-bruna-luciano",
    "stats": "1b35af4d1529adf6",
    "fights": [
      [
        "60247",
        "2024-08-10",
        "Talita Alencar",
        "win",
        "1b5d5af1bc0a34c7"
      ],
      [
        "60364",
        "2025-03-15",
        "Sam Hughes",
        "loss",
        "5fa6543868367f4b"
      ],
      [
        "38152",
        "2025-10-18",
        "Ravena Oliveira",
        "win",
        "8d9458121f0c4b95"
      ],
      [
        "83278",
        "2026-08-01",
        "Marina Spasić",
        "win",
        "878a7e6fec3e4573"
      ]
    ]
  },
  {
    "slug": "melissa-mullins",
    "name": "Melissa Mullins",
    "native": "122",
    "official": "https://www.ufc.com/athlete/melissa-mullins",
    "stats": "bd532e9a2b93870c",
    "fights": [
      [
        "60018",
        "2023-10-14",
        "Irina Alekseeva",
        "win",
        "1ba282da76ca82ad"
      ],
      [
        "61260",
        "2024-04-06",
        "Nora Cornolle",
        "loss",
        "1685eecc7ef37fb5"
      ],
      [
        "65833",
        "2024-11-09",
        "Klaudia Sygula",
        "win",
        "32f2965b4f4c4ebf"
      ],
      [
        "60279",
        "2025-06-21",
        "Daria Zhelezniakova",
        "loss",
        "fff3218758c513b8"
      ],
      [
        "66004",
        "2026-06-20",
        "Bia Mesquita",
        "loss",
        "c0980a613f24accd"
      ]
    ]
  },
  {
    "slug": "montserrat-conejo-ruiz",
    "name": "Montserrat Conejo Ruiz",
    "native": "406",
    "official": "https://www.ufc.com/athlete/montserrat-conejo",
    "stats": "1235b31de15d0c6e",
    "fights": [
      [
        "66314",
        "2021-03-20",
        "Cheyanne Vlismas",
        "win",
        "dd7f3f91ea6067d4"
      ],
      [
        "59467",
        "2021-07-17",
        "Amanda Lemos",
        "loss",
        "c5e71fbf22f669f7"
      ],
      [
        "60086",
        "2023-08-12",
        "Jaqueline Amorim",
        "loss",
        "ca2aa660bea0cb60"
      ],
      [
        "59995",
        "2023-11-04",
        "Eduarda Moura",
        "loss",
        "9e2bb8d5961b44d4"
      ],
      [
        "60428",
        "2025-11-01",
        "Alice Ardelean",
        "loss",
        "32927d50acedb507"
      ]
    ]
  }
];
const nativeHistory=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.date<=census.asOf&&!(c.slug==='stephanie-luciano'&&String(h.boutId)==='83935'));
test('wave44 three complete official UFC careers match all fourteen original measured fight IDs',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(cases.reduce((n,c)=>n+c.fights.length,0),14);
 assert.equal(new Set(cases.flatMap(c=>c.fights.map(x=>x[0]))).size,14);
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
   assert.ok(history.some(x=>String(x.boutId)===id&&x.result===result&&x.date===date));
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
test('Stephanie DWCS draw remains explicitly excluded even though native bout is absent from measured cache',()=>{
 const c=cases.find(x=>x.slug==='stephanie-luciano');
 const raw=profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc');
 assert.equal(raw.length,5);
 const dwcs=raw.find(h=>String(h.boutId)==='83935');
 assert.equal(dwcs?.result,'draw');
 assert.equal(dwcs?.opponent,'Talita Alencar');
 assert.equal(cache.bouts['83935'],undefined);
 assert.equal(feeder.bouts.filter(x=>x.boutId==='83935'&&x.fighterSlug===c.slug&&x.date==='2023-09-19'&&x.sourceUrl===c.official).length,1);
 assert.equal(register[c.slug].sourceVerifiedExcludedFeederBouts[0].nativeBoutId,'83935');
 assert.equal(register[c.slug].bouts.some(x=>x.nativeBoutId==='83935'),false);
});
test('wave44 strict independent gate fails closed for missing bout, substituted numeric identity or changed outcome',()=>{
 for(const c of cases){
  const proof=register[c.slug],history=nativeHistory(c);
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=e=>evaluateCareerEvidence(profiles[c.slug],history,last,approval.rosterAsOf,e,cache.bouts).independentlyVerified;
  assert.equal(gate({...proof,bouts:proof.bouts.slice(1)}),false);
  assert.equal(gate({...proof,verifiedNumericFighterIds:['99999999']}),false);
  assert.equal(gate({...proof,bouts:proof.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
