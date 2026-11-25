/* Finish videos on fighter profiles (owner, 25 Nov 2026: "link videos for highlights of the fighter ... submissions/knockouts").
 * A UFC fighter's KO/TKO or submission WIN in the Fights tab gets a "Watch the finish" button when BEFN holds a clip of that
 * exact bout. Two sources, both official uploads (the UFC or its broadcasters) and both behind the film feed's Australian-playback gate (checked in the
 * last 48 hours, with YouTube's own thumbnail):
 *  1. data/ufc-finish-clips.json: hand-checked clips (oEmbed author UFC, ESPN MMA or TNT Fight Sports, title names the
 *     bout; owner 25 Nov 2026 added the two broadcasters, and a non-UFC clip's button names its channel), matched on fighter,
 *     opponent and date. Kind: finish, highlights or full fight; the button says which.
 *  2. data/fight-film.json: the film feed, with the Analysis stoppage rule (a KO, TKO or submission clip whose title names
 *     the winner, published on the fight day or within 14 days, not a reaction, reel, full card, interview or preview).
 * No clip: no button. The player loads only when pressed (youtube-nocookie). */
(function(root){
 const DAY=86400000;
 const fold=s=>String(s==null?'':s).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 const key=s=>fold(s).replace(/-/g,'');
 const ID=/^[\w-]{11}$/;
 const NOT_THE_FINISH=/\b(react\w*|every|best|greatest|top \d+|ranked|ever|of the year|full fight|full card|marathon|compilation|comeback|press conference|weigh[- ]?in|interview|breakdown|analysis|preview)\b/i;
 const LABEL={finish:'Watch the finish',highlights:'Watch the highlights','full-fight':'Watch the full fight'};
 function auOk(v,now){
  return !!v&&v.auAvailable===true&&['youtube-country-metadata','youtube-api-region-restriction'].includes(v.auVerification)&&
   !!v.auVerifiedAt&&now-Date.parse(v.auVerifiedAt)>=0&&now-Date.parse(v.auVerifiedAt)<48*3600000&&
   /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(v.thumbnail||'');
 }
 const namesIn=(title,name)=>{const t='-'+fold(title)+'-',n=fold(name),last=n.split('-').pop();
  return !!n&&(t.includes('-'+n+'-')||(last.length>4&&t.includes('-'+last+'-')));};
 const isFinishMethod=m=>/\b(ko|tko|knockout|submission|sub)\b/i.test(String(m||'').replace(/_/g,' '));
 function youtubeId(url){
  try{const u=new URL(url);const id=/(^|\.)youtube\.com$/.test(u.hostname)&&u.pathname==='/watch'?u.searchParams.get('v'):u.hostname==='youtu.be'?u.pathname.slice(1):'';
   return ID.test(id||'')?id:'';}catch(e){return ''}
 }
 /* The clip for one bout {fighter, opponent, date (YYYY-MM-DD), outcome, method}, or null. */
 function clipFor(bout,curated,film,now){
  if(!bout||bout.outcome!=='W'||!isFinishMethod(bout.method)||!/^\d{4}-\d\d-\d\d$/.test(bout.date||''))return null;
  const f=key(bout.fighter),o=key(bout.opponent);
  for(const c of (curated&&curated.clips)||[]){
   if(c&&ID.test(c.videoId||'')&&key(c.fighter)===f&&key(c.opponent)===o&&c.date===bout.date&&LABEL[c.kind]&&auOk(c,now))
    return {id:c.videoId,kind:c.kind,title:c.title||'',publisher:c.publisher||'UFC',source:'curated'};
  }
  const fight=Date.parse(bout.date+'T12:00:00Z');
  const pool=root.FightFilm&&root.FightFilm.pool&&film?root.FightFilm.pool(film,'mma',now,{shorts:true}):[];
  const hits=pool.filter(v=>{
   const day=Date.parse((v.date||'')+'T12:00:00Z');
   return v&&v.title&&(v.isFinish===true||/^(ko|tko|submission)\b/i.test(v.kind||''))&&!NOT_THE_FINISH.test(v.title)&&
    youtubeId(v.url)&&Number.isFinite(day)&&day>=fight&&day<=fight+14*DAY&&namesIn(v.title,bout.fighter);
  }).sort((a,b)=>Math.abs(Date.parse(a.date)-fight)-Math.abs(Date.parse(b.date)-fight));
  return hits[0]?{id:youtubeId(hits[0].url),kind:'finish',title:hits[0].title,publisher:hits[0].publisher||'',source:'feed'}:null;
 }

 // ---------- browser ----------
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const data={curated:null,film:null,loading:null};
 function load(){
  if(data.loading||typeof fetch!=='function')return data.loading||Promise.resolve();
  const get=u=>fetch(u).then(r=>r.ok?r.json():null).catch(()=>null);
  data.loading=Promise.all([get('data/ufc-finish-clips.json'),get('data/fight-film.json')]).then(([c,f])=>{
   data.curated=c&&c.schema===1&&Array.isArray(c.clips)?c:null;data.film=f&&Array.isArray(f.videos)?f:null;
   const d=root.document&&root.document.querySelector('#fighterDialog');
   if(d&&d.open)decorate(d);
  });
  return data.loading;
 }
 /* Add buttons to the open profile's fight rows. Safe to call again after every re-render. */
 function decorate(dialog){
  load();
  const pa=dialog&&dialog.querySelector('.befn-pa');
  // Only UFC profiles have the deep fight list (fighter-insights' rows), so no list means nothing to do.
  if(!pa||!pa.querySelector('[data-pa-deep="fights"] .befn-pro-fight-list'))return;
  const name=(pa.querySelector('.befn-pa-who h2')||{}).textContent||'';
  if(!name||!data.loading)return;
  const now=Date.now();
  const rows=[];
  // Recent fights cards (fighter-insights) and the "Earlier UFC fights" list (fighter-stats-profile).
  for(const li of pa.querySelectorAll('[data-pa-deep="fights"] .befn-pro-fight-list>li')){
   const main=li.querySelector('.befn-pro-fight-main');
   rows.push({li,host:main,opponent:(li.querySelector('.befn-v3-opponent')||{}).textContent,
    date:(li.querySelector('.befn-v3-date')||{}).textContent,method:(li.querySelector('.befn-v3-method')||{}).textContent});
  }
  for(const li of pa.querySelectorAll('[data-pa-deep="fights"] .bsp-history>ul>li')){
   const host=li.querySelector('.bsp-history-row>div');
   const small=((host&&host.querySelector('small'))||{}).textContent||'';
   const parts=small.split(' · ');
   rows.push({li,host,opponent:((host&&host.querySelector('strong'))||{}).textContent,date:parts[parts.length-1],method:parts.slice(0,-1).join(' · ')});
  }
  for(const r of rows){
   if(!r.host||r.host.querySelector('.befn-finish-play')||r.li.querySelector('.befn-finish-video'))continue;
   const bout={fighter:name.trim(),opponent:String(r.opponent||'').trim(),date:String(r.date||'').trim(),
    outcome:r.li.classList.contains('is-win')?'W':'',method:r.method};
   const clip=clipFor(bout,data.curated,data.film,now);
   if(!clip)continue;
   r.host.insertAdjacentHTML('beforeend','<button type="button" class="befn-finish-play" data-finish-id="'+esc(clip.id)+'" data-finish-title="'+
    esc(clip.title||bout.fighter+' vs '+bout.opponent)+'"><span aria-hidden="true">▶</span> '+esc(LABEL[clip.kind])+(clip.publisher&&clip.publisher!=='UFC'?' · '+esc(clip.publisher):'')+'</button>');
  }
 }
 function play(btn){
  const id=btn.getAttribute('data-finish-id');
  if(!ID.test(id||''))return;
  const doc=root.document,li=btn.closest('li');
  const box=doc.createElement('div');box.className='befn-finish-video';
  const frame=doc.createElement('iframe');
  frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
  frame.title=btn.getAttribute('data-finish-title')||'YouTube video';
  frame.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
  frame.setAttribute('allowfullscreen','');
  frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
  box.appendChild(frame);
  (li||btn.parentNode).appendChild(box);
  btn.remove();
  frame.focus();
 }
 if(root.document)root.document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('.befn-finish-play');
  if(b){e.preventDefault();play(b);}
 });
 const api={clipFor,decorate,load,isFinishMethod};
 root.BEFNFinishClips=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
