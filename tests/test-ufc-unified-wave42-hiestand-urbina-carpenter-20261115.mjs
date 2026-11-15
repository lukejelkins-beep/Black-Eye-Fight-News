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
    "slug": "brady-hiestand",
    "id": "759",
    "name": "Brady Hiestand",
    "official": "https://www.ufc.com/athlete/brady-hiestand",
    "stats": "7af33fc4435017f1",
    "fights": [
      [
        "66292",
        "2021-08-28",
        "Ricky Turcios",
        "loss",
        "ed64e42263bf50bf"
      ],
      [
        "59788",
        "2022-11-19",
        "Fernie Garcia",
        "win",
        "a3696c847ef6c7f9"
      ],
      [
        "61282",
        "2023-04-22",
        "Batgerel Danaa",
        "win",
        "277233ca9ea25674"
      ],
      [
        "61057",
        "2024-06-15",
        "Garrett Armfield",
        "win",
        "fea3a0643218e16b"
      ],
      [
        "85943",
        "2026-09-26",
        "Rinya Nakamura",
        "win",
        "29423f522e76f12e"
      ]
    ]
  },
  {
    "slug": "gilbert-urbina",
    "id": "758",
    "name": "Gilbert Urbina",
    "official": "https://www.ufc.com/athlete/gilbert-urbina",
    "stats": "b12fb759e02378de",
    "fights": [
      [
        "66291",
        "2021-08-28",
        "Bryan Battle",
        "loss",
        "5086f9fb4fdc2f60"
      ],
      [
        "61327",
        "2023-05-20",
        "Orion Cosce",
        "win",
        "7d583e4002622848"
      ],
      [
        "59856",
        "2024-02-03",
        "Charles Radtke",
        "loss",
        "330d86bfaa4155fe"
      ],
      [
        "60517",
        "2025-08-09",
        "Uros Medic",
        "loss",
        "7d923267c44dd93b"
      ],
      [
        "66468",
        "2026-08-01",
        "Vlasto Cepo",
        "win",
        "7ecb154439aca0f9"
      ]
    ]
  },
  {
    "slug": "clayton-carpenter",
    "id": "25",
    "name": "Clayton Carpenter",
    "official": "https://www.ufc.com/athlete/clayton-carpenter",
    "stats": "b62d5280966b2460",
    "fights": [
      [
        "59704",
        "2023-02-18",
        "Juancamilo Ronderos",
        "win",
        "40781a64c4cea877"
      ],
      [
        "61127",
        "2024-10-12",
        "Lucas Rocha",
        "win",
        "de484433eef22e1d"
      ],
      [
        "60953",
        "2025-01-18",
        "Tagir Ulanbekov",
        "loss",
        "e294a1e5723011db"
      ],
      [
        "65893",
        "2025-10-11",
        "Jafel Filho",
        "loss",
        "766b0b26c40525de"
      ],
      [
        "66062",
        "2026-05-09",
        "Jose Ochoa",
        "loss",
        "e92d89cb2d69235e"
      ]
    ]
  }
];
const feederId='83955';
test('wave42: three distinct full UFC careers have exact 15 pinned source fights, measured native identities and results',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(cases.map(c=>c.slug)).size,3);
 assert.equal(cases.reduce((n,c)=>n+c.fights.length,0),15);
 const allIds=new Set();
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const e=evidence[c.slug],profile=profiles[c.slug];
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
  const history=profile.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==feederId);
  assert.equal(history.length,c.fights.length);
  for(const [id,date,opponent,result,source] of c.fights){
   assert.equal(allIds.has(id),false);
   allIds.add(id);
   const b=e.bouts.find(x=>x.nativeBoutId===id);
   assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+source,nativeBoutId:id,nativeFighterId:c.id});
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
  assert.equal(evaluateCareerEvidence(profile,history,last,approval.rosterAsOf,e,progress.bouts).independentlyVerified,true);
 }
});
test('wave42: TUF 29 televised official finals included, house bouts excluded, and Clayton DWCS contract bout not counted',()=>{
 assert.ok(evidence['brady-hiestand'].bouts.some(x=>x.nativeBoutId==='66292'&&x.result==='loss'));
 assert.ok(evidence['gilbert-urbina'].bouts.some(x=>x.nativeBoutId==='66291'&&x.result==='loss'));
 assert.equal(feeder.bouts.filter(x=>x.boutId===feederId&&x.fighterSlug==='clayton-carpenter').length,1);
 const native=progress.bouts[feederId],entry=feeder.bouts.find(x=>x.boutId===feederId&&x.fighterSlug==='clayton-carpenter');
 assert.match(native.event,/Contender Series/);
 assert.equal(native.a?.id,'88');
 assert.equal(native.b?.id,'25');
 assert.equal(native.result.winnerId,'25');
 assert.equal(entry.opponent,'Édgar Cháirez');
 assert.equal(entry.sourceUrl,'https://www.ufc.com/news/season-6-week-3-results-dana-whites-contender-series');
 assert.ok(!evidence['clayton-carpenter'].bouts.some(x=>x.nativeBoutId===feederId));
 assert.equal(evidence['clayton-carpenter'].sourceVerifiedExcludedFeederBouts[0].nativeBoutId,feederId);
});
test('wave42: omitted or changed results / IDs cannot pass independent full-career source gate',()=>{
 for(const c of cases){
  const e=evidence[c.slug],p=profiles[c.slug];
  const hist=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf&&x.boutId!==feederId);
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=x=>evaluateCareerEvidence(p,hist,last,approval.rosterAsOf,x,progress.bouts).independentlyVerified;
  assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate({...e,verifiedNumericFighterIds:['999999999999']}),false);
  assert.equal(gate({...e,bouts:e.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
