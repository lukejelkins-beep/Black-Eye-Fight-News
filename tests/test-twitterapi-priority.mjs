import assert from 'node:assert/strict';
import fs from 'node:fs';
import {X_POLICY,xAccounts,accountGroups,priorityNames,priorityGroups,reservePlan,finalizeLedger} from '../scripts/twitterapi-io-core.mjs';
const config=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8'));
const accounts=xAccounts(config);
const target=accounts.find(a=>a.role==='fighter');
const now=Date.parse('2026-11-21T09:00:00Z');
const upcoming={events:[
 {date:'2026-11-25',bouts:[{fighters:[target.name,'Nobody Tracked']}]},
 {date:'2026-12-20',bouts:[{fighters:['Far Future Person']}]},
 {date:'2026-10-01',bouts:[{fighters:['Long Past Person']}]}]};
const results={results:[{date:'2026-11-19',fighters:[{name:'Recent Winner'}]},{date:'2026-11-01',fighters:[{name:'Old Winner'}]}]};
const names=priorityNames(upcoming,results,now);
assert(names.has(target.name.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')));
assert(names.has('recentwinner'),'fighters from the last 3 days count');
assert(!names.has('oldwinner')&&!names.has('farfutureperson')&&!names.has('longpastperson'),'only the window counts');
const pg=priorityGroups(config,names);
assert.equal(pg.length,1);
assert(pg[0].every(a=>a.name===target.name||names.size>0));
assert.deepEqual(priorityGroups(config,new Set()),[]);
assert.deepEqual(priorityGroups(config,null),[]);
// Small priority list (1 account): every fourth call, budget unchanged
let r=reservePlan(null,config,now,true,names);
assert.equal(r.reason,'reserved');assert.equal(r.pending.priority,true);
assert.deepEqual(r.pending.handles,pg[0].map(a=>a.username));
assert.equal(r.state.reservedMicroUsd,X_POLICY.maxReservedMicroUsdPerRequest,'a priority call costs the same reservation');
let ledger=finalizeLedger(r.state,{result:{ok:true},at:new Date(now).toISOString()});
const seq=[];let t0=now;
for(let i=0;i<4;i++){t0+=90*60000;r=reservePlan(ledger,config,t0,true,names);seq.push(!!r.pending.priority);ledger=finalizeLedger(r.state,{result:{ok:true},at:new Date(t0).toISOString()})}
assert.deepEqual(seq,[false,false,false,true],'attempts 1-3 rotate normally, attempt 4 is priority again');
// Large priority list (8+ accounts): every second call
const many=new Set(accounts.filter(a=>a.role==='fighter').slice(0,8).map(a=>a.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')));
assert.equal(priorityGroups(config,many).length,1);assert.equal(priorityGroups(config,many)[0].length,8);
let l2=null;const seq2=[];t0=now;
for(let i=0;i<4;i++){const p2=reservePlan(l2,config,t0,true,many);seq2.push(!!p2.pending.priority);l2=finalizeLedger(p2.state,{result:{ok:true},at:new Date(t0).toISOString()});t0+=90*60000}
assert.deepEqual(seq2,[true,false,true,false]);
assert.equal(reservePlan(null,config,now,true,many).pending.groupIndex,0);
// No priority names: behaves as before
const plain=reservePlan(null,config,now,true,null);
assert.equal(plain.pending.priority,undefined);assert.equal(plain.pending.groupIndex,0);
// Budget cap still wins over priority
const full={...plain.state,pending:null,reservedMicroUsd:X_POLICY.internalMonthlyReserveMicroUsd,lastReservedAt:null};
assert.equal(reservePlan(full,config,now+1e7,true,names).reason,'monthly-budget');
console.log('X priority ordering: window, alternation, unchanged budget and cap passed.');
