/* Amateur career on UFC profiles (owner approved option A with metallic medals, 25 Nov 2026).
 * Data: data/ufc-amateur-credentials.json, built offline from verified research by
 * scripts/build-amateur-credentials.mjs. Adds up to three badges under the record and an
 * "Amateur career" list with one row per result and a link to its source. */
(function(){
 'use strict';
 const DATA_URL='data/ufc-amateur-credentials.json?v=20261125-am1';
 let data=null,loading=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeURL=u=>/^https:\/\//i.test(u||'')?u:'';
 const slugOf=f=>f?.statsSlug||String(f?.name||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/['’.]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const MEDALS={gold:'Gold',silver:'Silver',bronze:'Bronze'};

 function load(){
  if(data||loading)return loading||Promise.resolve(data);
  loading=fetch(DATA_URL).then(r=>r.ok?r.json():null).then(d=>{data=d?.schema===1?d:{fighters:{}};return data})
   .catch(()=>{data={fighters:{}};return data});
  return loading;
 }
 function entryFor(f){return data?.fighters?.[slugOf(f)]||null}

 function medalHTML(medal,place,small){
  const cls='befn-am-medal'+(small?' is-small':'')+' is-'+(medal||'none');
  const label=medal?MEDALS[medal]+' medal':(place?'Placed '+place:'Competed');
  return '<span class="'+cls+'" role="img" aria-label="'+esc(label)+'">'+esc(place?String(place):'·')+'</span>';
 }
 function badgesHTML(entry){
  if(!entry?.badges?.length)return '';
  return '<div class="befn-am-badges" data-befn-amateur-badges>'+entry.badges.map(b=>
   '<span class="befn-am-badge'+(b.highlight?' is-highlight':'')+'">'+
   (b.medal?medalHTML(b.medal,{gold:1,silver:2,bronze:3}[b.medal],true):'')+esc(b.label)+'</span>').join('')+'</div>';
 }
 function sectionHTML(entry){
  if(!entry?.rows?.length)return '';
  const sports=[...new Set(entry.rows.map(r=>r.sport).filter(Boolean))];
  const rows=entry.rows.map(r=>{
   const detail=[r.year,r.event,r.country].filter(Boolean).join(' · ');
   const result=!r.medal&&!r.place?'<span class="befn-am-result">'+esc(r.result)+'</span>':'';
   const url=safeURL(r.source?.url);
   return '<li class="befn-am-row">'+medalHTML(r.medal,r.place,false)+
    '<div class="befn-am-text"><b>'+esc(r.edition)+'</b><span>'+esc(detail)+'</span>'+result+'</div>'+
    (url?'<a class="befn-am-source" href="'+esc(url)+'" target="_blank" rel="noopener" title="'+esc(r.source.name)+'">Source</a>':'')+'</li>';
  }).join('');
  return '<section class="befn-pro-card befn-am-card" data-pro-section="amateur" data-befn-amateur>'+
   '<header><h3>Amateur career</h3><p>'+esc(sports.join(' · '))+' · verified against official results</p></header>'+
   '<ol class="befn-am-list">'+rows+'</ol>'+
   '<div class="befn-am-key" aria-hidden="true">'+medalHTML('gold',1,true)+'Gold'+medalHTML('silver',2,true)+'Silver'+
   medalHTML('bronze',3,true)+'Bronze'+medalHTML(null,8,true)+'Placed</div>'+
   '<p class="befn-am-note">Only results checked against the official source appear here.</p></section>';
 }
 function apply(dialog,f){
  const entry=entryFor(f);
  if(!dialog||!entry)return false;
  dialog.querySelectorAll('[data-befn-amateur],[data-befn-amateur-badges]').forEach(n=>n.remove());
  const top=dialog.querySelector('[data-befn-top-credentials]');
  if(top&&entry.badges.length)top.insertAdjacentHTML('afterbegin',badgesHTML(entry));
  const body=dialog.querySelector('.befn-pro-body');
  if(body){
   const anchor=body.querySelector('[data-pro-section="profile"]');
   if(anchor)anchor.insertAdjacentHTML('beforebegin',sectionHTML(entry));
   else body.insertAdjacentHTML('beforeend',sectionHTML(entry));
  }
  return true;
 }
 // Called right after a profile renders. If the data is still loading, applies it once it
 // arrives, provided the same fighter is still open.
 function decorate(dialog,f){
  if(data)return apply(dialog,f);
  const name=f?.name;
  load().then(()=>{if(dialog?.open&&dialog.querySelector('.befn-pro-id h2')?.textContent===name)apply(dialog,f)});
  return false;
 }
 window.BEFNAmateur={load,decorate,badgesHTML,sectionHTML,slugOf};
})();
