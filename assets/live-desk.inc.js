/* Standalone continuously updated public fight desk. */
state.news='all';state.newsPage=1;state.newsMode='latest';state.newsSort='latest';state.talkRole='all';state.talkSort='balanced';state.social='all';state.matDiscipline='all';
const desk={articles:[],sources:[],lastSuccessfulAt:null,events:[],reviewedAt:null,error:'',pending:null};
const displayDate=v=>window.FightTime.localDateTime(v);
const dayLabel=v=>new Date(v+'T12:00:00Z').toLocaleDateString('en-AU',{dateStyle:'medium',timeZone:'UTC'});
async function deskJSON(path){
 const base='https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/';
 const results=await Promise.all([base+path,path].map(async url=>{
  try{
   const r=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok)return null;
   const data=await r.json();
   if(path.endsWith('news-live.json')&&!Array.isArray(data.articles))return null;
   if(path.endsWith('grappling-events.json')&&!Array.isArray(data.events))return null;
   return data;
  }catch{return null;}
 }));
 const valid=results.filter(Boolean);
 valid.sort((a,b)=>(Date.parse(b.lastSuccessfulAt||b.reviewedAt)||0)-(Date.parse(a.lastSuccessfulAt||a.reviewedAt)||0));
 if(valid.length)return valid[0];
 throw Error('Feed unavailable');
}
async function loadDesk(background=false){
 try{
  const [n,e]=await Promise.all([deskJSON('data/news-live.json'),deskJSON('data/grappling-events.json')]);
  if(!Array.isArray(n.articles)||!Array.isArray(e.events))throw Error('Invalid feed');
  if(background){if(JSON.stringify(n.articles)===JSON.stringify(desk.articles)&&JSON.stringify(e.events)===JSON.stringify(desk.events)){Object.assign(desk,n,{error:''});return;}if(!location.hash||location.hash==='#home'){Object.assign(desk,n,{events:e.events,reviewedAt:e.reviewedAt,error:'',pending:null});const target=document.getElementById('main');if(target)target.innerHTML=renderHome();return;}desk.pending={n,e};const button=document.getElementById('desk-updates');if(button){button.hidden=false;button.textContent='New headlines available — show updates';}return;}
  Object.assign(desk,n,{events:e.events,reviewedAt:e.reviewedAt,error:'',pending:null});
 }catch{desk.error='Current feed unavailable. Previously loaded items remain visible.';}
 if(['','#home','#news','#calendar'].includes(location.hash))navigate();
}
const sourceHealth=()=>'<details class="source-health"><summary>News updated '+(desk.lastSuccessfulAt?esc(displayDate(desk.lastSuccessfulAt)):'pending')+'</summary><p>'+(desk.sources.some(s=>!s.ok)?'Some sources are delayed. ':'')+'Checks run every 15 minutes; publication and indexing can be delayed. '+esc(desk.error)+'</p></details><button class="btn" id="desk-updates" hidden>Show fresh updates</button>';
function newsFighterImage(a){
 const title=a.title.toLowerCase();
 const fighter=(D.fighters||[]).filter(f=>f.name&&f.photo&&title.includes(f.name.toLowerCase())).sort((a,b)=>b.name.length-a.name.length)[0];
 return fighter&&/^https:\/\//.test(fighter.photo)?{url:fighter.photo,name:fighter.name}:null;
}
function headlineCard(a){
 const fighter=newsFighterImage(a),publisher=a.image&&/^https:\/\//.test(a.image.url||'')?a.image:null;
 const src=publisher?publisher.url:fighter?fighter.url:'assets/mark.svg';
 const alt=publisher?(publisher.alt||a.title):fighter?'File photo of '+fighter.name:a.sport+' news';
 const caption=publisher?(publisher.credit||a.source)+(publisher.kind==='archive'?' · Archive feature image':' · Article image'):fighter?'File photo · '+fighter.name:'Combat sports news';
 return `<article class="news-card live-news-card"><a class="live-news-visual" href="${safeURL(a.url)}" target="_blank" rel="noopener noreferrer" aria-label="Read ${esc(a.title)}"><img class="live-news-image${!publisher&&!fighter?' news-brand-image':''}" src="${src==='assets/mark.svg'?src:safeURL(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-news-fallback="${fighter?safeURL(fighter.url):''}" data-news-fallback-name="${fighter?esc(fighter.name):''}"><span class="live-news-sport">${esc(a.sport)}</span></a><div class="live-news-copy"><p class="live-news-credit">${esc(caption)}</p><div class="card-kicker">${esc(a.sport)} · ${esc(a.source)} ${a.updatedAt?'· UPDATED':''}</div><h3><a href="${safeURL(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a></h3>${a.summary?'<p>'+esc(a.summary)+'</p>':''}${a.publishedAt?'<p>'+esc(displayDate(a.publishedAt))+' local time</p>':''}${a.updatedAt?'<p>Headline updated '+esc(displayDate(a.updatedAt))+'</p>':''}<a href="${safeURL(a.url)}" target="_blank" rel="noopener noreferrer">Read original reporting ↗</a></div></article>`;
}
document.addEventListener('error',event=>{
 const img=event.target;if(!img.classList?.contains('live-news-image'))return;
 queueMicrotask(()=>{
  const card=img.closest('.live-news-card'),credit=card?.querySelector('.live-news-credit');
  img.classList.remove('is-error');
  if(!img.dataset.newsAttempt&&img.dataset.newsFallback&&img.src!==img.dataset.newsFallback){
   img.dataset.newsAttempt='fighter';img.src=img.dataset.newsFallback;img.alt='File photo of '+img.dataset.newsFallbackName;
   if(credit)credit.textContent='File photo · '+img.dataset.newsFallbackName;
  }else if(img.dataset.newsAttempt!=='brand'){
   img.dataset.newsAttempt='brand';img.classList.add('news-brand-image');img.src='assets/mark.svg';img.alt='Combat sports news';if(credit)credit.textContent='Combat sports news';
  }else{img.remove();}
 });
},true);
function renderNews(){return renderHome();} // Legacy News link compatibility.
function eventCard(e){return `<article class="news-card" style="padding:24px"><div class="card-kicker">${esc(e.discipline)} · ${esc(e.status)}</div>${window.EventStatus?.badge(e)||''}<h3>${esc(e.name)}</h3><p><strong>${esc(dayLabel(e.date))}${e.endDate?' – '+esc(dayLabel(e.endDate)):''}</strong> · venue-local date</p><p>${esc(e.location)}</p><p>${esc(e.competitors)}</p><p>${esc(e.why)}</p>${e.startAt?'<p>Start: '+esc(displayDate(e.startAt))+' local time</p>':''}<p>${esc(e.watch)}</p><a href="${safeURL(e.source)}" target="_blank" rel="noopener noreferrer">Official event details ↗</a><p class="panel-note">Checked ${esc(e.verifiedAt)}</p></article>`;}
function renderCalendar(){
 if(state.calendar!=='grappling')return renderFrame(viewTitle('','Upcoming fights')+segments('calendar',['boxing','mma','grappling'],state.calendar)+window.UpcomingCards.render(state.calendar));
 const today=window.FightTime.dayKey(new Date());const horizon=window.FightTime.dayKey(new Date(Date.now()+42*86400000));
 const all=desk.events.filter(e=>(e.endDate||e.date)>=today&&(state.matDiscipline==='all'||e.discipline===state.matDiscipline)).sort((a,b)=>a.date.localeCompare(b.date));
 const near=all.filter(e=>e.date<=horizon),later=all.filter(e=>e.date>horizon);
 return renderFrame(viewTitle('','Grappling & wrestling')+segments('calendar',['boxing','mma','grappling'],state.calendar)+'<div class="filter-row">'+segments('matDiscipline',['all','RAF','BJJ / submission','NCAA','Freestyle','Greco-Roman'],state.matDiscipline)+'</div><p class="panel-note">Official listings last reviewed '+esc(desk.reviewedAt||'not yet loaded')+'. Dates may change. Unverified matchups and viewing details are explicitly marked.</p><h2>Next six weeks</h2><div class="grid news-grid">'+(near.length?near.map(eventCard).join(''):'<p>No confirmed upcoming events loaded for this selection.</p>')+'</div>'+(later.length?'<h2>Looking further ahead</h2><div class="grid news-grid">'+later.map(eventCard).join('')+'</div>':''));
}

function headlineEligible(a){
 if(!a||typeof a.title!=='string'||!/^https:\/\//.test(a.url||'')||!Number.isFinite(Date.parse(a.publishedAt)))return false;
 // Results, replays and viewing guides belong in their own sections.
 return !/\b(?:main card results|prelim(?:inary)? results|official weigh-in results|post-fight show|post-event facts|bonus coverage|scorecards?|round-by-round|fight by fight preview|how to watch|stream|betting odds|predictions?|live blog|promotional guidelines|video: every|monthly report)\b/i.test(a.title)
  && !/^(?:video:|ufc .{0,35} video:)/i.test(a.title)
  && !/\bresults?\b\s*(?:\||:|[-–—]|\b(?:from|for|of)\b)/i.test(a.title);
}
function headlineImportance(a,now){
 const title=a.title;
 const age=(now-Date.parse(a.publishedAt))/3600000;
 const fresh=Math.max(0,1-Math.max(0,age)/48)*12;
 const confirmed=/\b(?:announc\w*|confirm\w*|scheduled|booked|sign(?:s|ed|ing)?|scratched|withdraw\w*|cancell?ed|postpon\w*|set for|to face|to fight|unification|suspend\w*|replacement|added to)\b/i.test(title);
 const cardUpdate=/\b(?:fight card|title shot|title fight|championship)\b/i.test(title);
 const important=/\b(?:attacked|hospitali[sz]ed|doctor stops|injur\w*|fine|investigation|controversy|brawl|deal|dispute|retir\w*|return\w*)\b/i.test(title);
 const commentary=/\b(?:calls? out|wants|believes|reaction|react|post-fight|highlights|finish|knockout win|knockout in|knockout at|what's next|predictions?|recap|ahead of)\b/i.test(title);
 return fresh+(confirmed?18:0)+(cardUpdate?5:0)+(important?8:0)+(commentary?-7:0)+Math.min(3,Math.max(0,Number(a.score)||0));
}
function topStories(){
 const now=Date.now();
 const verified=desk.articles.filter(headlineEligible);
 const recent=verified.filter(a=>Date.parse(a.publishedAt)<=now+30*60*1000&&Date.parse(a.publishedAt)>=now-48*3600*1000);
 const candidates=recent.length?recent:verified;
 const unique=new Map();
 for(const a of candidates){
  const key=a.title.toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(!unique.has(key))unique.set(key,a);
 }
 const ranked=[...unique.values()].sort((a,b)=>headlineImportance(b,now)-headlineImportance(a,now)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 // Prevent a single publisher or sport from occupying every lead slot.
 const lead=[];
 for(const a of ranked){
  if(lead.length===4)break;
  if(lead.filter(x=>x.source===a.source).length>=2)continue;
  lead.push(a);
 }
 for(const sport of ['boxing','mma']){
  if(lead.length===4&&!lead.some(x=>x.sport===sport)){
   const alt=ranked.find(a=>a.sport===sport&&!lead.some(x=>x.url===a.url));
   if(alt)lead[3]=alt;
  }
 }
 const seen=new Set(lead.map(x=>x.url));
 return [...lead,...ranked.filter(a=>!seen.has(a.url))].slice(0,10);
}
function homeLeadCard(a){
 const image=a.image?.url&&/^https:\/\//.test(a.image.url)?a.image.url:newsFighterImage(a)?.url||'assets/mark.svg';
 return '<a class="front-lead-card" href="'+safeURL(a.url)+'" target="_blank" rel="noopener noreferrer">'
  +'<div class="front-lead-image"><img loading="eager" decoding="async" src="'+(image==='assets/mark.svg'?image:safeURL(image))+'" alt="'+esc(a.image?.alt||a.title)+'"></div>'
  +'<div class="front-lead-copy"><span class="front-story-meta">'+esc(a.sport)+' · '+esc(a.source)+'</span><h2>'+esc(a.title)+'</h2>'
  +'<time datetime="'+esc(a.publishedAt)+'">'+esc(displayDate(a.publishedAt))+'</time></div></a>';
}
function homeBriefCard(a){
 return '<a class="front-brief-card" href="'+safeURL(a.url)+'" target="_blank" rel="noopener noreferrer"><span class="front-story-meta">'
  +esc(a.sport)+' · '+esc(a.source)+'</span><h3>'+esc(a.title)+'</h3>'
  +'<time datetime="'+esc(a.publishedAt)+'">'+esc(displayDate(a.publishedAt))+'</time></a>';
}

function newsFeedItems(){
 const promoted=new Set(topStories().slice(0,4).map(a=>a.url));
 const seen=new Set(),now=Date.now();
 return desk.articles.filter(headlineEligible).filter(a=>{
  if(promoted.has(a.url)||(state.news!=='all'&&a.sport!==state.news))return false;
  const key=a.title.toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>state.newsSort==='significant'
  ?headlineImportance(b,now)-headlineImportance(a,now)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)
  :Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
function renderNewsFeed(){
 const all=newsFeedItems(),shown=all.slice(0,Math.max(1,state.newsPage||1)*12);
 const controls='<div class="unified-news-filters">'+segments('news',['all','boxing','mma'],state.news)+segments('newsSort',['latest','significant'],state.newsSort)+'</div>';
 const more=shown.length<all.length?'<button class="news-load-more" type="button" data-news-more>Show more stories ('+(all.length-shown.length)+' remaining)</button>':'';
 const junkie=state.news==='mma'?'<a class="news-publisher-link" href="https://mmajunkie.usatoday.com/" target="_blank" rel="noopener noreferrer">MMA Junkie ↗</a>':'';
 return '<div class="front-follow-up"><div class="front-follow-up-head"><h2>Latest news</h2><span class="unified-news-count">'+all.length+' stories</span></div>'
  +controls+junkie+'<div class="grid news-grid">'+(shown.length?shown.map(headlineCard).join(''):'<p class="front-loading">No other articles match these filters.</p>')+'</div>'
  +more+sourceHealth()+'</div>';
}
function renderHome(){
 const stories=topStories();
 if(!stories.length)return renderFrame('<header class="front-home-head"><h1>News</h1></header><p role="status" class="front-loading">Checking the latest fight news…</p>');
 const top=stories.slice(0,4);
 return renderFrame('<div class="front-home"><header class="front-home-head"><h1>Top stories</h1></header>'
  +'<div class="front-lead-layout">'+homeLeadCard(top[0])+'<div class="front-brief-list">'+top.slice(1).map(homeBriefCard).join('')+'</div></div>'
  +'<section id="news-feed" aria-label="Latest boxing and MMA articles">'+renderNewsFeed()+'</section></div>');
}
document.addEventListener('click',e=>{if(e.target.closest('#desk-updates')&&desk.pending){const {n,e:events}=desk.pending;Object.assign(desk,n,{events:events.events,reviewedAt:events.reviewedAt,pending:null});navigate();}});
setInterval(()=>loadDesk(true),5*60*1000);
