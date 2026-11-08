/* Event-level status, separate from the outcome of any individual bout. */
window.EventStatus=(()=>{
 const entries=[
  {id:'buatsi-hutchinson-2026-11-07',date:'2026-11-07',aliases:['buatsi','hutchinson'],status:'completed',source:'https://www.skysports.com/boxing/news/13609599/willy-hutchinson-crowned-as-new-wbc-light-heavyweight-champion-after-beating-joshua-buatsi-in-rematch'},
  {id:'zuffa-12-2026-11-07',date:'2026-11-07',aliases:['billam-smith','cheavon clarke','zuffa boxing 12'],status:'completed',source:'https://www.ufc.com/news/zuffa-boxing-12-results-scorecards-billam-smith-vs-clarke'},
  {id:'ufc-cortes-walker-2026-11-07',date:'2026-11-07',aliases:['cortes-acosta','cortes acosta','johnny walker','billy elekana','marcos degli','gabriella fernandes','nina milosevic'],status:'underway',verifiedAt:'2026-11-08T01:34:00Z',validUntil:'2026-11-08T03:34:00Z',source:'https://www.ufc.com/event/ufc-fight-night-november-07-2026'},
  {id:'ufc-nolan-moicano-2026-10-31',date:'2026-10-31',aliases:['moicano','nolan'],status:'completed',source:'https://www.ufc.com/news/ufc-fight-night-moicano-vs-nolan-results'}
 ];
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normal=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function dateOf(s){const m=String(s).match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(20\d{2}))?/i);if(!m)return '';return `${m[3]||'2026'}-${String(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase())+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`}
 function resolve(e,now=Date.now()){
  if(e?.status==='completed')return 'completed';
  if(e?.status==='underway'&&Date.parse(e.verifiedAt)<=now&&Date.parse(e.validUntil)>now)return 'underway';
  if(['cancelled','postponed'].includes(e?.status?.toLowerCase()))return e.status.toLowerCase();
  if(e?.status==='underway'||(e?.startAt&&Date.parse(e.startAt)<=now))return 'pending';
  if(e?.date&&Date.parse((e.endDate||e.date)+'T23:59:59-12:00')<now)return 'pending';
  return e?.date?'scheduled':'unknown';
 }
 function badge(e){const s=resolve(e),labels={underway:'Currently underway',completed:'Completed',scheduled:'Scheduled',pending:'Awaiting status update',unknown:'Status unconfirmed',cancelled:'Cancelled',postponed:'Postponed'};const icon={underway:'●',completed:'✓',scheduled:'◷',pending:'◷',unknown:'?',cancelled:'×',postponed:'↻'};return `<span class="event-status event-status-${s}"><span aria-hidden="true">${icon[s]}</span> ${labels[s]}</span>`}
 function event(id){const e=entries.find(x=>x.id===id);return `<span data-event-status="${esc(id)}">${badge(e)}</span>`}
 function row(row){const day=dateOf(row[0]),text=normal(row.join(' '));const e=entries.find(x=>x.date===day&&x.aliases.some(a=>text.includes(a)));return e?event(e.id):badge({date:day})}
 function legend(){return `<div class="event-status-legend">${badge({status:'underway',verifiedAt:new Date(0).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()})}${badge({status:'completed'})}${badge({date:'2099-01-01'})}<small>Event status · live labels expire without a fresh check. Completed requires a confirmed result, not just a past date.</small></div>`}
 function refresh(){document.querySelectorAll('[data-event-status]').forEach(el=>{const html=badge(entries.find(x=>x.id===el.dataset.eventStatus));if(el.innerHTML!==html)el.innerHTML=html})}
 setInterval(refresh,60000);
 function setEvents(events){for(const e of events){const old=entries.find(x=>x.id===e.id);if(old)Object.assign(old,e);else entries.push({...e,aliases:[e.name||e.id]})}refresh()}
 return {event,row,badge,legend,resolve,dateOf,entries,setEvents};
})();
