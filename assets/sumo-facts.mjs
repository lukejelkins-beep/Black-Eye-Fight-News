import {currentFactFeed,HIGH_WIN_PCT_THRESHOLD,rollingWinPercentageRows,ROLLING_BASHO_MAX,FACT_DIVISIONS} from './sumo-facts-data.mjs?v=20261121-v1';
const ROOT=document.querySelector('#sumo-main');
const CATS=[['all','All stories'],['fire','On fire 🔥'],['rising','Rising stars'],['percent','Win % Leaders'],['title','Title race'],['watch','Record watch'],['stablemates','Stablemate Showdowns'],['family','Family ties'],['records','Record holders']];
const S={roster:null,details:null,photos:{},feed:null,filter:'all',query:'',rollingBashos:1};
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
/** Full rolling leaderboard; controls count every selected basho, not just
 * a cherry-picked number of past fights. The current basho may be in progress
 * and all previous bashos must have complete, source-backed records.
 */
function rollingCard(w,rank){
 const r=S.roster.rikishi.find(x=>String(x.sourceId)===w.id);
 const metric=w.winPct.toFixed(1)+'%';
 return '<article class="facts-rolling-card">'+
   '<span class="facts-rolling-place" aria-label="Division percentage rank">'+rank+'</span>'+
   portrait(r,'facts-rolling-photo')+
   '<div class="facts-rolling-person"><a href="'+profile(r)+'">'+esc(w.name)+'</a>'+
   '<small>'+esc(w.rank)+' · '+esc(w.stable)+'</small>'+
   '<span>'+w.wins+' wins · '+w.losses+' losses · '+w.bouts+' decided bouts</span></div>'+
   '<strong class="facts-rolling-pct">'+metric+'</strong></article>';
}
function rollingPanel(){
 const n=S.rollingBashos;
 const options=Array.from({length:ROLLING_BASHO_MAX},(_,i)=>i+1);
 const rows=S.feed.fresh?rollingWinPercentageRows(S.roster,S.details,n,{limitPerDivision:18}):[];
 const q=S.query.trim().toLowerCase();
 const matches=rows.filter(w=>!q||[w.name,w.stable,w.division,w.rank].some(t=>String(t||'').toLowerCase().includes(q)));
 const history=S.details?.funFactsHistory;
 const historicalReady=n===1||(history?.schemaVersion===1&&String(history.bashoId)===String(S.details?.bashoId)&&
   history.historicalBashos?.length>=n-1);
 const select='<label for="facts-rolling-window">Last</label>'+
  '<select id="facts-rolling-window" aria-label="Win percentage over last N basho">'+
  options.map(v=>'<option value="'+v+'"'+(v===n?' selected':'')+'>'+v+'</option>').join('')+'</select>'+
  '<span>basho'+(n===1?'':' · current + '+(n-1)+' previous completed')+'</span>';
 const header='<section class="facts-rolling"><div class="facts-rolling-head">'+
  '<div><span class="facts-kicker">ROLLING WIN % · COMPLETE CACHED BOUT RECORDS</span>'+
  '<h2>Winning across '+n+' basho'+(n===1?'':'')+'</h2></div>'+
  '<div class="facts-rolling-select">'+select+'</div></div>'+
  '<p class="facts-rolling-note">Win % = wins ÷ (wins + losses). The range always includes the current '+
  'tournament (as played), plus '+(n-1)+' immediately preceding completed basho'+(n===2?'':'s')+
  '. Historical basho only count when all 15 or 7 regular bouts are recorded. '+
  'Playoffs and incomplete or injury-affected historical tournaments are excluded from these rankings.'+
  ' Displayed division is each wrestler’s <strong>current</strong> division.</p>';
 const empty=!S.feed.fresh?
  'The latest results snapshot is more than 48 hours old. Rolling figures are hidden until the source refreshes.':
  !historicalReady?
  'The complete-basho historical rollup has not yet been generated for this preview. It will be built by the next successful results refresh.':
  'No wrestlers have complete, qualifying tournament histories across this exact '+n+'-basho period'+(q?' matching your search':'')+'. Try a shorter period.';
 const blocks=FACT_DIVISIONS.map(div=>{
  const group=matches.filter(x=>x.division===div);
  if(!group.length)return '';
  return '<section class="facts-rolling-division"><div class="facts-section-title">'+
    '<h3>'+div+'</h3><span>'+group.length+' ranked wrestlers</span></div>'+
    '<div class="facts-rolling-grid">'+group.map((w,i)=>rollingCard(w,i+1)).join('')+'</div></section>';
 }).join('');
 const output=matches.length?blocks:'<div class="facts-empty">'+esc(empty)+'</div>';
 return header+output+'</section>';
}
function refreshCards(){
 if(S.filter==='percent'){
  ROOT.querySelector('#facts-results').innerHTML=rollingPanel();
  ROOT.querySelector('#facts-rolling-window').addEventListener('change',e=>{
   const next=Number(e.target.value);
   if(Number.isInteger(next)&&next>=1&&next<=ROLLING_BASHO_MAX){S.rollingBashos=next;refreshCards();}
  });
  ROOT.querySelectorAll('[data-fact-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.factFilter===S.filter)));
  return;
 }
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
 const highPct=f.fresh?f.rows.filter(w=>w.bouts>=(w.division==='Makushita'?3:5)&&w.wins*100>=HIGH_WIN_PCT_THRESHOLD*w.bouts).length:'—';
 ROOT.innerHTML='<div class="sumo-facts"><header class="facts-top"><span class="facts-kicker">BEFN SUMO · THE DOHYO DIARIES</span>'+
 '<h1>Sumo <em>Fun Facts</em></h1>'+
 '<p>Family dynasties. Rare stablemate playoffs. Hot streaks. Fast-rising newcomers. Win percentages over 1–30 basho, record holders and tournament milestones. Every story features a currently tracked rikishi.</p></header>'+
 '<div class="facts-status"><b'+(f.fresh?'':' class="is-stale"')+'>'+(f.fresh?'Current tournament snapshot':'Live form paused — source data out of date')+'</b>'+
 '<span>'+esc(f.bashoLabel)+' · Updated '+esc(dateLabel(f.asOf))+'</span></div>'+
 '<section class="facts-statbar" aria-label="Tracked wrestler statistics">'+
 '<div><strong>'+f.trackedCount+'</strong><small>Tracked rikishi</small></div>'+
 '<div><strong>'+unbeaten+'</strong><small>Unbeaten (4+ bouts)</small></div>'+
 '<div><strong>'+highPct+'</strong><small>80%+ basho win rate</small></div>'+ 
 '<div><strong>'+f.editorialCount+'</strong><small>Verified stories</small></div></section>'+
 '<div class="facts-controls"><div class="facts-filters" role="group" aria-label="Choose a story category">'+
 CATS.map(([id,label])=>'<button type="button" data-fact-filter="'+id+'" aria-pressed="'+(id===S.filter)+'">'+label+'</button>').join('')+
 '</div><label class="facts-find"><input id="facts-search" type="search" aria-label="Search facts" placeholder="Search wrestlers or stories…" value="'+esc(S.query)+'" autocomplete="off"></label></div>'+
 '<section id="facts-results" aria-live="polite"></section>'+
 '<aside class="facts-about"><strong>Always date-checked:</strong> Tournament stories recalculate from each successful Sumo preview banzuke refresh. If data is older than 48 hours, all live-form stories are withheld. Family facts are linked to external sources and display only while featured wrestlers remain in the tracked roster. Historical record-holder stories need a fresh editorial review every 90 days. Stablemates usually meet only in exceptional title playoffs; only individually sourced completed meetings appear. Win percentages are wins divided by completed decisions (W+L), requiring 5 bouts in Makuuchi/Jūryō or 3 in Makushita. These are completed-bout figures for the three tracked divisions, not live play-by-play or all-division records. Rising stars use the cached banzuke and bout history of wrestlers now in Makushita or above: ranked basho count from a wrestler’s first banzuke appearance, and a basho’s record is shown only when every regular bout is recorded.'+
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
  S.roster=roster;S.details=details;S.photos=photos?.bySourceId||{};
  S.feed=currentFactFeed(roster,details,curated);render();
 }catch(error){
  ROOT.innerHTML='<div class="sumo-facts"><h1>Fun Facts unavailable</h1><p>Source data could not be loaded, so dated tournament claims are withheld.</p><a href="sumo.html">Back to Sumo</a></div>';
  console.error('Sumo facts:',error);
 }
}
main();
