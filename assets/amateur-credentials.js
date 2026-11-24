/* Amateur career on UFC profiles (owner approved option A with metallic medals, 25 Nov 2026).
 * Data: data/ufc-amateur-credentials.json, built offline from verified research by
 * scripts/build-amateur-credentials.mjs. Adds up to three badges under the record and an
 * "Amateur career" list with one row per result and a link to its source. */
(function(){
 'use strict';
 const DATA_URL='data/ufc-amateur-credentials.json?v=20261125-am6';
 let data=null,loading=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeURL=u=>/^https:\/\//i.test(u||'')?u:'';
 const slugOf=f=>f?.statsSlug||String(f?.name||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/['’.]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const MEDALS={gold:'Gold',silver:'Silver',bronze:'Bronze'};
 const BELTS=['white','blue','purple','brown','black'];
 const FOLD=8;

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
  const row=r=>{
   const detail=[r.year,r.event,r.country].filter(Boolean).join(' · ');
   const result=!r.medal&&!r.place?'<span class="befn-am-result">'+esc(r.result)+'</span>':'';
   const url=safeURL(r.source?.url);
   const belt=BELTS.includes(r.belt)?'<i class="befn-am-belt is-'+r.belt+'" role="img" aria-label="'+r.belt+' belt"></i>':'';
   return '<li class="befn-am-row">'+medalHTML(r.medal,r.place,false)+
    '<div class="befn-am-text"><b>'+esc(r.edition)+'</b><span>'+belt+esc(detail)+'</span>'+result+'</div>'+
    (url?'<a class="befn-am-source" href="'+esc(url)+'" target="_blank" rel="noopener" title="'+esc(r.source.name)+'">Source</a>':'')+'</li>';
  };
  // Long careers (some grapplers have 70+ podiums) fold after the first rows.
  const shown=entry.rows.slice(0,FOLD).map(row).join(''),rest=entry.rows.slice(FOLD);
  return '<section class="befn-pro-card befn-am-card" data-pro-section="amateur" data-befn-amateur>'+
   '<header><h3>Amateur career</h3><p>'+esc(sports.join(' · '))+' · verified against official results</p></header>'+
   '<ol class="befn-am-list">'+shown+'</ol>'+
   (rest.length?'<details class="befn-am-more"><summary>Show all '+entry.rows.length+' results</summary><ol class="befn-am-list" start="'+(FOLD+1)+'">'+rest.map(row).join('')+'</ol></details>':'')+
   '<div class="befn-am-key" aria-hidden="true">'+medalHTML('gold',1,true)+'Gold'+medalHTML('silver',2,true)+'Silver'+
   medalHTML('bronze',3,true)+'Bronze'+medalHTML(null,8,true)+'Placed</div>'+
   '<p class="befn-am-note">Only results checked against the official source appear here.</p></section>';
 }
 // The badges and card sit BESIDE the areas fighter-insights.js rebuilds when its own data
 // arrives (it rewrites [data-befn-top-credentials] and replaces .befn-profile-insights), never
 // inside them, so a late rebuild cannot wipe them. An observer re-adds them if anything else
 // re-renders the open profile.
 let watched=null;
 function place(dialog,entry){
  let changed=false;
  const top=dialog.querySelector('[data-befn-top-credentials]');
  if(top&&entry.badges.length&&!dialog.querySelector('[data-befn-amateur-badges]')){
   top.insertAdjacentHTML('beforebegin',badgesHTML(entry));changed=true;
  }
  const body=dialog.querySelector('.befn-pro-body');
  if(body&&!dialog.querySelector('[data-befn-amateur]')){
   const insights=body.querySelector(':scope > .befn-profile-insights');
   if(insights)insights.insertAdjacentHTML('afterend',sectionHTML(entry));
   else body.insertAdjacentHTML('beforeend',sectionHTML(entry));
   changed=true;
  }
  return changed;
 }
 function apply(dialog,f){
  const entry=entryFor(f);
  watched?.observer.disconnect();watched=null;
  if(!dialog)return false;
  dialog.querySelectorAll('[data-befn-amateur],[data-befn-amateur-badges]').forEach(n=>n.remove());
  if(!entry)return false;
  place(dialog,entry);
  const content=dialog.querySelector('#fighter-dialog-content')||dialog;
  const name=f?.name;
  const observer=new MutationObserver(()=>{
   if(!dialog.open||dialog.querySelector('.befn-pro-id h2')?.textContent!==name){observer.disconnect();watched=null;return}
   place(dialog,entry);
  });
  observer.observe(content,{childList:true,subtree:true});
  watched={observer};
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
