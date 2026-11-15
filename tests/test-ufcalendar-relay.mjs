import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planRelay,dispatchRelay,getCollectorRuns,activeCollectorRun,MAX_RELAY_HOP,RESEARCH_CEILING} from '../scripts/ufcalendar-relay.mjs';
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
 assert.deepEqual(JSON.parse(request.options.body),{ref:'main',inputs:{continuous:'true',hop:'3',source_run_id:'',checkpoint_sha:''}});
 assert.equal(request.options.method,'POST');
 assert(!request.options.body.includes('fixture'));
});

test('Relay records the source run and committed checkpoint without a paid request',async()=>{
 let request;
 const fetcher=async(url,options)=>{request={url,options};return {status:204}};
 const sha='a'.repeat(40);
 await dispatchRelay({token:'fixture',repository:'sample/project',hop:6,sourceRunId:'123',checkpointSha:sha,fetcher});
 assert.deepEqual(JSON.parse(request.options.body).inputs,{continuous:'true',hop:'6',source_run_id:'123',checkpoint_sha:sha});
 await assert.rejects(dispatchRelay({token:'fixture',repository:'sample/project',hop:6,sourceRunId:'wrong',fetcher}),/Invalid source run ID/);
});
test('Relay checks queued runs and fails closed when the run list is unavailable',async()=>{
 const runs=[{id:11,status:'in_progress'},{id:12,status:'queued'}];
 assert.equal(activeCollectorRun(runs,11).id,12);
 assert.equal(activeCollectorRun([{id:11,status:'in_progress'}],11),undefined);
 const fetcher=async()=>({ok:true,json:async()=>({workflow_runs:runs})});
 assert.deepEqual(await getCollectorRuns({token:'fixture',repository:'sample/project',fetcher}),runs);
 await assert.rejects(getCollectorRuns({token:'fixture',repository:'sample/project',fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
});
