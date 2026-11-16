import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json'),census=load('ufc-36-month-candidates.json');
const profile=load('ufcalendar-fighter-research.json').profiles['quillan-salkilld'];
const cache=load('ufcalendar-rich-progress.json');
const e=load('ufc-independent-full-career-verification.json').fighters['quillan-salkilld'];
const history=profile.recentHistory.filter(x=>x.source==='native'&&x.promotion==='ufc'&&x.boutId&&!/contender series|road to ufc|dwcs/i.test(cache.bouts[x.boutId]?.event||''));
const strict=p=>evaluateCareerEvidence(profile,history,census.fighters.find(x=>x.slug==='quillan-salkilld').lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('Quillan source-verified six UFC victories and independent DWCS exclusion qualify only under strict career gate',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.ok(approval.approvedFighters.includes('quillan-salkilld'));
 assert.equal(history.length,6);assert.equal(e.bouts.length,6);assert.equal(e.officialUfcCareerBoutCount,6);
 assert.deepEqual(e.verifiedNumericFighterIds,['323']);
 assert.equal(e.sourceVerifiedExcludedFeederBouts.length,1);assert.equal(e.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,'83889');
 assert.match(cache.bouts['83889'].event,/Contender Series/);assert.ok(!history.some(x=>x.boutId==='83889'));
 for(const b of e.bouts){
 assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
 assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
 const n=cache.bouts[b.nativeBoutId];assert.ok([n.a.id,n.b.id].includes('323'));assert.equal(b.result,'win');
 }
 assert.equal(strict(e),true);
});
test('Quillan fail-closed gate refuses missing fight, result swap or fabricated native identity',()=>{
 assert.equal(strict({...e,bouts:e.bouts.slice(1)}),false);
 assert.equal(strict({...e,verifiedNumericFighterIds:['999999']}),false);
 const inverted=e.bouts.map((b,i)=>i===0?{...b,result:'loss'}:b);
 assert.equal(strict({...e,bouts:inverted}),false);
 assert.equal(strict({...e,bouts:[...e.bouts,{...e.bouts[0],nativeBoutId:'83889',fightUrl:'https://ufcstats.com/fight-details/0000000000000000'}]}),false);
});
