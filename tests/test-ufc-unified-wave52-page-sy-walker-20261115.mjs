import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,source=read('ufc-unified-wave52-page-sy-walker-source-review-20261115.json');
const cases=[
  {
    "slug": "michael-page",
    "name": "Michael Page",
    "nativeId": "532",
    "statsId": "a67d071163962af8",
    "official": "https://www.ufc.com/athlete/michael-page",
    "bouts": [
      {
        "date": "2024-03-09",
        "opponent": "Kevin Holland",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/270edfb687c0d20c",
        "nativeBoutId": "60904",
        "nativeFighterId": "532",
        "originalOpponentNumericId": "162"
      },
      {
        "date": "2024-06-29",
        "opponent": "Ian Machado Garry",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/fbf77262d8da342b",
        "nativeBoutId": "61045",
        "nativeFighterId": "532",
        "originalOpponentNumericId": "387"
      },
      {
        "date": "2025-02-01",
        "opponent": "Shara Magomedov",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/426e7a3de68117b0",
        "nativeBoutId": "66435",
        "nativeFighterId": "532",
        "originalOpponentNumericId": "285"
      },
      {
        "date": "2025-08-16",
        "opponent": "Jared Cannonier",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/9939d7073462e07e",
        "nativeBoutId": "60499",
        "nativeFighterId": "532",
        "originalOpponentNumericId": "1044"
      },
      {
        "date": "2026-03-21",
        "opponent": "Sam Patterson",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/5ee11b727e89e8ad",
        "nativeBoutId": "60561",
        "nativeFighterId": "532",
        "originalOpponentNumericId": "250"
      },
      {
        "date": "2026-09-05",
        "opponent": "Nursulton Ruziboev",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/c23197c7e4f2fd9d",
        "nativeBoutId": "83069",
        "nativeFighterId": "532",
        "originalOpponentNumericId": "2822"
      }
    ]
  },
  {
    "slug": "oumar-sy",
    "name": "Oumar Sy",
    "nativeId": "262",
    "statsId": "46e2011d92463b7e",
    "official": "https://www.ufc.com/athlete/oumar-sy",
    "bouts": [
      {
        "date": "2024-05-18",
        "opponent": "Tuco Tokkos",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/68ee31dd0853cdc9",
        "nativeBoutId": "61021",
        "nativeFighterId": "262",
        "originalOpponentNumericId": "37"
      },
      {
        "date": "2024-09-28",
        "opponent": "Da Woon Jung",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/3599e9de4ae0e171",
        "nativeBoutId": "38707",
        "nativeFighterId": "262",
        "originalOpponentNumericId": "1067"
      },
      {
        "date": "2025-06-14",
        "opponent": "Alonzo Menifield",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/ec2034b134ae71cd",
        "nativeBoutId": "60288",
        "nativeFighterId": "262",
        "originalOpponentNumericId": "54"
      },
      {
        "date": "2025-09-06",
        "opponent": "Brendson Ribeiro",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/4080b4310d82b42d",
        "nativeBoutId": "60477",
        "nativeFighterId": "262",
        "originalOpponentNumericId": "263"
      },
      {
        "date": "2026-03-14",
        "opponent": "Ion Cuțelaba",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/db7694f4513120d5",
        "nativeBoutId": "60715",
        "nativeFighterId": "262",
        "originalOpponentNumericId": "115"
      },
      {
        "date": "2026-09-05",
        "opponent": "Modestas Bukauskas",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/94d411112ebe8fad",
        "nativeBoutId": "83647",
        "nativeFighterId": "262",
        "originalOpponentNumericId": "33"
      }
    ]
  },
  {
    "slug": "valter-walker",
    "name": "Valter Walker",
    "nativeId": "443",
    "statsId": "f5779a2303ed76ec",
    "official": "https://www.ufc.com/athlete/valter-walker",
    "bouts": [
      {
        "date": "2024-04-06",
        "opponent": "Lukasz Brzeski",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/ff5a8078ea85bbc7",
        "nativeBoutId": "61255",
        "nativeFighterId": "443",
        "originalOpponentNumericId": "2771"
      },
      {
        "date": "2024-08-17",
        "opponent": "Junior Tafa",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/ea4ff1d77928b029",
        "nativeBoutId": "65950",
        "nativeFighterId": "443",
        "originalOpponentNumericId": "322"
      },
      {
        "date": "2025-02-15",
        "opponent": "Don'Tale Mayes",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/3b2a24db4eeaeede",
        "nativeBoutId": "61001",
        "nativeFighterId": "443",
        "originalOpponentNumericId": "1152"
      },
      {
        "date": "2025-07-12",
        "opponent": "Kennedy Nzechukwu",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/5c650ae2193ab1bc",
        "nativeBoutId": "60838",
        "nativeFighterId": "443",
        "originalOpponentNumericId": "344"
      },
      {
        "date": "2025-10-25",
        "opponent": "Louie Sutherland",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/f2c2a49fed32bd75",
        "nativeBoutId": "60466",
        "nativeFighterId": "443",
        "originalOpponentNumericId": "437"
      },
      {
        "date": "2026-07-25",
        "opponent": "Thomas Petersen",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/d7070ab1b2144f8d",
        "nativeBoutId": "82601",
        "nativeFighterId": "443",
        "originalOpponentNumericId": "167"
      }
    ]
  }
];
const history=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],history(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave52 independently verifies three complete six-fight UFC careers from approved immutable cohort',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b.nativeBoutId))).size,18);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug),'approved 783 frozen snapshot only: '+c.slug);
  const p=register[c.slug],s=source.fighters[c.slug];
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,6);
  assert.equal(p.bouts.length,6);assert.equal(s.bouts.length,6);assert.equal(history(c).length,6);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);
  assert.equal(p.officialFighterUrl,c.official);assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
  for(const b of c.bouts){
   const {originalOpponentNumericId:otherId,...evidence}=b;
   assert.deepEqual(p.bouts.find(x=>x.nativeBoutId===b.nativeBoutId),evidence);
   const bout=cache.bouts[b.nativeBoutId];assert.equal(bout.org,'ufc');assert.equal(bout.status,'completed');
   assert.ok(Math.abs(Date.parse(bout.eventDate)-Date.parse(b.date))<=86400000);
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   const own=bout.a.id===c.nativeId?bout.a:bout.b.id===c.nativeId?bout.b:null,other=own===bout.a?bout.b:bout.a;
   assert.equal(own.slug,c.slug);assert.equal(other.id,otherId);assert.equal(other.name,b.opponent);
   assert.equal(bout.result.winnerId===own.id?'win':bout.result.winnerId===other.id?'loss':null,b.result);
   assert.ok(history(c).some(h=>h.boutId===b.nativeBoutId&&h.result===b.result&&Math.abs(Date.parse(h.date)-Date.parse(b.date))<=86400000));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave52 corrects UFC graphical result badges using official narratives and retains true complete career',()=>{
 const page=register['michael-page'],sy=register['oumar-sy'],walker=register['valter-walker'];
 assert.deepEqual(page.bouts.map(x=>x.result),['win','loss','win','win','win','win']);
 assert.deepEqual(sy.bouts.map(x=>x.result),['win','win','loss','win','loss','loss']);
 assert.deepEqual(walker.bouts.map(x=>x.result),['loss','win','win','win','win','win']);
 assert.equal(sy.bouts.find(x=>x.nativeBoutId==='60715').opponent,'Ion Cuțelaba');
 assert.equal(walker.bouts.find(x=>x.nativeBoutId==='60838').date,'2025-07-12');
 assert.equal(cache.bouts['60838'].eventDate,'2025-07-13');
 assert.equal(page.earliestOfficialUfcBout,'2024-03-09');
});
test('wave52 fails closed for removed official bout, wrong numeric fighter source and inverted winner',()=>{
 for(const c of cases){const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
