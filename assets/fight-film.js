/* Fight film: the film wall (owner, design A, 24 Nov 2026).
   Clips are the publishers' own uploads. YouTube clips play in the page through the
   privacy-enhanced youtube-nocookie.com player, created only when the reader taps;
   publisher-site clips open on the publisher's site. No video is hosted or re-uploaded.
   Staff notes (Australian playback checks, sources, update time) live in the closed
   "About this film" panel at the foot of the page (DIRECTION rule 6). */
(function(root){
 'use strict';
 const FIRST_PAGE=12,PAGE=12,FEATURE_DAYS=7;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=x=>{try{const u=new URL(x,'https://example.invalid/');return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};

 /* ---------- gates: unchanged rules for which clips may show ---------- */
 function isAuYoutube(v,now=Date.now()){
  return v.auAvailable===true&&['youtube-country-metadata','youtube-api-region-restriction'].includes(v.auVerification)&&
   !!v.auVerifiedAt&&now-Date.parse(v.auVerifiedAt)<48*3600000&&
   /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(v.thumbnail||'');
 }
 function isPublisherClip(v,now=Date.now()){
  if(v.sourceType!=='publisher-video-page'||v.verified!==true||v.category!=='combat'||!v.thumbnail||!v.url)return false;
  try{const u=new URL(v.url);return u.protocol==='https:'&&(
   (u.hostname==='www.ufc.com'&&/^\/video\/\d+$/.test(u.pathname))||
   (u.hostname==='www.mmafighting.com'&&u.pathname.startsWith('/ufc/')))
   &&now-Date.parse(v.date+'T12:00:00Z')<22*86400000}
  catch{return false}
 }
 function videoSport(v){
  if(['boxing','mma','grappling'].includes(v.sport))return v.sport;
  const title=String(v.title||''),publisher=String(v.publisher||''),discipline=String(v.discipline||'');
  if(/\b(?:ufc[\s-]*bjj|bjj|jiu[\s-]*jitsu|submission grappling|grappling match|adcc|ibjjf|no[\s-]*gi|greco[\s-]*roman|freestyle wrestling|wrestling|raf[\s-]*\d+)\b/i.test(title))return 'grappling';
  if(/BJJ|Wrestling/i.test(discipline)||(publisher!=='ONE Championship'&&/Grappling/.test(discipline)))return 'grappling';
  if(/\b(?:muay thai|kickboxing)\b/i.test(title)&&!/\b(?:mma|mixed martial arts|bjj|submission grappling)\b/i.test(title))return null;
  if(publisher==='ONE Championship')return /\b(?:mma|mixed martial arts)\b/i.test(title)?'mma':null;
  if(v.category==='boxing')return 'boxing';
  if(/\bboxing\b/i.test(title)&&!/ufc/i.test(publisher))return 'boxing';
  return 'mma';
 }

 /* ---------- pure helpers (unit-tested in tests/test-fight-film.cjs) ---------- */
 const EMOJI=/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/gu;
 const ACRONYMS=new Set(['UFC','PFL','KSW','MMA','KO','TKO','CW','BJJ','ADCC','IBJJF','RAF','DAZN','WBC','WBA','IBF','WBO','IBO','GTA','II','III','IV','VI','USA','UK','UAE','BKFC','LFA','NYC','TV','HBO','WWE','NFL','NBA','OKTAGON','MSG','LW','HW','MW','WW','FW','BW']);
 const SMALL=new Set(['a','an','and','at','by','for','from','in','of','on','or','the','to','with']);
 const isCapsWord=w=>{const letters=w.replace(/[^\p{L}]/gu,'');return letters.length>=2&&letters===letters.toUpperCase()&&letters!==letters.toLowerCase()};
 const bare=w=>w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'').replace(/['’]S$/,'');
 function calm(part){
  const words=part.split(/(\s+)/);
  const idx=[];words.forEach((w,i)=>{if(w.trim())idx.push(i)});
  const caps=idx.map(i=>isCapsWord(words[i])&&!ACRONYMS.has(bare(words[i]).toUpperCase())&&!/^(?:VS\.?|V)$/i.test(bare(words[i])));
  idx.forEach((i,n)=>{
   const w=words[i],b=bare(w);
   if(/^vs$/i.test(b)&&/^[^\p{Ll}]*$/u.test(w)){words[i]=w.replace(/vs/i,'vs');return}
   if(b==='V'&&n>0&&n<idx.length-1){words[i]=w.replace('V','v');return}
   if(b==='A'&&caps[n-1]&&caps[n+1]){words[i]=w.replace('A','a');return}
   if(!caps[n])return;
   const run=(caps[n-1]||caps[n+1]||bare(w).length>=3);
   if(!run)return;
   const lower=w.toLowerCase();
   const lb=bare(lower);
   if(n>0&&SMALL.has(lb)&&caps[n-1]){words[i]=lower;return}
   words[i]=lower.replace(/^([^\p{L}\p{N}]*)(\p{L})/u,(m,pre,c)=>pre+c.toUpperCase());
  });
  return words.join('');
 }
 const BOILER=/^(?:(?:mma\s+|ufc\s+|full\s+card\s+|crazy\s+|fight\s+|match\s+)?highlights!?|(?:mma\s+)?(?:full|free)\s+(?:fight|match)(?:\s+(?:marathon|compilation))?|full\s+card)$/i;
 const tidy=s=>s.replace(/\s+/g,' ').replace(/^[\s\-–—:·,]+|[\s\-–—:·,]+$/g,'').trim();
 function tidyTitle(raw){
  const original=String(raw??'').trim();
  const cleaned=original.replace(/#[\p{L}\p{N}_]+/gu,' ').replace(EMOJI,' ');
  const parts=cleaned.split('|').map(tidy).filter(Boolean);
  if(!parts.length)return {main:tidy(original.replace(EMOJI,' '))||original,hook:'',original};
  const vs=/(^|\s)(?:vs\.?|v)(\s|$)/i;
  let mi=parts.findIndex(p=>vs.test(p));
  if(mi<0)mi=parts.findIndex(p=>!BOILER.test(p));
  if(mi<0)mi=0;
  const others=parts.filter((p,i)=>i!==mi&&!BOILER.test(p));
  const before=parts.slice(0,mi).filter(p=>!BOILER.test(p));
  const hook=before[0]||others[0]||'';
  const main=parts[mi].replace(/\s+[-–]\s+(?:official\s+|full\s+|fight\s+)*highlights$/i,'');
  return {main:calm(main),hook:hook?calm(hook.replace(/\s+[-–]\s+(?:official\s+|full\s+|fight\s+)*highlights$/i,'')):'',original};
 }
 function isShort(v){
  if(v?.isShort===true)return true; // the film collector asked YouTube (/shorts/<id> answers only for a Short)
  return /#shorts?\b/i.test(String(v?.title||''))||/^shorts?$/i.test(String(v?.kind||''))||/youtube\.com\/shorts\//i.test(String(v?.url||''));
 }
 const FINISH_WORDS=/\b(?:knock\s?outs?|k\.?o\.?s?|tko|submissions?|finish(?:es)?|stoppage|pins?)\b/i;
 /* Owner, 24 Nov 2026 ("Only real finishes lead"): a compilation of many knockouts is not a fight finish,
    so it is Highlights and never the big clip or "Latest finishes". */
 const COMPILATION=/\b(?:compilation|marathon|countdown|montage)\b|\bevery\s+(?:knock\s?out|k\.?o|finish|submission|stoppage)\b|\b(?:\d+|every|all|best|top|most|greatest|historic|forgotten)\b[^|]*?\b(?:knock\s?outs|k\.?o\.?s|finishes|submissions|stoppages|performances)\b/i;
 function isCompilation(v){return COMPILATION.test(String(v?.title||''));}
 function tagOf(v){
  const kind=String(v?.kind||''),title=String(v?.title||'');
  if(isCompilation(v))return /\b(?:full|free)\s+(?:fight|match)\b/i.test(title)&&!/\bcompilation\b/i.test(title)?'full':'highlights';
  if(v?.isFinish===true||/\b(?:KO|TKO|Submission|Pin)\b/i.test(kind))return 'finish';
  if(FINISH_WORDS.test(title)&&!/\b(?:media day|press conference|interview|weigh[\s-]?ins?|reacting|reaction|preview|predictions?)\b/i.test(title))return 'finish';
  if(/\b(?:full|free)\s+(?:fight|match)\b/i.test(title))return 'full';
  return 'highlights';
 }
 const TAG_LABEL={finish:'Finish',full:'Full fight',highlights:'Highlights'};
 function youtubeId(url){
  try{
   const u=new URL(url);
   let id='';
   if(/(^|\.)youtube\.com$/.test(u.hostname)&&u.pathname==='/watch')id=u.searchParams.get('v')||'';
   else if(u.hostname==='youtu.be')id=u.pathname.slice(1);
   return /^[\w-]{11}$/.test(id)?id:'';
  }catch{return ''}
 }
 const sortNewest=(a,b)=>(b.date||'').localeCompare(a.date||'')||(a.featuredOrder??999)-(b.featuredOrder??999);
 /* Every clip that may show for the sport: gated, sorted newest first, no shorts. */
 function pool(data,sport,now=Date.now()){
  const sports=sport==='all'||!sport?['boxing','mma']:[sport];
  return (data?.videos||[]).filter(v=>v&&v.url&&['boxing','combat'].includes(v.category)&&(isAuYoutube(v,now)||isPublisherClip(v,now))&&!isShort(v)&&sports.includes(videoSport(v)))
   .map((v,i)=>({v,i})).sort((a,b)=>sortNewest(a.v,b.v)||a.i-b.i).map(x=>x.v);
 }
 /* The big clip is the newest clip, or the newest finish from the last week if there is one. */
 function pickTop(list,now=Date.now()){
  const since=new Date(now-FEATURE_DAYS*86400000).toISOString().slice(0,10);
  const feature=list.find(v=>tagOf(v)==='finish'&&(v.date||'')>=since)||list[0]||null;
  const finishes=list.filter(v=>v!==feature&&tagOf(v)==='finish').slice(0,3);
  return {feature,finishes};
 }
 function publishers(list,max){
  const count=new Map();
  list.forEach(v=>{if(v.publisher)count.set(v.publisher,(count.get(v.publisher)||0)+1)});
  return [...count].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,max).map(x=>x[0]);
 }
 function filterList(list,type,chip){
  return list.filter(v=>(type==='all'||tagOf(v)===type)&&
   (chip==='all'||(chip.startsWith('sport:')?videoSport(v)===chip.slice(6):v.publisher===chip.slice(4))));
 }
 function shortDay(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d||'')))return '';
  const x=new Date(d+'T12:00:00Z');
  return Number.isFinite(x.getTime())?x.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).replace(',',''):'';
 }

 /* ---------- markup ---------- */
 function thumbSrc(v,size){
  const t=String(v.thumbnail||'');
  return size==='big'?t:t.replace(/\/(maxresdefault|sddefault)\.jpg$/,'/hqdefault.jpg');
 }
 function fallbackFor(v,size){
  if(v.fallbackThumbnail)return v.fallbackThumbnail;
  const t=String(v.thumbnail||'');
  return size==='big'&&/\/maxresdefault\.jpg$/.test(t)?t.replace(/maxresdefault\.jpg$/,'hqdefault.jpg'):'';
 }
 function card(v,size='grid'){
  const t=tidyTitle(v.title),tag=tagOf(v),yt=youtubeId(v.url);
  const fb=fallbackFor(v,size);
  const portrait=v.thumbnailType==='portrait';
  const img=`<img loading="${size==='big'?'eager':'lazy'}" decoding="async" referrerpolicy="no-referrer" src="${safe(thumbSrc(v,size))}"${fb?` data-film-fallback="${safe(fb)}"`:''} alt=""${portrait?' class="is-portrait"':''}>`;
  const inner=`${img}<span class="ff-play" aria-hidden="true">▶</span><b class="ff-tag ff-tag-${tag}">${TAG_LABEL[tag]}</b>`;
  const where=yt?'YouTube':(v.publisher||'the publisher');
  const thumb=yt
   ?`<button type="button" class="ff-thumb" data-ff-play="${esc(yt)}" data-ff-title="${esc(t.main)}" aria-label="Play ${esc(t.original)}" title="${esc(t.original)}">${inner}</button>`
   :`<a class="ff-thumb" href="${safe(v.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${esc(t.original)} on ${esc(where)} (opens in a new tab)" title="${esc(t.original)}">${inner}</a>`;
  const Heading=size==='big'?'h2':'h3';
  return `<article class="ff-card ff-c-${size}" data-ff-tag="${tag}">${thumb}<div class="ff-body"><p class="ff-meta">${esc(v.publisher||'')}${v.publisher&&v.date?' · ':''}${esc(shortDay(v.date))}</p><${Heading} class="ff-title">${esc(t.main)}</${Heading}>${t.hook?`<p class="ff-hook">${esc(t.hook)}</p>`:''}<a class="ff-out" href="${safe(v.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${esc(t.original)} on ${esc(where)} (opens in a new tab)" title="${esc(t.original)}">Watch on ${esc(where)} <span aria-hidden="true">↗</span></a></div></article>`;
 }
 function bar(list,sport,state){
  const types=[['all','All'],['finish','Finishes'],['full','Full fights'],['highlights','Highlights']];
  const chips=[['all','All']];
  if(sport==='all')chips.push(['sport:boxing','Boxing'],['sport:mma','MMA']);
  publishers(list,sport==='all'?4:5).forEach(p=>chips.push(['pub:'+p,p]));
  return `<div class="ff-bar"><div class="ff-seg" role="group" aria-label="Type of film">${types.map(([k,l])=>`<button type="button" data-ff-type="${k}" aria-pressed="${state.type===k}"${state.type===k?' class="is-on"':''}>${l}</button>`).join('')}</div>`+
   `<div class="ff-chips" role="group" aria-label="${sport==='all'?'Sport and promotion':'Promotion'}">${chips.map(([k,l])=>`<button type="button" data-ff-chip="${esc(k)}" aria-pressed="${state.chip===k}"${state.chip===k?' class="is-on"':''}>${esc(l)}</button>`).join('')}</div></div>`;
 }
 function wall(list,top,sport,state){
  const shownAbove=new Set([top.feature,...top.finishes]);
  let rows=filterList(list,state.type,state.chip);
  if(state.type==='all'&&state.chip==='all')rows=rows.filter(v=>!shownAbove.has(v));
  const page=rows.slice(0,state.shown);
  const grid=page.length?`<div class="ff-grid">${page.map(v=>card(v,'grid')).join('')}</div>`:`<p class="ff-empty">No clips match these filters right now.</p>`;
  const more=rows.length>page.length?`<button type="button" class="ff-more" data-ff-more>More film</button>`:'';
  return bar(list,sport,state)+grid+more;
 }
 function about(data,now){
  const updated=data?.updatedAt&&Number.isFinite(Date.parse(data.updatedAt))
   ?(root.FightTime?.localDateTime?root.FightTime.localDateTime(data.updatedAt):new Date(data.updatedAt).toUTCString()):'';
  const sources=Array.isArray(data?.sources)?data.sources:[];
  return `<details class="ff-about"><summary>About this film</summary><div class="ff-about-body">
   <p>Every clip is the publisher's own upload. BEFN does not host or re-upload fight footage. YouTube clips play through YouTube's privacy-enhanced player, which loads only when you tap play.</p>
   <p>YouTube clips are listed only after a check that they can be played in Australia (YouTube region data) and that the thumbnail is the video's own. Clips on publisher sites, such as UFC.com and MMA Fighting, open on that site; AU playback for those has not been independently verified. YouTube Shorts are left out.</p>
   ${sources.length?`<p><strong>Sources:</strong> ${sources.map(esc).join('; ')}.</p>`:''}
   ${updated?`<p><strong>Updated:</strong> ${esc(updated)}</p>`:''}
  </div></details>`;
 }
 function freshState(sport){return {sport,type:'all',chip:'all',shown:FIRST_PAGE}}
 let state=freshState('all');
 function content(data,sport,now=Date.now(),st=null){
  const s=st||state;
  const list=pool(data,sport,now);
  if(!list.length)return `<p class="ff-empty">No clips to show right now. Check back after the next card.</p>`+about(data,now);
  const top=pickTop(list,now);
  const side=top.finishes.length?`<div class="ff-side"><h2 class="ff-side-h">Latest finishes</h2>${top.finishes.map(v=>card(v,'mini')).join('')}</div>`:'';
  return `<section class="ff-hero${side?'':' is-solo'}" aria-label="Latest film">${card(top.feature,'big')}${side}</section>`+
   `<div id="ff-wall" class="ff-wall">${wall(list,top,sport,s)}</div>`+about(data,now);
 }

 /* ---------- browser runtime ---------- */
 let data=null,pending=null,failed=false,lastAttempt=0;
 const currentSport=()=>{const s=root.BEFNSport?.get?.()||'all';return ['all','boxing','mma','grappling'].includes(s)?s:'all'};
 function body(){
  const sport=currentSport();
  if(state.sport!==sport)state=freshState(sport);
  if(!data)return `<div class="ff-loading" role="status">${failed?'Fight film is unavailable right now. Please try again shortly.':'Loading fight film…'}</div>`;
  return content(data,sport);
 }
 function update(){
  const el=root.document?.getElementById('fight-film-content');
  if(el)el.innerHTML=body();
 }
 function updateWall(focusSel){
  const el=root.document?.getElementById('ff-wall');
  if(!el||!data)return update();
  const sport=currentSport();
  const list=pool(data,sport);
  el.innerHTML=wall(list,pickTop(list),sport,state);
  if(focusSel){const f=el.querySelector(focusSel);if(f)f.focus()}
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
  return `<div class="frame film-page ff"><div id="fight-film-content">${body()}</div></div>`;
 }
 function play(btn){
  const id=btn.getAttribute('data-ff-play');
  if(!/^[\w-]{11}$/.test(id||''))return;
  const doc=root.document;
  const frame=doc.createElement('iframe');
  frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
  frame.title=btn.getAttribute('data-ff-title')||'YouTube video';
  frame.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
  frame.setAttribute('allowfullscreen','');
  frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
  const box=doc.createElement('div');
  box.className='ff-thumb ff-player';
  box.appendChild(frame);
  btn.closest('.ff-card')?.classList.add('is-playing');
  btn.replaceWith(box);
  frame.focus();
 }
 if(root.document){
  const doc=root.document;
  doc.addEventListener('click',e=>{
   const t=e.target.closest?.('[data-ff-play],[data-ff-type],[data-ff-chip],[data-ff-more]');
   if(!t||!t.closest('.ff'))return;
   if(t.hasAttribute('data-ff-play')){e.preventDefault();play(t);return}
   if(t.hasAttribute('data-ff-type')){state.type=t.getAttribute('data-ff-type');state.shown=FIRST_PAGE;updateWall(`[data-ff-type="${state.type}"]`);return}
   if(t.hasAttribute('data-ff-chip')){state.chip=t.getAttribute('data-ff-chip');state.shown=FIRST_PAGE;updateWall(`[data-ff-chip="${CSS.escape(state.chip)}"]`);return}
   if(t.hasAttribute('data-ff-more')){
    const before=doc.querySelectorAll('#ff-wall .ff-card').length;
    state.shown+=PAGE;updateWall(null);
    const next=doc.querySelectorAll('#ff-wall .ff-card')[before];
    (next?.querySelector('.ff-thumb')||doc.querySelector('#ff-wall [data-ff-more]'))?.focus();
   }
  });
  doc.addEventListener('error',e=>{
   const img=e.target;
   if(!img.matches?.('.ff-thumb img'))return;
   // A blocked image falls back to the sourced alternative once; otherwise the card is hidden,
   // never shown with a made-up picture.
   const alternate=img.getAttribute('data-film-fallback');
   if(alternate&&!img.dataset.filmFallbackTried){img.dataset.filmFallbackTried='yes';img.src=alternate;return}
   const c=img.closest('.ff-card');
   if(c)c.hidden=true;
  },true);
  setInterval(()=>{if(!doc.hidden&&root.location?.hash.startsWith('#highlights'))load()},300000);
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&root.location?.hash.startsWith('#highlights')&&Date.now()-lastAttempt>300000)load()});
 }
 const api={render,load,tidyTitle,isShort,tagOf,youtubeId,pool,pickTop,publishers,filterList,content:(d,sport,now)=>content(d,sport,now,freshState(sport))};
 root.FightFilm=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
