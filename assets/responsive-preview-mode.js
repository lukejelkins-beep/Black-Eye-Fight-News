/* Test-only layout selector for isolated BEFN redesign preview. */
(()=>{
 'use strict';
 if(location.hostname!=='befn-responsive-preview.onrender.com')return;
 const query=new URLSearchParams(location.search);
 const forced=query.get('layout')==='desktop'||query.get('desktop')==='1'||sessionStorage.getItem('befn-preview-layout')==='desktop';
 function setup(){
   if(forced)document.body.classList.add('befn-force-desktop');
   const control=document.createElement('div');
   control.className='befn-preview-switch';
   control.setAttribute('aria-label','Preview layout controls');
   const text=document.createElement('span');
   text.textContent='PREVIEW · '+Math.round(window.innerWidth)+'px';
   const button=document.createElement('button');
   button.type='button';
   const update=()=>{
     const isDesktop=document.body.classList.contains('befn-force-desktop');
     button.textContent=isDesktop?'Use responsive view':'Show desktop view';
     button.setAttribute('aria-pressed',String(isDesktop));
   };
   button.addEventListener('click',()=>{
     document.body.classList.toggle('befn-force-desktop');
     sessionStorage.setItem('befn-preview-layout',document.body.classList.contains('befn-force-desktop')?'desktop':'responsive');
     update();
   });
   window.addEventListener('resize',()=>{text.textContent='PREVIEW · '+Math.round(window.innerWidth)+'px';});
   control.append(text,button);document.body.append(control);update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
