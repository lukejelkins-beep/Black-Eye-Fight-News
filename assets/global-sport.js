/* BEFN v1.0.3: one editorial sport selection across sections.
   Presentation-only state; no background polling or data collection. */
(()=>{
 'use strict';
 const allowed=new Set(['all','boxing','mma','grappling']);
 const key='befn-selected-sport-v1.0.3';
 let sport='all';
 try{const saved=localStorage.getItem(key);if(allowed.has(saved))sport=saved;}catch(_){}
 function sync(){
  document.documentElement.dataset.befnSport=sport;
  document.querySelectorAll('[data-befn-sport]').forEach(button=>{
   const active=button.dataset.befnSport===sport;
   button.setAttribute('aria-pressed',String(active));
   button.classList.toggle('is-active',active);
  });
 }
 function set(value){
  if(!allowed.has(value))return;
  const changed=sport!==value;sport=value;
  try{localStorage.setItem(key,sport)}catch(_){}
  sync();
  if(changed)window.dispatchEvent(new CustomEvent('befn:sportchange',{detail:{sport}}));
 }
 window.BEFNSport=Object.freeze({get:()=>sport,set,values:[...allowed]});
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button[data-befn-sport]');
  if(button){event.preventDefault();set(button.dataset.befnSport);}
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
 else sync();
})();