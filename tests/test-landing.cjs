const assert=require('assert');
const L=require('../assets/landing.js');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h={esc,safeURL:x=>/^https:/.test(x)||/^assets\//.test(x)?esc(x):'#',meta:a=>'<span>'+esc(a.source)+'</span>',photo:a=>a.image?{url:a.image.url,alt:a.title}:{url:'',alt:''}};
const now=Date.parse('2026-11-22T03:00:00Z');
// Fixtures: boxing and MMA only, today to 14 days, soonest first, max six.
const ev=(d,s,t)=>({date:d,sport:s,title:t,promotion:'P',bouts:[{}]});
const events=[ev('2026-11-21','boxing','Past'),ev('2026-12-12','mma','Too far'),ev('2026-12-05','mma','UFC FN'),ev('2026-11-28','boxing','Kabayel'),ev('2026-11-25','sumo','Sumo day'),
 ...[1,2,3,4,5].map(i=>ev('2026-12-0'+i,'boxing','B'+i))];
const fx=L.fixtures(events,now);
assert.strictEqual(fx.length,6);
assert(fx.every(e=>['boxing','mma'].includes(e.sport)&&e.date>='2026-11-22'&&e.date<='2026-12-06'));
assert.deepStrictEqual(fx.map(e=>e.date),[...fx.map(e=>e.date)].sort());
assert(L.fixtures([{date:'2026-11-28',sport:'boxing',title:'No card yet',bouts:[]}],now).length===0);
assert(!fx.some(e=>e.title==='Past'||e.title==='Too far'||e.title==='Sumo day'));
// Result: winner with a cutout is preferred over a newer main bout without one; no winner means skipped.
const results={events:[{id:'e1',name:'UFC Old',date:'2026-11-20',status:'completed',mainBoutId:'b1'},{id:'e2',name:'Box New',date:'2026-11-21',status:'completed',mainBoutId:'b2'},{id:'e3',name:'Draw',date:'2026-11-22',status:'completed',mainBoutId:'b3'}],
 results:[{id:'b1',event:'UFC Old',winner:0,method:'KO',round:2,fighters:[{name:'Navajo Stirling'},{name:'Jiří Procházka'}]},
          {id:'b2',event:'Box New',winner:1,method:'decision',round:12,fighters:[{name:'A'},{name:'B C'}]},
          {id:'b3',event:'Draw',winner:null,fighters:[{name:'X'},{name:'Y'}]}]};
const cut={'navajo-stirling':{ok:true},'b-c':{ok:false}};
let r=L.latestResult(results,cut,now);
assert.strictEqual(r.winner,'Navajo Stirling');assert.strictEqual(r.cutout,'assets/img/ufc-cutouts/navajo-stirling.webp');
r=L.latestResult(results,{},now);assert.strictEqual(r.winner,'B C');assert.strictEqual(r.cutout,'');
assert.strictEqual(L.latestResult(null,null,now),null);
// HTML: escapes, no placeholder text, no tile without data, cutout only when there is one.
const st=(i,sport,t,x={})=>({url:'https://x.test/'+i,title:t,source:'S',sport,publishedAt:new Date(Date.UTC(2026,10,22,i)).toISOString(),...x});
const html=L.build({stories:[st(1,'mma','<i>Lead</i>'),st(2,'boxing','Box one'),st(3,'boxing','Box two'),st(4,'mma','MMA one')],events,results,cutouts:cut,
 sumo:[{url:'https://s.test/1',title:'Sumo head',source:'NHK',sport:'sumo',publishedAt:'2026-11-22T01:00:00Z'}],sumoHref:'https://sumo.test/',now},h);
assert(!html.includes('<i>Lead'));assert(html.includes('&lt;i&gt;Lead'));
assert(html.includes('This week and next')&&html.includes('lp-sumo')&&html.includes('lp-boxing')&&html.includes('lp-mma'));
assert(html.includes('assets/img/ufc-cutouts/navajo-stirling.webp'));
assert(!/tbc|placeholder|lorem/i.test(html));
const bare=L.build({stories:[],events:[],now},h);
assert(!bare.includes('lp-fixtures')&&!bare.includes('lp-cols')&&!bare.includes('lp-result'));
// Phone rules (docs/design/DIRECTION.md): nothing under 12 px, tap targets at least 44 px.
// This checks the stylesheet, not the rendered boxes; the rendered sizes were checked in a browser at 390 and 1280 px.
const css=require('fs').readFileSync(require('path').join(__dirname,'../assets/landing-page.css'),'utf8');
const small=[...css.matchAll(/font-size:\s*(?:clamp\(\s*)?(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1])).filter(n=>n<12);
assert.deepStrictEqual(small,[],'landing-page.css sets text under 12 px: '+small.join(', '));
const line=sel=>css.split('\n').find(l=>l.startsWith(sel+'{'));
for(const sel of ['#main .lp-button','#main .lp-col-item','#main .lp-col-foot a']){
  assert(/min-height:44px/.test(line(sel)||''),sel+' must keep its 44 px tap target');
}
for(const sel of ['#main .lp-head a','#main .lp-col-head a']){
  const r=line(sel)||'';
  assert(/padding:14px 0/.test(r)&&/margin:-14px 0/.test(r),sel+' must keep its 44 px hit box (14 px padding, cancelled by a negative margin)');
}
console.log('landing tests passed');
