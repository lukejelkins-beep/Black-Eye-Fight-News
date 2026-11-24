import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditRolling,basesFrom,validateStanding} from '../scripts/ufc-rolling-certification-audit.mjs';
import {gateContext} from '../scripts/ufc-extension-stage3-audit.mjs';
import {buildRolling,STATS_ALIASES} from '../scripts/build-ufc-v4-certified-careers.mjs';

// Owner standing rule, 24 Nov 2026: newcomers certified automatically, certified fighters rolled forward when
// UFCStats and the event's Wikipedia article agree. This re-checks the committed weekly state offline.
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const standing=read('data/ufc-standing-certification-approval.json');
const state=read('data/ufc-rolling-certification.json');
const frozen=read('data/ufc-36-month-roster-approval.json').approvedFighters;
const extension=read('data/ufc-extension-cohort-approval-20261124.json').approvedFighters;
const careers=read('data/ufc-v4-certified-careers.json');
const statsFor=slug=>{const u=new URL('../data/ufc-stats/fighters/'+slug+'.json',import.meta.url);
 return fs.existsSync(u)?JSON.parse(fs.readFileSync(u,'utf8')):null;};
const ctx=gateContext({research:read('data/ufcalendar-fighter-research.json'),progress:read('data/ufcalendar-rich-progress.json'),
 register:read('data/ufc-independent-full-career-verification.json'),feeder:read('data/ufc-feeder-bout-evidence.json'),stats:statsFor});
// The current certificates, as the committed certified list records them (the qa/ audit files are CI artefacts).
const bases={};
for(const [s,n] of Object.entries(careers.certified))bases[s]={base:'ufc-36-month-roster',through:careers.certifiedThrough,count:n};
for(const [s,n] of Object.entries(careers.extension.certified))bases[s]={base:careers.extension.cohort,through:careers.extension.certifiedThrough,count:n};
const run=(over={})=>auditRolling({standing,state,frozen,extension,bases,aliases:STATS_ALIASES,ctx,...over});
const clone=x=>structuredClone(x);
const first=Object.keys(state.careers)[0];

test('the standing approval is the owner\'s and names Wikipedia as the second source',()=>{
 assert.equal(validateStanding(standing).approvedBy,'user');
 assert.throws(()=>validateStanding({...standing,approvedBy:'bot'}));
 assert.throws(()=>validateStanding({...standing,rules:{...standing.rules,secondSource:'none'}}));
});

test('the committed weekly state passes the offline audit and matches the certified list',()=>{
 const r=run();
 assert.equal(r.lanes.exceptions.length,0,JSON.stringify(r.lanes.exceptions));
 assert.equal(r.totals.certified,Object.keys(state.careers).length);
 for(const c of r.lanes.certified){
  assert.equal(careers.rolling.certified[c.slug],c.count,c.slug);
  assert.equal(careers.rolling.certifiedThrough[c.slug],c.through,c.slug);
 }
});

test('a rolled-forward bout needs both a UFCStats link and a Wikipedia second source',()=>{
 if(!first)return;
 for(const strip of ['fightUrl','secondSourceUrl']){
  const s=clone(state);delete s.careers[first].added[0][strip];
  assert.equal(run({state:s}).lanes.exceptions[0]?.slug,first,strip);
 }
});

test('a changed base certificate, a missing profile fight or an extra bout fails closed',()=>{
 if(!first)return;
 const changed=clone(state);changed.careers[first].baseCount+=1;
 assert.ok(run({state:changed}).lanes.exceptions[0].reasons.includes('base_certificate_changed'));
 const extra=clone(state);extra.careers[first].added.push({...extra.careers[first].added[0],date:extra.careers[first].through,opponent:'Invented Person'});
 assert.ok(run({state:extra}).lanes.exceptions[0].reasons.includes('profile_fights_differ_from_rolled_bouts'));
 const late=clone(state);late.careers[first].added[0].date='2027-01-01';
 assert.ok(run({state:late}).lanes.exceptions[0].reasons.includes('added_bout_without_two_sources'));
});

test('a rolling member cannot belong to another cohort, and a newcomer passes the full gate',()=>{
 const s=clone(state);s.members[frozen[0]]={addedOn:'2026-11-24'};
 assert.throws(()=>run({state:s}),/already in another cohort/);
 const n=clone(state);n.members['made-up-fighter']={addedOn:'2026-11-24'};
 n.careers['made-up-fighter']={base:'ufc-rolling',baseThrough:'2026-11-21',baseCount:1,through:'2026-11-21',added:[]};
 assert.ok(run({state:n}).lanes.exceptions.find(e=>e.slug==='made-up-fighter').reasons.includes('no_register_entry'));
});

test('the certified list refuses a rolling audit with exceptions or for another run',()=>{
 const audit=run();
 assert.ok(buildRolling(audit,state,careers));
 assert.throws(()=>buildRolling({...audit,lanes:{...audit.lanes,exceptions:[{slug:'x',reasons:['y']}]}},state,careers),/exceptions/);
 assert.throws(()=>buildRolling(audit,{...state,lastRun:'1999-01-01'},careers),/committed state/);
 if(first)assert.throws(()=>buildRolling({...audit,lanes:{...audit.lanes,certified:[{slug:first,count:1,through:'2026-11-21'}]}},state,{...careers,certified:{[first]:5}}),/fewer fights/);
});

test('bases come from the 783 queue and the extension audit',()=>{
 const b=basesFrom({lanes:{certified:[{slug:'a',knownUfcBouts:3}]}},{summary:{certificationEvidenceCutoff:'2026-11-14'}},
  {cohort:'ext',evidenceCutoff:'2026-11-24',lanes:{certified:[{slug:'b',knownUfcBouts:2}]}});
 assert.deepEqual(b,{a:{base:'ufc-36-month-roster',through:'2026-11-14',count:3},b:{base:'ext',through:'2026-11-24',count:2}});
});
