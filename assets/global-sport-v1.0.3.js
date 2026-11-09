/* BEFN v1.0.3 — persistent editorial sport selection.
   This only selects local views; it does not change any data polling, workflows or endpoints. */
(() => {
 'use strict';
 const KEY='befn-selected-sport-v1.0.3';
 const allowed=new Set(['all','boxing','mma','grappling']);
 let value='all';
 try{const saved=localStorage.getItem(KEY);if(allowed.has(saved))value=saved}catch(_){}
 function refreshUI(){
  if(!document.body)return;
  document.body.dataset.befnSport=value;
  document.querySelectorAll('[data-sport-value]').forEach(btn=>{
   const selected=btn.dataset.sportValue===value;
   btn.setAttribute('aria-pressed',String(selected));
   btn.classList.toggle('is-active',selected);
  });
 }
 function set(next){
  if(!allowed.has(next)||next===value)return;
  value=next;
  try{localStorage.setItem(KEY,next)}catch(_){}
  refreshUI();
  document.dispatchEvent(new CustomEvent('befn:sport-change',{detail:{sport:value}}));
 }
 window.BEFNSport=Object.freeze({get:()=>value,set,options:[...allowed]});
 document.addEventListener('click',event=>{
  const btn=event.target.closest?.('button[data-sport-value]');
  if(btn){set(btn.dataset.sportValue)}
 });
 document.addEventListener('DOMContentLoaded',refreshUI);
 window.addEventListener('storage',event=>{
  if(event.key===KEY&&allowed.has(event.newValue)&&value!==event.newValue){
   value=event.newValue;refreshUI();
   document.dispatchEvent(new CustomEvent('befn:sport-change',{detail:{sport:value}}));
  }
 });
})();
