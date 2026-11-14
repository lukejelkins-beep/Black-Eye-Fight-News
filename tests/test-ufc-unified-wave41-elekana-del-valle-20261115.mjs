import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const evidence=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const progress=read('ufcalendar-rich-progress.json');
const census=read('ufc-36-month-candidates.json');
const feeder=read('ufc-feeder-bout-evidence.json');
const cases=[
  {
    "slug": "billy-elekana",
    "name": "Billy Elekana",
    "id": "84",
    "stats": "07a74004d964c7f4",
    "official": "https://www.ufc.com/athlete/billy-elekana",
    "fights": [
      [
        "60948",
        "2025-01-18",
        "Bogdan Guskov",
        "loss",
        "a6db8eb1fb3eebf2"
      ],
      [
        "60826",
        "2025-07-26",
        "Ibo Aslan",
        "win",
        "f9dac7702609669f"
      ],
      [
        "60424",
        "2025-11-01",
        "Kevin Christian",
        "win",
        "f063bcccbbb9edc5"
      ],
      [
        "65852",
        "2026-01-31",
        "Junior Tafa",
        "win",
        "d94f1b32a81e3fa1"
      ],
      [
        "93276",
        "2026-11-07",
        "Lucas Fernando",
        "loss",
        "1955773d3e42a616"
      ]
    ]
  },
  {
    "slug": "yadier-del-valle",
    "name": "Yadier del Valle",
    "id": "412",
    "stats": "70380ccdc81915b8",
    "official": "https://www.ufc.com/athlete/yadier-del-valle",
    "fights": [
      [
        "60847",
        "2025-05-17",
        "Connor Matthews",
        "win",
        "d6e2bc6e6c0cc4fe"
      ],
      [
        "60421",
        "2025-11-01",
        "Isaac Dulgarian",
        "win",
        "767b78b67c7da17c"
      ],
      [
        "60671",
        "2026-02-21",
        "Jordan Leavitt",
        "loss",
        "5b97f47cdd355cbe"
      ],
      [
        "83257",
        "2026-08-08",
        "Darren Elkins",
        "win",
        "06bfde3e3577906f"
      ]
    ]
  }
];
const exempt='84171';
test('wave41 two exhaustive sourced UFC careers have nine exact original measured native fight identities and no duplicate certification',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(cases.map(x=>x.slug)).size,2);
 assert.equal(cases.reduce((n,c)=>n+c.fights.length,0),9);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const e=evidence[c.slug],p=profiles[c.slug];
  assert.equal(e?.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.fighterName,c.name);
  assert.equal(e.officialFighterUrl,c.official);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.stats);
  assert.equal(e.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.deepEqual(e.verifiedNumericFighterIds,[c.id]);
  assert.equal(e.officialUfcCareerBoutCount,c.fights.length);
  assert.equal(e.bouts.length,c.fights.length);
  const history=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==exempt);
  assert.equal(history.length,c.fights.length);
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,c.fights.length);
  assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,c.fights.length);
  for(const [nativeBoutId,date,opponent,result,fightId] of c.fights){
   const b=e.bouts.find(x=>x.nativeBoutId===nativeBoutId);
   assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId,nativeFighterId:c.id});
   assert.ok(history.some(x=>x.boutId===nativeBoutId&&x.result===result));
   const n=progress.bouts[nativeBoutId];
   assert.equal(n?.org,'ufc');
   assert.equal(n?.status,'completed');
   assert.ok(Math.abs(Date.parse(date)-Date.parse(n.eventDate))<=86400000);
   assert.ok(Number(progress.roundDone[nativeBoutId])>0);
   const own=n.a?.id===c.id?n.a:n.b?.id===c.id?n.b:null;
   assert.equal(own?.slug,c.slug);
   const other=own===n.a?n.b:n.a;
   assert.equal(other?.name,opponent);
   assert.equal(n.result?.winnerId===own.id?'win':n.result?.winnerId===other?.id?'loss':null,result);
  }
  const latest=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  assert.equal(evaluateCareerEvidence(p,history,latest,approval.rosterAsOf,e,progress.bouts).independentlyVerified,true);
 }
});
test('source-verified DWCS native 84171 excluded from Yadier full UFC career, but original result retained',()=>{
 const b=progress.bouts[exempt];
 assert.equal(b.a.id,'31415');
 assert.equal(b.b.id,'412');
 assert.equal(b.result.winnerId,'412');
 assert.match(b.event,/Contender Series/);
 assert.equal(feeder.bouts.filter(x=>x.boutId===exempt&&x.fighterSlug==='yadier-del-valle').length,1);
 const entry=feeder.bouts.find(x=>x.boutId===exempt&&x.fighterSlug==='yadier-del-valle');
 assert.equal(entry?.opponent,'Antônio Monteiro');
 assert.equal(entry.sourceUrl,'https://www.ufc.com/news/week-10-results-scorecards-dana-whites-contender-series-season-8');
 assert.ok(!evidence['yadier-del-valle'].bouts.some(x=>x.nativeBoutId===exempt));
 assert.equal(evidence['yadier-del-valle'].sourceVerifiedExcludedFeederBouts[0].nativeBoutId,exempt);
});
test('wave41 independent stage3 source gate fails closed on omitted fight, changed result or native identity',()=>{
 for(const c of cases){
  const e=evidence[c.slug],p=profiles[c.slug];
  const history=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==exempt);
  const latest=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=x=>evaluateCareerEvidence(p,history,latest,approval.rosterAsOf,x,progress.bouts).independentlyVerified;
  assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate({...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate({...e,bouts:e.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
