import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const reg=load('ufc-independent-full-career-verification.json').fighters['paul-craig'];
const profile=load('ufcalendar-fighter-research.json').profiles['paul-craig'];
const progress=load('ufcalendar-rich-progress.json');
const rows=profile.recentHistory.filter(r=>r.promotion==='ufc');
const pass=(history=rows,evidence=reg)=>evaluateCareerEvidence(profile,history,
 '2025-09-06','2026-11-15',evidence,progress.bouts,'2026-11-14').independentlyVerified;
test('Paul Craig official 21-bout record: 9 wins 10 losses 1 draw and 1 no contest',()=>{
 assert.equal(rows.length,21);
 assert.equal(reg.bouts.length,21);
 for(const [outcome,count] of Object.entries({win:9,loss:10,draw:1,no_contest:1})){
  assert.equal(rows.filter(r=>r.result===outcome).length,count);
  assert.equal(reg.bouts.filter(r=>r.result===outcome).length,count);
 }
 assert.equal(reg.bouts.filter(b=>b.opponent==='Mauricio Rua').length,2);
 assert.equal(pass(),true);
});
test('Paul Craig certification fails for missing, duplicated, inverted or invented official contests',()=>{
 const edits=[
  r=>r.slice(1),r=>[...r,r[0]],
  r=>r.map((x,i)=>i===5?{...x,result:'loss'}:x),
  r=>r.map((x,i)=>i===6?{...x,opponent:'Unknown opponent'}:x)
 ];
 for(const edit of edits)assert.equal(pass(edit(rows)),false);
 for(const source of [
  {...reg,sourceCoverageAttested:false},
  {...reg,bouts:reg.bouts.slice(1)},
  {...reg,bouts:[reg.bouts[0],...reg.bouts.slice(0,-1)]},
  {...reg,officialFighterUrl:'https://example.test/paul'},
  {...reg,fighterName:'Not Paul Craig'}
 ])assert.equal(pass(rows,source),false);
});
test('Paul Craig UFC fights remain valid without optional round measurements or original IDs',()=>{
 const stripped={...reg,bouts:reg.bouts.map(({nativeBoutId,nativeFighterId,fightUrl,...b})=>b)};
 assert.equal(pass(rows,stripped),true);
 assert.equal(pass(rows.map(({boutId,...r})=>r),stripped),true);
});
