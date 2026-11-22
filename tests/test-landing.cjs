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

// Pictures. Posters come from the BEFN copy, keyed by event id; landscape is preferred.
const posters={'kab-2026-11-28':{landscape:{url:'assets/img/posters/kab-landscape.webp'},portrait:{url:'assets/img/posters/kab-portrait.webp'}},
 'pt-2026-12-01':{portrait:{url:'assets/img/posters/pt-portrait.webp'}}};
assert.strictEqual(L.posterFor({id:'kab-2026-11-28'},posters),'assets/img/posters/kab-landscape.webp');
assert.strictEqual(L.posterFor({id:'pt-2026-12-01'},posters),'assets/img/posters/pt-portrait.webp');
assert.strictEqual(L.posterFor({id:'nope'},posters),'');
assert.strictEqual(L.posterFor({},null),'');
// A cut-out stands in for a missing poster, but only for a fighter who has one cleared.
const boutEv=(id,names)=>({id,date:'2026-11-28',sport:'mma',title:names.join(' vs '),bouts:[{fighters:names}]});
assert.deepStrictEqual(L.cutoutFor(boutEv('e',['Jiří Procházka','Navajo Stirling']),cut),
 {url:'assets/img/ufc-cutouts/navajo-stirling.webp',name:'Navajo Stirling'});
assert.strictEqual(L.cutoutFor(boutEv('e',['B C']),cut),null);
assert.strictEqual(L.cutoutFor({id:'e'},cut),null);
assert.strictEqual(L.cutoutFor(boutEv('e',['Navajo Stirling']),null),null);

// Cut-outs are read from the folder their own register names, so a boxer's file is not
// looked for among the UFC ones. An entry with no dir still resolves to the UFC folder.
const mixed={'navajo-stirling':{ok:true,dir:'assets/img/ufc-cutouts/'},'adam-azim':{ok:true,dir:'assets/img/boxing-cutouts/'},'old-entry':{ok:true}};
assert.deepStrictEqual(L.cutoutFor(boutEv('b',['Adam Azim']),mixed),
 {url:'assets/img/boxing-cutouts/adam-azim.webp',name:'Adam Azim'});
assert.deepStrictEqual(L.cutoutFor(boutEv('u',['Navajo Stirling']),mixed),
 {url:'assets/img/ufc-cutouts/navajo-stirling.webp',name:'Navajo Stirling'});
assert.deepStrictEqual(L.cutoutFor(boutEv('o',['Old Entry']),mixed),
 {url:'assets/img/ufc-cutouts/old-entry.webp',name:'Old Entry'});
assert.strictEqual(L.cutoutForTitle('Adam Azim wins again',mixed).url,'assets/img/boxing-cutouts/adam-azim.webp');
// Only a fighter the card is billed on may stand for it. Someone further down the bill
// is not used, however many cut-outs they have: the tile reads as though the card is theirs.
const bill={id:'c',date:'2026-11-28',sport:'boxing',title:'Navajo Stirling vs Alexis Rocha',
 bouts:[{fighters:['Adam Azim','Someone Else']},{fighters:['Navajo Stirling','Alexis Rocha']}]};
assert.strictEqual(L.cutoutFor(bill,mixed).name,'Navajo Stirling');
assert.strictEqual(L.cutoutFor(Object.assign({},bill,{title:'Conah Walker vs Alexis Rocha'}),mixed),null);
// A UFC title carries surnames only, and a surname still bills the fighter.
assert.deepStrictEqual(L.billed({title:'UFC Fight Night: Prochazka vs Stirling',bouts:[{fighters:['Navajo Stirling','Jiri Prochazka','Nobody Else']}]}),
 ['Navajo Stirling','Jiri Prochazka']);
// A surname under four letters is ignored, so it cannot hit inside another word.
assert.deepStrictEqual(L.billed({title:'Smith vs Jones',bouts:[{fighters:['Ann Li']}]}),[]);
assert.deepStrictEqual(L.billed({}),[]);
const boxResult={events:[{id:'e1',name:'Box',date:'2026-11-21',status:'completed',mainBoutId:'b1'}],
 results:[{id:'b1',event:'Box',winner:0,method:'KO',round:3,fighters:[{name:'Adam Azim'},{name:'Someone Else'}]}]};
assert.strictEqual(L.latestResult(boxResult,mixed,now).cutout,'assets/img/boxing-cutouts/adam-azim.webp');

// mergeCutouts: each register's rows are tagged with its folder, a slug held in both
// sports is dropped, and nothing at all gives null so callers keep their fallback.
const merged=L.mergeCutouts([['assets/img/ufc-cutouts/',{cutouts:{'a-one':{ok:true},'both-ways':{ok:true}}}],
 ['assets/img/boxing-cutouts/',{cutouts:{'b-two':{ok:true},'both-ways':{ok:true}}}]]);
assert.strictEqual(merged['a-one'].dir,'assets/img/ufc-cutouts/');
assert.strictEqual(merged['b-two'].dir,'assets/img/boxing-cutouts/');
assert.strictEqual(merged['both-ways'].ok,false);
assert.strictEqual(L.cutoutFor(boutEv('x',['Both Ways']),merged),null);
assert.strictEqual(L.mergeCutouts([['assets/img/ufc-cutouts/',null]]),null);
assert.strictEqual(L.mergeCutouts(null),null);

const withArt=L.build({stories:[
  st(9,'mma','Lead',{image:{url:'https://pub.test/lead.jpg'}}),
  st(8,'boxing','Box one'),
  st(7,'boxing','Box two',{image:{url:'https://pub.test/box.jpg'}}),
  st(6,'boxing','Box three'),
  st(5,'boxing','Row one',{image:{url:'https://pub.test/row.jpg'}}),
  st(4,'mma','MMA one',{image:{url:'https://pub.test/mma.jpg'}}),
  st(3,'mma','MMA two'),
  st(2,'mma','MMA three'),
  st(1,'mma','Row two',{image:{url:'assets/img/ufc/row-two-card.webp'}})],
 events:[{id:'kab-2026-11-28',date:'2026-11-28',sport:'boxing',title:'Kabayel',bouts:[{fighters:['Agit Kabayel','Nelson Hysa']}]},
         {id:'cut-2026-11-29',date:'2026-11-29',sport:'mma',title:'Navajo Stirling vs X Y',bouts:[{fighters:['Navajo Stirling','X Y']}]},
         {id:'none-2026-11-30',date:'2026-11-30',sport:'mma',title:'No art',bouts:[{fighters:['Nobody Here']}]}],
 results,cutouts:cut,posters,sumo:[],now},h);
// The poster wins where there is one, the cut-out fills in, and a card with neither stays text.
assert(withArt.includes('assets/img/posters/kab-landscape.webp'));
assert(withArt.includes('lp-fixture-cutout')&&withArt.includes('assets/img/ufc-cutouts/navajo-stirling.webp'));
// Every card carries something: two pictures here, and the house tile on the third.
assert.strictEqual((withArt.match(/lp-fixture-art/g)||[]).length,3);
assert.strictEqual((withArt.match(/lp-tile lp-tile-mma/g)||[]).length,1);
assert(!/class="lp-fixture lp-(?:mma|boxing)"/.test(withArt));
// Latest-news rows carry the story's own picture.
assert(withArt.includes('lp-latest-photo')&&withArt.includes('https://pub.test/row.jpg'));
assert(withArt.includes('lp-latest-row has-art'));
// A picture of a fighter that BEFN holds is marked for the borderless treatment.
// Cached event artwork is a poster, and a publisher's photo is theirs: neither is.
assert(withArt.includes('class="lp-fixture-art lp-fixture-cutout is-cached"'));
assert(withArt.includes('class="lp-latest-photo is-cached"'));
assert(withArt.includes('class="lp-fixture-art"'));
assert(withArt.includes('class="lp-lead-photo"'));
// A headline that names a cleared fighter lends its cut-out to a story with no picture.
assert.deepStrictEqual(L.cutoutForTitle('Jiří Procházka loses to Navajo Stirling',{'navajo-stirling':{ok:true}}),
 {url:'assets/img/ufc-cutouts/navajo-stirling.webp',name:''});
assert.strictEqual(L.cutoutForTitle('Navajo Stirling wins',{'navajo-stirling':{ok:false}}),null);
assert.strictEqual(L.cutoutForTitle('A story about nobody',{'navajo-stirling':{ok:true}}),null);
assert.strictEqual(L.cutoutForTitle('Stirling wins again',{'stirling':{ok:true}}),null);
assert.strictEqual(L.cutoutForTitle('Anything',null),null);
// A column whose newest story has no picture still shows one from the next story.
const boxCol=withArt.slice(withArt.indexOf('lp-col lp-boxing'),withArt.indexOf('lp-col lp-mma'));
assert(boxCol.includes('lp-col-photo')&&boxCol.includes('https://pub.test/box.jpg'));
// With nothing to show, slots carry the tile and no <img> is invented for them.
const noArt=L.build({stories:[st(1,'mma','Lead'),st(2,'boxing','Box one'),st(3,'boxing','Two'),st(4,'boxing','Three'),st(5,'boxing','Four')],events:[],now},h);
assert(!noArt.includes('lp-lead-photo'));
assert(noArt.includes('lp-col-photo lp-tile lp-tile-boxing'));
assert(noArt.includes('lp-latest-photo lp-tile'));
assert(!/<img[^>]*lp-tile/.test(noArt));

// A fighter the headline names, from the page's own local map, when nothing else fits.
const withLocal=L.build({stories:[st(9,'mma','Lead'),st(8,'boxing','Box one'),st(7,'boxing','Box two'),
  st(6,'boxing','Box three'),st(1,'boxing','Deontay Wilder returns in March')],
 events:[],now},
 Object.assign({},h,{localPhoto:(text,kind)=>/Deontay Wilder/.test(text)?{url:'assets/img/ufc/deontay-wilder-'+kind+'.webp',name:'Deontay Wilder'}:null}));
assert(withLocal.includes('assets/img/ufc/deontay-wilder-card.webp'));
assert(withLocal.includes('class="lp-latest-photo is-cached"'));
// The map is asked only when there is nothing better, and a page without one still works.
const noHelper=L.build({stories:[st(9,'mma','Lead'),st(8,'boxing','Box one'),st(7,'boxing','Box two'),st(6,'boxing','Box three'),st(1,'boxing','Deontay Wilder returns')],events:[],now},h);
assert(noHelper.includes('lp-latest-photo lp-tile'));
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
