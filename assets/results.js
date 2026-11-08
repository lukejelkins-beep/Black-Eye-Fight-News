/* Curated, dated results. Never reuse current profile records for historical bouts. */
window.ResultsDesk=(()=>{
 'use strict';
 let data=null,error='',pending=null,lastPollAt=0;
 const activeCardSection=new Map();
 const attemptedPortraits=new Set(),portraitJobs=[];
 let portraitActive=0;
 const filters={sport:'All',query:'',clips:false};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const url=x=>{try{const u=new URL(x,location.href);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
 const date=x=>new Date(x+'T12:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
 const link=(href,label,cls='')=>`<a class="${cls}" href="${url(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 function photo(f, winner=false) {
 const source=f.photo || (typeof portraitURL === 'function' ? portraitURL(f.name) : '');
 const initials=String(f.name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join('');
 return `<span class="result-photo${winner?' is-winner':''}" data-result-photo-name="${esc(f.name)}">${source?`<img src="${url(source)}" alt="Photograph of ${esc(f.name)}" loading="lazy" referrerpolicy="no-referrer">`:''}<span class="result-photo-missing" ${source?'hidden':''} aria-hidden="true">${esc(initials)}</span>${winner?'<span class="result-win-tick" role="img" aria-label="Confirmed winner">✓</span>':''}</span>`;
}
 function record(f){if(!f.record)return '<span class="result-record">Record awaiting verification</span>';return `<span class="result-record">${link(f.recordSource,f.record+(f.noContests?` · ${f.noContests} NC`:""))} <small>after this fight</small></span>`}
 function fighter(f,label){return `<div class="result-fighter">${photo(f)}<div><span class="result-outcome ${label==='WIN'?'win':''}">${label}</span><strong>${esc(f.name)}</strong>${record(f)}</div></div>`}
 function clip(r){
  if(!r.highlights?.url||r.highlights.auAvailable!==true||!r.highlights.thumbnail)return '<span class="result-unavailable">AU video not yet verified</span>';
  const finished=/\b(ko|tko|knockout|stoppage|submission|tapout)\b/i.test(r.method||'');
  const label=finished?'▶ Watch finish':'▶ Watch highlights';
  return link(r.highlights.url,label,'result-watch')+`<small class="result-clip-publisher">${esc(r.highlights.publisher||'Original publisher')}</small>`;
 }
 function media(r){return r.image?`<div class="result-cover"><img src="${url(r.image)}" alt="${esc(r.fighters.map(f=>f.name).join(' vs '))}" loading="lazy"><small>${esc(r.imageCredit)}</small></div>`:`<div class="result-faceoff">${r.fighters.map((f,i)=>photo(f,r.status==='completed'&&r.winner===i)).join('<span class="result-vs">VS</span>')}</div>`}
 function card(r){return `<article class="result-feature">${media(r)}<div class="result-feature-body"><div class="result-eyebrow">${esc(r.sport)} / ${esc(r.division||"Weight class not confirmed")} / ${date(r.date)}</div><h2>${esc(r.fighters[r.winner].name)} wins</h2><p>${esc(r.summary)}</p><div class="result-method">${esc(r.method)} <span>ROUND ${r.round}${r.time?' · '+esc(r.time):''}</span></div><div class="result-card-records">${r.fighters.map(f=>`<div><strong>${esc(f.name)}</strong>${record(f)}</div>`).join('')}</div><div class="result-links">${clip(r)}${link(r.source,'Result report')}</div></div></article>`}
 function boutRecord(f, complete){
 if(complete&&f.record)return `<span class="result-bout-record" title="Record after this fight">${esc(f.record)} <small>after fight</small></span>`;
 if(f.preRecord)return `<span class="result-bout-record">${esc(f.preRecord)} <small>before fight</small></span>`;
 return `<span class="result-bout-record is-unverified">Record unverified</span>`;
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
 if(s==='completed')return '<span class="result-bout-status is-final"><span aria-hidden="true">✓</span> FINAL</span>';
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
  const complete=r.status==='completed';
  if(complete){
   const detail=[boutMethod(r.method),r.round?'R'+r.round:'',r.time||''].filter(Boolean).join(' · ');
   return `<div class="result-matchup-result" aria-label="Final result"><span class="result-matchup-finished">FINAL</span><strong>${esc(detail)}</strong>${r.scores?`<span class="result-matchup-scores">${esc(r.scores)}</span>`:''}</div>`;
  }
  if(r.status==='underway'||r.status==='live')return '<span class="result-matchup-live">● BOUT UNDERWAY</span>';
  if(r.status==='cancelled')return '<span class="result-matchup-cancelled">BOUT CANCELLED</span>';
  return '';
 }
 function row(r){
  const finished=r.status==='completed',winner=finished&&(r.winner===0||r.winner===1);
  const first=(r.fighters||[])[0]||{name:'Fighter TBC'},second=(r.fighters||[])[1]||{name:'Fighter TBC'};
  const side=(f,i)=>`<div class="result-contender result-contender-${i===0?'left':'right'}${winner&&r.winner===i?' is-winner':''}">${i===0?photo(f,winner&&r.winner===i):''}<div class="result-contender-info"><strong>${esc(f.name)}</strong>${boutRecord(f,finished)}</div>${i===1?photo(f,winner&&r.winner===i):''}</div>`;
  const roundText=Number.isInteger(r.scheduledRounds)&&r.scheduledRounds>0?`<span class="result-bout-rounds">${r.scheduledRounds} rounds</span>`:'';
  const extra=r.divisionNote?'<span class="result-division-caution">Weigh-in note</span>':'';
  return `<article class="result-bout result-bout-compact${finished?' is-completed':''}" aria-label="${esc(first.name)} versus ${esc(second.name)}${winner?'; '+esc(r.fighters[r.winner].name)+' winner':''}">
   <div class="result-matchup ${finished?'has-result':''}">
    ${countryFlag(first,'left')}${countryFlag(second,'right')}
    <span class="result-matchup-vs-watermark" aria-hidden="true">VS</span>
    ${matchResult(r)}
    ${side(first,0)}${side(second,1)}
   </div>
   <div class="result-bout-detail">
    <span class="result-bout-division">${esc(r.division||'Weight class not confirmed')}${extra}</span>
    ${roundText}
   </div>
   <div class="result-bout-secondary">${r.highlights?clip(r):''}${sourceDetails(r)}</div>
  </article>`;
 }
 function selected(){return (data?.results||[]).filter(r=>(filters.sport==='All'||r.sport===filters.sport)&&(!filters.clips||r.highlights)&&JSON.stringify([r.event,r.division,...r.fighters.map(f=>f.name)]).toLowerCase().includes(filters.query.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)||(a.order||0)-(b.order||0))}
 function groups(rows){const events=new Map();for(const r of rows){const id=r.eventId||r.date+'-'+r.event;if(!events.has(id))events.set(id,[]);events.get(id).push(r)}return [...events.values()]}
 function cardSection(r){
 const section=String(r.section||'').toLowerCase();
 return /prelim|undercard/.test(section)?'prelims':'main';
}
 function eventSection(rows){
 const r=rows[0],e=(data.events||[]).find(e=>e.id===r.eventId)||{},all=data.results.filter(x=>x.eventId===r.eventId),done=all.filter(x=>x.status==='completed').length;
 const featured=all.find(x=>x.id===e.featuredId&&x.status==='completed')||all.find(x=>x.status==='completed');
 const stale=e.feedDelayed||(e.status==='underway'&&Date.now()-Date.parse(e.checkedAt)>900000);
 const takeaways=(e.takeaways||[]).filter(x=>x.text);
 const eventId=r.eventId||r.date+'-'+r.event;
 const main=rows.filter(x=>cardSection(x)==='main');
 const prelims=rows.filter(x=>cardSection(x)==='prelims');
 const sections=[{key:'main',label:r.sport==='Boxing'&&all.some(x=>/main event/i.test(x.section||''))?'Main Event':'Main Card',bouts:main},{key:'prelims',label:r.sport==='Boxing'&&all.some(x=>/undercard/i.test(x.section||''))?'Undercard':'Prelims',bouts:prelims}];
 const available=sections.filter(x=>x.bouts.length);
 const requested=activeCardSection.get(eventId);
 const active=available.find(x=>x.key===requested)||available[0];
 const tabs=available.length>1?`<div class="result-card-tabs" role="group" aria-label="${esc(r.event)} card section">${available.map(section=>`<button type="button" class="result-card-tab${section.key===active.key?' is-active':''}" data-result-event-tab="${esc(eventId)}" data-result-card-section="${section.key}" aria-pressed="${section.key===active.key}" aria-controls="results-bouts-${esc(eventId)}"><span>${section.label}</span><small>${section.bouts.length} ${section.bouts.length===1?'fight':'fights'}</small></button>`).join('')}</div>`:'';
 return `<section class="result-event" aria-label="${esc(r.event)}"><header class="result-event-heading"><div><span class="result-eyebrow">${esc(r.sport)} · ${date(r.date)} · ${esc(r.location)}</span><h2>${esc(r.event)}</h2><p>${done} of ${e.expectedBouts||all.length} results confirmed · ${rows.length} ${rows.length===1?'bout':'bouts'} shown${done<all.length?' · Remaining outcomes awaiting confirmation':''}</p><small>${e.checkedAt?'Source checked '+esc(new Date(e.checkedAt).toLocaleString('en-AU')):'Source check pending'}${stale?' · Updates delayed; last confirmed results retained':''}</small></div>${window.EventStatus?.event(r.eventId)||''}</header>${featured?`<div class="result-event-feature">${card(featured)}</div>`:''}${takeaways.length?`<div class="result-takeaways"><h3>Card takeaways${e.status==='underway'?' · so far':''}</h3><ul>${takeaways.map(p=>`<li>${esc(p.text)} ${p.source?link(p.source,'Source'):''}</li>`).join('')}</ul></div>`:''}<details class="result-event-bouts" data-card="${esc(eventId)}" open><summary>Fight card <span>${rows.length} total</span></summary>${tabs}<div class="result-bouts" id="results-bouts-${esc(eventId)}" role="list" aria-label="${esc(r.event)} — ${esc(active?.label||'Fight card')}">${(active?.bouts||[]).map(x=>`<div role="listitem">${row(x)}</div>`).join('')}</div><p class="result-bouts-note">Green portrait rings and ticks mark confirmed winners only. Records are identified as pre-fight or post-fight.</p></details></section>`;
}
  function content(){if(!data)return `<div class="empty" role="status">${error?'Results could not be loaded. <button id="results-retry">Try again</button>':'Loading sourced results…'}</div>`;
 const rows=selected(),events=groups(rows);return `${error?'<p role="status">Refresh unavailable. Showing the last loaded results.</p>':''}<p class="results-count" role="status">${events.length} ${events.length===1?'event':'events'} · ${rows.length} ${rows.length===1?'bout':'bouts'} · Reviewed ${date(data.reviewedAt)}</p>${rows.length?events.map(eventSection).join(''):'<div class="empty">No results match these filters. <button id="results-reset">Clear filters</button></div>'}`}
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
  el.innerHTML=content();
  el.querySelectorAll('details[data-card]').forEach(x=>{if(closed.has(x.dataset.card))x.open=false});
  hydrateResultPhotos();
 }
}
 function refreshPollLabel(){
 const label=document.getElementById('results-auto-sync');
 if(!label)return;
 const when=lastPollAt?new Date(lastPollAt).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',second:'2-digit'}):'not yet';
 label.textContent=(error?'Latest check failed; previous verified results retained':'Checking for newly published results every 30 seconds')+' · Last check: '+when+'. Official sources may publish less frequently.';
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
 setInterval(()=>{if(!document.hidden&&location.hash.startsWith('#results'))load()},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash.startsWith('#results'))load()});
 load();
  function render(){if((!data||Date.now()-lastPollAt>30000)&&!pending)load();requestAnimationFrame(hydrateResultPhotos);return `<div class="frame results-page"><div class="section-heading"><div><div class="eyebrow">THE FINAL BELL</div><h1>Results & highlights</h1></div><p>The outcome. The new records. The moments that decided it.</p></div><p class="results-note">Boxing and MMA results grouped by fight card, newest events first. Weight classes are checked against published event listings, with discrepancies in the source details. Records reflect the end of each fight. Clips open with the publisher and may have regional restrictions.</p><div class="results-toolbar"><button id="results-retry" type="button">↻ Refresh results</button><label>Sport<select id="results-sport">${['All','Boxing','MMA'].map(s=>`<option${s===filters.sport?' selected':''}>${s}</option>`).join('')}</select></label><label class="results-search">Find a fight<input id="results-search" type="search" placeholder="Fighter, event or division" value="${esc(filters.query)}"></label><label class="results-check"><input id="results-clips" type="checkbox"${filters.clips?' checked':''}> Highlights available</label></div><p id="results-auto-sync" class="results-sync" role="status" aria-live="polite">Checking for newly published results every 30 seconds while this page is open. Official sources may publish less frequently.</p><div id="results-content">${content()}</div><p class="results-note">The browser checks for newly published results every 30 seconds while this page is active. The source updater is scheduled approximately every five minutes during monitored cards, and publisher or scheduling delays may occur. This is a results feed, not round-by-round scoring. Open “Record sources” for verification notes.</p></div>`}
 document.addEventListener('input',e=>{if(e.target.id==='results-search'){filters.query=e.target.value;update()}});
 document.addEventListener('change',e=>{if(e.target.id==='results-sport')filters.sport=e.target.value;else if(e.target.id==='results-clips')filters.clips=e.target.checked;else return;update()});
 document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-result-event-tab]');
  if(tab){
   activeCardSection.set(tab.dataset.resultEventTab,tab.dataset.resultCardSection);
   update();
   return;
  }
  if(e.target.closest('#results-retry'))load();
  if(e.target.closest('#results-reset')){filters.sport='All';filters.query='';filters.clips=false;document.getElementById('main').innerHTML=render()}
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
 return {render};
})();
