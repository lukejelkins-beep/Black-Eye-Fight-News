const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync('data/results.json','utf8'));let calls=0;const timers=[];
let now=Date.now();class Clock extends Date{static now(){return now}}
const document={hidden:false,addEventListener(){},querySelectorAll(){return []},getElementById(){return null}};
const window={BEFNFightsUI:{view:'results'}};
const context={window,document,location:{href:'https://example.com/',hash:'#fights'},URL,Date:Clock,AbortSignal,
 setInterval:fn=>timers.push(fn),requestAnimationFrame:fn=>fn(),
 fetch:async()=>{calls++;return {ok:true,json:async()=>data}}};
vm.runInNewContext(fs.readFileSync('assets/event-status.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('assets/results.js','utf8'),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await tick();let html=window.ResultsDesk.render();
 assert(html.includes('47 bouts'));
 assert.equal((html.match(/class="result-takeaways"/g)||[]).length,4);
 assert.equal((html.match(/<li>/g)||[]).length,12);
 assert(html.includes('Awaiting confirmed result'));
 assert(html.includes('Full fight card'));
 assert(!html.includes('Round null'));
 assert(!html.includes('undefined'));
 const start=calls;assert(start>=1);
 timers.at(-1)();await tick();
 assert.equal(calls,start,'Idle feed must not fetch again after 30 seconds');
 now+=5*60*1000+1;
 timers.at(-1)();await tick();
 assert(calls>start,'Idle feed should refetch after five minutes');
 console.log('Results UI: full cards, verified records, safe missing data and idle polling passed');
})().catch(e=>{console.error(e);process.exitCode=1});
