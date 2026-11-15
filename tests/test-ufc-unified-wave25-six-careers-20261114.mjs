import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const load=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=load('data/ufc-36-month-roster-approval.json'),reg=load('data/ufc-independent-full-career-verification.json'),cache=load('data/ufcalendar-rich-progress.json'),cases=load('data/ufc-unified-wave25-six-careers-source-20261114.json').fighters;
test('wave25: source-prove 6 approved complete careers, 24 exact saved fights/opposing corners and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 let count=0;for(const [slug,c] of Object.entries(cases)){assert.ok(roster.approvedFighters.includes(slug));
 const proof=reg.fighters[slug];assert.equal(proof?.sourceCoverageAttested,true);assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/'+c.ufcStatsFighterId);
 assert.equal(proof.officialFighterUrl,c.officialFighterUrl);assert.deepEqual(proof.verifiedNumericFighterIds,[c.nativeFighterId]);
 assert.equal(proof.officialUfcCareerBoutCount,4);assert.deepEqual(proof.bouts,c.bouts);
 assert.equal(new Set(proof.bouts.map(x=>x.fightUrl)).size,4);
 for(const b of proof.bouts){const n=cache.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');
 assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
 const own=n.a?.id===c.nativeFighterId?n.a:n.b?.id===c.nativeFighterId?n.b:null,other=n.a?.id===c.nativeFighterId?n.b:n.a;
 assert.ok(own&&other&&own.slug===slug);assert.equal(other.name,b.opponent);
 assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
 assert.ok(cache.roundDone[b.nativeBoutId]>0);count++;}}
 assert.equal(count,24);
});
test('no duplicate Coria Noche UFC bout, preserve Donchenko televised TUF final and exclude exhibition',()=>{
 const a=reg.fighters['alden-coria'];if(a){assert.equal(a.bouts.filter(x=>x.nativeBoutId==='38232').length,1);assert.equal(a.bouts.find(x=>x.nativeBoutId==='83726')?.result,'loss');}
 const d=reg.fighters['daniil-donchenko'];if(d){assert.equal(d.bouts.find(x=>x.nativeBoutId==='38234')?.result,'win');assert.ok(!d.bouts.some(x=>['Matt Dixon','Richard Martins'].includes(x.opponent)));}
});
