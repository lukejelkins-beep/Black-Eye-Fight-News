import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const native=read('ufcalendar-rich-progress.json');
const profile=read('ufcalendar-fighter-research.json').profiles['mohammed-usman'];
const proof=read('ufc-independent-full-career-verification.json').fighters['mohammed-usman'];
const expected=[
 ['2025-06-21','Hamdy Abdelwahab','win','60282','a12d3a6c8aaf87ca','445'],
 ['2024-07-20','Thomas Petersen','loss','65933','836e9bc5c1f6acd3','167'],
 ['2024-03-23','Mick Parkin','loss','39004','3223b7e196a07224','2819'],
 ['2023-09-23','Jake Collier','win','60039','49ede01b061cfae3','961'],
 ['2023-04-22','Junior Tafa','win','61280','8beab5f941dae8e0','322'],
 ['2022-08-06','Zac Pauga','win','59549','36f38c2534ef646b','2778']
];
const history=profile.recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const check=p=>evaluateCareerEvidence(profile,history,
 census.fighters.find(x=>x.slug==='mohammed-usman')?.lastUfcFight,
 approval.rosterAsOf,p,native.bouts).independentlyVerified;

test('Mohammed Usman: full six-bout UFC career certified only through strict source/native/round gate',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.ok(approval.approvedFighters.includes('mohammed-usman'));
 assert.equal(profile.name,'Mohammed Usman');
 assert.equal(proof.officialFighterUrl,'https://www.ufc.com/athlete/mohammed-usman');
 assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/da7f113b5ea39c43');
 assert.equal(proof.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
 assert.deepEqual(proof.verifiedNumericFighterIds,['2799']);
 assert.equal(proof.sourceCoverageAttested,true);
 assert.equal(proof.officialUfcCareerBoutCount,6);
 assert.equal(proof.bouts.length,6);
 assert.equal(history.length,6);
 for(const [date,opponent,result,boutId,sourceId,opponentId] of expected){
   const attested=proof.bouts.find(b=>b.nativeBoutId===boutId);
   assert.deepEqual(attested,{date,opponent,result,
    fightUrl:'https://ufcstats.com/fight-details/'+sourceId,
    nativeBoutId:boutId,nativeFighterId:'2799'});
   const saved=native.bouts[boutId];
   assert.equal(saved.org,'ufc');assert.equal(saved.status,'completed');
   assert.equal(saved.eventDate,date);
   const own=saved.a.id==='2799'?saved.a:saved.b.id==='2799'?saved.b:null;
   assert.ok(own);assert.equal(own.slug,'mohammed-usman');
   const other=own===saved.a?saved.b:saved.a;
   assert.equal(other.name,opponent);assert.equal(other.id,opponentId);
   assert.equal(saved.result.winnerId===own.id?'win':saved.result.winnerId===other.id?'loss':null,result);
   assert.ok(Number(native.roundDone[boutId])>0);
   assert.equal(history.filter(h=>h.boutId===boutId&&h.date===date&&h.result===result).length,1);
 }
 assert.equal(check(proof),true);
});

test('Mohammed Usman: TUF 30 final is included, unrelated feeder/exhibitions not manufactured',()=>{
 assert.ok(proof.bouts.some(b=>b.date==='2022-08-06'&&b.opponent==='Zac Pauga'));
 assert.ok(proof.bouts.every(b=>/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/.test(b.fightUrl)));
 assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,6);
 assert.equal(proof.bouts.filter(b=>b.result==='win').length,4);
 assert.equal(proof.bouts.filter(b=>b.result==='loss').length,2);
 assert.equal(proof.bouts.some(b=>b.date<'2022-08-06'),false);
});

test('Mohammed Usman: changed result, missing fight and mismatched native fighter ID must fail closed',()=>{
 for(const mutation of [
  p=>{p.bouts.pop();},
  p=>{p.bouts[0].result='loss';},
  p=>{p.bouts[0].nativeFighterId='999999';}
 ]){
  const bad=structuredClone(proof);mutation(bad);
  assert.equal(check(bad),false);
 }
});
