import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approved=read('ufc-36-month-roster-approval.json');
const register=read('ufc-independent-full-career-verification.json').fighters;
const profile=read('ufcalendar-fighter-research.json').profiles['mairon-santos'];
const cache=read('ufcalendar-rich-progress.json');
const census=read('ufc-36-month-candidates.json');
const expected=[
 ['60230','2024-08-24','Kaan Ofli','win','bad06a5380d762b8'],
 ['60329','2025-03-08','Francis Marshall','win','19fe7177254802d1'],
 ['60842','2025-05-17','Sodiq Yusuff','win','dcb27eef6441268c'],
 ['60533','2025-12-06','Muhammad Naimov','win','40fa4f8b4b93884e']
];
test('Mairon full official UFC career has exactly four attested bouts and pinned measured native corners',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.ok(approved.approvedFighters.includes('mairon-santos'));
 const proof=register['mairon-santos'],kaan=register['kaan-ofli'];
 assert.equal(proof?.sourceCoverageAttested,true);
 assert.equal(proof.scope,'complete_official_ufc_career');
 assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(proof.officialFighterUrl,'https://www.ufc.com/athlete/mairon-santos-alves');
 assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/480779d7f9a424d3');
 assert.equal(proof.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
 assert.deepEqual(proof.verifiedNumericFighterIds,['306']);
 assert.equal(proof.officialUfcCareerBoutCount,4);
 assert.equal(proof.bouts.length,4);
 assert.equal(new Set(proof.bouts.map(x=>x.nativeBoutId)).size,4);
 assert.deepEqual(proof.sourceVerifiedExcludedFeederBouts,[]);
 const history=profile.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf);
 assert.equal(history.length,4);
 for(const [id,date,opponent,result,source] of expected){
  const b=proof.bouts.find(x=>x.nativeBoutId===id);
  assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+source,nativeBoutId:id,nativeFighterId:'306'});
  const n=cache.bouts[id];
  assert.equal(n?.org,'ufc');
  assert.equal(n?.status,'completed');
  assert.ok(Math.abs(Date.parse(date)-Date.parse(n.eventDate))<=86400000);
  assert.ok(Number(cache.roundDone[id])>0);
  assert.ok(history.some(x=>x.boutId===id&&x.result===result));
  const own=n.a?.id==='306'?n.a:n.b?.id==='306'?n.b:null;
  assert.equal(own?.slug,'mairon-santos');
  const other=own===n.a?n.b:n.a;
  assert.equal(other?.name,opponent);
  assert.equal(n.result?.winnerId,own.id);
 }
 assert.equal(cache.bouts['60533'].eventDate,'2025-12-07');
 assert.equal(cache.bouts['60230'].event,'UFC Fight Night: Cannonier vs Borralho');
 assert.ok(kaan.bouts.some(x=>x.nativeBoutId==='60230'&&x.fightUrl===proof.bouts[0].fightUrl&&x.result==='loss'));
 const last=census.fighters.find(x=>x.slug==='mairon-santos')?.lastUfcFight;
 assert.equal(evaluateCareerEvidence(profile,history,last,approved.rosterAsOf,proof,cache.bouts).independentlyVerified,true);
});
test('Mairon certificate fails closed if one native bout, its official result or fighter ID changes',()=>{
 const e=register['mairon-santos'],history=profile.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf),last=census.fighters.find(x=>x.slug==='mairon-santos')?.lastUfcFight;
 const gate=x=>evaluateCareerEvidence(profile,history,last,approved.rosterAsOf,x,cache.bouts).independentlyVerified;
 assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
 assert.equal(gate({...e,verifiedNumericFighterIds:['999999999999']}),false);
 assert.equal(gate({...e,bouts:e.bouts.map((x,i)=>i===1?{...x,result:'loss'}:x)}),false);
});
