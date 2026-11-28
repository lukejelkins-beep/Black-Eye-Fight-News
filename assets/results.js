/* Curated, dated results. Never reuse current profile records for historical bouts. */
window.ResultsDesk=(()=>{
 'use strict';
 let data=null,error='',pending=null,lastPollAt=0;
 let posters={},posterPending=null,posterLastChecked=0;
 const activeCardSection=new Map();
 let weeksShown=3; // Results page (owner, 25 Nov 2026, design G/H): newest weeks first, "Show older weeks" adds four.
 const attemptedPortraits=new Set(),portraitJobs=[];
 let portraitActive=0;
 const filters={sport:'All',query:'',clips:false,promotion:'all'};
 const promotions=[['ufc','UFC','UFC Logo.svg'],['pfl','PFL','Professional Fighters League Primary Logo.jpg'],['one','ONE','ONE Championship.png']];

 // Event-specific historical promotional images with original source URLs.
 function posterFor(e){const own=(window.BEFNLocalPosters||{})[e.id],mine=own&&(own.portrait||own.landscape);if(mine)return {url:mine.url,source:mine.source,kind:own.portrait?'poster':'artwork'};const x=posters[e.id]||e.poster||null;return x&&/^https:\/\//i.test(x.url||'')&&/^https:\/\//i.test(x.source||'')?x:null}
 async function loadPosters(){
  if(posterPending||Date.now()-posterLastChecked<15*60*1000)return posterPending;
  posterLastChecked=Date.now();
  posterPending=(async()=>{
   for(const base of ['data/historical-posters.json','https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/data/historical-posters.json']){
    try{
     const response=await fetch(base+'?t='+Math.floor(Date.now()/900000),{cache:'no-store',signal:AbortSignal.timeout(12000)});
     if(!response.ok)continue;
     const file=await response.json();
     if(!file||typeof file.events!=='object'||Array.isArray(file.events))continue;
     if(JSON.stringify(file.events)!==JSON.stringify(posters)){posters=file.events;update()}
     return;
    }catch{}
   }
  })().finally(()=>{posterPending=null});
  return posterPending;
 }
 const selectedPromotion=()=>window.BEFNFightsUI?.promotion||filters.promotion;
 const belongsToPromotion=r=>{const e=(data?.events||[]).find(x=>x.id===r.eventId)||{};const name=String([r.event,r.promotion,r.organization,e.name,e.promotion,e.organization].filter(Boolean).join(' ')).toLowerCase();const p=selectedPromotion();if(p==='all')return true;return (window.BEFNPromotions||{ufc:/\bufc\b|ultimate fighting championship/,pfl:/\bpfl\b|professional fighters league/,one:/\bone\b|one championship/})[p]?.test(name)??false};
 const promotionMatch=r=>window.BEFNSport?.get()!=='mma'||belongsToPromotion(r);
 const isFinalStatus=s=>['completed','no_contest','draw'].includes(String(s||'').toLowerCase());
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const url=x=>{if(/^assets\/img\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(String(x)))return esc(x);try{const u=new URL(x,location.href);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
 const date=x=>window.FightTime.venueDay(x);
 const link=(href,label,cls='')=>`<a class="${cls}" href="${url(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 function photo(f, winner=false) {
 const source=(window.BEFNLocalImages?window.BEFNLocalImages.url(f.name,'thumb'):'') || f.photo || (typeof portraitURL === 'function' ? portraitURL(f.name) : '');
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
 /* The fighter's UFC cut-out, scaled so every head is the same size (assets/cutout-fit.js); '' when there is none. */
 const slugOf=n=>String(n||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[łŁ]/g,'l').replace(/[øØ]/g,'o').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 function fitPhoto(f,winner){
  const Fit=window.BEFNCutoutFit,k=slugOf(f.name),fit=Fit&&Fit.style('fighter',k,{head:30,crown:9});
  // The older result styles size every photo with !important, so the fitted placement carries !important too.
  const style=fit&&fit.split(';').map(x=>x+'!important').join(';');
  return style?`<span class="result-photo rr-fit${winner?' is-winner':''}" data-portrait-ignore><img src="assets/img/ufc-cutouts/${esc(k)}.webp" alt="" style="${style}" loading="lazy" onerror="this.parentNode.classList.add('is-gone')"></span>`:'';
 }
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
 if(s==='draw')return '<span class="result-bout-status is-final">DRAW</span>';
 if(s==='no_contest')return '<span class="result-bout-status is-cancelled">NO CONTEST</span>';
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
   const label=r.status==='draw'?'DRAW':r.status==='no_contest'?'NO CONTEST':'FINAL';
   // Results card rows, design A (owner, 28 Nov 2026): a short method chip and the round and time; the full method stays
   // in the label and in the fight snapshot.
   const m=String(r.method||'').toLowerCase();
   const [kind,chip]=r.status==='draw'||/draw/.test(m)?['draw','DRAW']:r.status==='no_contest'||/no contest/.test(m)?['nc','NC']:
    /sub/.test(m)?['sub','SUB']:/\b(t?ko|knockout|stoppage|rtd|retire)/.test(m)?['ko','KO/TKO']:
    /split/.test(m)?['dec','SPLIT DEC']:/majority/.test(m)?['dec','MAJ DEC']:/decision/.test(m)?['dec','DEC']:['',label];
   const when=[r.round?'R'+r.round:'',r.time||''].filter(Boolean).join(' · ');
   return `<div class="result-matchup-result" aria-label="${esc(label==='FINAL'?'Final result: '+detail:label+(detail?': '+detail:''))}"><span class="result-matchup-finished">${label}</span><strong>${esc(detail)}</strong><span class="rr-chip is-${kind}" aria-hidden="true">${esc(chip)}</span>${when?`<span class="rr-when" aria-hidden="true">${esc(when)}</span>`:''}${r.scores?`<span class="result-matchup-scores">${esc(r.scores)}</span>`:''}</div>`;
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
  const pic=(f,w)=>(r.sport==='MMA'&&fitPhoto(f,w))||photo(f,w);
  const side=(f,i)=>`<div class="result-contender result-contender-${i===0?'left':'right'}${winner&&r.winner===i?' is-winner':''}">${i===0?pic(f,winner&&r.winner===i):''}<div class="result-contender-info"><strong>${esc(f.name)} ${fighterLabels(f).rankLabel}</strong>${boutRecord(f,finished)}${fighterLabels(f).tier}</div>${i===1?pic(f,winner&&r.winner===i):''}</div>`;
  const roundText=Number.isInteger(r.scheduledRounds)&&r.scheduledRounds>0?`<span class="result-bout-rounds">${r.scheduledRounds} rounds</span>`:'';
  const extra=r.divisionNote?'<span class="result-division-caution">Weigh-in note</span>':'';
  return `<article class="result-bout result-bout-compact${finished?' is-completed':''}${position.main?' is-main-event':''}${position.coMain?' is-co-main-event':''}" aria-label="${esc(first.name)} versus ${esc(second.name)}${winner?'; '+esc(r.fighters[r.winner].name)+' winner':''}">
   <div class="result-matchup ${finished?'has-result':''}${winner?' has-winner':''}">\n    ${position.main?'<span class="result-featured-bout-label">MAIN EVENT</span>':position.coMain?'<span class="result-featured-bout-label">CO-MAIN EVENT</span>':''}
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
 return /prelim|undercard|the inner circle/.test(section)?'prelims':'main';
}
 function eventSection(rows,opts={}){
 const r=rows[0],e=(data.events||[]).find(e=>e.id===r.eventId)||{},all=data.results.filter(x=>x.eventId===r.eventId),done=all.filter(x=>isFinalStatus(x.status)).length;
 const featured=all.find(x=>x.id===e.featuredId&&x.status==='completed'&&[0,1].includes(x.winner))||all.find(x=>x.status==='completed'&&[0,1].includes(x.winner));
 const stale=e.feedDelayed||(e.status==='underway'&&Date.now()-Date.parse(e.checkedAt)>900000);
 const takeaways=(e.takeaways||[]).filter(x=>x.text);
 const eventId=r.eventId||r.date+'-'+r.event;
 const poster=posterFor(e);
 const fighterPreview=featured?.image||featured?.fighters?.find(f=>f.photo)?.photo||'';
 const preview=poster?.url||fighterPreview;
 const thumb=preview?'<img src="'+url(preview)+'" alt="'+esc(poster?(poster.kind==='poster'?'Event poster for ':'Event artwork for ')+r.event:'Fighter image for '+r.event)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"'+(poster&&fighterPreview?' data-fallback-src="'+url(fighterPreview)+'"':'')+'>':'<span class="befn-result-thumb-fallback">BEFN</span>';
 const expandedPoster=poster?'<figure class="befn-result-poster"><div class="befn-result-poster-frame"><img class="befn-expanded-poster-image" src="'+url(poster.url)+'" alt="Event artwork: '+esc((globalThis.BEFNEventTitle||(x=>x))(r.event))+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div></figure>':'';
 const venue=[e.location,r.location,poster?.location].map(x=>String(x||'').trim()).find(x=>x&&!/not confirmed|venue tbc|location unknown|location tbc|unknown venue/i.test(x))||'';
 const validVenue=Boolean(venue);
 const eventFoot='<footer class="befn-result-event-foot">'+(validVenue?'<div><strong>Location</strong><span>'+esc(venue)+'</span></div>':'')+(e.source?'<div><strong>Results</strong>'+(/^https:\/\/boxerbook\.com\//.test(e.source)?link('https://boxerbook.com','Data from Boxerbook')+' · '+link(e.source,'View source'):link(e.source,'View source'))+'</div>':'')+(poster?.source?'<div><strong>Artwork</strong>'+link(poster.source,'Image source')+'</div>':'')+'</footer>';
 const winner=featured?.status==='completed'&&[0,1].includes(featured.winner)?featured.fighters[featured.winner]?.name:'';
 const opponent=winner?featured.fighters[1-featured.winner]?.name:'';
 /* Results card front (owner, 24 Nov 2026): the event poster we hold, otherwise both fighters' faces with the
    winner first; then "Winner beat Loser", method, round and division. The full card opens on tap, as before. */
 const rxcFace=(f,cls)=>{const src=(window.BEFNLocalImages?window.BEFNLocalImages.url(f?.name,'thumb'):'')||f?.photo||'';const ini=String(f?.name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join('');
  return '<span class="rxc-face '+cls+'"><span class="rxc-ini" aria-hidden="true">'+esc(ini)+'</span>'+(src?'<img src="'+url(src)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">':'')+'</span>';};
 const ownPoster=(()=>{const own=(window.BEFNLocalPosters||{})[e.id];const p=own&&(own.portrait||own.landscape);return p&&p.url?p:null})();
 const pairNames=featured?(winner?[featured.fighters[featured.winner],featured.fighters[1-featured.winner]]:featured.fighters):[];
 const rxcMedia=ownPoster?'<span class="rxc-media is-poster"><img src="'+url(ownPoster.url)+'" alt="'+esc('Event poster for '+r.event)+'" loading="lazy" decoding="async"></span>'
  :'<span class="rxc-media is-pair">'+(pairNames.length===2?rxcFace(pairNames[0],winner?'is-win':'')+rxcFace(pairNames[1],winner?'is-lose':''):'')+'</span>';
 const rxcLine=winner?'<b>'+esc(winner)+'</b> beat '+esc(opponent||'opponent'):featured?esc(featured.fighters.map(f=>f.name).join(' and ')):esc((globalThis.BEFNEventTitle||(x=>x))(r.event));
 const rxcMeta=featured?[String(boutMethod(featured.method)).replace(/\s*\(.*\)\s*$/,''),winner&&featured.round?'Round '+featured.round:'',featured.division].filter(Boolean).join(' · '):'';
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
 const oneSessions=all.some(x=>x.session==='The Inner Circle')&&all.some(x=>/Friday Fights/.test(x.session||''));
 const sections=[{key:'main',label:oneSessions?'ONE Friday Fights':r.sport==='Boxing'&&all.some(x=>/main event/i.test(x.section||''))?'Main Event':'Main Card',bouts:main},{key:'prelims',label:oneSessions?'The Inner Circle':r.sport==='Boxing'&&all.some(x=>/undercard/i.test(x.section||''))?'Undercard':'Prelims',bouts:prelims}];
 const available=sections.filter(x=>x.bouts.length);
 const requested=activeCardSection.get(eventId);
 const active=available.find(x=>x.key===requested)||available[0];
 const shown=active?active.bouts:[];
 const tabs=available.length>1?`<div class="result-card-tabs" role="group" aria-label="${esc((globalThis.BEFNEventTitle||(x=>x))(r.event))} card section">${available.map(section=>`<button type="button" class="result-card-tab${section.key===active?.key?' is-active':''}" data-result-event-tab="${esc(eventId)}" data-result-card-section="${section.key}" aria-pressed="${section.key===active?.key}" aria-controls="results-bouts-${esc(eventId)}">${section.label} <small>${section.bouts.length}</small></button>`).join('')}</div>`:'';
 const size=['lead','big','small'].includes(opts.size)?opts.size:'big';
 const title=String((globalThis.BEFNEventTitle||(x=>x))(r.event)).replace(/\s+[—–-]\s+verified\b.*$/i,''); // e.g. "RIZIN 55 — verified main-card results"
 const art=posterArt(e,poster);
 const surname=f=>String(f?.name||'').trim().split(/\s+/).slice(-1)[0]||'';
 const tile=pairNames.length===2?esc(surname(pairNames[0]))+'<i>v</i>'+esc(surname(pairNames[1])):esc(title);
 const rxpArt=art?'<span class="rxp-art"><img src="'+url(art.url)+'" alt="'+esc((art.kind==='poster'?'Event poster for ':'Event artwork for ')+title)+'" style="object-position:'+art.position+'" loading="'+(size==='lead'?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer"></span>'
  :'<span class="rxp-art is-tile" aria-hidden="true"><span class="rxp-tile">'+tile+'</span></span>';
 const lead=size==='lead';
 const leadClip=lead&&featured&&verifiedClip(featured)?'<span class="rxp-clip">'+clip(featured)+'</span>':'';
 const m=opts.match;
 const matchLine=m&&[0,1].includes(m.winner)&&isFinalStatus(m.status)?'<span class="rxp-match">'+esc(m.fighters[m.winner].name)+' beat '+esc(m.fighters[1-m.winner].name)+' · '+esc(String(boutMethod(m.method)).replace(/\s*\(.*\)\s*$/,''))+'</span>':m?'<span class="rxp-match">'+esc(m.fighters.map(f=>f.name).join(' v '))+'</span>':'';
 const meta=[rxcMeta,all.length+' '+(all.length===1?'bout':'bouts')].filter(Boolean).join(' · ');
 return `<details class="result-event befn-result-list-event rxp-card is-${size}${art?'':' no-art'}" data-result-event="${esc(eventId)}" data-befn-sport="${esc(String(r.sport||'').toLowerCase())}" aria-label="${esc(title)}"><summary class="befn-result-summary rxp-head">${rxpArt}<span class="rxp-text"><small class="rxp-kicker">${esc(title)} · ${esc(shortDay(r.date))}</small><strong class="rxp-line">${rxcLine}</strong>${matchLine}<span class="rxp-meta">${esc(meta)}</span>${leadClip}</span><span class="rxp-open" aria-hidden="true"><span class="rxp-open-closed">Card <span class="befn-result-caret">⌄</span></span><span class="rxp-open-opened">Close ⌃</span></span></summary><div class="befn-result-expanded"><div class="result-event-bouts" data-card="${esc(eventId)}">${tabs}<div class="result-bouts" id="results-bouts-${esc(eventId)}" role="list" aria-label="${esc(title)} — ${esc(active?.label||'Main Card')}">${shown.map(x=>`<div role="listitem">${row(x,{main:x.id===headlinerId,coMain:main.length>1&&x.id===main[1].id})}</div>`).join('')}</div></div>${eventFoot}</div></details>`;
}

 /* Results page layout (owner, 25 Nov 2026): phone design G, desktop H. Search on top (Fights controls),
    the result of the week, then each week newest first as big posters (older weeks smaller), and
    "Show older weeks". A poster opens the full card in place. */
 const DAY=86400000;
 const dayMs=d=>Date.parse(String(d).slice(0,10)+'T12:00:00Z');
 function shortDay(d){const t=dayMs(d);return Number.isFinite(t)?new Date(t).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).replace(',',''):String(d||'')}
 function weekStart(d){const t=dayMs(d);if(!Number.isFinite(t))return '';const wd=(new Date(t).getUTCDay()+6)%7;return new Date(t-wd*DAY).toISOString().slice(0,10)}
 function todayKey(){try{return window.FightTime.dayKey(new Date())}catch{return new Date().toISOString().slice(0,10)}}
 function weekLabel(start,today=todayKey()){
  const current=weekStart(today);
  if(start===current)return 'This week';
  if(start===weekStart(new Date(dayMs(current)-7*DAY).toISOString()))return 'Last week';
  return weekRange(start);
 }
 function weekRange(start){
  const a=new Date(dayMs(start)),z=new Date(dayMs(start)+6*DAY);
  const mon=x=>x.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'});
  return a.getUTCMonth()===z.getUTCMonth()?a.getUTCDate()+'–'+z.getUTCDate()+' '+mon(z):a.getUTCDate()+' '+mon(a)+'–'+z.getUTCDate()+' '+mon(z);
 }
 // The sharper of the two posters we hold: the wide one when it is at least 600 px wide, otherwise the
 // tall poster cropped to the fighters. Then the historical poster feed. No image: a dark name tile.
 function posterArt(e,remote){
  const own=(window.BEFNLocalPosters||{})[e.id]||{},wide=own.landscape,tall=own.portrait;
  if(wide?.url&&(wide.width||0)>=600)return {url:wide.url,position:'center',kind:'artwork'};
  if(tall?.url)return {url:tall.url,position:'center 15%',kind:'poster'};
  if(wide?.url)return {url:wide.url,position:'center',kind:'artwork'};
  if(remote?.url)return {url:remote.url,position:'center 20%',kind:remote.kind==='poster'?'poster':'artwork'};
  return null;
 }
 const verifiedClip=r=>Boolean(r?.highlights?.url&&r.highlights.auAvailable===true&&r.highlights.thumbnail);
 function headliner(ev){
  const all=(data?.results||[]).filter(x=>x.eventId===ev[0].eventId),e=(data?.events||[]).find(x=>x.id===ev[0].eventId)||{};
  return all.find(x=>x.id===e.mainBoutId)||all.find(x=>x.id===e.featuredId)||null;
 }
 // Result of the week: from the newest week with results, the card whose main event has a verified
 // video, then the biggest card, then the newest.
 function pickLead(week){
  const size=ev=>(data?.results||[]).filter(x=>x.eventId===ev[0].eventId).length;
  return [...week].sort((a,b)=>(verifiedClip(headliner(b))-verifiedClip(headliner(a)))||(size(b)-size(a))||b[0].date.localeCompare(a[0].date))[0];
 }
 function weeksOf(events){
  const weeks=new Map();
  for(const ev of events){const k=weekStart(ev[0].date);if(!weeks.has(k))weeks.set(k,[]);weeks.get(k).push(ev)}
  return [...weeks.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
 }
 function weeklyLayout(events){
  const weeks=weeksOf(events),today=todayKey();
  const lead=pickLead(weeks[0][1]);
  let html='<section class="rxp-group rxp-lead-group"><h2 class="rxp-sec">Result of the week</h2>'+eventSection(lead,{size:'lead'})+'</section>';
  weeks.slice(0,weeksShown).forEach(([start,list],i)=>{
   const items=list.filter(ev=>ev!==lead);
   if(!items.length)return;
   const label=weekLabel(start,today),relative=/week$/.test(label);
   const heading=(list.includes(lead)?'Also '+(relative?label.toLowerCase():label):label);
   const note=(relative?weekRange(start)+' · ':'')+items.length+' '+(items.length===1?'card':'cards');
   const size=i<2?'big':'small';
   html+='<section class="rxp-group"><div class="rxp-wkh"><h2>'+esc(heading)+'</h2><span>'+esc(note)+'</span></div><div class="rxp-grid is-'+size+'">'+items.map(ev=>eventSection(ev,{size})).join('')+'</div></section>';
  });
  if(weeks.length>weeksShown){
   const oldest=events[events.length-1][0].date;
   html+='<div class="rxp-older"><button type="button" class="rxp-more" data-results-older>Show older weeks</button><p>Results go back to '+esc(shortDay(oldest)+' '+String(oldest).slice(0,4))+', or search above.</p></div>';
  }
  return html;
 }
 function searchLayout(events,query){
  const q=query.toLowerCase();
  const cards=events.map(ev=>{
   const full=(data?.results||[]).filter(x=>x.eventId===ev[0].eventId);
   const byName=String(ev[0].event||'').toLowerCase().includes(q);
   const match=byName?null:ev.find(x=>x.fighters.some(f=>String(f.name||'').toLowerCase().includes(q)))||null;
   return eventSection(full.length?full:ev,{size:'big',match});
  });
  return '<section class="rxp-group"><div class="rxp-wkh"><h2>Cards matching “'+esc(query)+'”</h2><span>'+cards.length+' '+(cards.length===1?'card':'cards')+'</span></div><div class="rxp-grid is-big">'+cards.join('')+'</div></section>';
 }
  function content(){if(!data)return `<div class="empty" role="status">${error?'Results could not be loaded. <button id="results-retry">Try again</button>':'Loading sourced results…'}</div>`;

 const rows=selected(),events=groups(rows);
 const sport=window.BEFNSport?.get()||'all',promo=window.BEFNFightsUI?.promotion||filters.promotion;
 const promotionLabel={ufc:'UFC',one:'ONE Championship',pfl:'PFL',ksw:'KSW',rizin:'RIZIN',cw:'Cage Warriors'}[promo]||'MMA';
 const query=String(window.BEFNFightsUI?.query??filters.query).trim();
 const empty=query?'<div class="empty">No results match your search. Try another event or fighter.</div>':
  '<div class="empty">'+(sport==='mma'?'No verified '+promotionLabel+' results are currently available in this feed.':'No completed fight results are currently available in this category.')+'</div>';
 const status=error?'<p role="status">Refresh unavailable. Showing the last loaded results.</p>':'';
 if(!events.length)return status+empty;
 return status+(query?searchLayout(events,query):weeklyLayout(events));
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
 if(window.BEFNCutoutFit)window.BEFNCutoutFit.load().then(()=>{if(data&&document.getElementById('results-content'))update();});
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
 // The browser can poll faster than GitHub's scheduled five-minute runs.
 // Poll every 30s only when the published feed has a recently checked
 // live event; otherwise use five minutes to avoid repeated 1 MB+ fetches.
 function isLiveCard(){
  return (data?.events||[]).some(e=>
   ['underway','live'].includes(String(e.status||'').toLowerCase())&&
   Number.isFinite(Date.parse(e.checkedAt))&&
   Date.now()-Date.parse(e.checkedAt)<15*60*1000);
 }
 const pollDelay=()=>isLiveCard()?30*1000:5*60*1000;
 function refreshPollLabel(){
 const label=document.getElementById('results-auto-sync');
 if(!label)return;
 const when=lastPollAt?new Date(lastPollAt).toLocaleTimeString(window.FightTime.locale,{hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'not yet';
 label.textContent=(error?'Check failed · showing saved results':isLiveCard()?'Auto-refresh 30s · live':'Auto-refresh 5 min · idle')+' · Checked '+when;
}
 async function load(){
 if(pending)return pending;
 const previousError=error;
 error='';
 pending=(async()=>{
  let changed=false;
  try{
   // The GitHub copy first, else the site's copy (unchanged rule); the download is shared with the rest of the page
   // (assets/feed-cache.js), so results.json is fetched once per source, not once per script.
   const okResults=c=>Array.isArray(c.events)&&Array.isArray(c.results)&&!c.results.some(r=>r.fighters?.length!==2);
   const d=await (window.BEFNFeed?window.BEFNFeed.newest:(p,ok)=>fetch(p+'?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d&&(!ok||ok(d))?d:null).catch(()=>null))('data/results.json',okResults,{bucketMs:30000,timeoutMs:12000,stamp:()=>0});
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
 setInterval(()=>{if(!document.hidden&&location.hash?.startsWith('#fights')&&window.BEFNFightsUI?.view==='results'&&Date.now()-lastPollAt>=pollDelay())load()},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(location.hash.startsWith('#fights')&&window.BEFNFightsUI?.view==='results'))load()});
 load();
 loadPosters();
  function promotionTabs(){return `<div class="befn-promotion-strip" id="befn-promotion-strip" role="group" aria-label="Filter MMA results by organisation" ${window.BEFNSport?.get()==='mma'?'':'hidden'}>${promotions.map(([id,label,domain])=>`<button type="button" class="befn-promotion-tab${filters.promotion===id?' selected':''}" data-result-promotion="${id}" aria-label="${label}" aria-pressed="${filters.promotion===id}">${domain?`<img src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(domain)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${label}</span>`:`<span>${label}</span>`}</button>`).join('')}</div>`}
 function render(opts={}){if((!data||Date.now()-lastPollAt>pollDelay())&&!pending)load();requestAnimationFrame(()=>{hydrateResultPhotos();const strip=document.getElementById("befn-promotion-strip");if(strip)strip.scrollLeft=0});if(opts.embedded===true)return `<div class="frame results-page befn-unified-results"><div id="results-content">${content()}</div></div>`;return `<div class="frame results-page">${promotionTabs()}<div class="section-heading"><div><h1>Results & highlights</h1></div></div><div class="results-toolbar"><button id="results-retry" type="button">↻ Refresh results</button><label class="results-search">Find a fight<input id="results-search" type="search" placeholder="Fighter, event or division" value="${esc(filters.query)}"></label><label class="results-check"><input id="results-clips" type="checkbox"${filters.clips?' checked':''}> Highlights available</label></div><p id="results-auto-sync" class="results-sync" role="status" aria-live="polite">Auto-refresh · checking…</p><div id="results-content">${content()}</div><details class="compact-note"><summary>Results and verification</summary><p>Results are sourced from published event listings. Weight classes and fighter records are checked against those sources; discrepancies are noted on individual bouts. Highlight videos may be region-restricted. This feed is not round-by-round scoring.</p></details></div>`}
 document.addEventListener('input',e=>{if(e.target.id==='results-search'){filters.query=e.target.value;update()}});
 document.addEventListener('change',e=>{if(e.target.id==='results-clips')filters.clips=e.target.checked;else return;update()});
 document.addEventListener('click',e=>{
  const promotion=e.target.closest('[data-result-promotion]');if(promotion){filters.promotion=promotion.dataset.resultPromotion;document.querySelectorAll('[data-result-promotion]').forEach(b=>{b.classList.toggle('selected',b.dataset.resultPromotion===filters.promotion);b.setAttribute('aria-pressed',String(b.dataset.resultPromotion===filters.promotion))});update();return;}
  if(e.target.closest('[data-results-older]')){weeksShown+=4;update();return;}
  const tab=e.target.closest('[data-result-event-tab]');
  if(tab){
   activeCardSection.set(tab.dataset.resultEventTab,tab.dataset.resultCardSection);
   update();
   return;
  }
  if(e.target.closest('#results-retry'))load();
  if(e.target.closest('#results-reset')){filters.query='';filters.clips=false;document.getElementById('main').innerHTML=render()}
 });
 // Tapping a result row anywhere opens or closes its fight snapshot (links and buttons keep their own action).
 document.addEventListener('click',e=>{
  const m=e.target.closest&&e.target.closest('#results-content [data-result-event] .result-bout-compact > .result-matchup');
  if(!m||e.target.closest('a,button,summary,input'))return;
  const d=m.parentElement.querySelector(':scope > details.befn-fight-snapshot');
  if(d)d.open=!d.open;
 });

 document.addEventListener('error',function(e){
 if(e.target.matches?.('.befn-result-thumb img')){
  const img=e.target,fallback=img.dataset.fallbackSrc;
  if(fallback&&!img.dataset.fallbackUsed){
   img.dataset.fallbackUsed='1';img.alt='Fighter portrait';img.src=fallback;return;
  }
  img.hidden=true;
  return;
 }
 if(e.target.matches?.('.befn-expanded-poster-image')){
  const figure=e.target.closest('.befn-result-poster');
  if(figure)figure.hidden=true;
  return;
 }
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
 const css=document.createElement('style');css.textContent=`.befn-promotion-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;max-width:420px;min-width:0;box-sizing:border-box;margin:0 0 18px;padding:4px 2px}.befn-promotion-strip[hidden]{display:none!important}.befn-promotion-tab{width:100%;min-width:0;min-height:64px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #aeb3b9;border-radius:12px;box-shadow:0 2px 3px #0002;padding:9px;color:#191d21;font-weight:900;font-size:13px;cursor:pointer;overflow:hidden}.befn-promotion-tab img{display:block;width:90px;height:42px;max-width:100%;object-fit:contain}.befn-promotion-tab.selected{background:#b70c26;border:3px solid #ef334f;color:#fff;box-shadow:0 0 0 2px #b70c26}.befn-promotion-tab:focus-visible{outline:3px solid #111;outline-offset:2px}@media(max-width:600px){.befn-promotion-strip{max-width:100%;gap:6px}.befn-promotion-tab{min-height:60px;padding:6px}.befn-promotion-tab img{width:82px;height:40px}.results-page{min-width:0;max-width:100%;overflow-x:clip}.befn-promotion-tab span:not([hidden]){font-size:12px;line-height:1.1;text-align:center}}`;document.head.appendChild(css);
 // Pure helpers, exposed for tests/test-results-layout.cjs.
 return {render,layout:{weekStart,weekLabel,weekRange,shortDay,posterArt}};
})();
