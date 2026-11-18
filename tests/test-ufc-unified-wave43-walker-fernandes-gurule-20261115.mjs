import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const evidence=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const progress=read('ufcalendar-rich-progress.json');
const census=read('ufc-36-month-candidates.json');
const feeder=read('ufc-feeder-bout-evidence.json');
const cases=[
  {
    "slug": "julius-walker",
    "id": "498",
    "name": "Julius Walker",
    "stats": "6add18754930182b",
    "official": "https://www.ufc.com/athlete/julius-walker",
    "fights": [
      [
        "38532",
        "2025-02-22",
        "Alonzo Menifield",
        "loss",
        "c0d8a231d2f1d1af"
      ],
      [
        "60514",
        "2025-08-09",
        "Rafael Cerqueira",
        "win",
        "3d6571790c21527c"
      ],
      [
        "60730",
        "2026-02-07",
        "Dustin Jacoby",
        "loss",
        "6cca11f353a2b42d"
      ],
      [
        "66373",
        "2026-06-27",
        "Abdul Rakhman Yakhyaev",
        "loss",
        "48b1ee7ab45add4c"
      ],
      [
        "93200",
        "2026-10-10",
        "Gerald Meerschaert",
        "win",
        "eda03e3ddf74d1cd"
      ]
    ]
  },
  {
    "slug": "kaue-fernandes",
    "id": "247",
    "name": "Kaue Fernandes",
    "stats": "ec13c393d029297d",
    "official": "https://www.ufc.com/athlete/kaue-fernandes",
    "fights": [
      [
        "59996",
        "2023-11-04",
        "Marc Diakiese",
        "loss",
        "3c69bed42893da75"
      ],
      [
        "61098",
        "2024-08-03",
        "Mohammad Yahya",
        "win",
        "1cd63899011c4bf6"
      ],
      [
        "60320",
        "2025-03-22",
        "Guram Kutateladze",
        "win",
        "265dbd9be8caa7de"
      ],
      [
        "60479",
        "2025-09-06",
        "Harry Hardwick",
        "win",
        "5cd2dd6075fadcce"
      ],
      [
        "82953",
        "2026-08-15",
        "Jalin Turner",
        "loss",
        "d4bd456d70965734"
      ]
    ]
  },
  {
    "slug": "luis-gurule",
    "id": "48",
    "name": "Luis Gurule",
    "stats": "29162be25ebef5f0",
    "official": "https://www.ufc.com/athlete/luis-gurule",
    "fights": [
      [
        "60300",
        "2025-04-05",
        "Ode Osbourne",
        "loss",
        "de9422207df2de64"
      ],
      [
        "38230",
        "2025-09-13",
        "Jesus Aguilar",
        "loss",
        "3dc1a6335d890650"
      ],
      [
        "60667",
        "2026-02-21",
        "Alden Coria",
        "loss",
        "ac39c1f00ae31e58"
      ],
      [
        "66125",
        "2026-05-16",
        "Daniel Barez",
        "win",
        "b482d4452e4d0eee"
      ],
      [
        "66457",
        "2026-05-30",
        "Rei Tsuruya",
        "loss",
        "224dce2c0b03e7eb"
      ]
    ]
  }
];
const excluded='84170';
// Luis Gurule fought again at UFC 334 on 2026-11-14 (native bout 93106, split
// decision win over Bilal Hasan), the approved roster date itself. His
// certificate was researched from a UFC.com biography that still listed five
// bouts, so it is stale: the pipeline must refuse it until his six-bout
// career is re-certified from sources. Walker and Fernandes are unaffected.
const staleCertificate={slug:'luis-gurule',boutId:'93106',date:'2026-11-14',opponent:'Bilal Hasan'};
const certified=cases.filter(c=>c.slug!==staleCertificate.slug);
test('wave43 two complete source-attested UFC histories reconcile ten distinct saved numeric UFC contests',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(cases.map(x=>x.slug)).size,3);
 assert.equal(cases.reduce((n,x)=>n+x.fights.length,0),15);
 assert.equal(certified.reduce((n,x)=>n+x.fights.length,0),10);
 let seen=new Set();
 for(const c of certified){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const e=evidence[c.slug],p=profiles[c.slug];
  assert.equal(e?.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.fighterName,c.name);
  assert.equal(e.officialFighterUrl,c.official);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.stats);
  assert.equal(e.sourceSnapshot?.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(e.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.deepEqual(e.verifiedNumericFighterIds,[c.id]);
  assert.equal(e.officialUfcCareerBoutCount,c.fights.length);
  assert.equal(e.bouts.length,c.fights.length);
  const history=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==excluded);
  assert.equal(history.length,c.fights.length);
  for(const [id,date,opponent,result,fightId] of c.fights){
   assert.equal(seen.has(id),false);
   seen.add(id);
   const b=e.bouts.find(x=>x.nativeBoutId===id);
   assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId:id,nativeFighterId:c.id});
   assert.ok(history.some(x=>x.boutId===id&&x.result===result));
   const native=progress.bouts[id];
   assert.equal(native?.org,'ufc');
   assert.equal(native?.status,'completed');
   assert.ok(Math.abs(Date.parse(date)-Date.parse(native.eventDate))<=86400000);
   assert.ok(Number(progress.roundDone[id])>0);
   const own=native.a?.id===c.id?native.a:native.b?.id===c.id?native.b:null;
   assert.equal(own?.slug,c.slug);
   const other=own===native.a?native.b:native.a;
   assert.equal(other?.name,opponent);
   assert.equal(native.result?.winnerId===own.id?'win':native.result?.winnerId===other?.id?'loss':null,result);
  }
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  assert.equal(evaluateCareerEvidence(p,history,last,approval.rosterAsOf,e,progress.bouts).independentlyVerified,true);
 }
});
test('wave43: Luis Gurule certificate is stale after his roster-date UFC 334 bout and fails closed',()=>{
 const c=cases.find(x=>x.slug===staleCertificate.slug);
 const e=evidence[c.slug],p=profiles[c.slug];
 // The saved certificate is unchanged and still lists only the five earlier bouts.
 assert.equal(e.officialUfcCareerBoutCount,5);
 assert.deepEqual(e.bouts.map(x=>x.nativeBoutId),c.fights.map(x=>x[0]));
 assert.ok(!e.bouts.some(x=>x.nativeBoutId===staleCertificate.boutId));
 // The newer bout is a real, completed UFC contest on the approved roster date.
 const native=progress.bouts[staleCertificate.boutId];
 assert.equal(native?.org,'ufc');
 assert.equal(native?.status,'completed');
 assert.equal(native?.eventDate,approval.rosterAsOf);
 assert.ok([native.a?.name,native.b?.name].includes(staleCertificate.opponent));
 const history=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==excluded);
 assert.equal(history.length,c.fights.length+1);
 assert.ok(history.some(x=>x.boutId===staleCertificate.boutId&&x.date===staleCertificate.date));
 // Fail closed: a five-bout certificate can never certify a six-bout career.
 const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
 assert.equal(last,staleCertificate.date);
 assert.equal(evaluateCareerEvidence(p,history,last,approval.rosterAsOf,e,progress.bouts).independentlyVerified,false);
});
test('wave43: Luis DWCS is separately attested feeder, and alias source rows cannot make duplicate official UFC results',()=>{
 const a=progress.bouts[excluded],f=feeder.bouts.filter(x=>x.boutId===excluded&&x.fighterSlug==='luis-gurule');
 assert.equal(f.length,1);
 assert.match(a?.event,/Contender Series/);
 assert.equal(a?.result?.winnerId,'48');
 assert.equal(f[0].opponent,'Nick Piccininni');
 assert.equal(f[0].sourceUrl,'https://www.ufc.com/news/week-10-results-scorecards-dana-whites-contender-series-season-8');
 assert.ok(!evidence['luis-gurule'].bouts.some(x=>x.nativeBoutId===excluded));
 assert.equal(evidence['luis-gurule'].sourceVerifiedExcludedFeederBouts[0].nativeBoutId,excluded);
 const once=evidence['luis-gurule'].bouts.filter(x=>x.nativeBoutId==='38230');
 assert.equal(once.length,1);
 assert.equal(once[0].fightUrl,'https://ufcstats.com/fight-details/3dc1a6335d890650');
});
test('wave43 complete career gate is fail-closed on omissions, wrong winners and numeric identity substitutions',()=>{
 // Only meaningful for certificates that currently pass; Gurule's is stale (above).
 for(const c of certified){
  const e=evidence[c.slug],p=profiles[c.slug];
  const hist=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==excluded);
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=x=>evaluateCareerEvidence(p,hist,last,approval.rosterAsOf,x,progress.bouts).independentlyVerified;
  assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate({...e,verifiedNumericFighterIds:['9999999999']}),false);
  assert.equal(gate({...e,bouts:e.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
