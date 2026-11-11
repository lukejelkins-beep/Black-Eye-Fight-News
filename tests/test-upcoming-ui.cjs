const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const fixture={reviewedAt:'2099-01-01',events:[{
 id:'example-test-2099',date:'2099-01-01',sport:'boxing',promotion:'Publisher',
 title:'Agit Kabayel vs Nelson Hysa',location:'Germany',
 source:'https://example.org/event',
 poster:{url:'https://example.org/poster.jpg',source:'https://example.org/event',credit:'Event promoter'},
 posterPortrait:{url:'https://example.org/portrait-poster.jpg',source:'https://example.org/event'},
 bouts:[
  {id:'b1',section:'main',fighters:['Agit Kabayel','Nelson Hysa'],records:['27-0 (19 KOs)','25-0 (23 KOs)'],division:'Heavyweight',source:'https://example.org/b1'},
  {id:'b2',section:'undercard',fighters:['Kevin Saszik','Patrick Korte'],records:['11-0 (5 KOs)',null],division:'Heavyweight',source:'https://example.org/b2'}
 ]
}]};
const source=fs.readFileSync('assets/upcoming-cards.js','utf8');
const handlers={};
const document={
 addEventListener:(name,fn)=>{handlers[name]=fn;},
 getElementById:(id)=>id==='fighter-portrait-registry'?{textContent:'{"fighters":{}}'}:null,
 querySelectorAll:()=>[]
};
const sandbox={
 window:{},document,
 URL,Date,Intl,console,
 AbortSignal:{timeout:()=>undefined},
 requestAnimationFrame:undefined,
 setInterval:()=>0,
 fetch:async()=>({ok:true,json:async()=>fixture})
};
vm.runInNewContext(fs.readFileSync('assets/local-time.js','utf8'),sandbox);
vm.runInNewContext(source,sandbox,{timeout:5000});
(async()=>{
 assert(sandbox.window.UpcomingCards);
 await sandbox.window.UpcomingCards.load();
 const html=sandbox.window.UpcomingCards.render('boxing');
 assert(html.includes('27-0 (19 KOs)'),'Source record displayed under fighter');
 assert(html.includes('25-0 (23 KOs)'),'Both fighters records displayed');
 assert(html.includes('Record not verified'),'Unknown opponent record cannot be invented');
 assert(html.includes('upcoming-fighter-record'),'Record UI is a distinct line under fighter name');
 assert(html.includes('upcoming-hero-media'),'Event poster thumbnail displayed');
 assert(html.includes('upcoming-schedule-row'),'Compact event row required');
 assert(html.includes('upcoming-list-date'),'Date grouping required');
 assert(html.includes('upcoming-hero-poster'),'Official poster is displayed ahead of the event details');
 assert(html.indexOf('upcoming-hero-poster')<html.indexOf('upcoming-hero-content'),'Poster must sit above event details');
 assert(html.includes('portrait-poster.jpg'),'Sourced portrait poster displayed');
 assert(html.includes('Undercard / order TBC'),'Named undercard has own tab');
 assert(html.includes('Kevin Saszik'),'Named undercard pairing remains visible');
 assert(html.includes('Heavyweight'),'The weight class remains visible');
 assert(html.includes('Fight card'),'Expanding a card shows its bouts');
 assert(html.includes('is-main-event'),'Main bout receives the shared Results main-event style');
 assert(html.includes('result-featured-bout-label'),'Featured-bout label reuses Results markup');
 assert(html.includes('MAIN EVENT'),'Main event is labelled');
 assert(!html.includes('result-win-tick'),'Upcoming bouts never display completed-result winner ticks');
 assert(!html.includes('is-completed'),'Upcoming bouts never impersonate results');

 for(const removed of ['Announced pairing','Reported pairing','Bout source','Event source','Poster source','Other artwork','Local scheduled start','upcoming-event-note','upcoming-bout-note','upcoming-record-source']){
  assert(!html.includes(removed),'Upcoming fixture UI must hide verbose metadata: '+removed);
 }
 assert(!html.includes('<a href='),'Upcoming card previews should be display-only without source links');
 console.log('Upcoming card UI: sourced records, unknown fallbacks, event poster and verified undercard sections passed');
})().catch(e=>{console.error(e);process.exitCode=1});
