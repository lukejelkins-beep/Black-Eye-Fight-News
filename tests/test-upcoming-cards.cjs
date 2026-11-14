// Synthetic cards keep this UI regression independent of changing research and dates.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const now=Date.parse('2026-11-14T00:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const bout=(id,section)=>({id,section,fighters:[id+' Alpha',id+' Beta'],records:['3-0',null],division:'Lightweight',source:'https://example.org/'+id});
const event=(id,sport,date,extra={})=>({id,sport,date,title:id+' title',promotion:sport==='mma'?'UFC':'Boxing promoter',location:'Test venue',source:'https://example.org/'+id,bouts:[bout(id+'-main','main'),bout(id+'-prelim','prelims'),bout(id+'-early','early')],...extra});
const fixture={reviewedAt:'2026-11-14',events:[
 event('confirmed-mma','mma','2026-11-15'),
 event('reported-mma','mma','2026-12-05',{sourceStatus:'reported',bouts:[bout('reported-a','announced'),bout('reported-b','announced')]}),
 event('confirmed-boxing','boxing','2026-12-06'),
 event('past-card','mma','2026-10-01'),
 event('completed-card','mma','2026-11-15',{status:'completed'}),
 event('cancelled-card','mma','2026-11-15',{status:'cancelled'}),
 event('recent-unconfirmed','mma','2026-11-13')
]};
const handlers={};
const document={hidden:false,addEventListener:(name,fn)=>{(handlers[name]??=[]).push(fn)},querySelectorAll:()=>[],getElementById:id=>id==='fighter-portrait-registry'?{textContent:'{"fighters":{}}'}:null};
const context={window:{},document,location:{hash:'#fights'},setInterval(){},Date:Clock,URL,Intl,AbortSignal,console,
 fetch:async url=>({ok:true,json:async()=>url.includes('upcoming-cards.json')?structuredClone(fixture):{}})};
for(const file of ['local-time.js','upcoming-cards.js'])vm.runInNewContext(fs.readFileSync('assets/'+file,'utf8'),context);
(async()=>{
 await context.window.UpcomingCards.load();
 const boxing=context.window.UpcomingCards.render('boxing'),mma=context.window.UpcomingCards.render('mma');
 assert(boxing.includes('confirmed-boxing title')&&!boxing.includes('confirmed-mma title'),'Boxing filter excludes MMA');
 assert(mma.includes('confirmed-mma title')&&!mma.includes('confirmed-boxing title'),'MMA filter excludes boxing');
 assert(!mma.includes('past-card title'),'Past cards are removed from upcoming');
 assert(!mma.includes('completed-card title'),'Completed cards are removed from upcoming');
 assert(!mma.includes('cancelled-card title'),'Cancelled cards are removed from upcoming');
 assert(mma.includes('recent-unconfirmed title'),'A passed date alone cannot establish completion');
 assert(mma.includes('reported-mma title')&&mma.includes('Reported · UFC confirmation pending'),'Reported event remains explicitly provisional');
 for(const section of ['main','prelims','early'])assert(mma.includes('data-upcoming-panel="'+section+'"'),'Preserve '+section+' bouts');
 assert(mma.includes('reported-a Alpha')&&mma.includes('reported-b Alpha'),'All reported pairings retained');
 assert(mma.includes('Start time TBC · venue date'),'Unknown start is not converted into a made-up local time');
 assert(mma.includes('Record not verified'),'Missing record stays unknown');
 assert(!mma.includes('undefined')&&!boxing.includes('undefined'));
 console.log('Upcoming UI: sport filters, provisional status, full card sections, unknown time/record and date exclusion passed');
})().catch(e=>{console.error(e);process.exitCode=1});
