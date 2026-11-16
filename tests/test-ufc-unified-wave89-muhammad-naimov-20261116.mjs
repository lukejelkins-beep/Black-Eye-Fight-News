import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json'),census=load('ufc-36-month-candidates.json'),profile=load('ufcalendar-fighter-research.json').profiles['muhammad-naimov'],cache=load('ufcalendar-rich-progress.json'),registry=load('ufc-independent-full-career-verification.json').fighters,e=registry['muhammad-naimov'];
const history=profile.recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|dwcs/i.test(cache.bouts[h.boutId]?.event||''));
const check=x=>evaluateCareerEvidence(profile,history,census.fighters.find(f=>f.slug==='muhammad-naimov').lastUfcFight,approval.rosterAsOf,x,cache.bouts).independentlyVerified;
test('Muhammad Naimov eight UFC appearances have unique pinned Greco identities, original corner outcomes, rounds and reciprocal source proof',()=>{
assert.equal(approval.approvedFighters.length,783);assert.ok(approval.approvedFighters.includes('muhammad-naimov'));
assert.equal(e.officialUfcCareerBoutCount,8);assert.equal(e.bouts.length,8);assert.equal(history.length,8);
assert.deepEqual(e.verifiedNumericFighterIds,['313']);assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/8d11d9c13e2ccdf7');
assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');assert.equal(e.sourceVerifiedExcludedFeederBouts.length,1);
assert.match(e.sourceVerifiedExcludedFeederBouts[0].event,/Contender Series/);
const ids=new Set(),urls=new Set();
for(const b of e.bouts){assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);assert.ok(!ids.has(b.nativeBoutId));assert.ok(!urls.has(b.fightUrl));ids.add(b.nativeBoutId);urls.add(b.fightUrl);
const n=cache.bouts[b.nativeBoutId];assert.equal(n.org,'ufc');assert.ok(!/contender series|road to ufc|dwcs/i.test(n.event));assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
const own=n.a.id==='313'?n.a:n.b.id==='313'?n.b:null;assert.ok(own);assert.equal(own.slug,'muhammad-naimov');const other=own===n.a?n.b:n.a;assert.equal(other.name,b.opponent);assert.equal(n.result.winnerId===own.id?'win':'loss',b.result);
const prior=Object.entries(registry).flatMap(([slug,x])=>(x.bouts||[]).filter(z=>slug!=='muhammad-naimov'&&z.nativeBoutId===b.nativeBoutId&&z.fightUrl===b.fightUrl).map(z=>({slug,...z})));assert.equal(prior.length,1);assert.notEqual(prior[0].result,b.result);}
assert.equal(ids.size,8);assert.equal(urls.size,8);assert.equal(check(e),true);
});
test('Muhammad Naimov altered identity, missing fight, reversed result, duplicate source and fabricated native fight fail closed',()=>{
assert.equal(check({...e,bouts:e.bouts.slice(1)}),false);
assert.equal(check({...e,verifiedNumericFighterIds:['999999']}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,fightUrl:e.bouts[1].fightUrl})}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,nativeBoutId:'999999'})}),false);
});
