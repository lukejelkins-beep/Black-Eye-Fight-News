import {currentFactFeed} from './sumo-facts-data.mjs';
const ROOT=document.querySelector('#sumo-main');
const CATS=[['all','All stories'],['fire','On fire 🔥'],['title','Title race'],['watch','Record watch'],['family','Family ties'],['records','Record holders']];
const S={roster:null,photos:{},feed:null,filter:'all',query:''};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=w=>'sumo.html#profile/'+encodeURIComponent(w.sourceId);
const people=c=>(c.memberIds||[]).map(id=>S.roster.rikishi.find(w=>String(w.sourceId)===String(id))).filter(Boolean);
const heroPerson=c=>people(c).find(w=>photo(w))||people(c)[0]||null;
function photo(w){
 const p=w&&S.photos[String(w.sourceId)];
 if(p?.approved!==true||!String(p.license||'').trim()||!String(p.credit||'').trim())return null;
 return /^assets\/sumo-photos\/[A-Za-z0-9_-]+\.(webp|jpg|jpeg|png)$/.test(p.path||'')?p.path:null;
}
function portrait(w,cls,priority=false){
 const path=photo(w);
 return '<div class="'+cls+'">'+(path?'<img src="'+esc(path)+'" alt="'+esc(w.shikonaEn)+'" loading="'+(priority?'eager':'lazy')+'" decoding="async">':
 '<span class="facts-figure-fallback" aria-label="Portrait unavailable">相</span>')+'</div>';
}
function peopleLinks(c){
 return '<div class="facts-people">'+people(c).map(w=>'<a href="'+profile(w)+'">'+esc(w.shikonaEn)+'</a>').join('')+'</div>';
}
function source(c){
 return /^https:\/\//.test(c.sourceUrl||'')?'<a href="'+esc(c.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(c.sourceLabel||'Source')+' ↗</a>':'';
}
function factTile(c){
 return '<article class="facts-tile"><div class="facts-tile-banner">'+portrait(heroPerson(c),'facts-tile-photo')+
 (c.metric?'<div class="facts-banner-metric">'+esc(c.metric)+'</div>':'')+'</div>'+
 '<div class="facts-tile-body"><span class="facts-tile-label">'+esc(c.tag||c.category)+'</span>'+
 '<h3>'+esc(c.headline)+'</h3><p>'+esc(c.description)+'</p>'+peopleLinks(c)+
 '<div class="facts-source"><span>'+(c.kind==='dynamic'?'Tournament snapshot':'Checked '+esc(c.verifiedAt||''))+'</span>'+source(c)+'</div></div></article>';
}
function feature(c,main=false){
 const w=heroPerson(c);
 return main?'<article class="facts-feature-main"><div class="facts-cover-text">'+
 '<span class="facts-mini-tag">'+esc(c.tag)+'</span><h2>'+esc(c.headline)+'</h2><p>'+esc(c.description)+'</p>'+
 (c.metric?'<strong class="facts-stat-accent">'+esc(c.metric)+'</strong>':'')+
 peopleLinks(c)+'<div class="facts-source"><span>Source-checked story</span>'+source(c)+'</div></div>'+
 portrait(w,'facts-figure',true)+'</article>':
 '<article class="facts-side-card">'+portrait(w,'facts-side-photo')+
 '<div class="facts-side-body"><small>'+esc(c.tag)+'</small><h3>'+esc(c.headline)+'</h3>'+
 '<p>'+esc(c.description)+'</p>'+peopleLinks(c)+'</div></article>';
}
function visible(){
 const q=S.query.toLowerCase().trim();
 return S.feed.cards.filter(c=>(S.filter==='all'||c.category===S.filter)&&
 (!q||[c.headline,c.description,...people(c).map(w=>w.shikonaEn)].some(s=>String(s||'').toLowerCase().includes(q))));
}
function refreshCards(){
 const list=visible(),featureList=S.filter==='all'&&!S.query?list.slice(0,3):[],tail=list.slice(featureList.length);
 const section=featureList.length?'<section class="facts-feature" aria-label="Featured current stories">'+
 feature(featureList[0],true)+(featureList.length>1?'<div class="facts-feature-side">'+featureList.slice(1).map(c=>feature(c)).join('')+'</div>':'')+'</section>':'';
 const content=tail.length?'<div class="facts-grid">'+tail.map(factTile).join('')+'</div>':
 (featureList.length?'':'<div class="facts-empty">No sourced facts match. Try a different filter or search.</div>');
 ROOT.querySelector('#facts-results').innerHTML=section+
 '<div class="facts-section-title"><h2>'+(S.filter==='all'?'More sumo stories':esc(CATS.find(c=>c[0]===S.filter)?.[1]||'Stories'))+
 '</h2><span>'+list.length+' sourced '+(list.length===1?'story':'stories')+'</span></div>'+content;
 ROOT.querySelectorAll('[data-fact-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.factFilter===S.filter)));
}
function dateLabel(iso){
 if(!iso||Number.isNaN(Date.parse(iso)))return 'No update timestamp';
 return new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Australia/Melbourne'}).format(new Date(iso))+' Melbourne time';
}
function render(){
 const f=S.feed,unbeaten=f.fresh?f.rows.filter(w=>w.perfect&&w.bouts>=4).length:'—';
 const doubleWins=f.fresh?f.rows.filter(w=>w.division==='Makuuchi'&&w.wins>=10).length:'—';
 ROOT.innerHTML='<div class="sumo-facts"><header class="facts-top"><span class="facts-kicker">BEFN SUMO · THE DOHYO DIARIES</span>'+
 '<h1>Sumo <em>Fun Facts</em></h1>'+
 '<p>Family dynasties. Hot streaks. Unbeaten records. Record holders and incredible tournament milestones. Every story features a currently tracked rikishi.</p></header>'+
 '<div class="facts-status"><b'+(f.fresh?'':' class="is-stale"')+'>'+(f.fresh?'Current tournament snapshot':'Live form paused — source data out of date')+'</b>'+
 '<span>'+esc(f.bashoLabel)+' · Updated '+esc(dateLabel(f.asOf))+'</span></div>'+
 '<section class="facts-statbar" aria-label="Tracked wrestler statistics">'+
 '<div><strong>'+f.trackedCount+'</strong><small>Tracked rikishi</small></div>'+
 '<div><strong>'+unbeaten+'</strong><small>Unbeaten (4+ bouts)</small></div>'+
 '<div><strong>'+doubleWins+'</strong><small>Makuuchi 10+ wins</small></div>'+
 '<div><strong>'+f.editorialCount+'</strong><small>Verified stories</small></div></section>'+
 '<div class="facts-controls"><div class="facts-filters" role="group" aria-label="Choose a story category">'+
 CATS.map(([id,label])=>'<button type="button" data-fact-filter="'+id+'" aria-pressed="'+(id===S.filter)+'">'+label+'</button>').join('')+
 '</div><label class="facts-find"><input id="facts-search" type="search" aria-label="Search facts" placeholder="Search wrestlers or stories…" value="'+esc(S.query)+'" autocomplete="off"></label></div>'+
 '<section id="facts-results" aria-live="polite"></section>'+
 '<aside class="facts-about"><strong>Always date-checked:</strong> Tournament stories recalculate from each successful Sumo preview banzuke refresh. If data is older than 48 hours, all live-form stories are withheld. Family facts are linked to external sources and display only while featured wrestlers remain in the tracked roster. Historical record-holder stories need a fresh editorial review every 90 days. These are completed-bout figures for Makuuchi, Jūryō and Makushita; not live play-by-play or all-division records.'+
 '<div class="facts-linkrow"><a href="sumo.html#basho">Latest results</a><a href="sumo-stables.html">Explore stables</a>'+
 '<a href="https://www.sumo.or.jp/EnHonbashoMain/leaders/" target="_blank" rel="noopener noreferrer">Official JSA leaders ↗</a></div></aside></div>';
 ROOT.querySelectorAll('[data-fact-filter]').forEach(b=>b.addEventListener('click',()=>{S.filter=b.dataset.factFilter;refreshCards();}));
 ROOT.querySelector('#facts-search').addEventListener('input',e=>{S.query=e.target.value;refreshCards();});
 refreshCards();
}
async function load(path){const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw Error(path+' unavailable');return response.json();}
async function main(){
 try{
  const [roster,details,curated,photos]=await Promise.all([
   load('data/sumo/rikishi-index.json'),load('data/sumo/preview-details.json'),
   load('data/sumo/fun-facts-editorial.json'),load('data/sumo/approved-photos.json')
  ]);
  if(!Array.isArray(roster?.rikishi)||!details?.banzuke)throw Error('Incomplete Sumo data');
  S.roster=roster;S.photos=photos?.bySourceId||{};
  S.feed=currentFactFeed(roster,details,curated);render();
 }catch(error){
  ROOT.innerHTML='<div class="sumo-facts"><h1>Fun Facts unavailable</h1><p>Source data could not be loaded, so dated tournament claims are withheld.</p><a href="sumo.html">Back to Sumo</a></div>';
  console.error('Sumo facts:',error);
 }
}
main();
