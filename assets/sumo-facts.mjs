import {currentFactFeed,HIGH_WIN_PCT_THRESHOLD,rollingWinPercentageRows,ROLLING_BASHO_MAX,FACT_DIVISIONS} from './sumo-facts-data.mjs?v=20261121-v1';
import {factText,factPeople} from './sumo-fact-engine.mjs?v=20261121-phase2';
import {storylines} from './sumo-storylines.mjs?v=20261128-model2';
/* BEFN Sumo Stories: the hub. A fact of the day, themed rows, wrestler/pair search.
 * Facts come from the fact engine index (level B, scoped to BEFN's bout records)
 * and the owner-approved editorial file (level A/C). Nothing here is invented. */
const ROOT=document.querySelector('#sumo-main');
const S={roster:null,details:null,photos:{},cutouts:{},heads:{},lastBasho:[],feed:null,query:'',open:null,view:'stories',rollingBashos:1};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=w=>'sumo.html#profile/'+encodeURIComponent(w.sourceId);
const byId=id=>S.roster.rikishi.find(w=>String(w.sourceId)===String(id));
const name=id=>byId(id)?.shikonaEn||'';
function photo(w){
 const p=w&&S.photos[String(w.sourceId)];
 if(p?.approved!==true||!String(p.license||'').trim()||!String(p.credit||'').trim())return null;
 return /^assets\/sumo-photos\/[A-Za-z0-9_-]+\.(webp|jpg|jpeg|png)$/.test(p.path||'')?p.path:null;
}
function portrait(w,cls,priority=false){
 const path=photo(w);
 return '<div class="'+cls+'">'+(path?'<img src="'+esc(path)+'" alt="'+esc(w?.shikonaEn)+'" loading="'+(priority?'eager':'lazy')+'" decoding="async">':
 '<span class="facts-figure-fallback" aria-label="Portrait unavailable">相</span>')+'</div>';
}
/* Cut-out (or head crop) for a story card: only derivatives of an approved photo, as sumo.js checks. */
function derivative(map,id,dir){
 const d=map?.[String(id)],p=S.photos[String(id)];
 return d&&p?.approved===true&&d.sourceSha256===p.sha256&&new RegExp('^assets/sumo-photos/'+dir+'/[a-zA-Z0-9_-]+\\.webp$').test(String(d.path||''))?d.path:'';
}
/* Photo band on a story card: one or two wrestlers, cut-outs on the sumo blue. */
function band(ids){
 const shots=ids.slice(0,2).map(id=>({w:byId(id),src:derivative(S.cutouts,id,'cutout')||derivative(S.heads,id,'head')})).filter(x=>x.w&&x.src);
 if(!shots.length)return '';
 return '<div class="st-band'+(shots.length>1?' is-pair':'')+'">'+shots.map(x=>'<img src="'+esc(x.src)+'" alt="'+esc(x.w.shikonaEn)+'" loading="lazy" decoding="async"'+(x.src.includes('/head/')?' class="is-head"':'')+'>').join('')+'</div>';
}
/* ---- engine facts -> displayable records ------------------------------- */
const metricOf=f=>{
 switch(f.k){
  case 'series':return f.wa+'–'+f.wb;
  case 'streak':return String(f.n);
  case 'sweep':return f.n+'–0';
  case 'finish':return f.c+'/'+f.t;
  case 'rep':return String(f.n);
  case 'sig':return f.pct+'%';
  case 'rare':return f.total===1?'1':String(f.total);
  case 'clutch':return f.won+'–'+f.lost;
  case 'comeback':return '0–4';
  case 'first':return 'NEW';
  default:return '';
 }
};
const ROWS=[
 ['rivalries','Rivalries',['series','streak','sweep','finish'],'Head-to-head series between wrestlers BEFN tracks.'],
 ['technique','Technique',['rep','sig','rare'],'Winning moves since January 2021.'],
 ['pressure','Pressure',['clutch','comeback'],'Final-day nerve and comebacks from 0–4.']
];
function engineFacts(){
 const idx=S.details?.factIndex;
 if(idx?.schemaVersion!==1||String(idx.bashoId)!==String(S.details?.bashoId))return [];
 const out=[];
 for(const list of Object.values(idx.pairs||{}))for(const f of list)out.push(f);
 for(const list of Object.values(idx.people||{}))for(const f of list)out.push(f);
 return out.filter(f=>f.k!=='first').map(f=>{
  const t=factText(f,name),p=factPeople(f);
  if(!t||!p.main||!byId(p.main))return null;
  return {f,t,metric:metricOf(f),members:[p.main,p.other].filter(id=>id&&byId(id)),score:f.s};
 }).filter(Boolean).sort((a,b)=>b.score-a.score);
}
/* ---- pieces ------------------------------------------------------------- */
const names=ids=>ids.map(id=>{const w=byId(id);return w?'<a href="'+profile(w)+'">'+esc(w.shikonaEn)+'</a>':'';}).join('');
function railCard(r){
 return '<article class="st-card">'+band(r.members)+'<span class="st-metric">'+esc(r.metric)+'</span>'+
  '<h3>'+esc(r.t.lead)+'</h3>'+(r.t.rest?'<p>'+esc(r.t.rest)+'</p>':'')+
  '<div class="st-people">'+names(r.members)+'</div><small>'+esc(r.t.scope)+'</small></article>';
}
function editorialCard(c){
 const src=/^https:\/\//.test(c.sourceUrl||'')?'<a href="'+esc(c.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(c.sourceLabel||'Source')+' ↗</a>':'';
 const ids=c.memberIds||[];
 return '<article class="st-card">'+band(ids)+'<span class="st-metric st-tag">'+esc(c.metric||c.tag)+'</span>'+
  '<h3>'+esc(c.headline)+'</h3><p>'+esc(c.description)+'</p>'+
  '<div class="st-people">'+names(ids)+'</div><small>'+(c.kind==='dynamic'?'Tournament snapshot':'Checked '+esc(c.verifiedAt||''))+' '+src+'</small></article>';
}
/* Storylines of the last finished basho (sumo-storylines.mjs): big number, tag, photo, link to the review. */
function storyCard(c){
 return '<article class="st-card st-story">'+band(c.memberIds||[])+'<span class="st-kicker">'+esc(c.tag)+'</span><span class="st-metric">'+esc(c.metric)+'</span>'+
  '<h3>'+esc(c.headline)+'</h3><p>'+esc(c.description)+'</p>'+
  '<div class="st-people">'+names(c.memberIds||[])+'</div><small>BEFN predictor and bout records · <a href="'+esc(c.link)+'">'+(c.link.includes('#predict')?'Power table':'Basho review')+' ›</a></small></article>';
}
function row(id,title,sub,cards,{limit=6}={}){
 if(!cards.length)return '';
 const open=S.open===id,shown=open?cards:cards.slice(0,limit);
 return '<section class="st-row" aria-labelledby="st-'+id+'"><div class="st-rowhead"><div><h2 id="st-'+id+'">'+esc(title)+'</h2><span>'+esc(sub)+'</span></div>'+
  (cards.length>limit?'<button type="button" class="st-all" data-open="'+id+'" aria-expanded="'+open+'">'+(open?'Show fewer':'See all '+cards.length)+'</button>':'')+
  '</div><div class="st-rail'+(open?' is-open':'')+'">'+shown.join('')+'</div></section>';
}
function oneRowPerPair(list){
 const seen=new Set();
 return list.filter(r=>{const k=r.f.k+':'+r.members.slice().sort().join('-');if(seen.has(k))return false;seen.add(k);return true;});
}
function factOfTheDay(pool){
 if(!pool.length)return '';
 const top=pool.filter(r=>r.members.length===2).slice(0,6);
 const list=top.length?top:pool.slice(0,6);
 const day=Math.floor(Date.now()/86400000);
 const r=list[day%list.length],[a,b]=r.members.map(byId);
 return '<section class="st-today" aria-label="Fact of the day"><div class="st-today-text"><span class="st-label">Fact of the day</span>'+
  '<strong class="st-bignum">'+esc(r.metric)+'</strong><h2>'+esc(r.t.lead)+'</h2>'+(r.t.rest?'<p>'+esc(r.t.rest)+'</p>':'')+
  '<small>'+esc(r.t.scope)+'</small></div><div class="st-today-faces">'+portrait(a,'st-face',true)+(b?portrait(b,'st-face'):'')+'</div></section>';
}
/* ---- search: one wrestler, or two separated by v / vs / , / & ----------- */
function matchWrestler(q){
 const t=q.trim().toLowerCase();
 if(!t)return null;
 return S.roster.rikishi.find(w=>String(w.shikonaEn||'').toLowerCase()===t)||
  S.roster.rikishi.find(w=>String(w.shikonaEn||'').toLowerCase().startsWith(t))||
  S.roster.rikishi.find(w=>String(w.shikonaEn||'').toLowerCase().includes(t))||null;
}
function searchResults(all){
 const parts=S.query.split(/\s+(?:vs?\.?|and)\s+|\s*[,&]\s*/i).filter(x=>x.trim());
 const found=parts.slice(0,2).map(matchWrestler);
 if(!found.length||found.some(w=>!w))return '<div class="facts-empty">No tracked wrestler matches “'+esc(S.query)+'”. Try a shikona such as Hoshoryu, or a pair such as “Ura v Daieisho”.</div>';
 const ids=found.map(w=>String(w.sourceId));
 const hits=ids.length===2?all.filter(r=>ids.every(id=>r.members.map(String).includes(id))):all.filter(r=>r.members.map(String).includes(ids[0]));
 const title=found.map(w=>w.shikonaEn).join(' v ');
 return '<section class="st-row"><div class="st-rowhead"><div><h2>'+esc(title)+'</h2><span>'+hits.length+' '+(hits.length===1?'fact':'facts')+' in BEFN’s records</span></div></div>'+
  (hits.length?'<div class="st-rail is-open">'+hits.map(railCard).join('')+'</div>':
  '<div class="facts-empty">Nothing clears the bar for '+esc(title)+' yet. Facts only show when they are both true and surprising.</div>')+'</section>';
}
/* ---- win % (kept as its own view until the Leaderboards section exists) -- */
function rollingCard(w,rank){
 const r=byId(w.id);
 return '<article class="facts-rolling-card"><span class="facts-rolling-place">'+rank+'</span>'+portrait(r,'facts-rolling-photo')+
  '<div class="facts-rolling-person"><a href="'+profile(r)+'">'+esc(w.name)+'</a><small>'+esc(w.rank)+' · '+esc(w.stable)+'</small>'+
  '<span>'+w.wins+' wins · '+w.losses+' losses · '+w.bouts+' decided bouts</span></div><strong class="facts-rolling-pct">'+w.winPct.toFixed(1)+'%</strong></article>';
}
function winPctView(){
 const n=S.rollingBashos,presets=[[1,'This basho'],[3,'Last 3'],[6,'Last 6'],[12,'Last 12'],[24,'Two years']];
 const rows=S.feed.fresh?rollingWinPercentageRows(S.roster,S.details,n,{limitPerDivision:18}):[];
 const hist=S.details?.funFactsHistory;
 const ready=n===1||(hist?.schemaVersion===1&&String(hist.bashoId)===String(S.details?.bashoId)&&hist.historicalBashos?.length>=n-1);
 const blocks=FACT_DIVISIONS.map(div=>{const g=rows.filter(x=>x.division===div);
  return g.length?'<section class="facts-rolling-division"><div class="facts-section-title"><h3>'+div+'</h3><span>'+g.length+' ranked wrestlers</span></div><div class="facts-rolling-grid">'+g.map((w,i)=>rollingCard(w,i+1)).join('')+'</div></section>':'';}).join('');
 const empty=!S.feed.fresh?'The latest results snapshot is more than 48 hours old. Win % figures are hidden until the source refreshes.':
  !ready?'The complete-basho history for this period has not been generated yet. It arrives with the next successful results refresh.':'No wrestlers have complete, qualifying histories across this period. Try a shorter one.';
 return '<section class="facts-rolling"><div class="facts-rolling-head"><div><span class="facts-kicker">Win % leaders · complete saved bout records</span><h2>Winning across '+n+' basho</h2></div></div>'+
  '<div class="st-presets" role="group" aria-label="Win % window">'+presets.filter(p=>p[0]<=ROLLING_BASHO_MAX).map(([v,l])=>'<button type="button" data-win="'+v+'" aria-pressed="'+(v===n)+'">'+l+'</button>').join('')+'</div>'+
  '<p class="facts-rolling-note">Win % = wins ÷ (wins + losses), including the current tournament plus '+(n-1)+' completed before it. Historical basho count only when every regular bout is recorded. Division shown is each wrestler’s current division.</p>'+
  (rows.length?blocks:'<div class="facts-empty">'+esc(empty)+'</div>')+'</section>';
}
/* ---- page --------------------------------------------------------------- */
function dateLabel(iso){
 if(!iso||Number.isNaN(Date.parse(iso)))return 'No update timestamp';
 return new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Australia/Melbourne'}).format(new Date(iso))+' Melbourne time';
}
function storiesBody(){
 const all=engineFacts();
 if(S.query.trim())return searchResults(all);
 const rows=ROWS.map(([id,title,kinds,sub])=>row(id,title,sub,oneRowPerPair(all.filter(r=>kinds.includes(r.f.k))).map(railCard)));
 const cards=S.feed.cards,pick=cats=>cards.filter(c=>cats.includes(c.category));
 const live=S.feed.fresh?pick(['title','fire','watch']):[];
 const ed=[
  row('rising','Rising stars','Fast climbs and early titles.',pick(['rising']).map(editorialCard)),
  row('families','Families and roots','Brothers, dynasties and stable showdowns.',pick(['family','stablemates']).map(editorialCard)),
  row('records','Records','Honours, re-checked every 90 days.',pick(['records']).map(editorialCard))
 ];
 const thisBasho=live.length?row('basho','This basho','Live from the current tournament. Hidden when data is over 48 hours old.',live.map(editorialCard)):'';
 const last=S.lastBasho.length?row('lastbasho',S.lastBashoName?'The '+S.lastBashoName+' basho':'The last basho','Who beat the odds, who fell short, and the biggest shock, by BEFN’s predictor.',S.lastBasho.map(storyCard)):'';
 return factOfTheDay(all)+thisBasho+last+rows.join('')+ed.join('');
}
function render(){
 const f=S.feed,highPct=f.fresh?f.rows.filter(w=>w.bouts>=(w.division==='Makushita'?3:5)&&w.wins*100>=HIGH_WIN_PCT_THRESHOLD*w.bouts).length:'—';
 const stories=S.view==='stories';
 /* Same page head as the other Sumo pages: dark band, gold kicker, Unbounded sentence-case title (28 Nov 2026). */
 ROOT.innerHTML='<div class="sumo-facts sumo-stories"><header class="facts-top st-hero"><span class="st-hero-kicker">Sumo stories</span>'+
 '<h1>True, surprising and sourced</h1><p>Every story features a wrestler on today’s banzuke and shows where it comes from.</p>'+
 '<div class="facts-status"><b'+(f.fresh?'':' class="is-stale"')+'>'+(f.fresh?'Current tournament':'Live form paused: source data out of date')+'</b>'+
 '<span>'+esc(f.bashoLabel)+' · Updated '+esc(dateLabel(f.asOf))+'</span></div></header>'+
 '<nav class="st-tabs" aria-label="Stories views"><button type="button" data-view="stories" aria-pressed="'+stories+'">Stories</button>'+
 '<button type="button" data-view="winpct" aria-pressed="'+!stories+'">Win % Leaders <small>'+highPct+' at 80%+ basho win rate</small></button>'+
 (stories?'<label class="facts-find"><input id="facts-search" type="search" aria-label="Search by wrestler or pair" placeholder="A wrestler, or a pair: Ura v Daieisho" value="'+esc(S.query)+'" autocomplete="off"></label>':'')+'</nav>'+
 '<div id="facts-results" aria-live="polite"></div>'+
 '<aside class="facts-about"><strong>How stories are chosen:</strong> a fact must be true as worded, then surprising enough to show. Facts calculated from BEFN’s stored bout records are scoped to those records (“in BEFN’s records”), never “in sumo”, and are not independently JSA-certified. Family and record stories carry a source link and are re-checked on a schedule. If tournament data is over 48 hours old, live-form stories are withheld.'+
 '<div class="facts-linkrow"><a href="sumo.html#basho">Latest results</a><a href="sumo-stables.html">Explore stables</a><a href="https://www.sumo.or.jp/EnHonbashoMain/leaders/" target="_blank" rel="noopener noreferrer">Official JSA leaders ↗</a></div></aside></div>';
 ROOT.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{S.view=b.dataset.view;render();}));
 const input=ROOT.querySelector('#facts-search');
 if(input)input.addEventListener('input',e=>{S.query=e.target.value;paint();});
 paint();
}
function paint(){
 const out=ROOT.querySelector('#facts-results');
 out.innerHTML=S.view==='stories'?storiesBody():winPctView();
 out.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{S.open=S.open===b.dataset.open?null:b.dataset.open;paint();}));
 out.querySelectorAll('[data-win]').forEach(b=>b.addEventListener('click',()=>{S.rollingBashos=Number(b.dataset.win);paint();}));
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
  S.feed=currentFactFeed(roster,details,curated);
  /* Photos and the last basho's storylines are extras: the page shows without them. */
  const [cut,heads,model,index]=await Promise.all(['data/sumo/cutouts.json','data/sumo/heads.json','data/sumo/predictor.json','data/sumo/basho-archive/index.json'].map(u=>load(u).catch(()=>null)));
  S.cutouts=cut?.bySourceId||{};S.heads=heads?.bySourceId||{};
  const lastId=index?.basho?.length?index.basho[index.basho.length-1].bashoId:null;
  if(model&&/^\d{6}$/.test(String(lastId||''))){
   const file=await load('data/sumo/basho-archive/'+lastId+'.json').catch(()=>null);
   try{S.lastBasho=storylines(file,model,roster);S.lastBashoName=new Date(Date.UTC(+lastId.slice(0,4),+lastId.slice(4)-1,1)).toLocaleDateString('en-AU',{month:'long',year:'numeric',timeZone:'UTC'});}catch(e){S.lastBasho=[];}
  }
  if(new URLSearchParams(location.search).get('view')==='winpct')S.view='winpct';
  render();
 }catch(error){
  ROOT.innerHTML='<div class="sumo-facts"><h1>Sumo Stories unavailable</h1><p>Source data could not be loaded, so dated claims are withheld.</p><a href="sumo.html">Back to Sumo</a></div>';
  console.error('Sumo stories:',error);
 }
}
main();
