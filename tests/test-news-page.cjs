const assert=require('assert');
const np=require('../assets/news-page.js');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h={esc,safeURL:x=>/^https:/.test(x)||/^assets\//.test(x)?esc(x):'#',meta:a=>'<span>'+esc(a.source)+'</span>',photo:a=>a.image?{url:a.image.url,alt:a.title}:{url:'',alt:''}};
const mk=(id,t,cov,extra={})=>({url:'https://x.test/'+id,title:t,source:'S'+id,sport:'boxing',publishedAt:new Date(Date.UTC(2026,10,19,id)).toISOString(),coverage:cov,...extra});
const stories=[mk(1,'Old big story',4,{alsoCoveredBy:['A','B','C','D']}),mk(5,'Newest',1),mk(3,'Middle',2)];
// Uses the feed's named leads.
let l=np.pickLeads(stories,{newest:stories[1].url,mostCovered:stories[0].url});
assert.deepStrictEqual(l.map(x=>x.story.title),['Newest','Old big story']);
assert.strictEqual(l[1].label,'Most covered');
// Falls back when the feed names a story the sport tab hides, and never repeats a story.
l=np.pickLeads(stories,{newest:'https://x.test/gone',mostCovered:'https://x.test/gone'});
assert.strictEqual(l[0].story.title,'Newest');assert.strictEqual(l[1].story.title,'Old big story');
l=np.pickLeads(stories,{newest:stories[0].url,mostCovered:stories[0].url});
assert.notStrictEqual(l[0].story.url,l[1].story.url);
// Nothing multi-covered: second slot is "Next up", not "Most covered".
l=np.pickLeads([mk(1,'A',1),mk(2,'B',1)],null);
assert.strictEqual(l[1].label,'Next up');
assert.deepStrictEqual(np.pickLeads([],null),[]);
assert.strictEqual(np.pickLeads([mk(1,'Only',1)],null).length,1);
// HTML escapes titles and shows a sport tile, never placeholder text, when there is no photo.
const html=np.leadsHTML(np.pickLeads([mk(1,'<b>Hi</b> & co',3,{alsoCoveredBy:['Z']})],null),h);
assert(!html.includes('<b>Hi'));assert(html.includes('&lt;b&gt;Hi'));assert(html.includes('np-photo-empty'));assert(!/photo\b.*tbc|placeholder/i.test(html));
assert(html.includes('3 outlets')&&html.includes('also Z'));
const withPhoto=np.rowHTML(mk(1,'T',1,{image:{url:'https://img.test/a.jpg'}}),h);
assert(withPhoto.includes('<img')&&withPhoto.includes('https://img.test/a.jpg'));
// Translated stories: untranslated entries are hidden, sport filter and order apply.
const lang={stories:[
 {title:'Teraji vs Amat',originalTitle:'寺地',url:'https://n.test/1',language:'ja',sport:'boxing',source:'Yahoo',publishedAt:'2026-11-19T01:00:00Z'},
 {title:'same',originalTitle:'same',url:'https://n.test/2',language:'es',sport:'mma',source:'Marca',publishedAt:'2026-11-19T02:00:00Z'},
 {title:'Topuria',originalTitle:'Topuria 2',url:'https://n.test/3',language:'es',sport:'mma',source:'Marca',publishedAt:'2026-11-19T03:00:00Z'}]};
assert.deepStrictEqual(np.usableLanguageStories(lang,'all').map(s=>s.title),['Topuria','Teraji vs Amat']);
assert.deepStrictEqual(np.usableLanguageStories(lang,'boxing').map(s=>s.title),['Teraji vs Amat']);
assert.deepStrictEqual(np.usableLanguageStories(null,'all'),[]);
const li=np.languageHTML(np.usableLanguageStories(lang,'all'),h);
assert(li.includes('JA · translated')&&li.includes('ES · translated')&&li.includes('lang="ja"')&&li.includes('from Japanese'));
assert.strictEqual(np.languageHTML([],h),'');
const many=[4,3,2,1].map(i=>({title:'Y'+i,originalTitle:'o'+i,url:'https://n.test/y'+i,language:'ja',sport:'boxing',source:'Yahoo',publishedAt:'2026-11-19T0'+i+':00:00Z'}));
many.push({title:'Marca one',originalTitle:'m',url:'https://n.test/m',language:'es',sport:'mma',source:'Marca',publishedAt:'2026-11-19T00:30:00Z'});
const div=np.languageHTML(many,h,2);
assert(div.includes('Marca one')&&div.includes('Y4')&&!div.includes('Y3'),'one per publisher first');
console.log('news page tests passed');
