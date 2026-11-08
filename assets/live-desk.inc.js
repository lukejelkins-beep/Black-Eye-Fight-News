/* Standalone continuously updated public fight desk. */
state.newsMode='latest';state.newsSort='latest';state.talkRole='all';state.talkSort='balanced';state.social='all';state.matDiscipline='all';
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
  if(background){if(JSON.stringify(n.articles)===JSON.stringify(desk.articles)&&JSON.stringify(e.events)===JSON.stringify(desk.events)){Object.assign(desk,n,{error:''});return;}desk.pending={n,e};const button=document.getElementById('desk-updates');if(button){button.hidden=false;button.textContent='Fresh feed check available — show updates';}return;}
  Object.assign(desk,n,{events:e.events,reviewedAt:e.reviewedAt,error:'',pending:null});
 }catch{desk.error='Current feed unavailable. Previously loaded items remain visible.';}
 if(['','#home','#news','#calendar'].includes(location.hash))navigate();
}
const sourceHealth=()=>'<p class="panel-note">'+(desk.lastSuccessfulAt?'Last successful news collection: '+esc(displayDate(desk.lastSuccessfulAt))+' local time.':'No successful news collection yet.')+(desk.lastSuccessfulAt&&Date.now()-Date.parse(desk.lastSuccessfulAt)>3600000?' Collection is delayed; showing retained stories.':'')+' Checks scheduled every 15 minutes; delays may occur. '+esc(desk.error)+(desk.sources.some(s=>!s.ok)?' Some sources are delayed; retained stories keep their original dates.':'')+'</p><button class="btn" id="desk-updates" hidden>Show fresh updates</button>';
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
function renderNews(){
 let items=desk.articles.filter(a=>a.sport===state.news);if(state.newsSort==='significant')items=[...items].sort((a,b)=>b.score-a.score);
 const seen=new Set();items=items.filter(a=>{const key=a.title.toLowerCase().replace(/[^a-z0-9]/g,'');if(seen.has(key))return false;seen.add(key);return true;});
 return renderFrame(viewTitle('THE GLOBAL FIGHT DESK','Latest news','Source-linked boxing and MMA headlines, refreshed throughout the day.')+'<div class="filter-row">'+segments('news',['boxing','mma'],state.news)+segments('newsSort',['latest','significant'],state.newsSort)+'</div>'+sourceHealth()+'<div class="grid news-grid">'+(items.length?items.map(headlineCard).join(''):'<p>No recent stories available in this selection.</p>')+'</div>');
}
function eventCard(e){return `<article class="news-card" style="padding:24px"><div class="card-kicker">${esc(e.discipline)} · ${esc(e.status)}</div>${window.EventStatus?.badge(e)||''}<h3>${esc(e.name)}</h3><p><strong>${esc(dayLabel(e.date))}${e.endDate?' – '+esc(dayLabel(e.endDate)):''}</strong> · venue-local date</p><p>${esc(e.location)}</p><p>${esc(e.competitors)}</p><p>${esc(e.why)}</p>${e.startAt?'<p>Start: '+esc(displayDate(e.startAt))+' local time</p>':''}<p>${esc(e.watch)}</p><a href="${safeURL(e.source)}" target="_blank" rel="noopener noreferrer">Official event details ↗</a><p class="panel-note">Checked ${esc(e.verifiedAt)}</p></article>`;}
function renderCalendar(){
 if(state.calendar!=='grappling')return renderFrame(viewTitle('THE FIXTURE LIST','Upcoming fight cards','Announced boxing and MMA cards, with expandable bout lists and sourced main-card and prelim assignments.')+segments('calendar',['boxing','mma','grappling'],state.calendar)+window.UpcomingCards.render(state.calendar));
 const today=window.FightTime.dayKey(new Date());const horizon=window.FightTime.dayKey(new Date(Date.now()+42*86400000));
 const all=desk.events.filter(e=>(e.endDate||e.date)>=today&&(state.matDiscipline==='all'||e.discipline===state.matDiscipline)).sort((a,b)=>a.date.localeCompare(b.date));
 const near=all.filter(e=>e.date<=horizon),later=all.filter(e=>e.date>horizon);
 return renderFrame(viewTitle('AROUND THE MATS','Coming up on the mats','Major BJJ, submission grappling and wrestling events, including Real American Freestyle.')+segments('calendar',['boxing','mma','grappling'],state.calendar)+'<div class="filter-row">'+segments('matDiscipline',['all','RAF','BJJ / submission','NCAA','Freestyle','Greco-Roman'],state.matDiscipline)+'</div><p class="panel-note">Official listings last reviewed '+esc(desk.reviewedAt||'not yet loaded')+'. Dates may change. Unverified matchups and viewing details are explicitly marked.</p><h2>Next six weeks</h2><div class="grid news-grid">'+(near.length?near.map(eventCard).join(''):'<p>No confirmed upcoming events loaded for this selection.</p>')+'</div>'+(later.length?'<h2>Looking further ahead</h2><div class="grid news-grid">'+later.map(eventCard).join('')+'</div>':''));
}
function renderHome(){return hero()+renderFrame(viewTitle('THE LIVE DESK','Across the fight world','Latest source-linked headlines and meaningful updates from across combat sports.')+sourceHealth()+'<div class="grid news-grid">'+desk.articles.slice(0,6).map(headlineCard).join('')+'</div><p><a class="btn" href="#news">All news ↗</a> <a class="btn" href="#social">Fight Talk ↗</a> <button class="btn" data-segment="calendar" data-value="grappling" onclick="location.hash=\'calendar\'">Grappling & RAF calendar ↗</button></p>');}
document.addEventListener('click',e=>{if(e.target.closest('#desk-updates')&&desk.pending){const {n,e:events}=desk.pending;Object.assign(desk,n,{events:events.events,reviewedAt:events.reviewedAt,pending:null});navigate();}});
setInterval(()=>loadDesk(true),5*60*1000);
