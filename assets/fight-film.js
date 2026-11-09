/* Live, sourced video desk. No video files are hosted or modified by this site. */
window.FightFilm=(()=>{
 'use strict';
 let data=null,pending=null,failed=false,lastAttempt=0;
 let selectedSection='boxing'; // legacy state kept for backward compatibility; global selector now drives the view.
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=x=>{try{const u=new URL(x,location.href);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
 const date=x=>window.FightTime.venueDay(x);
 function isAuYoutube(v){
  return v.auAvailable===true&&['youtube-country-metadata','youtube-api-region-restriction'].includes(v.auVerification)&&
   v.auVerifiedAt&&Date.now()-Date.parse(v.auVerifiedAt)<48*3600000&&
   /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(v.thumbnail||'');
 }
 function isPublisherClip(v){
  if(v.sourceType!=='publisher-video-page'||v.verified!==true||v.category!=='combat'||!v.thumbnail||!v.url)return false;
  try{const u=new URL(v.url);return u.protocol==='https:'&&(
   (u.hostname==='www.ufc.com'&&/^\/video\/\d+$/.test(u.pathname))||
   (u.hostname==='www.mmafighting.com'&&u.pathname.startsWith('/ufc/')))
   &&Date.now()-Date.parse(v.date+'T12:00:00Z')<22*86400000}
  catch{return false}
 }
 function card(v){
  const thumbnail=`<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${safe(v.thumbnail)}" ${v.fallbackThumbnail?`data-film-fallback="${safe(v.fallbackThumbnail)}"`:''} alt="${esc(v.thumbnailType==='portrait'?'Fighter portrait':'Photo from the event')} for ${esc(v.title)}" ${v.thumbnailType==='portrait'?'style="object-fit:contain;background:#14242c"':''}>`;
  const section=v.category==='boxing'?'Boxing':v.discipline||'MMA / Wrestling / BJJ';
  const kind=v.kind||(v.isFinish?'Finish':'Highlights');
  return `<article class="film-card"><a class="film-card-link" href="${safe(v.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${esc(v.title)} with ${esc(v.publisher)}">
    <div class="film-thumbnail">${thumbnail}<span class="film-play" aria-hidden="true">▶</span><span class="film-kind">${esc(kind)}</span></div>
    <div class="film-copy"><div class="film-meta"><span>${esc(section)}</span><span>${esc(date(v.date))}</span></div><h3>${esc(v.title)}</h3><div class="film-publisher"><span>${esc(v.publisher||'Original publisher')}${v.sourceType==='publisher-video-page'?'<small class="film-access-note"> · Publisher clip · AU playback not verified</small>':''}</span><strong>${v.sourceType==='publisher-video-page'?'Watch on publisher ↗':'Watch video ↗'}</strong></div></div>
   </a></article>`;
 }
 function section(key,title,desc,discipline=null){
  const videos=(data?.videos||[]).filter(v=>v.category===key&&v.url&&(isAuYoutube(v)||isPublisherClip(v))&&(!discipline||discipline(v)))
   .sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(a.featuredOrder??999)-(b.featuredOrder??999)).slice(0,72);
  const featured=key==='combat'?videos.filter(v=>v.eventId==='ufc-cortes-walker-2026-11-07'):[];
  const other=videos.filter(v=>!featured.includes(v));
  const header=`<section class="film-section" aria-label="${esc(title)}"><div class="film-section-head"><div><div class="eyebrow">${esc(key==='boxing'?'THE SWEET SCIENCE':'THE MAT AND THE CAGE')}</div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div><span class="film-total">${videos.length} clips</span></div>`;
  if(!videos.length)return header+`<div class="film-empty">No verified videos or direct publisher highlight pages available right now.</div></section>`;
  if(!featured.length)return header+`<div class="film-grid">${videos.map(card).join('')}</div></section>`;
  return header+`<div class="film-featured-head"><div class="eyebrow">7 NOVEMBER 2026 · UFC VEGAS 124</div><h3>Walker vs Cortes Acosta — fight finishes</h3><p>${featured.length} sourced finish-video pages from the UFC and MMA Fighting. Direct publisher videos open on their original site; Australian video playback has not been independently confirmed.</p></div>
    <div class="film-grid">${featured.map(card).join('')}</div>
    ${other.length?`<div class="film-featured-head" style="margin-top:28px"><h3>More recent MMA, wrestling and BJJ film</h3></div><div class="film-grid">${other.map(card).join('')}</div>`:''}
   </section>`;
 }
 function content(){
  if(!data)return `<div class="film-loading" role="status">${failed?'Film feed temporarily unavailable. The archive remains accessible from Editions.':'Loading publisher videos…'}</div>`;
  return `<p class="film-updated">Curated clips from official promotions and verified publisher highlight pages. YouTube clips have Australian region metadata checks; direct UFC publisher pages may have different playback rights. ${failed?'The last available edition is shown while a source is unavailable.':''}${data.updatedAt?' Feed data last updated: '+esc(new Date(data.updatedAt).toLocaleString('en-AU'))+'.':''}</p>
   ${(window.BEFNSport?.get()||'all')==='all'?section('boxing','Boxing','Knockouts, stoppages and championship-fight highlights available in Australia.')+section('combat','MMA, Wrestling & BJJ','AU-checked YouTube clips and direct UFC finish-video pages (publisher playback may vary by region).'):(window.BEFNSport.get()==='boxing'?section('boxing','Fight film','Verified boxing highlights'):window.BEFNSport.get()==='mma'?section('combat','Fight film','Verified MMA highlights',v=>!/^(wrestling|grappling|bjj|jiu-jitsu|submission)(?:\b|\s*\/)/i.test(v.discipline||'')):section('combat','Fight film','Verified grappling, BJJ and wrestling footage',v=>/grappl|bjj|wrestl|jiu.jitsu|submission/i.test([v.discipline,v.title].join(' '))))}
   <p class="film-disclosure">YouTube clips are shown after Australian availability and thumbnail checks. UFC.com and publisher-hosted highlight links are clearly marked as direct pages where Australian playback could not be independently verified. We do not host or re-upload fight footage.</p>`;
 }
 function update(){
  const el=document.getElementById('fight-film-content');
  if(el)el.innerHTML=content();
 }
 async function load(){
  if(pending)return pending;
  lastAttempt=Date.now();
  pending=(async()=>{
   let latest=null;
   for(const path of ['https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/data/fight-film.json','data/fight-film.json']){
    try{
     const response=await fetch(path+'?t='+Math.floor(Date.now()/300000),{cache:'no-store',signal:AbortSignal.timeout(12000)});
     if(!response.ok)continue;
     const d=await response.json();
     if(Array.isArray(d.videos)&&d.videos.every(v=>v&&['boxing','combat'].includes(v.category)&&typeof v.url==='string')){latest=d;break}
    }catch{}
   }
   const old=JSON.stringify(data);
   if(latest){data=latest;failed=false}else failed=true;
   pending=null;
   if(old!==JSON.stringify(data)||failed)update();
  })();
  return pending;
 }
 function render(){
  if(!data&&!pending)load();
  else if(Date.now()-lastAttempt>300000&&!pending)load();
  return `<div class="frame film-page"><div class="section-heading"><div><h1>Fight film</h1></div></div><p class="film-status">Videos checked every 5 minutes · Rights-holder footage</p><div id="fight-film-content">${content()}</div></div>`;
 }
 document.addEventListener('error',e=>{
  const img=e.target;
  if(!img.matches?.('.film-thumbnail img'))return;
  // Keep verified clip pages visible if an editorial event photo is blocked:
  // fall back to a sourced portrait of the winner, never a fabricated fight still.
  const alternate=img.getAttribute('data-film-fallback');
  if(alternate&&!img.dataset.filmFallbackTried){
   img.dataset.filmFallbackTried='yes';
   img.style.objectFit='contain';
   img.style.background='#14242c';
   img.src=alternate;
   return;
  }
  const card=img.closest('.film-card');
  if(card)card.hidden=true;
 },true);
 setInterval(()=>{if(!document.hidden&&location.hash.startsWith('#highlights'))load()},300000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash.startsWith('#highlights')&&Date.now()-lastAttempt>300000)load()});
 return {render,load};
})();
