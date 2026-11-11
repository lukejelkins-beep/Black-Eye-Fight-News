/* Sourced future boxing/MMA cards; never assign unverified fights to prelims. */
window.UpcomingCards=(()=>{
 'use strict';
 let feed=null,error='',loading=null,lastCheck=0;
 const opened=new Set(),active=new Map();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const href=x=>{try{const u=new URL(x);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
 const localDate=()=>window.FightTime.dayKey(new Date());
 const fmtDate=x=>window.FightTime.venueDay(x);
 const fmtTime=x=>window.FightTime.localDateTime(x);
 let catalog=null;
 function registry(){
  if(catalog)return catalog;
  try{
   const node=document.getElementById('fighter-portrait-registry');
   catalog=JSON.parse(node.textContent).fighters||{};
  }catch{catalog={}}
  return catalog;
 }
 function sourcePhoto(name){
  const fighters=registry();
  const item=fighters[name]||Object.entries(fighters).find(([k])=>k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())?.[1];
  const src=item?.photo||'';
  return /^https:\/\//.test(src)?src:'';
 }
 function photoAttribution(name){
  const fighters=registry();
  const item=fighters[name]||Object.entries(fighters).find(([k])=>k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())?.[1];
  if(!item?.credit||!item?.source||!item?.license||!item?.licenseUrl)return '';
  return '<small class="upcoming-photo-credit"><a href="'+href(item.source)+'" target="_blank" rel="noopener noreferrer">Photo: '+esc(item.credit)+'</a> · <a href="'+href(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.license)+'</a></small>';
 }
 function initials(name){
  return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('')||'?';
 }
 function photo(name){
  const src=sourcePhoto(name);
  return '<span class="result-photo upcoming-photo" data-upcoming-photo-name="'+esc(name)+'" role="img" aria-label="Portrait of '+esc(name)+'">'+
   (src?'<img src="'+href(src)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
   '<span class="result-photo-missing" '+(src?'hidden':'')+' aria-hidden="true">'+esc(initials(name))+'</span></span>';
 }
 function fighterRecord(b,index){
  const record=Array.isArray(b.records)?b.records[index]:null;
  // Records are editorially sourced as W-L or W-L-D (optionally with KOs).
  // Never mistake rankings, rankings placeholders or unverified text for a record.
  if(typeof record!=='string'||!/^[0-9]{1,3}\s*[-–]\s*[0-9]{1,3}(?:\s*[-–]\s*[0-9]{1,2})?(?:\s*\([0-9]{1,3}\s*KOs?\))?$/.test(record.trim()))return '';
  return record.replace(/–/g,'-').replace(/\s+/g,' ').trim();
 }
 function fighterLabels(b,index,name,event){
  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const supplied=Array.isArray(b.fighterMeta)?b.fighterMeta[index]||{}:{};
  const profile=(window.COMBAT_DATA?.fighters||[]).find(f=>normal(f.name)===normal(name)&&String(f.sport||'').toLowerCase()===String(event.sport||'').toLowerCase());
  const classification=String(supplied.classification||b.fighterTiers?.[index]||profile?.category||'').toLowerCase();
  const tierEvidence=supplied.classificationSource||b.fighterTierSources?.[index]||(profile?.sources?.length?'scouting archive':'');
  const tier=['contender','prospect'].includes(classification)&&tierEvidence?
   '<span class="result-fighter-tier is-'+classification+'">'+classification.toUpperCase()+'</span>':'';
  const rank=Number(supplied.rank??b.ranks?.[index]),rankSource=supplied.rankSource||b.rankSources?.[index];
  const champion=supplied.champion===true&&supplied.championSource;
  const rankLabel=champion?'<span class="result-fighter-rank is-champion">CHAMPION</span>':
   Number.isInteger(rank)&&rank>=1&&rank<=15&&rankSource?'<span class="result-fighter-rank" title="Source-verified divisional ranking">#'+rank+'</span>':'';
  return {rankLabel,tier};
 }
 function contender(name,right,record,labels){
  const detail=record?'<span class="upcoming-fighter-record" aria-label="Professional record '+esc(record)+'">'+esc(record)+'</span>':
   '<span class="upcoming-fighter-record is-unverified">Record not verified</span>';
  return '<div class="result-contender result-contender-'+(right?'right':'left')+'">'+(!right?photo(name):'')+
   '<div class="result-contender-info"><strong>'+esc(name)+(labels.rankLabel?' '+labels.rankLabel:'')+'</strong>'+detail+labels.tier+photoAttribution(name)+'</div>'+(right?photo(name):'')+'</div>';
 }
 function flag(code,side){
  const c=String(code||'').toLowerCase();
  if(!/^(?:[a-z]{2}|gb-(?:eng|sct|wls))$/.test(c))return '';
  return '<img class="result-corner-flag result-corner-flag-'+side+'" src="https://flagcdn.com/'+c+'.svg" alt="" aria-hidden="true" decoding="async" loading="lazy" referrerpolicy="no-referrer">';
 }
 function featuredPosition(b,event){
  const note=String(b.note||''),rows=event.bouts.filter(x=>x.section==='main');
  const unknown=/\b(?:bout order|card order|main card order|placement)\b.{0,28}(?:tbc|unconfirmed|unknown)/i.test(String(event.note||''));
  const coMain=/\bco[\s-]?main\b|\bco[\s-]?feature\b/i.test(note);
  const main=(b.isMain===true||(/\bmain event\b/i.test(note)&&!coMain)||(!unknown&&rows[0]===b))&&!coMain;
  const co=coMain||(!main&&!unknown&&rows.length>1&&rows[1]===b);
  return {main,coMain:!main&&co};
 }
 function bout(b,event){
  const countries=Array.isArray(b.countries)?b.countries:[];
  const f=Array.isArray(b.fighters)?b.fighters:[];
  const first=f[0]||'Fighter TBC',second=f[1]||'Fighter TBC';
  const provisional=event.sourceStatus==='reported'||b.status==='reported';
  const position=featuredPosition(b,event),label=position.main?'MAIN EVENT':position.coMain?'CO-MAIN EVENT':'';
  const foundRounds=String(b.note||'').match(/\b(\d{1,2})\s*rounds?\b/i);
  const rounds=Number.isInteger(b.scheduledRounds)&&b.scheduledRounds>0?b.scheduledRounds:foundRounds?Number(foundRounds[1]):null;
  const roundText=rounds?'<span class="result-bout-rounds">'+rounds+' rounds</span>':'';
  return '<article class="result-bout result-bout-compact upcoming-bout'+(position.main?' is-main-event':'')+(position.coMain?' is-co-main-event':'')+'" aria-label="'+esc(first+' versus '+second)+'">'+
   '<div class="result-matchup">'+(label?'<span class="result-featured-bout-label">'+label+'</span>':'')+
   flag(countries[0],'left')+flag(countries[1],'right')+'<span class="result-matchup-vs-watermark" aria-hidden="true">VS</span>'+
   '<span class="upcoming-matchup-status">'+esc(provisional?'REPORTED':'SCHEDULED')+'</span>'+
   contender(first,false,fighterRecord(b,0),fighterLabels(b,0,first,event))+
   contender(second,true,fighterRecord(b,1),fighterLabels(b,1,second,event))+'</div>'+
   '<div class="result-bout-detail"><span class="result-bout-division">'+esc(b.division||'Weight class not confirmed')+'</span>'+roundText+'</div></article>';
 }
 const groups=[['main','Main Card'],['prelims','Prelims'],['early','Early Prelims'],['undercard','Undercard / order TBC'],['announced','Announced / order TBC']];

 function heroWhen(e){
  const date=window.FightTime.instant(e.startAt);
  return '<span class="upcoming-hero-date">'+esc(date?window.FightTime.localDate(e.startAt):fmtDate(e.date))+'</span>'+
   '<span class="upcoming-hero-clock">'+(date?esc(window.FightTime.localClock(e.startAt)):'Start time TBC · venue date')+'</span>';
 }
 function heroFighters(e){
  const main=e.bouts.find(b=>b.section==='main')||e.bouts[0];
  const names=(main?.fighters||[]).slice(0,2);
  const options=names.map(name=>{
   const custom=e.fighterFallback;
   const fallback=custom?.name===name&&/^https:\/\//i.test(custom.url||'')?custom.url:'';
   return {name,src:sourcePhoto(name)||fallback};
  }).filter(f=>f.src);
  const first=options[0]||{name:names[0]||'Main event',src:''};
  return '<span class="upcoming-hero-fighter-slot upcoming-hero-fighter-slot-single">'+
   '<span class="upcoming-hero-fighter-initials" aria-hidden="true">'+esc(initials(first.name))+'</span>'+
   (first.src?'<img class="upcoming-hero-fighter" src="'+href(first.src)+'" data-upcoming-fighter-options="'+esc(JSON.stringify(options))+'" data-upcoming-fighter-index="0" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
   '<span class="upcoming-hero-fighter-name">'+esc(first.name)+'</span></span>';
 }
 /* Prefer a full-size original from FIGHTMAG's WordPress feed, retaining the
    sourced thumbnail as an automatic fallback when the original is unavailable. */
 function posterUrls(url){
  if(!/^https:\/\//i.test(url||''))return {primary:'',backup:''};
  const original=String(url);
  try{
   const u=new URL(original);
   if(u.hostname==='schedule.fightmag.com'&&u.pathname.includes('/wp-content/uploads/')){
    const path=u.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)$)/i,'');
    if(path!==u.pathname){u.pathname=path;return {primary:u.href,backup:original}}
   }
  }catch{}
  return {primary:original,backup:''};
 }

 /* Prefer portrait event art; keep sourced landscape artwork, then fighter photos.
    Validate the candidate's actual dimensions after it loads. */
 function posterCandidates(e){
  const items=[],seen=new Set();
  for(const candidate of [e.posterPortrait?.url,e.posterList?.url]){
   if(typeof candidate==='string'&&/^https:\/\//i.test(candidate)&&!seen.has(candidate)){
    items.push({url:candidate,kind:'portrait'});seen.add(candidate);
   }
  }
  // Landscape banners are not event posters. Use a single main-event fighter
  // until the two-day poster discovery adds a validated portrait/square asset.
  return items;
 }
 // Only convert explicit source times. No guessed ring-walk or unverified start hours.
 function etInstant(date,hour,minute){
  const want=Date.UTC(+date.slice(0,4),+date.slice(5,7)-1,+date.slice(8),hour,minute);
  let current=want;
  try{
   for(let tries=0;tries<3;tries++){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',
     year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(current)).map(x=>[x.type,x.value]));
    current+=want-Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
   }
   return new Date(current);
  }catch{return null}
 }
 function publishedInstant(e,part='main'){
  const verified=window.FightTime.instant(e.startAt);
  if(verified&&part!=='prelims')return verified;
  const text=String(e.startLabel||'');
  const isPrelim=part==='prelims';
  const gulf=text.match(isPrelim?/prelims(?:\s+from)?\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)\s*GST/i:/main card\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)\s*GST/i);
  const hour=m=>(+m[1]%12)+(m[3].toLowerCase()==='pm'?12:0);
  if(gulf)return new Date(e.date+'T'+String(hour(gulf)).padStart(2,'0')+':'+(gulf[2]||'00')+':00+04:00');
  if(isPrelim){
    const east=text.match(/prelims(?:\s+from)?\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)\s*(?:US\s*)?(?:Eastern|ET)\b/i);
    return east?etInstant(e.date,hour(east),+(east[2]||0)):null;
   }
  const et=text.match(/^(?:main card|broadcast|wynn records network broadcast)\s*(?:from\s*)?(\d{1,2})(?::(\d\d))?\s*(am|pm)\s*(?:US\s*)?(?:Eastern|ET)\b/i);
  return et?etInstant(e.date,hour(et),+(et[2]||0)):null;
 }
 function auDay(e){
  const date=publishedInstant(e);
  return date?window.FightTime.dayKey(date):e.date;
 }
 function rowTimes(e){
  const main=publishedInstant(e),prelims=publishedInstant(e,'prelims');
  if(!main)return '<span>Start time TBC · venue date</span>';
  const label=/main\s*card/i.test(e.startLabel||'')?'Main card':/broadcast/i.test(e.startLabel||'')?'Broadcast':'Event start';
  return (prelims?'<span>Prelims <strong>'+esc(window.FightTime.localClock(prelims.toISOString()))+'</strong></span><span class="upcoming-dot">·</span>':'')+
   '<span>'+label+' <strong>'+esc(window.FightTime.localClock(main.toISOString()))+'</strong></span>'+
   '<span class="upcoming-time-countdown'+(window.FightTime.startReached(main.toISOString())?' is-reached':'')+'" data-upcoming-start="'+esc(main.toISOString())+'">'+esc(window.FightTime.relative(main.toISOString()))+'</span>';
 }
 function dateLabel(day){
  const d=new Date(day+'T12:00:00Z');
  return '<h4 class="upcoming-list-date"><span>'+esc(d.toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'UTC'}).toUpperCase())+'</span> <span>· '+esc(d.toLocaleDateString('en-AU',{weekday:'long',timeZone:'UTC'}))+'</span></h4>';
 }
 function eventCard(e){
  const sections=groups.map(([key,label])=>({key,label,rows:e.bouts.filter(b=>b.section===key)})).filter(g=>g.rows.length);
  const selected=sections.find(g=>g.key===active.get(e.id))||sections[0];
  const tabs=sections.length>1?'<div class="result-card-tabs upcoming-tabs" role="group" aria-label="'+esc(e.title)+' sections" style="grid-template-columns:repeat('+sections.length+',minmax(0,1fr))">'+sections.map(g=>
   '<button type="button" class="result-card-tab'+(g.key===selected.key?' is-active':'')+'" data-upcoming-tab="'+esc(e.id)+'" data-upcoming-section="'+esc(g.key)+'" aria-controls="upcoming-'+esc(e.id)+'-'+g.key+'" aria-pressed="'+String(g.key===selected.key)+'"><span>'+esc(g.label)+'</span><small>'+g.rows.length+' '+(g.rows.length===1?'fight':'fights')+'</small></button>').join('')+'</div>':
   '<div class="upcoming-single-section">'+esc(selected?.label||'Announced bouts')+'</div>';
  const panels=sections.map(g=>'<div id="upcoming-'+esc(e.id)+'-'+esc(g.key)+'" class="result-bouts upcoming-fights" data-upcoming-panel="'+esc(g.key)+'" role="list" aria-label="'+esc(g.label)+'" '+(g.key===selected.key?'':'hidden')+'>'+g.rows.map(b=>'<div role="listitem">'+bout(b,e)+'</div>').join('')+'</div>').join('');
  const artCandidates=posterCandidates(e),first=artCandidates[0],art=first?href(first.url):'';
  const media='<span class="upcoming-hero-media" aria-hidden="true"><span class="upcoming-hero-fallback is-single-fighter">'+heroFighters(e)+'</span>'+
   (first?'<img class="upcoming-hero-poster" src="'+art+'" data-upcoming-poster-candidates="'+esc(JSON.stringify(artCandidates))+'" data-upcoming-poster-index="0" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'</span>';
  const summary='<summary class="upcoming-event-summary upcoming-hero upcoming-schedule-row'+(art?' has-poster':' is-artwork-missing')+'">'+media+
   '<span class="upcoming-hero-content"><span class="upcoming-row-kicker">'+esc(e.promotion)+(window.BEFNSport?.get()==='all'?' · '+esc(e.sport==='mma'?'MMA':'BOXING'):'')+'</span>'+
   '<strong class="upcoming-hero-title">'+esc(e.title)+'</strong>'+
   '<span class="upcoming-hero-times">'+rowTimes(e)+'</span>'+
   '<span class="upcoming-hero-location">'+esc(e.location||'Venue TBC')+'</span>'+
   (e.sourceStatus==='reported'?'<span class="upcoming-row-provisional">Reported · UFC confirmation pending</span>':'')+'</span>'+
   '<span class="upcoming-row-chevron" aria-hidden="true">⌄</span></summary>';
  // Event time is already presented in the compact header. When expanded,
  // go straight to the card itself, without duplicate times, source links
  // or long editorial notes. Source URLs remain in the underlying JSON.
  return '<details class="result-event upcoming-event" data-upcoming-card="'+esc(e.id)+'" '+(opened.has(e.id)?'open':'')+'>'+summary+
   '<div class="upcoming-expanded"><div class="upcoming-card-bar"><strong>Fight card</strong><span>'+e.bouts.length+' total</span></div>'+tabs+panels+'</div></details>';
 }
 function listing(sport){
  if(!feed)return '<div class="upcoming-loading" role="status">'+(error?'Upcoming card feed unavailable. Please reload to try again.':'Loading announced fight cards…')+'</div>';
  const today=localDate(),recent=window.FightTime.dayKey(new Date(Date.now()-2*86400000));
  const query=String(window.BEFNFightsUI?.query||'').trim().toLowerCase();
  const promo=window.BEFNFightsUI?.promotion||'ufc';
  const events=feed.events.filter(e=>{
   if((sport!=='all'&&e.sport!==sport)||!Array.isArray(e.bouts)||!e.bouts.length)return false;
   if(sport==='mma'){
    const name=String(e.promotion||'').toLowerCase();
    const matches={ufc:/\bufc\b|ultimate fighting championship/,one:/\bone\b|one championship/,pfl:/\bpfl\b|professional fighters league/};
    if(!matches[promo]?.test(name))return false;
   }
   if(query&&!String([e.title,e.promotion,e.location,...e.bouts.flatMap(b=>b.fighters||[])].join(' ')).toLowerCase().includes(query))return false;
   const t=publishedInstant(e);
   return t?t.getTime()>Date.now()-36*3600000:e.date>=recent;
  }).sort((a,b)=>auDay(a).localeCompare(auDay(b))||a.title.localeCompare(b.title));
  const cutoff=new Date(today+'T12:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()+6);
  const nextWeek=cutoff.toISOString().slice(0,10);
  function section(label,items){
   if(!items.length)return '';
   let prev='',html='';
   for(const e of items){const date=auDay(e);if(date!==prev){html+=dateLabel(date);prev=date}html+=eventCard(e)}
   return '<section class="upcoming-list-group"><h3 class="upcoming-list-heading">'+esc(label)+'</h3>'+html+'</section>';
  }
  return '<div class="upcoming-schedule">'+
   (error?'<p class="upcoming-feed-warning">Latest refresh failed; showing saved listings.</p>':'')+
   section('This Week',events.filter(e=>auDay(e)<=nextWeek))+
   section('Upcoming',events.filter(e=>auDay(e)>nextWeek))+
   (events.length?'':'<p class="upcoming-empty">No upcoming fight cards confirmed in this category.</p>')+
   '<details class="compact-note"><summary>Schedule and timing notes</summary><p>Exact published start times display in your local time zone. Date-only events retain venue dates; matchups and bout order can change. Records are shown when verified. Reviewed: '+esc(feed.reviewedAt||'not confirmed')+'.</p></details></div>';
 }
 /* Portrait fallback: verify Wikimedia page title before using a thumbnail. */
 const portraitQueries=new Map(),portraitQueue=[],portraitTried=new Set();
 let portraitConcurrent=0;
 const normalName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+\([^)]*\)$/,'').trim();
 function wikiPortrait(name){
  const key=normalName(name);
  if(portraitQueries.has(key))return portraitQueries.get(key);
  const query=(async()=>{
   try{
    const url='https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&pithumbsize=240&titles='+encodeURIComponent(name);
    const response=await fetch(url,{mode:'cors'});
    if(!response.ok)return '';
    const page=Object.values((await response.json()).query?.pages||{})[0];
    if(!page||page.missing!==undefined||normalName(page.title)!==key)return '';
    const photo=page.thumbnail?.source||'';
    return /^https:\/\//.test(photo)?photo:'';
   }catch{return ''}
  })();
  portraitQueries.set(key,query);
  return query;
 }
 function hydratePortraits(){
  if(!document.querySelectorAll)return;
  document.querySelectorAll('.upcoming-event[open] .upcoming-photo[data-upcoming-photo-name]').forEach(el=>{
   if(el.querySelector('img:not([hidden])'))return;
   const name=el.dataset.upcomingPhotoName;
   const key=normalName(name);
   if(!name||portraitTried.has(key))return;
   portraitTried.add(key);portraitQueue.push({name,key});
  });
  function pump(){
   while(portraitConcurrent<3&&portraitQueue.length){
    const item=portraitQueue.shift();portraitConcurrent++;
    wikiPortrait(item.name).then(src=>{
     if(!src)return;
     document.querySelectorAll('.upcoming-photo[data-upcoming-photo-name]').forEach(el=>{
      if(normalName(el.dataset.upcomingPhotoName)!==item.key||el.querySelector('img:not([hidden])'))return;
      const img=document.createElement('img');
      img.alt='Photograph of '+item.name;img.loading='lazy';img.referrerPolicy='no-referrer';img.decoding='async';img.src=src;
      img.onload=()=>{const label=el.querySelector('.result-photo-missing');if(label)label.hidden=true};
      img.onerror=()=>{img.remove();const label=el.querySelector('.result-photo-missing');if(label)label.hidden=false};
      el.prepend(img);
     });
    }).catch(()=>{}).finally(()=>{portraitConcurrent--;pump()});
   }
  }
  pump();
 }
 function render(sport){const markup='<div id="upcoming-cards-root" data-local-day="'+localDate()+'" data-upcoming-sport="'+esc(sport)+'">'+listing(sport)+'</div>';if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{hydratePortraits();reconcileHeroImages()});return markup}
 function refreshCountdowns(){
  document.querySelectorAll('.upcoming-time-countdown[data-upcoming-start]').forEach(el=>{
   const next=window.FightTime.relative(el.dataset.upcomingStart);
   if(el.textContent!==next)el.textContent=next;
   const reached=window.FightTime.startReached(el.dataset.upcomingStart);
   el.classList.toggle('is-reached',reached);
   if(reached&&!el.dataset.recheckedAtStart){
    el.dataset.recheckedAtStart='1';
    if(Date.now()-lastCheck>30000)load();
   }
  });
  const root=document.getElementById('upcoming-cards-root');
  if(root&&root.dataset.localDay!==localDate()){root.dataset.localDay=localDate();update()}
 }
 function update(){
  const root=document.getElementById('upcoming-cards-root');
  if(!root)return;
  root.innerHTML=listing(root.dataset.upcomingSport||'mma');root.dataset.localDay=localDate();
  hydratePortraits();reconcileHeroImages();
 }
 function valid(d){return d&&Array.isArray(d.events)&&d.events.every(e=>typeof e.id==='string'&&typeof e.date==='string'&&typeof e.title==='string'&&Array.isArray(e.bouts)&&e.bouts.every(b=>Array.isArray(b.fighters)&&b.fighters.length===2));}
 function normalizeFighter(x){return String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
 function matchup(b){return Array.isArray(b?.fighters)?b.fighters.map(normalizeFighter).sort().join(':'):''}
 function mergeUfcResearch(source,external){
  if(!valid(source)||!external||external.schema!==1||!external.events||typeof external.events!=='object')return source;
  const merged={...source,events:source.events.map(e=>({...e,bouts:e.bouts.map(b=>({...b}))}))};
  const upcoming=Object.values(external.events).filter(e=>
   e&&e.org==='ufc'&&e.status!=='completed'&&Array.isArray(e.bouts)&&e.bouts.length>=2&&typeof e.date==='string')
   .map(e=>({...e,bouts:e.bouts.filter(b=>b&&b.status!=='cancelled').map(b=>({
     ...b,fighters:[b.a,b.b],isMain:b.main,isTitle:b.titleFight
   }))}));
  const today=new Date().toISOString().slice(0,10);
  for(const remote of upcoming){
   if(remote.date<today||remote.date>new Date(Date.now()+120*86400000).toISOString().slice(0,10))continue;
   const options=merged.events.filter(e=>e.sport==='mma'&&String(e.promotion).toLowerCase()==='ufc'
      &&Math.abs(Date.parse(e.date+'T12:00:00Z')-Date.parse(remote.date+'T12:00:00Z'))<=86400000);
   const score=e=>{
     const all=new Set(e.bouts.map(matchup));
     return remote.bouts.filter(b=>all.has(matchup(b))).length;
   };
   options.sort((a,b)=>score(b)-score(a));
   const existing=options.find(e=>score(e)>=2);
   if(existing){
    // Editorially verified fight cards are authoritative. Supplemental
    // research can enrich matching bouts, never insert stale replacements.
    for(const bout of remote.bouts){
     if(!Array.isArray(bout.fighters)||bout.fighters.length!==2||!bout.fighters.every(Boolean))continue;
     const matched=existing.bouts.find(b=>matchup(b)===matchup(bout));
     if(matched){
       // Keep official card section placement over supplemental research.
       if(!matched.division&&bout.division)matched.division=bout.division;
       if(!matched.note&&bout.isTitle)matched.note='Title fight';
       continue;
     }
     // New pairings require official confirmation before publication.
     // Otherwise a cancelled fight can be re-added after editorial removal.
     continue;
    }
    continue;
   }
   // A genuinely new UFC event must have a reliable dated fight card and main event.
   if(remote.bouts.length<3||!remote.bouts.some(b=>b.isMain))continue;
   if(options.length)continue; // Never duplicate an existing UFC event with uncertain matching.
   merged.events.push({id:'ufcalendar-'+remote.id,date:remote.date,sport:'mma',promotion:'UFC',title:remote.title,
    location:remote.location||'',source:'https://www.ufcalendar.com/events/'+encodeURIComponent(remote.slug),
    startAt:remote.mainAt||remote.startAt,bouts:remote.bouts.filter(b=>b.fighters?.length===2).map(b=>({
      id:'ufcalendar-'+b.id,section:['main','prelims','early'].includes(b.section)?b.section:'other',
      fighters:b.fighters,division:b.division||'',note:b.isTitle?'Title fight':'',
      source:'https://www.ufcalendar.com/events/'+encodeURIComponent(remote.slug)}))});
  }
  return merged;
 }
 async function load(){
  if(loading)return loading;
  loading=(async()=>{
   try{
    const urls=['https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/data/upcoming-cards.json','data/upcoming-cards.json'];
    const results=await Promise.all(urls.map(async u=>{
     try{const response=await fetch(u+'?t='+Math.floor(Date.now()/60000),{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!response.ok)return null;const d=await response.json();return valid(d)?d:null;}catch{return null}
    }));
    const next=results.filter(Boolean).sort((a,b)=>(Date.parse(b.lastCheckedAt||b.reviewedAt)||0)-(Date.parse(a.lastCheckedAt||a.reviewedAt)||0))[0];
    if(!next)throw Error('No source available');
    let enriched=next;
    try{
      const bonus=await fetch('data/ufcalendar-card-enhancements.json?t='+Math.floor(Date.now()/3600000),
        {cache:'no-store',signal:AbortSignal.timeout(9000)});
      if(bonus.ok)enriched=mergeUfcResearch(next,await bonus.json());
    }catch{}
    if(!feed||JSON.stringify(feed)!==JSON.stringify(enriched)){feed=enriched;update()}
    error='';
   }catch{error='unavailable';if(!feed)update()}
   finally{lastCheck=Date.now();loading=null}
  })();
  return loading;
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button[data-upcoming-tab]');
  if(!button)return;
  const card=button.closest('details[data-upcoming-card]');if(!card)return;
  const selected=button.dataset.upcomingSection;active.set(card.dataset.upcomingCard,selected);
  card.querySelectorAll('button[data-upcoming-tab]').forEach(b=>{const on=b.dataset.upcomingSection===selected;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',on?'true':'false')});
  card.querySelectorAll('[data-upcoming-panel]').forEach(panel=>{panel.hidden=panel.dataset.upcomingPanel!==selected});
 },false);
 document.addEventListener('toggle',event=>{
  const el=event.target;if(!el.matches?.('details[data-upcoming-card]'))return;
  if(el.open){opened.add(el.dataset.upcomingCard);hydratePortraits()}else opened.delete(el.dataset.upcomingCard);
 },true);


 function showPosterFallback(img){
  const hero=img.closest('.upcoming-hero');if(!hero)return;
  let candidates=[];
  try{candidates=JSON.parse(img.dataset.upcomingPosterCandidates||'[]')}catch{}
  const next=(Number(img.dataset.upcomingPosterIndex)||0)+1;
  hero.classList.remove('is-poster-ready','is-portrait-art');
  if(next<candidates.length){
   img.dataset.upcomingPosterIndex=String(next);
   img.hidden=false;
   img.src=candidates[next].url;
   return;
  }
  img.hidden=true;
  hero.classList.add('is-artwork-missing');
 }
 function posterReady(img){
  const hero=img.closest('.upcoming-hero'),media=img.closest('.upcoming-hero-media');
  if(!hero||!media)return;
  const w=img.naturalWidth,h=img.naturalHeight;
  let candidates=[];
  try{candidates=JSON.parse(img.dataset.upcomingPosterCandidates||'[]')}catch{}
  const active=candidates[Number(img.dataset.upcomingPosterIndex)||0];
  // Do not mislabel a landscape banner as a portrait poster. Move on to the
  // wider artwork, or the two-fighter fallback if no valid image remains.
  if(!w||!h||Math.min(w,h)<170||Math.max(w,h)<420||
     (active?.kind==='portrait'&&w/h>1.07)){showPosterFallback(img);return}
  media.style.setProperty('--poster-ratio',w+' / '+h);
  media.style.setProperty('--poster-native-width',w+'px');
  hero.classList.remove('is-artwork-missing');
  hero.classList.add('is-poster-ready');
  if(w/h<=0.91)hero.classList.add('is-portrait-art');
  else hero.classList.remove('is-portrait-art');
 }
 function fighterHeroFailed(img){
  const slot=img.closest('.upcoming-hero-fighter-slot');if(!slot)return;
  let options=[];
  try{options=JSON.parse(img.dataset.upcomingFighterOptions||'[]')}catch{}
  const next=(Number(img.dataset.upcomingFighterIndex)||0)+1;
  slot.classList.remove('has-photo');
  if(next<options.length){
   img.dataset.upcomingFighterIndex=String(next);
   const name=slot.querySelector?.('.upcoming-hero-fighter-name');
   const initialsNode=slot.querySelector?.('.upcoming-hero-fighter-initials');
   if(name)name.textContent=options[next].name;
   if(initialsNode)initialsNode.textContent=initials(options[next].name);
   img.hidden=false;img.src=options[next].src;return;
  }
  img.hidden=true;
 }
 function fighterHeroReady(img){
  const slot=img.closest('.upcoming-hero-fighter-slot');if(!slot)return;
  const w=img.naturalWidth,h=img.naturalHeight;
  if(Math.min(w,h)<95||w/h>1.8||w/h<0.34){fighterHeroFailed(img);return}
  img.hidden=false;slot.classList.add('has-photo');
 }
 function reconcileHeroImages(){
  document.querySelectorAll?.('.upcoming-hero-poster,.upcoming-hero-fighter').forEach(img=>{
   if(!img.complete)return;
   if(img.naturalWidth&&img.naturalHeight){
    if(img.matches('.upcoming-hero-poster'))posterReady(img);
    else fighterHeroReady(img);
   } // A deferred lazy image is not a failed image; wait for its load/error event.
  });
 }
 document.addEventListener('load',event=>{
  const img=event.target;
  if(img.matches?.('.upcoming-hero-poster')){posterReady(img);return}
  if(img.matches?.('.upcoming-hero-fighter')){fighterHeroReady(img);return}
  if(!img.matches?.('.upcoming-photo img'))return;
  const box=img.closest('.upcoming-photo');if(!box)return;
  if(img.naturalWidth<48||img.naturalHeight<48||img.naturalWidth/img.naturalHeight>1.9){
   img.hidden=true;
   const fallback=box.querySelector('.result-photo-missing');if(fallback)fallback.hidden=false;
   return;
  }
  img.classList.toggle('upcoming-photo-tall',img.naturalHeight/img.naturalWidth>1.7);
  const fallback=box.querySelector('.result-photo-missing');if(fallback)fallback.hidden=true;
 },true);
 document.addEventListener('error',event=>{
  const img=event.target;
  if(img.matches?.('.upcoming-hero-poster')){showPosterFallback(img);return}
  if(img.matches?.('.upcoming-hero-fighter')){fighterHeroFailed(img);return;}
  if(!img.matches?.('.upcoming-photo img'))return;
  img.hidden=true;const missing=img.parentElement.querySelector('.result-photo-missing');if(missing)missing.hidden=false;
  const el=img.parentElement,name=el?.dataset.upcomingPhotoName;
  if(name&&!portraitTried.has(normalName(name)))hydratePortraits();
 },true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash.startsWith('#fights')&&window.BEFNFightsUI?.view==='upcoming'&&Date.now()-lastCheck>15*60*1000)load()});
 setInterval(()=>{if(!document.hidden&&location.hash.startsWith('#fights')&&window.BEFNFightsUI?.view==='upcoming')load()},15*60*1000);
 setInterval(()=>{if(!document.hidden&&location.hash.startsWith('#fights')&&window.BEFNFightsUI?.view==='upcoming')refreshCountdowns()},15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCountdowns()});
 load();
 return {render,load,valid};
})();
