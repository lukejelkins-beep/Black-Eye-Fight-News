/* Five high-priority mobile tabs and one complete sections menu. */
(() => {
 'use strict';
 const $=(selector,scope=document)=>scope.querySelector(selector);
 const icon={
   home:'<path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-7h6v7"/>',
   news:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
   fighters:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
   analysis:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
   film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/>',
   fights:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4"/>',
   results:'<path d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4"/>',
   social:'<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A9 9 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z"/>'
 };
 const glyph=k=>'<svg aria-hidden="true" viewBox="0 0 24 24">'+icon[k]+'</svg>';
 const items=[['home','Home','news'],['fights','Fights','fights'],['fighters','Fighters','fighters'],['analysis','Analysis','analysis'],['social','Fight Talk','social']];
 const groupOf={calendar:'fights',results:'fights',highlights:'fights',champions:'fighters',leaderboards:'analysis'};
 let sheet=null, opener=null;
 function active(){
   const route=location.hash.slice(1).split('/')[0]||'home';
   const key=route==='news'?'home':(groupOf[route]||route);
   document.querySelectorAll('.befn-mobile-tabs a').forEach(a=>{
     if(a.dataset.key===key)a.setAttribute('aria-current','page');
     else a.removeAttribute('aria-current');
   });
 }
 function close(){
   if(!sheet)return;
   sheet.remove();sheet=null;
   window.removeEventListener('keydown',esc);
   opener?.focus();opener=null;
 }
 const esc=e=>{if(e.key==='Escape')close();};
 function openMenu(button){
   if(sheet){close();return;}
   opener=button;
   const cover=document.createElement('div');
   cover.className='befn-mobile-overlay';
   const panel=document.createElement('section');
   panel.className='befn-mobile-sheet';
   panel.setAttribute('role','dialog');
   panel.setAttribute('aria-modal','true');
   panel.setAttribute('aria-label','All Black Eye Fight News sections');
   const heading=document.createElement('div');heading.className='befn-mobile-sheet-head';
   const h2=document.createElement('h2');h2.textContent='Explore the fight desk';
   const x=document.createElement('button');x.type='button';x.textContent='Close';x.addEventListener('click',close);
   heading.append(h2,x);
   const grid=document.createElement('div');grid.className='befn-mobile-sheet-grid';
   const area=window.BEFNSport?.get?.()||'all';
   const areaName=window.BEFNSport?.name?.()||'All sports';
   const sports=document.createElement('div');sports.className='befn-mobile-sheet-grid';
   [['#home','All sports (front page)','all'],['#home','Boxing','boxing'],['#home','MMA','mma'],['sumo.html','Sumo','']].forEach(([href,label,key])=>{
     const a=document.createElement('a');a.href=href;a.textContent=label;if(key)a.dataset.area=key;
     if(key===area)a.setAttribute('aria-current','true');
     a.addEventListener('click',close);sports.append(a);
   });
   const sportsHead=document.createElement('h3');sportsHead.className='befn-mobile-sheet-sub';sportsHead.textContent='Sports';
   const sectionsHead=document.createElement('h3');sectionsHead.className='befn-mobile-sheet-sub';sectionsHead.textContent=areaName;
   const sections=[
     ['#home',area==='all'?'Front page':'Overview'],
     ['#fights','Upcoming fights'],['#results','Results'],['#highlights','Fight film'],
     ['#fighters','Fighters'],
     ['#analysis',area==='mma'?'Analysis: UFC stats':'Analysis'],['#social','Fight Talk']
   ];
   sections.forEach(([href,label])=>{const a=document.createElement('a');a.href=href;a.textContent=label;a.addEventListener('click',close);grid.append(a);});
   const alerts=document.createElement('button');alerts.type='button';alerts.textContent='Alerts: notification preferences';
   alerts.addEventListener('click',()=>{close();window.BEFNAlerts?.open?.();});
   grid.append(alerts);
   const install=document.querySelector('.befn-install-button');
   if(install){const b=document.createElement('button');b.type='button';b.textContent='Install the app';b.addEventListener('click',()=>{close();install.click();});grid.append(b);}
   panel.append(heading,sportsHead,sports,sectionsHead,grid);cover.append(panel);
   cover.addEventListener('click',e=>{if(e.target===cover)close();});
   document.body.append(cover);sheet=cover;window.addEventListener('keydown',esc);x.focus();
 }
 function init(){
   if(document.querySelector('.befn-mobile-tabs'))return;
   const rail=$('.navrail');if(!rail)return;
   /* The phone top bar (logo, sport tabs, menu icon) is built by assets/phone-nav.js, which opens
      this menu; Alerts and Install now live in the menu (owner, 24 Nov 2026, phone nav option B). */
   const dock=document.createElement('nav');dock.className='befn-mobile-tabs';dock.setAttribute('aria-label','Mobile quick navigation');
   items.forEach(([key,label,iconKey])=>{
     const a=document.createElement('a');a.href='#'+key;a.dataset.key=key;
     a.innerHTML=glyph(iconKey)+'<span>'+label+'</span>';
     dock.append(a);
   });
   document.body.append(dock);
   active();window.addEventListener('hashchange',active);
   const homeLabel=()=>{const span=dock.querySelector('a[data-key="home"] span');if(span)span.textContent=(window.BEFNSport?.get?.()||'all')==='all'?'Home':'Overview';};
   homeLabel();document.addEventListener('befn:sport-change',()=>{homeLabel();active();});
 }
 window.BEFNMobileMenu={open:openMenu};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
