// Regression: completed cards must display headliner -> section opener, even when
// the publisher stores rows chronologically (opener -> headliner).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const fixture=JSON.parse(fs.readFileSync('data/results.json','utf8'));
const listeners={};
const document={
 hidden:false,
 createElement:tag=>({tagName:tag,textContent:''}),
 head:{appendChild(){}},
 addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn)},
 querySelectorAll:()=>[],
 getElementById:()=>null
};
const window={
 FightTime:{venueDay:day=>day,localDateTime:value=>value,locale:'en-AU'},
 EventStatus:{event:()=>'',setEvents:()=>{}}
};
const context={
 window,document,location:{href:'https://example.com/#results',hash:'#results'},
 URL,Date,Intl,AbortSignal,requestAnimationFrame:()=>{},
 setInterval:()=>0,
 fetch:async()=>({ok:true,json:async()=>fixture})
};
vm.runInNewContext(fs.readFileSync('assets/results.js','utf8'),context,{timeout:5000});
const eventId='ufc-cortes-walker-2026-11-07';
function cardRows(){
 const html=window.ResultsDesk.render();
 const start=html.indexOf('<div class="result-bouts" id="results-bouts-'+eventId+'"');
 assert(start>=0,'Event fight card exists');
 const end=html.indexOf('</details>',start);
 assert(end>start,'Fight card end exists');
 return html.slice(start,end).split('<div role="listitem">').slice(1);
}
function chooseSection(section){
 const tab={dataset:{resultEventTab:eventId,resultCardSection:section}};
 for(const callback of listeners.click||[]){
  callback({target:{closest:selector=>selector==='[data-result-event-tab]'?tab:null}});
 }
}
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 const initial=window.ResultsDesk.render();
 const count=html=>(html.match(/class="result-event befn-result-list-event"/g)||[]).length;
 assert(count(initial)<=12,'Initial event rendering is bounded');
 let html=initial,passes=0;
 while(html.includes('id="results-more"')){
  for(const callback of listeners.click||[])callback({target:{closest:s=>s==='#results-more'?{}:null}});
  html=window.ResultsDesk.render();
  assert(++passes<100,'Pagination terminates');
 }
 assert(count(html)>12,'Older events remain reachable');
 const lastId=[...html.matchAll(/data-result-event="([^"]+)"/g)].at(-1)[1];
 const older=fixture.results.find(r=>r.eventId===lastId);
 assert(older,'Older event fixture exists');
 for(const callback of listeners.input||[])callback({target:{id:'results-search',value:older.event}});
 const searched=window.ResultsDesk.render();
 assert(searched.includes('data-result-event="'+lastId+'"'),'Search reaches beyond first batch');
 for(const callback of listeners.input||[])callback({target:{id:'results-search',value:''}});
 assert(count(window.ResultsDesk.render())<=12,'Changing search resets batch');
 console.log('Rendered event batches:',count(initial),'initial,',count(html),'after expansion');
 chooseSection('main');
 const main=cardRows();
 assert.equal(main.length,6,'Six main card bouts');
 assert(main[0].includes('Waldo Cortes Acosta')&&main[0].includes('Johnny Walker'),'Main event must be first');
 assert(main.at(-1).includes('Mitch Raposo')&&main.at(-1).includes('Marcos Degli'),'Main card opener must be last');
 chooseSection('prelims');
 const prelims=cardRows();
 assert.equal(prelims.length,8,'Eight preliminary bouts');
 assert(prelims[0].includes('Ollie Schmid')&&prelims[0].includes('Keiichiro Nakamura'),'Featured preliminary bout must be first');
 assert(prelims.at(-1).includes('José Souza')&&prelims.at(-1).includes('Jonny Parsons'),'Prelim opener must be last');
 console.log('Confirmed: completed main and prelim sections show headliner first, opener last');
})().catch(error=>{console.error(error);process.exitCode=1});
