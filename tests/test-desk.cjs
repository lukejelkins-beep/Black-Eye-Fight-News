const fs=require('fs'),vm=require('vm'),assert=require('assert');
const fullSite=fs.readFileSync('index.html','utf8');
const resultsSource=fs.readFileSync('assets/results.js','utf8');
const filmSource=fs.readFileSync('assets/fight-film.js','utf8');
assert(fullSite.includes('editorial-compact.css'),'Editorial-first CSS linked');
assert(fullSite.includes('function topStories()'),'Headline ranking implemented on public home');
assert(!fullSite.includes('THE FIGHT<br>WORLD'),'Promotional home hero removed');
assert(!fullSite.includes('Championship trackers. Deep scouting intelligence.'),'Home marketing copy removed');
assert(!resultsSource.includes('The outcome. The new records.'),'Results introductory fluff removed');
assert(!resultsSource.includes('Boxing and MMA results grouped by fight card, newest events first.'),'Results top disclaimer removed');
assert(resultsSource.includes('Auto-refresh 30s'),'Short, clear refresh status retained');
assert(!filmSource.includes('Fresh finishes, knockouts and submission highlights from around the fight world.'),'Film introductory fluff removed');

const source=fs.readFileSync('assets/live-desk.inc.js','utf8');
const state={calendar:'grappling',news:'boxing'};
class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-11-08T00:00:00Z']));}static now(){return new Date('2026-11-08T00:00:00Z').getTime();}}
const ctx={window:{},state,document:{addEventListener(){},getElementById(){return null}},setInterval(){},Date:FixedDate,AbortSignal,fetch:async()=>{throw Error('offline')},location:{hash:'#none'},navigate(){},esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),safeURL:s=>/^https:\/\//.test(s)?s:'#',renderFrame:s=>s,viewTitle:(...a)=>a.join(' '),segments:()=>'',hero:()=>'',archiveCard:()=>'',D:{news:{}},newsCard:()=>'',renderArchivedCalendar:()=>''};
ctx.navigator={language:'en-AU'};
ctx.Intl=Intl;
vm.createContext(ctx);
// The news desk runs in the browser after local-time.js; run the real shared
// date/time helper in this VM too, so the test matches the published site.
vm.runInContext(fs.readFileSync('assets/local-time.js','utf8'),ctx,{filename:'assets/local-time.js'});
assert(ctx.window.FightTime.dayKey(new FixedDate()).startsWith('2026-11-08'),'News desk uses visitor-local calendar dates');
vm.runInContext(source,ctx);
vm.runInContext('desk.events='+fs.readFileSync('data/grappling-events.json','utf8')+'.events;desk.reviewedAt="2026-11-08";',ctx);
assert(ctx.renderCalendar().includes('RAF Abu Dhabi'));state.matDiscipline='NCAA';assert(!ctx.renderCalendar().includes('RAF Abu Dhabi'));assert(ctx.renderCalendar().includes('NCAA Division I'));
assert(ctx.headlineCard({title:'<script>bad</script>',sport:'boxing',source:'test',url:'javascript:alert(1)',publishedAt:'2026-11-08T00:00:00Z'}).includes('href="#"'));
assert(!ctx.headlineCard({title:'<script>bad</script>',sport:'boxing',source:'test',url:'https://example.com',publishedAt:'2026-11-08T00:00:00Z'}).includes('<script>'));
vm.runInContext("desk.articles=[{title:'Important MMA fight announced',url:'https://example.com/mma',publishedAt:'2026-11-07T23:00:00Z',sport:'mma',source:'Official',score:5},{title:'Regular boxing update',url:'https://example.com/boxing',publishedAt:'2026-11-08T00:00:00Z',sport:'boxing',source:'Trusted',score:0}]",ctx);
const home=ctx.renderHome();
assert(home.includes('Top stories'),'Home page opens with news');
assert(home.includes('Important MMA fight announced'),'Significant verified news is prioritised');
assert(home.indexOf('Important MMA fight announced')<home.indexOf('Regular boxing update'),'Headline ranking puts significant story first');
assert(!home.includes('THE FIGHT WORLD'),'No promotional hero ahead of news');
console.log('Headline-first home, ranking, calendar filtering, unsafe URLs and HTML escaping passed');
(async()=>{
 const calls=[];
 ctx.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({articles:[{id:'remote'}]})}};
 assert.equal((await ctx.deskJSON('data/news-live.json')).articles[0].id,'remote');
 assert(calls[0].startsWith('https://raw.githubusercontent.com/'));
 ctx.fetch=async url=>url.startsWith('https:')?Promise.reject(Error('offline')):{ok:true,json:async()=>({articles:[{id:'fallback'}]})};
 assert.equal((await ctx.deskJSON('data/news-live.json')).articles[0].id,'fallback');
 ctx.fetch=async()=>({ok:true,json:async()=>({unexpected:true})});
 await assert.rejects(()=>ctx.deskJSON('data/news-live.json'));
 console.log('Latest-feed delivery, local fallback and malformed payload checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
