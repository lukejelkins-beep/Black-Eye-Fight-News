import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Research-only: no certification until full exact-HEAD 783-person Stage3 CI is successful.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const p=read('ufcalendar-fighter-research.json').profiles['marcin-tybura'];
const proof=read('ufc-independent-full-career-verification.json').fighters['marcin-tybura'];
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const history=p.recentHistory.filter(h=>h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc');
const gate=x=>evaluateCareerEvidence(p,history,history.map(z=>z.date).sort().at(-1),'2026-11-15',x,rich.bouts,approval.rosterAsOf).independentlyVerified;
test('Marcin Tybura: full 25-bout source/native fighter identity, results, rounds and pinned Romanov alias',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.ok(approval.approvedFighters.includes('marcin-tybura'));
 assert.equal(proof.sourceCoverageAttested,true);assert.equal(proof.scope,'complete_official_ufc_career');
 assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(proof.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
 assert.deepEqual(proof.verifiedNumericFighterIds,['264']);
 assert.equal(history.length,25);assert.equal(proof.officialUfcCareerBoutCount,25);assert.equal(proof.bouts.length,25);
 assert.equal(proof.bouts.filter(x=>x.result==='win').length,14);
 assert.equal(proof.bouts.filter(x=>x.result==='loss').length,11);
 assert.equal(new Set(proof.bouts.map(x=>x.nativeBoutId)).size,25);
 assert.equal(new Set(proof.bouts.map(x=>x.fightUrl)).size,25);
 for(const b of proof.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const bout=rich.bouts[b.nativeBoutId];
   assert.equal(bout?.org,'ufc');assert.ok(bout?.a?.id&&bout?.b?.id);
   assert.equal(b.nativeFighterId,'264');assert.ok(Number(rich.roundDone[b.nativeBoutId])>0);
   assert.equal(history.filter(h=>String(h.boutId)===b.nativeBoutId&&h.result===b.result).length,1);
 }
 const romanov=proof.bouts.find(x=>x.date==='2022-08-20');
 assert.equal(romanov.opponent,'Alexandr Romanov');
 assert.deepEqual(romanov.sourceVerifiedNativeOpponentAliases,['Alexander Romanov']);
 assert.deepEqual(romanov.verifiedOpponentNativeFighterIds,['6784']);
 assert.equal(romanov.officialAliasSourceUrl,'https://www.ufc.com/news/official-scorecards-ufc-278-usman-vs-edwards-2-salt-lake-city');
 assert.equal(gate(proof),true);
});
test('Tybura strict Stage3 fails closed on missing, duplicate, altered outcome, fake native identity or fabricated alias corner',()=>{
 assert.equal(gate(proof),true);
 const missing=structuredClone(proof);missing.bouts.pop();assert.equal(gate(missing),false);
 const duplicate=structuredClone(proof);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;assert.equal(gate(duplicate),false);
 const flipped=structuredClone(proof);flipped.bouts[0].result=flipped.bouts[0].result==='win'?'loss':'win';assert.equal(gate(flipped),false);
 const fake=structuredClone(proof);fake.verifiedNumericFighterIds=['999999'];assert.equal(gate(fake),false);
 const wrongAlias=structuredClone(proof);wrongAlias.bouts.find(x=>x.date==='2022-08-20').verifiedOpponentNativeFighterIds=['999999'];assert.equal(gate(wrongAlias),false);
});
