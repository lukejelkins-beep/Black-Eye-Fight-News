/* Curated, dated results. Never reuse current profile records for historical bouts. */
window.ResultsDesk=(()=>{
 'use strict';
 let data=null,error='',pending=null,lastPollAt=0;
 const activeCardSection=new Map();
 const attemptedPortraits=new Set(),portraitJobs=[];
 let portraitActive=0;
 const filters={sport:'All',query:'',clips:false,promotion:'ufc'};
 const promotions=[['ufc','UFC','UFC Logo.svg'],['pfl','PFL','Professional Fighters League Primary Logo.jpg'],['one','ONE','ONE Championship.png']];
 const selectedPromotion=()=>window.BEFNFightsUI?.promotion||filters.promotion;
 const belongsToPromotion=r=>{const e=(data?.events||[]).find(x=>x.id===r.eventId)||{};const name=String([r.event,r.promotion,r.organization,e.name,e.promotion,e.organization].filter(Boolean).join(' ')).toLowerCase();return ({ufc:/\bufc\b|ultimate fighting championship/,pfl:/\bpfl\b|professional fighters league/,one:/\bone\b|one championship/})[selectedPromotion()]?.test(name)??false};
 const promotionMatch=r=>window.BEFNSport?.get()!=='mma'||belongsToPromotion(r);
 const isFinalStatus=s=>['completed','no_contest','draw'].includes(String(s||'').toLowerCase());
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const url=x=>{try{const u=new URL(x,location.href);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
 const date=x=>window.FightTime.venueDay(x);
 const link=(href,label,cls='')=>`<a class="${cls}" href="${url(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 function photo(f, winner=false) {
 const source=f.photo || (typeof portraitURL === 'function' ? portraitURL(f.name) : '');
 const initials=String(f.name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join('');
 return `<span class="result-photo${winner?' is-winner':''}" data-result-photo-name="${esc(f.name)}">${source?`<img src="${url(source)}" alt="Photograph of ${esc(f.name)}" loading="lazy" referrerpolicy="no-referrer">`:''}<span class="result-photo-missing" ${source?'hidden':''} aria-hidden="true">${esc(initials)}</span>${winner?'<span class="result-win-tick" role="img" aria-label="Confirmed winner">✓</span>':''}</span>`;
}
 function record(f){if(!f.record){if(f.preRecord)return `<span class="result-record">${f.preRecordSource?link(f.preRecordSource,f.preRecord):esc(f.preRecord)} <small>before this fight</small></span>`;return '<span class="result-record is-unverified">Record not yet confirmed</span>';}return `<span class="result-record">${link(f.recordSource,f.record+(f.noContests?` · ${f.noContests} NC`:""))} <small>${esc(f.recordContext==='event-listing'?'as listed for event':f.recordVerifiedAt?'as of '+f.recordVerifiedAt:'after this fight')}</small></span>`}
 function fighter(f,label){return `<div class="result-fighter">${photo(f)}<div><span class="result-outcome ${label==='WIN'?'win':''}">${label}</span><strong>${esc(f.name)}</strong>${record(f)}</div></div>`}
 function clip(r){
  if(!r.highlights?.url||r.highlights.auAvailable!==true||!r.highlights.thumbnail)return '<span class="result-unavailable">AU video not yet verified</span>';
  const finished=/\b(ko|tko|knockout|stoppage|submission|tapout)\b/i.test(r.method||'');
  const label=finished?'▶ Watch finish':'▶ Watch highlights';
  return link(r.highlights.url,label,'result-watch')+`<small class="result-clip-publisher">${esc(r.highlights.publisher||'Original publisher')}</small>`;
 }
 function media(r){return r.image?`<div class="result-cover"><img src="${url(r.image)}" alt="${esc(r.fighters.map(f=>f.name).join(' vs '))}" loading="lazy"><small>${esc(r.imageCredit)}</small></div>`:`<div class="result-faceoff">${r.fighters.map((f,i)=>photo(f,r.status==='completed'&&r.winner===i)).join('<span class="result-vs">VS</span>')}</div>`}
 function card(r){return `<article class="result-feature">${media(r)}<div class="result-feature-body"><div class="result-eyebrow">${esc(r.sport)} / ${esc(r.division||"Weight class not confirmed")} / ${date(r.date)}</div><h2>${esc(r.fighters[r.winner].name)} wins</h2><p>${esc(r.summary)}</p><div class="result-method">${esc(r.method)} <span>${r.round?`ROUND ${esc(r.round)}`:''}${r.time?` · ${esc(r.time)}`:''}</span></div><div class="result-card-records">${r.fighters.map(f=>`<div><strong>${esc(f.name)}</strong>${record(f)}</div>`).join('')}</div><div class="result-links">${clip(r)}${link(r.source,'Result report')}</div></div></article>`}
 function boutRecord(f, complete){
 if(complete&&f.record){const context=f.recordContext==='event-listing'?'as listed for event':f.recordVerifiedAt?'as of '+f.recordVerifiedAt:'after fight';return `<span class="result-bout-record" title="Record ${esc(context)}">${esc(f.record)} <small>${esc(context)}</small></span>`;}
 if(f.preRecord)return `<span class="result-bout-record">${esc(f.preRecord)} <small>before fight</small></span>`;
 return `<span class="result-bout-record is-unverified">Record unavailable</span>`;
}
 function boutMethod(method){
 const m=String(method||'').trim();
 if(/^technical unanimous decision$/i.test(m))return 'Technical UD';
 if(/^unanimous decision$/i.test(m))return 'UD';
 if(/^split decision$/i.test(m))return 'SD';
 if(/^majority decision$/i.test(m))return 'MD';
 if(/^points$/i.test(m))return 'Points decision';
 if(/^knockout/i.test(m))return m.replace(/^knockout/i,'KO');
 if(/^submission/i.test(m))return m.replace(/^submission/i,'SUB');
 return m||'Result confirmed';
}
 function boutStatus(r){
 const s=String(r.status||'').toLowerCase();
 if(isFinalStatus(s))return '<span class="result-bout-status is-final"><span aria-hidden="true">✓</span> FINAL</span>';
 if(s==='cancelled')return '<span class="result-bout-status is-cancelled">CANCELLED</span>';
 if(s==='underway'||s==='live')return '<span class="result-bout-status is-live"><span aria-hidden="true">●</span> UNDERWAY</span>';
 return '<span class="result-bout-status is-pending">AWAITING RESULT</span>';
}

 function sourceDetails(r){
  const countrySources=r.fighters.map(f=>f.countrySource?`<div>${link(f.countrySource,(f.name||'Fighter')+' flag: '+(f.countryLabel||f.countryCode))}</div>`:'').join('');
  return `<details class="result-bout-sources"><summary>Sources & records</summary><div class="result-bout-source-list">
   ${r.divisionSource?`<div>${link(r.divisionSource,'Verified advertised division: '+r.division)}${r.divisionNote?`<small>${esc(r.divisionNote)}</small>`:''}${r.divisionWeightsSource?`<small>${link(r.divisionWeightsSource,'Official / reported weigh-in figures')}</small>`:''}</div>`:''}
   ${r.scheduledRoundsSource?`<div>${link(r.scheduledRoundsSource,'Scheduled rounds source')}</div>`:''}
   ${countrySources}
   ${r.source?link(r.source,'Official result / coverage'):''}
   ${r.fighters.map(f=>f.recordSource||f.preRecordSource?`<div>${link(f.recordSource||f.preRecordSource,`${f.name} record`)}${f.recordNote?`<small>${esc(f.recordNote)}</small>`:''}</div>`:'').join('')}
   </div></details>`;
 }
 function countryFlag(f,side){
  const code=String(f.countryCode||'').toLowerCase();
  if(!/^(?:[a-z]{2}|gb-(?:eng|sct|wls))$/.test(code))return '';
  const country=f.countryLabel||code.toUpperCase();
  return `<img class="result-corner-flag result-corner-flag-${side}" src="https://flagcdn.com/${code}.svg" alt="" aria-hidden="true" loading="lazy" referrerpolicy="no-referrer" title="${esc(country)} flag">`;
 }
 function matchResult(r){
  const complete=isFinalStatus(r.status);
  if(complete){
   const detail=[boutMethod(r.method),r.round?'R'+r.round:'',r.time||''].filter(Boolean).join(' · ');
   return `<div class="result-matchup-result" aria-label="Final result"><span class="result-matchup-finished">FINAL</span><strong>${esc(detail)}</strong>${r.scores?`<span class="result-matchup-scores">${esc(r.scores)}</span>`:''}</div>`;
  }
  if(r.status==='underway'||r.status==='live')return '<span class="result-matchup-live">● BOUT UNDERWAY</span>';
  if(r.status==='cancelled')return '<span class="result-matchup-cancelled">BOUT CANCELLED</span>';
  return '';
 }
 function fighterLabels(f){
  const rank=Number(f.rank??f.divisionRank);
  const rankLabel=(f.champion===true&&f.championSource)?'<span class="result-fighter-rank is-champion">CHAMPION</span>':Number.isInteger(rank)&&rank>=1&&rank<=15&&(f.rankSource||f.rankingSource)?`<span class="result-fighter-rank" title="UFC divisional ranking as of ${esc(f.rankingAsOf||'source date')}">#${rank}</span>`:'';
  const classification=String(f.classification||f.fighterTier||'').toLowerCase();
  const verifiedTier=['prospect','contender'].includes(classification)&&(f.classificationSource||f.fighterTierSource)?classification:(rankLabel&&rankLabel.includes('#')?'contender':'');
  const tier=verifiedTier?`<span class="result-fighter-tier is-${verifiedTier}">${verifiedTier.toUpperCase()}</span>`:'';
  return {rankLabel,tier};
 }
 function row(r,position={}){
  const finished=isFinalStatus(r.status),winner=finished&&(r.winner===0||r.winner===1);
  const first=(r.fighters||[])[0]||{name:'Fighter TBC'},second=(r.fighters||[])[1]||{name:'Fighter TBC'};
  const side=(f,i)=>`<div class="result-contender result-contender-${i===0?'left':'right'}${winner&&r.winner===i?' is-winner':''}">${i===0?photo(f,winner&&r.winner===i):''}<div class="result-contender-info"><strong>${esc(f.name)} ${fighterLabels(f).rankLabel}</strong>${boutRecord(f,finished)}${fighterLabels(f).tier}</div>${i===1?photo(f,winner&&r.winner===i):''}</div>`;
  const roundText=Number.isInteger(r.scheduledRounds)&&r.scheduledRounds>0?`<span class="result-bout-rounds">${r.scheduledRounds} rounds</span>`:'';
  const extra=r.divisionNote?'<span class="result-division-caution">Weigh-in note</span>':'';
  return `<article class="result-bout result-bout-compact${finished?' is-completed':''}${position.main?' is-main-event':''}${position.coMain?' is-co-main-event':''}" aria-label="${esc(first.name)} versus ${esc(second.name)}${winner?'; '+esc(r.fighters[r.winner].name)+' winner':''}">
   <div class="result-matchup ${finished?'has-result':''}">\n    ${position.main?'<span class="result-featured-bout-label">MAIN EVENT</span>':position.coMain?'<span class="result-featured-bout-label">CO-MAIN EVENT</span>':''}
    ${countryFlag(first,'left')}${countryFlag(second,'right')}
    <span class="result-matchup-vs-watermark" aria-hidden="true">VS</span>
    ${matchResult(r)}
    ${side(first,0)}${side(second,1)}
   </div>
   <div class="result-bout-detail">
    <span class="result-bout-division">${esc(r.division||'Weight class not confirmed')}${extra}</span>
    ${roundText}
   </div>
   <div class="result-bout-secondary">${r.highlights?clip(r):''}</div>
  </article>`;
 }
 function selected(){
  const sport=window.BEFNSport?.get()||'all',query=String(window.BEFNFightsUI?.query??filters.query).toLowerCase();
  return (data?.results||[]).filter(r=>
   (sport==='all'||(sport==='mma'?(r.sport==='MMA'||(selectedPromotion()==='one'&&belongsToPromotion(r))):r.sport===(sport==='boxing'?'Boxing':'Grappling')))&&
   promotionMatch(r)&&(!filters.clips||r.highlights)&&
   JSON.stringify([r.event,r.division,...r.fighters.map(f=>f.name)]).toLowerCase().includes(query)
  ).sort((a,b)=>b.date.localeCompare(a.date)||(a.order||0)-(b.order||0));
 }
 function groups(rows){const events=new Map();for(const r of rows){const id=r.eventId||r.date+'-'+r.event;if(!events.has(id))events.set(id,[]);events.get(id).push(r)}return [...events.values()]}
 function cardSection(r){
 const section=String(r.section||'').toLowerCase();
 return /prelim|undercard/.test(section)?'prelims':'main';
}
 function eventSection(rows){
 const r=rows[0],e=(data.events||[]).find(e=>e.id===r.eventId)||{},all=data.results.filter(x=>x.eventId===r.eventId),done=all.filter(x=>isFinalStatus(x.status)).length;
 const featured=all.find(x=>x.id===e.featuredId&&x.status==='completed'&&[0,1].includes(x.winner))||all.find(x=>x.status==='completed'&&[0,1].includes(x.winner));
 const stale=e.feedDelayed||(e.status==='underway'&&Date.now()-Date.parse(e.checkedAt)>900000);
 const takeaways=(e.takeaways||[]).filter(x=>x.text);
 const eventId=r.eventId||r.date+'-'+r.event;
 const preview=featured?.image||featured?.fighters?.find(f=>f.photo)?.photo||'';
 const winner=featured?.status==='completed'&&[0,1].includes(featured.winner)?featured.fighters[featured.winner]?.name:'';
 const opponent=winner?featured.fighters[1-featured.winner]?.name:'';
 const outcome=winner?(winner+' defeated '+(opponent||'opponent')+' · '+boutMethod(featured.method)) : '';
 const main=rows.filter(x=>cardSection(x)==='main');
 const prelims=rows.filter(x=>cardSection(x)==='prelims');
 // Determine the source's main-card direction using the COMPLETE event, not
 // the currently filtered bouts (search/clips must not alter fight order).
 const sourceMain=all.filter(x=>cardSection(x)==='main').sort((a,b)=>(Number.isFinite(a.order)?a.order:all.indexOf(a))-(Number.isFinite(b.order)?b.order:all.indexOf(b)));
 const headlinerId=[e.mainBoutId,e.featuredId].find(id=>sourceMain.some(x=>x.id===id));
 // Most source feeds use a single billing direction for the entire event.
 // Some publish in walkout order (opener first), others in billing order
 // (headliner first). Per-section editorial overrides are supported when a
 // provider mixes the two styles.
 const sectionOrder=e.sectionOrder||{};
 const openerFirst=sectionOrder.main==='opener-first'||
  (sectionOrder.main!=='headliner-first'&&sourceMain.length>1&&sourceMain[sourceMain.length-1].id===headlinerId);
 if(openerFirst)main.reverse();
 // Ensure the verified headline fight is shown first, even with imperfect
 // upstream order metadata. Each section must be checked independently:
 // UFC prelim results may already be headliner-first when the main card isn't.
 if(headlinerId){
  const headlineIndex=main.findIndex(x=>x.id===headlinerId);
  if(headlineIndex>0)main.unshift(main.splice(headlineIndex,1)[0]);
 }
 const sourcePrelims=all.filter(x=>cardSection(x)==='prelims').sort((a,b)=>(Number.isFinite(a.order)?a.order:all.indexOf(a))-(Number.isFinite(b.order)?b.order:all.indexOf(b)));
 const prelimHeadlinerId=[e.prelimHeadlinerId,e.prelimsFeaturedId].find(id=>sourcePrelims.some(x=>x.id===id));
 // Main and prelims can use OPPOSITE source orders (as the Nov 7
 // UFC results do). Never infer the prelim direction from the main card.
 // Without verified metadata, retain the source's headliner-first order;
 // reverse only when a confirmed prelim headliner is listed last.
 const prelimOpenerFirst=sectionOrder.prelims==='opener-first'||
  (sectionOrder.prelims!=='headliner-first'&&Boolean(prelimHeadlinerId)&&
   sourcePrelims.length>1&&sourcePrelims[sourcePrelims.length-1].id===prelimHeadlinerId);
 if(prelimOpenerFirst)prelims.reverse();
 if(prelimHeadlinerId){
  const prelimHeadlineIndex=prelims.findIndex(x=>x.id===prelimHeadlinerId);
  if(prelimHeadlineIndex>0)prelims.unshift(prelims.splice(prelimHeadlineIndex,1)[0]);
 }
 const sections=[{key:'main',label:r.sport==='Boxing'&&all.some(x=>/main event/i.test(x.section||''))?'Main Event':'Main Card',bouts:main},{key:'prelims',label:r.sport==='Boxing'&&all.some(x=>/undercard/i.test(x.section||''))?'Undercard':'Prelims',bouts:prelims}];
 const available=sections.filter(x=>x.bouts.length);
 const requested=activeCardSection.get(eventId)||'all';
 const active=available.find(x=>x.key===requested);
 const shown=active?active.bouts:[...main,...prelims];
 const tabs=available.length>1?`<div class="result-card-tabs" role="group" aria-label="${esc(r.event)} card section">${[{key:'all',label:'All',bouts:[...main,...prelims]},...available].map(section=>`<button type="button" class="result-card-tab${section.key===requested?' is-active':''}" data-result-event-tab="${esc(eventId)}" data-result-card-section="${section.key}" aria-pressed="${section.key===requested}" aria-controls="results-bouts-${esc(eventId)}">${section.label} <small>${section.bouts.length}</small></button>`).join('')}</div>`:'';
 return `<details class="result-event befn-result-list-event" data-result-event="${esc(eventId)}" aria-label="${esc(r.event)}"><summary class="befn-result-summary"><span class="befn-result-thumb">${preview?`<img src="${url(preview)}" alt="Event imagery for ${esc(r.event)}" loading="lazy" referrerpolicy="no-referrer">`:'<span class="befn-result-thumb-fallback">BEFN</span>'}</span><span class="befn-result-summary-copy"><small>${esc(r.sport)} · ${esc(date(r.date))}</small><strong>${esc(r.event)}</strong><span>${esc(r.location||'Venue not confirmed')}</span>${outcome?`<span class="befn-result-outcome">${esc(outcome)}</span>`:''}</span><span class="befn-result-caret" aria-hidden="true">⌄</span></summary><div class="befn-result-expanded"><header class="result-event-heading"><div><span class="result-eyebrow">${esc(r.sport)} · Venue date ${date(r.date)} · ${esc(r.location)}</span><h2>${esc(r.event)}</h2><p>${e.partialCoverage?`${done} verified bouts documented · ${e.expectedBouts||'Full card'} expected · Further results being verified`:`${done} of ${e.expectedBouts||all.length} results confirmed · ${rows.length} ${rows.length===1?'bout':'bouts'} shown${done<all.length?' · Remaining outcomes awaiting confirmation':''}`}</p><small>${e.checkedAt?'Source checked '+esc(window.FightTime.localDateTime(e.checkedAt)):'Source check pending'}${stale?' · Updates delayed; last confirmed results retained':''}</small></div>${window.EventStatus?.event(r.eventId)||''}</header>${featured?`<div class="result-event-feature">${card(featured)}</div>`:''}${takeaways.length?`<div class="result-takeaways"><h3>Card takeaways${e.status==='underway'?' · so far':''}</h3><ul>${takeaways.map(p=>`<li>${esc(p.text)} ${p.source?link(p.source,'Source'):''}</li>`).join('')}</ul></div>`:''}<details class="result-event-bouts" data-card="${esc(eventId)}" open><summary>Fight card <span>${rows.length} total</span></summary>${tabs}<div class="result-bouts" id="results-bouts-${esc(eventId)}" role="list" aria-label="${esc(r.event)} — ${esc(active?.label||'All fights')}">${shown.map(x=>`<div role="listitem">${row(x,{main:x.id===headlinerId,coMain:main.length>1&&x.id===main[1].id})}</div>`).join('')}</div><p class="result-bouts-note">Green portrait rings and ticks mark confirmed winners only. Records are identified as pre-fight or post-fight.</p></details></div></details>`;
}
  function content(){if(!data)return `<div class="empty" role="status">${error?'Results could not be loaded. <button id="results-retry">Try again</button>':'Loading sourced results…'}</div>`;

 const rows=selected(),events=groups(rows);
 const cutoff=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
 const recent=events.filter(e=>e[0].date>=cutoff),earlier=events.filter(e=>e[0].date<cutoff);
 function dated(items){
  let previous='',html='';
  for(const event of items){
   const day=event[0].date;
   if(day!==previous){const d=new Date(day+'T12:00:00Z');html+='<h3 class="fights-result-date"><span>'+esc(d.toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'UTC'}).toUpperCase())+'</span> · '+esc(d.toLocaleDateString('en-AU',{weekday:'long',timeZone:'UTC'}))+'</h3>';previous=day;}
   html+=eventSection(event);
  }
  return html;
 }
 const group=(title,items)=>items.length?'<section class="fights-result-group"><h2>'+title+'</h2>'+dated(items)+'</section>':'';
 const sport=window.BEFNSport?.get()||'all',promo=window.BEFNFightsUI?.promotion||filters.promotion;
 const promotionLabel={ufc:'UFC',one:'ONE Championship',pfl:'PFL'}[promo]||'MMA';
 const isSearching=String(window.BEFNFightsUI?.query??filters.query).trim().length>0;
 const empty=isSearching?'<div class="empty">No results match your search. Try another event or fighter.</div>':
  '<div class="empty">'+(sport==='mma'?'No verified '+promotionLabel+' results are currently available in this feed.':'No completed fight results are currently available in this category.')+'</div>';
 return (error?'<p role="status">Refresh unavailable. Showing the last loaded results.</p>':'')+
  (events.length?group('This Week',recent)+group('Earlier Results',earlier):empty);

 }
function hydrateResultPhotos(){
 if(typeof findWikipediaPortrait!=='function')return;
 const names=[...new Set([...document.querySelectorAll('.result-photo[data-result-photo-name]')].filter(el=>!el.querySelector('img')).map(el=>el.getAttribute('data-result-photo-name')))];
 for(const name of names){if(name&&!attemptedPortraits.has(name)){attemptedPortraits.add(name);portraitJobs.push(name)}}
 function pump(){
  while(portraitActive<4&&portraitJobs.length){
   const name=portraitJobs.shift();portraitActive++;
   Promise.resolve().then(()=>findWikipediaPortrait(name)).then(source=>{
    if(!source||!/^https:\/\//.test(source))return;
    document.querySelectorAll('.result-photo[data-result-photo-name]').forEach(el=>{
     if(el.getAttribute('data-result-photo-name')!==name||el.querySelector('img'))return;
     const image=document.createElement('img');
     image.src=source;image.alt='Photograph of '+name;image.loading='lazy';image.referrerPolicy='no-referrer';
     el.insertBefore(image,el.firstChild);
     const missing=el.querySelector('.result-photo-missing');if(missing)missing.hidden=true;
    });
   }).catch(()=>{}).finally(()=>{portraitActive--;pump()});
  }
 }
 pump();
}
 function update(){
 const el=document.getElementById('results-content');
 if(el){
  const closed=new Set([...el.querySelectorAll('details[data-card]:not([open])')].map(x=>x.dataset.card));
  const expanded=new Set([...el.querySelectorAll('.befn-result-list-event[open]')].map(x=>x.dataset.resultEvent));
  el.innerHTML=content();
  el.querySelectorAll('details[data-card]').forEach(x=>{if(closed.has(x.dataset.card))x.open=false});
  el.querySelectorAll('.befn-result-list-event').forEach(x=>{if(expanded.has(x.dataset.resultEvent))x.open=true});
  hydrateResultPhotos();
 }
}
 function refreshPollLabel(){
 const label=document.getElementById('results-auto-sync');
 if(!label)return;
 const when=lastPollAt?new Date(lastPollAt).toLocaleTimeString(window.FightTime.locale,{hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'not yet';
 label.textContent=(error?'Check failed · showing saved results':'Auto-refresh 30s')+' · Checked '+when;
}
 async function load(){
 if(pending)return pending;
 const previousError=error;
 error='';
 pending=(async()=>{
  let changed=false;
  try{
   let d;
   for(const path of ['https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/data/results.json','data/results.json']){
    try{
     const res=await fetch(path+'?t='+Math.floor(Date.now()/30000),{cache:'no-store',signal:AbortSignal.timeout(12000)});
     if(!res.ok)throw Error('Results unavailable');
     const candidate=await res.json();
     if(!Array.isArray(candidate.events)||!Array.isArray(candidate.results)||candidate.results.some(r=>r.fighters?.length!==2))throw Error('Invalid results');
     d=candidate;break;
    }catch{}
   }
   if(!d)throw Error('No verified results data');
   const newest=x=>Math.max(0,...(x?.events||[]).map(e=>Date.parse(e.checkedAt)||0));
   if(data&&newest(d)<newest(data))throw Error('Older published data');
   changed=!data||JSON.stringify(d)!==JSON.stringify(data);
   data=d;window.EventStatus?.setEvents?.(d.events||[]);
  }catch{error='unavailable';}
  finally{
   lastPollAt=Date.now();
   pending=null;
   if(changed||previousError!==error)update();
   refreshPollLabel();
  }
 })();
 return pending;
}
 setInterval(()=>{if(!document.hidden&&(location.hash.startsWith('#fights')&&window.BEFNFightsUI?.view==='results'))load()},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(location.hash.startsWith('#fights')&&window.BEFNFightsUI?.view==='results'))load()});
 load();
  function promotionTabs(){return `<div class="befn-promotion-strip" id="befn-promotion-strip" role="group" aria-label="Filter MMA results by organisation" ${window.BEFNSport?.get()==='mma'?'':'hidden'}>${promotions.map(([id,label,domain])=>`<button type="button" class="befn-promotion-tab${filters.promotion===id?' selected':''}" data-result-promotion="${id}" aria-label="${label}" aria-pressed="${filters.promotion===id}">${domain?`<img src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(domain)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${label}</span>`:`<span>${label}</span>`}</button>`).join('')}</div>`}
 function render(opts={}){if((!data||Date.now()-lastPollAt>30000)&&!pending)load();requestAnimationFrame(()=>{hydrateResultPhotos();const strip=document.getElementById("befn-promotion-strip");if(strip)strip.scrollLeft=0});if(opts.embedded===true)return `<div class="frame results-page befn-unified-results"><div id="results-content">${content()}</div></div>`;return `<div class="frame results-page">${promotionTabs()}<div class="section-heading"><div><h1>Results & highlights</h1></div></div><div class="results-toolbar"><button id="results-retry" type="button">↻ Refresh results</button><label class="results-search">Find a fight<input id="results-search" type="search" placeholder="Fighter, event or division" value="${esc(filters.query)}"></label><label class="results-check"><input id="results-clips" type="checkbox"${filters.clips?' checked':''}> Highlights available</label></div><p id="results-auto-sync" class="results-sync" role="status" aria-live="polite">Auto-refresh 30s · checking…</p><div id="results-content">${content()}</div><details class="compact-note"><summary>Results and verification</summary><p>Results are sourced from published event listings. Weight classes and fighter records are checked against those sources; discrepancies are noted on individual bouts. Highlight videos may be region-restricted. This feed is not round-by-round scoring.</p></details></div>`}
 document.addEventListener('input',e=>{if(e.target.id==='results-search'){filters.query=e.target.value;update()}});
 document.addEventListener('change',e=>{if(e.target.id==='results-clips')filters.clips=e.target.checked;else return;update()});
 document.addEventListener('click',e=>{
  const promotion=e.target.closest('[data-result-promotion]');if(promotion){filters.promotion=promotion.dataset.resultPromotion;document.querySelectorAll('[data-result-promotion]').forEach(b=>{b.classList.toggle('selected',b.dataset.resultPromotion===filters.promotion);b.setAttribute('aria-pressed',String(b.dataset.resultPromotion===filters.promotion))});update();return;}
  const tab=e.target.closest('[data-result-event-tab]');
  if(tab){
   activeCardSection.set(tab.dataset.resultEventTab,tab.dataset.resultCardSection);
   update();
   return;
  }
  if(e.target.closest('#results-retry'))load();
  if(e.target.closest('#results-reset')){filters.query='';filters.clips=false;document.getElementById('main').innerHTML=render()}
 });
 document.addEventListener('error',function(e){
 if(!e.target.matches?.('.result-photo img,.result-cover img'))return;
 const img=e.target,container=img.closest('.result-photo'),fallback=container?.querySelector('.result-photo-missing');
 const hide=()=>{img.hidden=true;if(fallback)fallback.hidden=false};
 if(container&&!img.dataset.wikiRetry&&typeof findWikipediaPortrait==='function'){
  img.dataset.wikiRetry='1';
  const name=container.getAttribute('data-result-photo-name');
  Promise.resolve(findWikipediaPortrait(name)).then(source=>{
   if(!source||source===img.src)throw Error('No alternative');
   img.hidden=false;img.src=source;
  }).catch(hide);
 }else hide();
},true);
 const css=document.createElement('style');css.textContent=`.befn-promotion-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;max-width:420px;min-width:0;box-sizing:border-box;margin:0 0 18px;padding:4px 2px}.befn-promotion-strip[hidden]{display:none!important}.befn-promotion-tab{width:100%;min-width:0;min-height:64px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #b9b3ae;border-radius:12px;box-shadow:0 2px 3px #0002;padding:9px;color:#21191a;font-weight:900;font-size:13px;cursor:pointer;overflow:hidden}.befn-promotion-tab img{display:block;width:90px;height:42px;max-width:100%;object-fit:contain}.befn-promotion-tab.selected{background:#b70c1c;border:3px solid #ef3343;color:#fff;box-shadow:0 0 0 2px #b70c1c}.befn-promotion-tab:focus-visible{outline:3px solid #111;outline-offset:2px}@media(max-width:600px){.befn-promotion-strip{max-width:100%;gap:6px}.befn-promotion-tab{min-height:60px;padding:6px}.befn-promotion-tab img{width:82px;height:40px}.results-page{min-width:0;max-width:100%;overflow-x:clip}.befn-promotion-tab span:not([hidden]){font-size:12px;line-height:1.1;text-align:center}}`;document.head.appendChild(css);
 return {render};
})();
