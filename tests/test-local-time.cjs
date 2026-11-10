'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const helper=fs.readFileSync('assets/local-time.js','utf8');
const upcoming=fs.readFileSync('assets/upcoming-cards.js','utf8');
const html=fs.readFileSync('index.html','utf8');

// Validate embedded JS too; node --check cannot inspect script tags in HTML.
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
 if(/\bsrc\s*=|type\s*=\s*["']application\/json/i.test(script[1]))continue;
 if(script[2].trim())new vm.Script(script[2],{filename:'index.html inline script'});
}
assert.match(html,/assets\/local-time\.js/);
assert.ok(html.indexOf('assets/local-time.js')<html.indexOf('assets/upcoming-cards.js'));

const fixed='2026-11-08T04:00:00Z';
class TestDate extends Date{
 constructor(...args){super(...(args.length?args:[fixed]));}
 static now(){return Date.parse(fixed);}
}
const sample={reviewedAt:'2026-11-08',lastCheckedAt:'2026-11-08T02:00:00Z',events:[
 {id:'et-sample',date:'2026-11-14',sport:'mma',title:'Eastern sample',promotion:'UFC',location:'New York',
  startLabel:'Main card 9 pm ET',source:'https://example.com',bouts:[{id:'et-bout',section:'main',fighters:['A','B']}]},
 {id:'dubai-sample',date:'2026-11-14',sport:'mma',title:'Dubai sample',promotion:'UFC',location:'Dubai',
  startLabel:'Prelims from 6 pm GST; main card 10 pm GST',source:'https://example.com',
  bouts:[{id:'db-bout',section:'main',fighters:['C','D']}]}
]};

async function runForZone(tz){
 process.env.TZ=tz;
 const sandbox={
  window:{},navigator:{language:'en-AU'},Intl,Date:TestDate,URL,
  document:{addEventListener(){},querySelectorAll(){return []},getElementById(){return null}},
  location:{hash:'#calendar'},setInterval(){},requestAnimationFrame(){},
  AbortSignal:{timeout(){return null}},
  fetch:async()=>({ok:true,json:async()=>sample}),
 };
 vm.createContext(sandbox);
 vm.runInContext(helper,sandbox,{filename:'assets/local-time.js'});
 const clock=sandbox.window.FightTime;
 assert.equal(clock.zone,tz);
 assert.equal(clock.instant('2026-11-14'),null,'A date-only value is not a time');
 assert.equal(clock.instant('2026-11-14T21:00:00'),null,'An unzoned datetime is ambiguous');
 assert.ok(clock.venueDay('2026-11-14').includes('14'),'Venue dates must not jump days');
 assert.equal(clock.startReached('2026-11-14T21:00:00-05:00',TestDate.parse('2026-11-15T02:00:00Z')),true);
 assert.match(clock.relative('2026-11-14T21:00:00-05:00',TestDate.parse('2026-11-15T01:00:00Z')),/Starts in 1h/);
 vm.runInContext(upcoming,sandbox,{filename:'assets/upcoming-cards.js'});
 await sandbox.window.UpcomingCards.load();
 const markup=sandbox.window.UpcomingCards.render('mma');
 assert.match(markup,/Eastern sample/);
 assert.match(markup,/Dubai sample/);
 assert.match(markup,/data-upcoming-start/);
 return {clock,markup};
}
(async()=>{
 const mel=await runForZone('Australia/Melbourne');
 assert.match(mel.clock.localDateTime('2026-11-14T21:00:00-05:00'),/15 Nov 2026/);
 assert.match(mel.clock.localClock('2026-11-14T21:00:00-05:00'),/1:00/);
 assert.match(mel.markup,/1:00/);
 assert.match(mel.markup,/5:00/);
 const la=await runForZone('America/Los_Angeles');
 assert.match(la.clock.localDateTime('2026-11-14T21:00:00-05:00'),/14 Nov 2026/);
 assert.match(la.clock.localClock('2026-11-14T21:00:00-05:00'),/6:00/);
 assert.match(la.markup,/6:00/);
 const london=await runForZone('Europe/London');
 assert.match(london.clock.localDateTime('2026-11-14T21:00:00-05:00'),/15 Nov 2026/);
 console.log('Local-time display checks passed (Melbourne, Los Angeles, London).');
})().catch(error=>{console.error(error);process.exitCode=1});
