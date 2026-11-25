/* BEFN sport areas (owner decision, 23 Nov 2026: sport first, then section).
   The sport is the area you are in: Boxing or MMA here, Sumo on its own pages. "all" is the
   mixed front page, reached from the logo. Grappling is hidden from the navigation for now
   (owner: a separate project), so a saved "grappling" falls back to the front page.
   This only selects local views; it does not change any data polling, workflows or endpoints.
   The sport is also kept in the address as ?sport=mma or ?sport=boxing (before the #), so a
   shared or reopened link shows the same sport (QA audit D02, 25 Nov 2026). The front page
   ("all") has no parameter. Routes after the # are unchanged, and the browser keeps the query
   through every '#…' navigation. A link without ?sport falls back to the saved choice. */
(() => {
 'use strict';
 const KEY='befn-selected-sport-v1.0.3';
 const allowed=new Set(['all','boxing','mma']);
 const NAMES={all:'All sports',boxing:'Boxing',mma:'MMA'};
 let value='all';
 try{const saved=localStorage.getItem(KEY);if(allowed.has(saved))value=saved}catch(_){}
 /* A sport in the address wins over the saved choice, and becomes the saved choice. */
 const fromURL=(()=>{try{return new URLSearchParams(location.search).get('sport')}catch(_){return null}})();
 if(allowed.has(fromURL)){value=fromURL;try{localStorage.setItem(KEY,value)}catch(_){}}
 function writeURL(){
  try{
   const url=new URL(location.href);
   if(value==='all')url.searchParams.delete('sport');else url.searchParams.set('sport',value);
   const next=url.pathname+url.search+url.hash;
   if(next!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',next);
  }catch(_){}
 }
 writeURL();
 function refreshUI(){
  if(!document.body)return;
  document.body.dataset.befnSport=value;
  document.documentElement.dataset.befnArea=value;
  document.querySelectorAll('.sh [data-area],[data-area-row] [data-area]').forEach(link=>{
   if(link.dataset.area==='all')return;
   if(link.dataset.area===value)link.setAttribute('aria-current','true');
   else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-area-name]').forEach(el=>{el.textContent=NAMES[value]});
  /* In a sport the first section is that sport's overview; with all sports it is the front page. */
  document.querySelectorAll('[data-section-label]').forEach(el=>{el.textContent=value==='all'?'Front page':'Overview'});
 }
 function set(next){
  if(!allowed.has(next)||next===value)return;
  value=next;
  try{localStorage.setItem(KEY,next)}catch(_){}
  writeURL();
  refreshUI();
  document.dispatchEvent(new CustomEvent('befn:sport-change',{detail:{sport:value}}));
 }
 /* Choosing a sport (or the logo) enters that area at its overview. */
 function enter(area){
  const sameRoute=location.hash===''||location.hash==='#home';
  if(area===value){if(!sameRoute)location.hash='#home';return}
  if(!sameRoute)history.replaceState(null,'','#home');
  set(area);
 }
 window.BEFNSport=Object.freeze({get:()=>value,set,enter,options:[...allowed],name:v=>NAMES[v||value]});
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('[data-area]');
  if(link&&allowed.has(link.dataset.area)&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey){
   event.preventDefault();enter(link.dataset.area);return;
  }
  const btn=event.target.closest?.('button[data-sport-value]');
  if(btn){set(btn.dataset.sportValue)}
 });
 document.addEventListener('DOMContentLoaded',refreshUI);
 window.addEventListener('storage',event=>{
  if(event.key===KEY&&allowed.has(event.newValue)&&value!==event.newValue){
   value=event.newValue;writeURL();refreshUI();
   document.dispatchEvent(new CustomEvent('befn:sport-change',{detail:{sport:value}}));
  }
 });
})();
