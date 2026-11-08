const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync('data/results.json','utf8'));let calls=0;const timers=[];
const document={hidden:false,addEventListener(){},querySelectorAll(){return []},getElementById(){return null}};
const window={};const context={window,document,location:{href:'https://example.com/'},URL,Date,AbortSignal,setInterval:fn=>timers.push(fn),fetch:async()=>{calls++;return {ok:true,json:async()=>data}}};
vm.runInNewContext(fs.readFileSync('assets/event-status.js','utf8'),context);vm.runInNewContext(fs.readFileSync('assets/results.js','utf8'),context);
setImmediate(async()=>{let html=window.ResultsDesk.render();assert(html.includes('47 bouts'));assert.equal((html.match(/class="result-takeaways"/g)||[]).length,4);assert.equal((html.match(/<li>/g)||[]).length,12);assert(html.includes('Awaiting confirmed result'));assert(html.includes('Full fight card'));assert(!html.includes('Round null'));assert(!html.includes('undefined'));await timers.at(-1)();assert(calls>=2);console.log('Full cards, takeaways, pending bouts, safe missing data and periodic refresh passed');});
