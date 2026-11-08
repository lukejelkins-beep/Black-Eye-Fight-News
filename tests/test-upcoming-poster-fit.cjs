/* Regression coverage for mixed image ratios, missing posters and fallbacks. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/upcoming-cards.js','utf8');
const styles=fs.readFileSync('assets/upcoming-cards.css','utf8');
const photoNames={'Fighter One':{photo:'https://example.com/one.jpg'},'Fighter Two':{photo:'https://example.com/two.jpg'}};
const input={reviewedAt:'2026-11-08',events:[
 {id:'wp',sport:'boxing',date:'2026-11-28',title:'Wide poster',promotion:'Test',location:'Test',source:'https://example.com',
  poster:{url:'https://schedule.fightmag.com/wp-content/uploads/2026/08/show-696x392.jpg',source:'https://example.com'},bouts:[{section:'main',fighters:['Fighter One','Fighter Two']}]},
 {id:'missing',sport:'boxing',date:'2026-11-29',title:'No poster',promotion:'Test',location:'Test',source:'https://example.com',bouts:[{section:'main',fighters:['Fighter One','Fighter Two']}]}
]};
const handlers={};
const doc={addEventListener(name,fn){handlers[name]=fn},getElementById(id){
 return id==='fighter-portrait-registry'?{textContent:JSON.stringify({fighters:photoNames})}:null
},querySelectorAll(){return []}};
const sandbox={window:{},document:doc,URL,Date,console,location:{hash:'#calendar'},setInterval(){},
 AbortSignal:{timeout:()=>undefined},fetch:async()=>({ok:true,json:async()=>input})};
vm.runInNewContext(fs.readFileSync('assets/local-time.js','utf8'),sandbox);
vm.runInNewContext(source,sandbox);
(async()=>{
 await sandbox.window.UpcomingCards.load();
 const html=sandbox.window.UpcomingCards.render('boxing');
 assert(html.includes('show.jpg'),'WordPress original poster URL preferred');
 assert(html.includes('data-upcoming-poster-candidates='),'Original and backup image candidates retained');
 assert(html.includes('upcoming-hero-fighter-slot'),'Portrait fallback available');
 assert(html.indexOf('upcoming-hero-poster')<html.indexOf('upcoming-hero-content'),'Artwork above event copy');
 assert(html.includes('upcoming-schedule-row')&&html.includes('data-upcoming-panel='),'Expandable event details retained');
 assert(styles.includes('object-fit:contain!important'),'Poster thumbnail must not crop');
 assert(html.includes('upcoming-schedule-row'),'Compact fixture row required');
 assert(styles.includes('object-fit:contain!important'),'Images never cropped to cover');
 assert(!/\.upcoming-hero-poster\s*\{[^}]*object-fit:cover/.test(styles),'Posters must never use cover cropping');
 const classes=new Set(),props={};
 const hero={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
 const media={style:{setProperty:(k,v)=>{props[k]=v}}};
 const img={
  naturalWidth:1159,naturalHeight:420,hidden:false,dataset:{},src:'https://example.com/poster.jpg',
  matches:q=>q==='.upcoming-hero-poster',closest:q=>q==='.upcoming-hero'?hero:q==='.upcoming-hero-media'?media:null
 };
 handlers.load({target:img});
 assert.equal(props['--poster-ratio'],'1159 / 420');
 assert.equal(props['--poster-native-width'],'1159px');
 assert(classes.has('is-poster-ready'),'Valid wide posters must display');
 img.naturalWidth=500;img.naturalHeight=800;
 handlers.load({target:img});
 assert.equal(props['--poster-ratio'],'500 / 800','Portrait image ratio preserved');
 img.naturalWidth=180;img.naturalHeight=90;img.dataset={};
 handlers.load({target:img});
 assert(img.hidden,'Undersized images fall back instead of being upscaled');
 // A supposed portrait that is actually landscape must fall back to real
 // event art rather than being force-cropped into the narrow thumbnail.
 img.hidden=false;img.naturalWidth=960;img.naturalHeight=540;
 img.dataset={upcomingPosterCandidates:JSON.stringify([
  {url:'https://example.com/claimed-portrait.jpg',kind:'portrait'},
  {url:'https://example.com/original.jpg',kind:'artwork'}]),upcomingPosterIndex:'0'};
 handlers.load({target:img});
 assert.equal(img.src,'https://example.com/original.jpg','Wrong-shape portrait should fall back');
 assert.equal(img.dataset.upcomingPosterIndex,'1');
 handlers.load({target:img});
 assert(classes.has('is-poster-ready'),'The contained landscape artwork remains usable');
 console.log('Poster QA passed: wide/portrait/native-size rendering, unavailable art, image backup and card accordion');
})().catch(e=>{console.error(e);process.exitCode=1});
