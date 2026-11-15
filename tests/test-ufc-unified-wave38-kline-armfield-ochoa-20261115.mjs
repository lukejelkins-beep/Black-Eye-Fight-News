import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const roster=read('ufc-36-month-roster-approval.json');
const independent=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const native=read('ufcalendar-rich-progress.json');
const census=read('ufc-36-month-candidates.json');
const sourceCommit='c742842f29466758fedc3906dbad28d6d320a8da';
const sourceSha='699c9b6cebb542bf458807563d93ed2406d8728f';

const cases=[
 {slug:'fatima-kline',name:'Fatima Kline',nativeFighterId:'389',
  official:'https://www.ufc.com/athlete/fatima-kline',fighterId:'745fa7b605f8e2da',
  bouts:[
   ['61072','2024-07-13','Jasmine Jasudavicius','loss','582afc25875911d1'],
   ['60353','2025-01-11','Viktoriia Dudakova','win','f01851055b8309e0'],
   ['60840','2025-07-12','Melissa Martinez','win','120d66cb0da0f3c3'],
   ['38206','2025-11-15','Angela Hill','win','6c2c6a6e3f4d04db'],
   ['82921','2026-07-18','Tabatha Ricci','win','52ddf20a10890b41']]},
 {slug:'garrett-armfield',name:'Garrett Armfield',nativeFighterId:'2800',
  official:'https://www.ufc.com/athlete/garrett-armfield',fighterId:'1effd880e1f1bb30',
  bouts:[
   ['61500','2022-07-09','David Onama','loss','a652918360fe9a72'],
   ['52440','2023-08-26','Toshiomi Kazama','win','48231fbd1af53674'],
   ['59869','2024-01-20','Brad Katona','win','670e4754d8d3d172'],
   ['61057','2024-06-15','Brady Hiestand','loss','fea3a0643218e16b'],
   ['61138','2024-11-02','Serhiy Sidey','loss','f93b074dfd47b4b4']]},
 {slug:'jose-ochoa',name:'Jose Ochoa',nativeFighterId:'26',
  official:'https://www.ufc.com/athlete/jose-ochoa',fighterId:'88be62d6c1e6dadb',
  bouts:[
   ['66436','2024-11-23',"Lone'er Kavanagh",'loss','38f1c83c19e99fa2'],
   ['60292','2025-06-14','Cody Durden','win','b39b8ff0d7de211a'],
   ['60820','2025-07-26','Asu Almabayev','loss','887c61da1a78a5e1'],
   ['66062','2026-05-09','Clayton Carpenter','win','e92d89cb2d69235e']]}
];

test('three new distinct complete UFC careers preserve exact primary source provenance and paired measured native fights',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(cases.map(x=>x.slug)).size,3);
 assert.equal(cases.reduce((n,x)=>n+x.bouts.length,0),14);
 const allBouts=new Set();
 for(const c of cases){
  assert.ok(roster.approvedFighters.includes(c.slug));
  const e=independent[c.slug],p=profiles[c.slug];
  assert.equal(e?.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.fighterName,c.name);
  assert.equal(e.officialFighterUrl,c.official);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.fighterId);
  assert.equal(e.sourceSnapshot?.sourceCommit,sourceCommit);
  assert.equal(e.sourceSnapshot?.fightResultsBlobSha,sourceSha);
  assert.deepEqual(e.verifiedNumericFighterIds,[c.nativeFighterId]);
  assert.equal(e.officialUfcCareerBoutCount,c.bouts.length);
  assert.equal(e.bouts.length,c.bouts.length);
  assert.deepEqual(e.sourceVerifiedExcludedFeederBouts,[]);
  const observed=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf);
  assert.equal(observed.length,c.bouts.length);
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,c.bouts.length);
  assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,c.bouts.length);
  for(const [id,day,opponent,outcome,source] of c.bouts){
   const b=e.bouts.find(x=>x.nativeBoutId===id);
   assert.deepEqual(b,{date:day,opponent,result:outcome,
    fightUrl:'https://ufcstats.com/fight-details/'+source,
    nativeBoutId:id,nativeFighterId:c.nativeFighterId});
   assert.ok(!allBouts.has(id),'not permitted to silently duplicate a native UFC fight in this certification wave');
   allBouts.add(id);
   assert.ok(observed.some(x=>x.boutId===id&&x.result===outcome));
   const saved=native.bouts[id];
   assert.equal(saved?.org,'ufc');
   assert.equal(saved?.status,'completed');
   assert.ok(!/contender series|road to ufc|\\bdwcs\\b/i.test(saved.event));
   assert.ok(Math.abs(Date.parse(day)-Date.parse(saved.eventDate))<=86400000);
   assert.ok(Number(native.roundDone[id])>0);
   const own=saved.a?.id===c.nativeFighterId?saved.a:saved.b?.id===c.nativeFighterId?saved.b:null;
   assert.equal(own?.slug,c.slug);
   const other=own===saved.a?saved.b:saved.a;
   assert.equal(other?.name,opponent);
   assert.equal(saved.result?.winnerId===own.id?'win':saved.result?.winnerId===other?.id?'loss':null,outcome);
  }
  const rosterLast=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  assert.equal(evaluateCareerEvidence(p,observed,rosterLast,roster.rosterAsOf,e,native.bouts).independentlyVerified,true);
 }
});

test('three strict certifications are fail-closed if any bout, identity or result is changed',()=>{
 for(const c of cases){
  const e=independent[c.slug],p=profiles[c.slug];
  const observed=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf);
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=proof=>evaluateCareerEvidence(p,observed,last,roster.rosterAsOf,proof,native.bouts).independentlyVerified;
  assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate({...e,verifiedNumericFighterIds:['999999999999']}),false);
  assert.equal(gate({...e,bouts:e.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
