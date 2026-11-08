/* Five high-priority mobile tabs and one complete sections menu. */
(() => {
 'use strict';
 const $=(selector,scope=document)=>scope.querySelector(selector);
 const icon={
   home:'<path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-7h6v7"/>',
   news:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
   fights:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4"/>',
   results:'<path d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4"/>',
   social:'<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A9 9 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z"/>'
 };
 const glyph=k=>'<svg aria-hidden="true" viewBox="0 0 24 24">'+icon[k]+'</svg>';
 const items=[['home','Home','home'],['news','News','news'],['calendar','Fights','fights'],['results','Results','results'],['social','Fight Talk','social']];
 let sheet=null, opener=null;
 function active(){
   const key=location.hash.slice(1).split('/')[0]||'home';
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
   const sections=[
     ['#home','Overview'],['#news','Latest news'],
     ['#calendar','Fight calendar'],['#results','Results & highlights'],
     ['#social','Fight Talk'],['#highlights','Fight film'],
     ['#champions','Champions'],['#fighters','Fighter scout'],
     ['#archive','Newsletter editions']
   ];
   sections.forEach(([href,label])=>{const a=document.createElement('a');a.href=href;a.textContent=label;a.addEventListener('click',close);grid.append(a);});
   const alerts=document.createElement('button');alerts.type='button';alerts.textContent='Notification preferences';
   alerts.addEventListener('click',()=>{close();window.BEFNAlerts?.open?.();});
   grid.append(alerts);
   panel.append(heading,grid);cover.append(panel);
   cover.addEventListener('click',e=>{if(e.target===cover)close();});
   document.body.append(cover);sheet=cover;window.addEventListener('keydown',esc);x.focus();
 }
 function init(){
   if(document.querySelector('.befn-mobile-tabs'))return;
   const rail=$('.navrail');if(!rail)return;
   const bar=document.createElement('div');bar.className='befn-mobile-topbar';
   const name=document.createElement('strong');name.className='befn-mobile-title';name.textContent='BLACK EYE FIGHT NEWS';
   const actions=document.createElement('div');actions.className='befn-mobile-actions';
   const alerts=document.createElement('button');alerts.type='button';alerts.textContent='Alerts';alerts.addEventListener('click',()=>window.BEFNAlerts?.open?.());
   const menu=document.createElement('button');menu.type='button';menu.textContent='Menu';menu.addEventListener('click',()=>openMenu(menu));
   const install=$('.navrail .befn-install-button');if(install)actions.append(install);
   actions.append(alerts,menu);bar.append(name,actions);rail.append(bar);
   const dock=document.createElement('nav');dock.className='befn-mobile-tabs';dock.setAttribute('aria-label','Mobile quick navigation');
   items.forEach(([key,label,iconKey])=>{
     const a=document.createElement('a');a.href='#'+key;a.dataset.key=key;
     a.innerHTML=glyph(iconKey)+'<span>'+label+'</span>';
     dock.append(a);
   });
   document.body.append(dock);
   active();window.addEventListener('hashchange',active);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
