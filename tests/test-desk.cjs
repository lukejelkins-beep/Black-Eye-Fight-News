const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('assets/live-desk.inc.js','utf8');
const state={calendar:'grappling',news:'boxing'};
class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-11-08T00:00:00Z']));}static now(){return new Date('2026-11-08T00:00:00Z').getTime();}}
const ctx={window:{},state,document:{addEventListener(){},getElementById(){return null}},setInterval(){},Date:FixedDate,AbortSignal,fetch:async()=>{throw Error('offline')},location:{hash:'#none'},navigate(){},esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),safeURL:s=>/^https:\/\//.test(s)?s:'#',renderFrame:s=>s,viewTitle:(...a)=>a.join(' '),segments:()=>'',hero:()=>'',archiveCard:()=>'',D:{news:{}},newsCard:()=>'',renderArchivedCalendar:()=>''};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext('desk.events='+fs.readFileSync('data/grappling-events.json','utf8')+'.events;desk.reviewedAt="2026-11-08";',ctx);
assert(ctx.renderCalendar().includes('RAF Abu Dhabi'));state.matDiscipline='NCAA';assert(!ctx.renderCalendar().includes('RAF Abu Dhabi'));assert(ctx.renderCalendar().includes('NCAA Division I'));
assert(ctx.headlineCard({title:'<script>bad</script>',sport:'boxing',source:'test',url:'javascript:alert(1)',publishedAt:'2026-11-08T00:00:00Z'}).includes('href="#"'));
assert(!ctx.headlineCard({title:'<script>bad</script>',sport:'boxing',source:'test',url:'https://example.com',publishedAt:'2026-11-08T00:00:00Z'}).includes('<script>'));
console.log('Calendar filtering, event display, unsafe URL and HTML escaping checks passed');
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
