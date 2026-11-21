/* BEFN Design 19 + first-mockup homepage experiment.
 * Preview branch only. Uses the existing sourced news feed and verified
 * upcoming-cards JSON; does not introduce invented fights or athlete images.
 */
(function(root){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=s=>{
    if(/^assets\/img\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(String(s||'')))return esc(s);
    try{const u=new URL(s);return u.protocol==='https:'?esc(u.href):'#';}catch{return '#';}
  };
  const sumoURL='https://befn-sumo-preview.onrender.com/sumo.html';
  const sportWord=s=>({boxing:'BOXING',mma:'MMA',sumo:'SUMO',grappling:'GRAPPLING'})[s]||'FIGHT NEWS';
  const hasPhoto=p=>p&&p.url&&safe(p.url)!=='#';
  const photoFrom=(a,h)=>a?h.photo(a):null;
  function mastPhoto(a,h,i){
    const p=photoFrom(a,h);
    if(!hasPhoto(p))return '';
    return '<div class="d12-hero-portrait d12-hero-portrait-'+i+'" aria-hidden="true"><img src="'+safe(p.url)+'" alt="" loading="'+(i===0?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer"></div>';
  }
  function leadStory(a,h){
    if(!a)return '<div class="d12-news-empty">Latest verified stories will appear here when the feed refreshes.</div>';
    const href=safe(a.url),photo=photoFrom(a,h),title=esc(a.title||'');
    const image=hasPhoto(photo)?'<img src="'+safe(photo.url)+'" alt="'+esc(photo.alt||a.title||'')+'" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'';
    return '<article class="d12-main-story"><a class="d12-main-image'+(!image?' is-photo-free':'')+'" href="'+href+'" target="_blank" rel="noopener noreferrer" aria-label="Read '+title+'">'+image+'<span class="d12-main-image-tag">'+sportWord(a.sport)+'</span></a>'+
      '<div class="d12-main-copy"><div class="d12-story-source">'+esc(a.source||'Editorial source')+'</div><h3><a href="'+href+'" target="_blank" rel="noopener noreferrer">'+title+'</a></h3><a class="d12-read" href="'+href+'" target="_blank" rel="noopener noreferrer">READ ORIGINAL <span aria-hidden="true">›</span></a></div></article>';
  }
  function miniStory(a,h){
    const p=photoFrom(a,h),href=safe(a.url),img=hasPhoto(p)?'<img src="'+safe(p.url)+'" loading="lazy" decoding="async" alt="" referrerpolicy="no-referrer">':'';
    return '<article class="d12-mini-story"><a href="'+href+'" target="_blank" rel="noopener noreferrer" class="d12-mini-link">'+
      '<span class="d12-mini-thumb'+(img?'':' is-photo-free')+'">'+img+'</span>'+
      '<span class="d12-mini-body"><span class="d12-mini-sport">'+sportWord(a.sport)+'</span><span class="d12-mini-title">'+esc(a.title||'')+'</span><span class="d12-mini-source">'+esc(a.source||'')+'</span></span></a></article>';
  }
  function render({leads,pool,helpers,newsFeed,languageHTML,updatedLine,sport}){
    const lead=leads?.[0]?.story||pool?.[0]||null;
    const unique=(pool||[]).filter(a=>a&&a.url&&a.title&&a.url!==lead?.url);
    const stories=unique.slice(0,3);
    const photos=[lead,...unique].filter(Boolean).filter(a=>hasPhoto(photoFrom(a,helpers))).slice(0,3);
    const portraits=photos.map((a,i)=>mastPhoto(a,helpers,i)).join('');
    const boxingPhoto=[lead,...unique].find(a=>a?.sport==='boxing'&&hasPhoto(photoFrom(a,helpers)));
    const mmaPhoto=[lead,...unique].find(a=>a?.sport==='mma'&&hasPhoto(photoFrom(a,helpers)));
    const sumoPhoto=[lead,...unique].find(a=>a?.sport==='sumo'&&hasPhoto(photoFrom(a,helpers)));
    const tileImg=a=>a?'<img src="'+safe(photoFrom(a,helpers).url)+'" loading="lazy" decoding="async" alt="" referrerpolicy="no-referrer">':'';
    const tiles=[
      '<button type="button" data-sport-value="boxing" class="d12-sport-tile d12-boxing" aria-pressed="'+(sport==='boxing')+'"><span class="d12-tile-image">'+tileImg(boxingPhoto)+'</span><strong>BOXING</strong><span class="d12-tile-arrow" aria-hidden="true">›</span></button>',
      '<button type="button" data-sport-value="mma" class="d12-sport-tile d12-mma" aria-pressed="'+(sport==='mma')+'"><span class="d12-tile-image">'+tileImg(mmaPhoto)+'</span><strong>MMA</strong><span class="d12-tile-arrow" aria-hidden="true">›</span></button>',
      '<a class="d12-sport-tile d12-sumo" href="'+sumoURL+'" aria-label="View BEFN Sumo preview"><span class="d12-tile-image">'+tileImg(sumoPhoto)+'</span><strong>SUMO</strong><span class="d12-tile-arrow" aria-hidden="true">›</span></a>'
    ].join('');
    const loadingNews=!lead?'<p class="d12-muted" role="status">Checking the latest verified fight news…</p>':'';
    const result='<div class="d12-home" data-design="19-layout-12">'+
      '<div class="d12-hero-wrap"><div class="d12-hero-inner">'+
      '<div class="d12-hero-header"><a href="#home" class="d12-hero-wordmark" aria-label="BEFN home"><b>BEFN</b><span>BLACK EYE<br>FIGHT NEWS</span></a><nav class="d12-hero-sports" aria-label="Fight disciplines"><button type="button" data-sport-value="boxing" aria-pressed="'+(sport==='boxing')+'">BOXING</button><i aria-hidden="true">/</i><button type="button" data-sport-value="mma" aria-pressed="'+(sport==='mma')+'">MMA</button><i aria-hidden="true">/</i><a href="'+sumoURL+'">SUMO</a></nav></div>'+
      '<section class="d12-hero-main"><div class="d12-hero-copy"><p class="d12-hero-eyebrow">BLACK EYE FIGHT NEWS</p><h1>THE NEXT ERA<br>OF FIGHT NEWS</h1><p class="d12-hero-subline">Every fight. Every story. Every result.</p><div class="d12-hero-rule"></div></div>'+
      '<div class="d12-hero-visual" aria-hidden="true">'+portraits+'<div class="d12-hero-slash"></div></div></section>'+
      '<nav class="d12-sport-tiles" aria-label="Explore fighting disciplines">'+tiles+'</nav></div></div>'+
      '<div class="d12-editorial"><div class="d12-editorial-grid">'+
      '<section class="d12-latest" aria-labelledby="d12-latest-title"><div class="d12-strip-header"><h2 id="d12-latest-title">LATEST NEWS</h2><a href="#news-feed">MORE STORIES <span aria-hidden="true">›</span></a></div>'+loadingNews+
      '<div class="d12-latest-grid">'+leadStory(lead,helpers)+'<div class="d12-mini-list">'+stories.map(a=>miniStory(a,helpers)).join('')+'</div></div></section>'+
      '<aside class="d12-calendar" aria-labelledby="d12-calendar-title"><div class="d12-strip-header d12-strip-header-red"><h2 id="d12-calendar-title">RESULTS &amp; SCHEDULE</h2><a href="#fights">FULL SCHEDULE <span aria-hidden="true">›</span></a></div>'+
      '<div class="d12-calendar-status"><a href="#fights">UPCOMING</a><a href="#results">RECENT RESULTS</a></div>'+
      '<div class="d12-calendar-list" id="d12-calendar-list" aria-live="polite"><p class="d12-muted">Checking sourced upcoming cards…</p></div>'+
      '<a class="d12-calendar-all" href="#fights">VIEW FULL SCHEDULE <span aria-hidden="true">›</span></a></aside></div>'+
      '<div class="d12-news-feed" id="news-feed">'+(newsFeed||'')+'</div>'+
      (languageHTML?'<div class="d12-world-news">'+languageHTML+'</div>':'')+
      '<div class="d12-feed-status">'+(updatedLine||'')+'</div>'+
      '</div></div>';
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(hydrateSchedule);
    return result;
  }
  let eventsCache=null;
  let lastFetch=0;
  let pending=null;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const localDate=s=>{
    try{return new Date(s+'T12:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});}
    catch{return s;}
  };
  async function loadEvents(){
    if(eventsCache&&Date.now()-lastFetch<180000)return eventsCache;
    if(pending)return pending;
    pending=(async()=>{
      const bases=['https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/data/upcoming-cards.json','data/upcoming-cards.json'];
      const d=await Promise.all(bases.map(async u=>{
        try{const r=await fetch(u+'?v='+Math.floor(Date.now()/180000),{cache:'no-store',signal:AbortSignal.timeout(9000)});
         if(!r.ok)return null;const j=await r.json();return j&&Array.isArray(j.events)?j:null;}catch{return null;}
      }));
      const ok=d.filter(Boolean).sort((a,b)=>Date.parse(b.lastCheckedAt||b.reviewedAt||0)-Date.parse(a.lastCheckedAt||a.reviewedAt||0))[0];
      if(!ok)throw Error('Schedule feed unavailable');
      eventsCache=ok;
      lastFetch=Date.now();
      return ok;
    })().finally(()=>{pending=null;});
    return pending;
  }
  function eventRows(data){
    const now=today();
    const list=(data.events||[]).filter(e=>e&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&e.date>=now&&['mma','boxing'].includes(e.sport))
      .sort((a,b)=>a.date.localeCompare(b.date)||String(a.title).localeCompare(String(b.title))).slice(0,4);
    if(!list.length)return '<p class="d12-calendar-empty">No upcoming sourced cards are currently listed. See the full schedule for updates.</p>';
    return list.map(e=>{
      const label=(e.promotion||e.sport||'Fights').toUpperCase();
      const status=e.sourceStatus==='reported'?'REPORTED':'UPCOMING';
      const link=e.source&&safe(e.source)!=='#'?safe(e.source):'#fights';
      return '<article class="d12-event"><div class="d12-event-meta"><span class="d12-event-sport">'+esc(label)+'</span><span class="d12-event-status">'+status+'</span></div>'+
        '<a href="'+link+'"'+(link!=='#fights'?' target="_blank" rel="noopener noreferrer"':'')+' class="d12-event-title">'+esc(e.title)+'</a>'+
        '<div class="d12-event-date">'+esc(localDate(e.date))+' · Event date</div></article>';
    }).join('');
  }
  async function hydrateSchedule(){
    const node=document.getElementById('d12-calendar-list');
    if(!node)return;
    try{const data=await loadEvents();if(node.isConnected)node.innerHTML=eventRows(data);}
    catch{if(node.isConnected)node.innerHTML='<p class="d12-calendar-empty">The schedule feed is temporarily unavailable. <a href="#fights">Open the full schedule</a>.</p>';}
  }
  root.BEFNDesign12Home=Object.freeze({render,hydrateSchedule});
})(window);
