import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),profile=read('ufcalendar-fighter-research.json').profiles['morgan-charriere'],cache=read('ufcalendar-rich-progress.json'),registry=read('ufc-independent-full-career-verification.json').fighters,e=registry['morgan-charriere'];
const history=profile.recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|dwcs/i.test(cache.bouts[h.boutId]?.event||''));
const check=x=>evaluateCareerEvidence(profile,history,census.fighters.find(f=>f.slug==='morgan-charriere').lastUfcFight,approval.rosterAsOf,x,cache.bouts).independentlyVerified;
test('Morgan Charriere official seven fight career matches independent Greco source IDs, native opponents, outcomes and saved rounds',()=>{
assert.equal(approval.approvedFighters.length,783);assert.ok(approval.approvedFighters.includes('morgan-charriere'));
assert.equal(history.length,7);assert.equal(e.officialUfcCareerBoutCount,7);assert.equal(e.bouts.length,7);
assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/5b03b61f9d90125e');assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
const ids=new Set(),urls=new Set();let independentlyNew=0;
for(const b of e.bouts){assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);assert.ok(!urls.has(b.fightUrl));assert.ok(!ids.has(b.nativeBoutId));urls.add(b.fightUrl);ids.add(b.nativeBoutId);
const n=cache.bouts[b.nativeBoutId];assert.equal(n.org,'ufc');assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
const own=n.a.id===e.verifiedNumericFighterIds[0]?n.a:n.b.id===e.verifiedNumericFighterIds[0]?n.b:null;assert.ok(own);assert.equal(own.slug,'morgan-charriere');const other=own===n.a?n.b:n.a;assert.equal(other.name,b.opponent);assert.equal(n.result.winnerId===own.id?'win':'loss',b.result);
const prior=Object.entries(registry).flatMap(([slug,x])=>(x.bouts||[]).filter(z=>slug!=='morgan-charriere'&&z.nativeBoutId===b.nativeBoutId&&z.fightUrl===b.fightUrl).map(z=>({slug,...z})));
if(b.nativeBoutId==='38704'){assert.equal(b.fightUrl,'https://ufcstats.com/fight-details/f114929ed709606e');assert.equal(prior.length,0);independentlyNew++;}
else{assert.equal(prior.length,1);assert.notEqual(prior[0].result,b.result)}
}
assert.equal(ids.size,7);assert.equal(urls.size,7);assert.equal(independentlyNew,1);assert.equal(check(e),true);
});
test('Morgan Charriere fails closed on missing Gabriel Miranda bout, duplicate source, inverted result and fabricated ID',()=>{
assert.equal(check({...e,bouts:e.bouts.filter(x=>x.nativeBoutId!=='38704')}),false);
assert.equal(check({...e,verifiedNumericFighterIds:['999999']}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,fightUrl:e.bouts[1].fightUrl})}),false);
assert.equal(check({...e,bouts:e.bouts.map((b,i)=>i?b:{...b,nativeBoutId:'999999'})}),false);
});
