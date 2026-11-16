import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json'),census=load('ufc-36-month-candidates.json'),profile=load('ufcalendar-fighter-research.json').profiles['nora-cornolle'],cache=load('ufcalendar-rich-progress.json'),registry=load('ufc-independent-full-career-verification.json').fighters,e=registry['nora-cornolle'];
const history=profile.recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|dwcs/i.test(cache.bouts[h.boutId]?.event||''));
const check=x=>evaluateCareerEvidence(profile,history,census.fighters.find(f=>f.slug==='nora-cornolle').lastUfcFight,approval.rosterAsOf,x,cache.bouts).independentlyVerified;
test('Nora Cornolle exhaustive seven-fight UFCStats/official/native reciprocal identity source gate',()=>{
assert.equal(approval.approvedFighters.length,783);assert.ok(approval.approvedFighters.includes('nora-cornolle'));
assert.equal(history.length,7);assert.equal(e.officialUfcCareerBoutCount,7);assert.equal(e.bouts.length,7);
assert.deepEqual(e.verifiedNumericFighterIds,['481']);assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/f2b3f4ef3f780168');
assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
const ids=new Set(),urls=new Set();
for(const b of e.bouts){assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);assert.ok(!ids.has(b.nativeBoutId));assert.ok(!urls.has(b.fightUrl));ids.add(b.nativeBoutId);urls.add(b.fightUrl);
const n=cache.bouts[b.nativeBoutId];assert.equal(n.org,'ufc');assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
const own=n.a.id==='481'?n.a:n.b.id==='481'?n.b:null;assert.ok(own);assert.equal(own.slug,'nora-cornolle');const opp=own===n.a?n.b:n.a;assert.equal(opp.name,b.opponent);assert.equal(n.result.winnerId===own.id?'win':'loss',b.result);
const prior=Object.entries(registry).flatMap(([slug,x])=>(x.bouts||[]).filter(z=>slug!=='nora-cornolle'&&z.nativeBoutId===b.nativeBoutId&&z.fightUrl===b.fightUrl).map(z=>({slug,...z})));assert.equal(prior.length,1);assert.notEqual(prior[0].result,b.result);}
assert.equal(ids.size,7);assert.equal(urls.size,7);assert.equal(e.bouts.filter(b=>b.opponent==='Joselyne Edwards').length,2);assert.equal(check(e),true);
});
test('Nora Cornolle omitted, duplicated, inverted, fabricated identity and fake native ID fail closed',()=>{
assert.equal(check({...e,bouts:e.bouts.slice(1)}),false);
assert.equal(check({...e,verifiedNumericFighterIds:['999999']}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,fightUrl:e.bouts[1].fightUrl})}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,nativeBoutId:'999999'})}),false);
});
