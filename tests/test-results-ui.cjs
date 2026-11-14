// Deterministic behavior checks: no provider calls, live datasets or wall-clock assumptions.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let now=Date.parse('2026-11-14T00:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const fixture={events:[{id:'qa-card',name:'QA fight card',date:'2026-11-13',status:'completed',checkedAt:new Clock().toISOString()}],results:[
 {id:'qa-final',eventId:'qa-card',event:'QA fight card',date:'2026-11-13',sport:'MMA',status:'completed',winner:0,method:'UD',round:null,time:null,section:'Main card',order:1,source:'https://example.org/result',fighters:[{name:'Alpha Winner',record:'2-0',recordSource:'https://example.org/alpha'},{name:'Beta Opponent'}]},
 {id:'qa-pending',eventId:'qa-card',event:'QA fight card',date:'2026-11-13',sport:'MMA',status:'pending',winner:null,section:'Prelims',order:0,source:'https://example.org/card',fighters:[{name:'Gamma Pending'},{name:'Delta Pending'}]}
]};
let payload=fixture,fail=false,calls=0;const timers=[];
let root=null;const handlers={};
const document={activeElement:null,hidden:false,createElement:()=>({textContent:''}),head:{appendChild(){}},addEventListener(name,fn){(handlers[name]??=[]).push(fn)},querySelectorAll(){return []},getElementById(id){return id==='results-content'?root:null}};
const window={BEFNFightsUI:{view:'results'}};
const location={href:'https://example.org/#fights',hash:'#fights'};
const context={window,document,location,URL,Date:Clock,Intl,AbortSignal,
 setInterval:(fn,ms)=>timers.push({fn,ms}),requestAnimationFrame:fn=>fn(),
 fetch:async url=>{
  if(url.includes('historical-posters.json'))return {ok:true,json:async()=>({events:{}})};
  assert(url.includes('results.json'),'Only expected results requests');calls++;
  if(fail)throw Error('simulated outage');
  return {ok:true,json:async()=>structuredClone(payload)};
 }};
for(const file of ['local-time.js','event-status.js','results.js'])vm.runInNewContext(fs.readFileSync('assets/'+file,'utf8'),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await tick();const poll=timers.find(t=>t.ms===30000).fn;
 let html=window.ResultsDesk.render();
 assert(html.includes('Alpha Winner')&&html.includes('Gamma Pending'),'Both final and pending bouts retained');
 assert(html.includes('2-0')&&html.includes('Record unavailable'),'Missing record stays unknown');
 assert(!html.includes('Round null')&&!html.includes('undefined'));
 assert(!html.includes('Gamma Pending winner'),'No winner inferred for pending bout');
 // Minimal DOM contract: replacing innerHTML detaches descendants and clears focus.
 const outside={dataset:{},name:'outside control'};
 let buttons=[];
 root={
  contains(node){return buttons.includes(node)},
  querySelectorAll(selector){return selector==='[data-result-event-tab]'?buttons:[]},
  set innerHTML(value){
   if(this.contains(document.activeElement))document.activeElement=null;
   buttons=[...value.matchAll(/data-result-event-tab="([^"]+)" data-result-card-section="([^"]+)"/g)].map(([,event,section])=>({
    dataset:{resultEventTab:event,resultCardSection:section},
    closest(selector){return selector==='[data-result-event-tab]'?this:null},
    focus(options){assert.equal(options.preventScroll,true);document.activeElement=this}
   }));
  }
 };
 root.innerHTML=html;
 const selected=buttons.find(b=>b.dataset.resultCardSection==='prelims');
 assert(selected,'Fixture provides a real rendered prelim button');
 document.activeElement=selected;
 for(const handler of handlers.click)handler({target:selected});
 assert.notEqual(document.activeElement,selected,'Original focused node was replaced');
 assert.equal(document.activeElement?.dataset.resultCardSection,'prelims','Card selection preserves keyboard focus on replacement');
 document.activeElement=outside;
 for(const handler of handlers.input)handler({target:{id:'results-search',value:''}});
 assert.equal(document.activeElement,outside,'A refresh cannot steal focus from outside results');
 root=null;
 let start=calls;
 now+=30000;poll();await tick();assert.equal(calls,start,'Idle feed does not fetch at 30 seconds');
 now+=270000;poll();await tick();assert.equal(calls,start+1,'Idle feed fetches at five minutes');
 payload=structuredClone(fixture);payload.events[0].status='live';payload.events[0].checkedAt=new Clock().toISOString();
 now+=300000;poll();await tick();start=calls;
 now+=29999;poll();await tick();assert.equal(calls,start,'Live polling waits thirty seconds');
 now++;poll();await tick();assert.equal(calls,start+1,'Fresh live feed polls at thirty seconds');
 start=calls;document.hidden=true;now+=30000;poll();await tick();assert.equal(calls,start,'Hidden tab makes no polling request');
 document.hidden=false;window.BEFNFightsUI.view='upcoming';poll();await tick();assert.equal(calls,start,'Inactive results view makes no polling request');
 window.BEFNFightsUI.view='results';location.hash='#home';poll();await tick();assert.equal(calls,start,'Other page makes no polling request');
 location.hash='#fights';fail=true;poll();await tick();
 html=window.ResultsDesk.render();assert(html.includes('Refresh unavailable. Showing the last loaded results.')&&html.includes('Alpha Winner'),'Outage preserves loaded results with a warning');
 fail=false;payload={events:[],results:[{fighters:[{name:'Invalid single corner'}]}]};now+=300000;poll();await tick();
 assert(window.ResultsDesk.render().includes('Alpha Winner'),'Invalid payload cannot replace saved data');
 payload=structuredClone(fixture);payload.events[0].checkedAt='2020-01-01T00:00:00Z';payload.results[0].fighters[0].name='Stale Replacement';now+=300000;poll();await tick();
 assert(!window.ResultsDesk.render().includes('Stale Replacement'),'Older published data cannot replace newer results');
 // A stale live flag must return to the lower-frequency idle cadence.
 payload=structuredClone(fixture);payload.events[0].status='live';payload.events[0].checkedAt=new Clock(now-16*60*1000).toISOString();
 // Reset is unnecessary: the cached previous live timestamp is now >15 minutes old.
 start=calls;now+=30000;poll();await tick();assert.equal(calls,start,'Expired live status does not keep thirty-second polling');
 console.log('Results UI: missing data, live/idle throttling, hidden/inactive tabs, outage, malformed and stale payloads passed');
})().catch(e=>{console.error(e);process.exitCode=1});
