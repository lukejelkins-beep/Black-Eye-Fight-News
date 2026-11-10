/* Shared Fights screen: one route, upcoming/results tabs, MMA promotion filters. */
window.FightsHub = (() => {
  'use strict';
  const state = {tab:'upcoming', promotion:'ufc', query:''};
  let views = null;
  const options = [
    ['ufc','UFC','UFC Logo.svg'],
    ['one','ONE','ONE Championship.png'],
    ['pfl','PFL','Professional Fighters League Primary Logo.jpg']
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tab = (key,label) => '<button type="button" role="tab" data-fights-tab="'+key+'" id="fights-tab-'+key+'" aria-controls="fights-feed" aria-selected="'+(state.tab===key)+'" class="'+(state.tab===key?'is-active':'')+'">'+label+'</button>';
  const promotions = () => '<div class="fights-promotions" role="group" aria-label="Select MMA organisation"'+(views?.sport==='mma'?'':' hidden')+'>'+
    options.map(([key,name,file])=>'<button type="button" data-fights-promotion="'+key+'" class="fights-promotion'+(state.promotion===key?' is-active':'')+'" aria-pressed="'+(state.promotion===key)+'" aria-label="'+name+'"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)+'" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>'+name+'</span></button>').join('')+'</div>';
  function body() {
    if(!views)return '';
    return state.tab==='upcoming' ? views.upcoming() : views.results();
  }
  function render({sport,upcoming,results}) {
    views = {sport,upcoming,results};
    return '<div id="fights-hub-root" class="fights-hub" data-sport="'+esc(sport)+'">'+
      '<header class="section-heading calendar-photo-heading"><h1>Fights</h1></header>'+
      '<div class="fights-controls">'+
        '<label class="fights-search" for="fights-search"><span aria-hidden="true">⌕</span><input id="fights-search" type="search" autocomplete="off" placeholder="Search events or fighters" value="'+esc(state.query)+'"></label>'+
        '<div class="fights-tabs" role="tablist" aria-label="Fight cards">'+tab('upcoming','Upcoming')+tab('results','Results')+'</div>'+
        promotions()+
      '</div>'+
      '<div class="fights-feed" id="fights-feed" role="tabpanel" aria-labelledby="fights-tab-'+state.tab+'">'+body()+'</div>'+
    '</div>';
  }
  function refreshFeed() {
    const feed = document.getElementById('fights-feed');
    if(!feed)return;
    feed.setAttribute('aria-labelledby','fights-tab-'+state.tab);
    feed.innerHTML = body();
  }
  function setTab(next) {
    if(next!=='upcoming' && next!=='results')return;
    state.tab=next;
    document.querySelectorAll('#fights-hub-root [data-fights-tab]').forEach(button=>{
      const selected=button.dataset.fightsTab===state.tab;
      button.classList.toggle('is-active',selected);
      button.setAttribute('aria-selected',String(selected));
    });
    refreshFeed();
  }
  function setPromotion(next) {
    if(!options.some(option=>option[0]===next))return;
    state.promotion=next;
    document.querySelectorAll('#fights-hub-root [data-fights-promotion]').forEach(button=>{
      const selected=button.dataset.fightsPromotion===next;
      button.classList.toggle('is-active',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    refreshFeed();
  }
  document.addEventListener('click',event=>{
    const tabButton=event.target.closest?.('#fights-hub-root [data-fights-tab]');
    if(tabButton){setTab(tabButton.dataset.fightsTab);return;}
    const promotionButton=event.target.closest?.('#fights-hub-root [data-fights-promotion]');
    if(promotionButton){setPromotion(promotionButton.dataset.fightsPromotion);}
  });
  document.addEventListener('input',event=>{
    if(event.target.id!=='fights-search')return;
    state.query=event.target.value;
    refreshFeed();
  });
  return {render,setTab,getTab:()=>state.tab,getPromotion:()=>state.promotion,getQuery:()=>state.query};
})();