import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planRelay,dispatchRelay,MAX_RELAY_HOP,RESEARCH_CEILING} from '../scripts/ufcalendar-relay.mjs';
import {shouldRestart} from '../scripts/ufcalendar-watchdog.mjs';

const t=new Date('2026-11-12T02:00:00.000Z');
const state={status:'connected',provider:{usedAtStart:5500,limit:30000},lastCalls:42,lastRun:'2026-11-12T01:55:00.000Z'};
test('November 2026 push can seed a bounded relay',()=>{
 const plan=planRelay({now:t,eventName:'push',progress:state,startedAt:Date.parse('2026-11-12T01:59:00Z')/1000});
 assert.equal(plan.enabled,true);assert.equal(plan.hop,1);
 assert.equal(plan.delayMs,240000);
});
test('Relay manually dispatched with continuous flag increments hop',()=>{
 const plan=planRelay({now:t,eventName:'workflow_dispatch',inputs:{continuous:'true',hop:'5'},progress:state,startedAt:Date.parse('2026-11-12T01:54:00Z')/1000});
 assert.equal(plan.enabled,true);assert.equal(plan.hop,6);assert.equal(plan.delayMs,0);
});
test('No automatic chaining for manual one-time or non-November runs',()=>{
 assert.equal(planRelay({now:t,eventName:'workflow_dispatch',progress:state}).enabled,false);
 assert.equal(planRelay({now:new Date('2026-12-01T02:00:00Z'),eventName:'push',progress:state}).enabled,false);
});
test('Bounded chain terminates and cannot recurse indefinitely',()=>{
 assert.equal(planRelay({now:t,eventName:'workflow_dispatch',inputs:{continuous:'true',hop:String(MAX_RELAY_HOP)},progress:state}).enabled,false);
 assert.equal(planRelay({now:t,eventName:'workflow_dispatch',inputs:{continuous:'true',hop:'bad'},progress:state}).enabled,false);
});
test('Provider budget guard cannot be bypassed by relay',()=>{
 for(const s of [
  {...state,status:'budget_guard'},
  {...state,provider:{usedAtStart:RESEARCH_CEILING},lastCalls:0},
  {...state,provider:{usedAtStart:RESEARCH_CEILING-4},lastCalls:5},
  {...state,provider:{}}
 ])assert.equal(planRelay({now:t,eventName:'push',progress:s}).enabled,false);
});
test('Watchdog does not duplicate active or recently completed runs',()=>{
 const stale={...state,lastRun:'2026-11-12T01:00:00Z'};
 assert.equal(shouldRestart({now:t,progress:state,runs:[]}).restart,false);
 assert.equal(shouldRestart({now:t,progress:stale,runs:[{status:'in_progress'}]}).restart,false);
 assert.equal(shouldRestart({now:t,progress:stale,runs:[{status:'queued'}]}).restart,false);
 assert.equal(shouldRestart({now:t,progress:stale,runs:[{status:'completed'}]}).restart,true);
 assert.equal(shouldRestart({now:new Date('2026-12-01T00:00:01Z'),progress:stale,runs:[]}).restart,false);
 assert.equal(shouldRestart({now:t,progress:{...stale,status:'budget_guard'},runs:[]}).restart,false);
});
test('GitHub dispatch uses tokenless input and never invokes UFCalendar',async()=>{
 let request;
 const fake=async(url,options)=>{request={url,options};return {status:204}};
 await dispatchRelay({token:'fixture',repository:'sample/project',hop:3,fetcher:fake});
 assert.match(request.url,/github\.com\/repos\/sample\/project\/actions\/workflows\//);
 assert(!request.url.includes('ufcalendar.com'));
 assert.deepEqual(JSON.parse(request.options.body),{ref:'main',inputs:{continuous:'true',hop:'3'}});
 assert.equal(request.options.method,'POST');
 assert(!request.options.body.includes('fixture'));
});
