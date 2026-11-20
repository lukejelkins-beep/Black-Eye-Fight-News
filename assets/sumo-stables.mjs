/* BEFN Sumo stables — current JSA heya directory + BEFN's tracked banzuke cohort.
 * The 45-name directory follows the official JSA stable guide, verified 2026-11-20.
 * Membership/counts come from the existing tracked Makuuchi/Juryo/Makushita snapshot,
 * NOT the complete lower-division roster. Never claim a stable has no wrestlers.
 */
const OFFICIAL_STABLES = [
 'Asakayama','Asahiyama','Ajigawa','Arashio','Ikazuchi','Isegahama','Isenoumi',
 'Oitekaze','Onomatsu','Oshima','Otake','Oshiogawa','Otowayama','Onoe','Kasugano',
 'Kataonami','Kise','Kokonoe','Sakaigawa','Sadogatake','Shikihide','Shikoroyama',
 'Shibatayama','Takasago','Takadagawa','Takekuma','Tagonoura','Tatsunami',
 'Tamanoi','Dewanoumi','Tokitsukaze','Nakamura','Naruto','Nishiiwa','Nishikido',
 'Nishonoseki','Hakkaku','Hanaregoma','Hidenoyama','Fujishima','Futagoyama',
 'Minato','Minatogawa','Musashigawa','Yamahibiki'
];
const JSA = 'https://www.sumo.or.jp/EnSumoDataSumoBeya/wrap';
const root = document.getElementById('sumo-main');
const state = { roster: [], photos: {}, details: null, stables: [], query: '', filter: 'all', sort: 'alpha' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const division = rank => /^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira)\b/i.test(rank) ? 'Makuuchi' : /^Juryo\b/i.test(rank) ? 'Juryo' : /^Makushita\b/i.test(rank) ? 'Makushita' : 'Other';
const slug = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const counts = (members) => ({
  Makuuchi: members.filter(w => division(w.currentRank) === 'Makuuchi').length,
  Juryo: members.filter(w => division(w.currentRank) === 'Juryo').length,
  Makushita: members.filter(w => division(w.currentRank) === 'Makushita').length
});
function ranking(w) {
  const r=String(w.currentRank||'');
  const group=/^Yokozuna\b/i.test(r)?0:/^Ozeki\b/i.test(r)?1:/^Sekiwake\b/i.test(r)?2:/^Komusubi\b/i.test(r)?3:/^Maegashira\b/i.test(r)?4:/^Juryo\b/i.test(r)?5:6;
  const n=Number(r.match(/\b(\d+)\b/)?.[1]||1);
  return group*1000+n*2+(/\bWest\b/i.test(r)?1:0);
}
const photoFor = w => {
  const p = w && state.photos[String(w.sourceId)];
  return p?.approved === true && typeof p.license === 'string' && p.license.trim() &&
    typeof p.credit === 'string' && p.credit.trim() &&
    /^assets\/sumo-photos\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg)$/.test(String(p.path||''))
    ? p.path : null;
};
function photoMarkup(w,small=false) {
  const path=photoFor(w);
  return path ? '<img src="'+escapeHtml(path)+'" alt="'+escapeHtml(w.shikonaEn)+'" loading="lazy" decoding="async">'
    : small ? '<span aria-label="No licensed photograph available">相</span>'
    : '<span class="heya-image-fallback" aria-label="No licensed photograph available">相</span>';
}
function prepareStables() {
  const byStable=new Map(OFFICIAL_STABLES.map(name=>[name,[]]));
  for (const w of state.roster) if (byStable.has(w.heya)) byStable.get(w.heya).push(w);
  state.stables=OFFICIAL_STABLES.map(name=>{
    const members=byStable.get(name).sort((a,b)=>ranking(a)-ranking(b)||String(a.shikonaEn).localeCompare(String(b.shikonaEn)));
    return {name,slug:slug(name),members,byDivision:counts(members),leader:members[0]||null,
      imageMember:members.find(w=>photoFor(w))||null};
  });
}
function renderCard(stable){
  const {name,members,byDivision,leader,imageMember}=stable;
  const featured=leader?leader.shikonaEn+' · '+leader.currentRank:'No tracked top-three-division rikishi';
  const total=members.length;
  return '<a class="heya-card" href="#stable/'+escapeHtml(stable.slug)+'" aria-label="View '+escapeHtml(name)+' stable">'+
   '<div class="heya-card-visual">'+photoMarkup(imageMember)+
   (imageMember?'<small>'+escapeHtml(imageMember.shikonaEn)+'</small>':'')+'</div>'+
   '<div class="heya-card-body"><h2>'+escapeHtml(name)+'<span>↗</span></h2>'+
   '<p class="heya-card-lead">'+escapeHtml(featured)+'</p>'+
   '<div class="heya-card-counts">'+
     '<span><strong>'+byDivision.Makuuchi+'</strong>Makuuchi</span>'+
     '<span><strong>'+byDivision.Juryo+'</strong>Jūryō</span>'+
     '<span><strong>'+byDivision.Makushita+'</strong>Makushita</span></div>'+
   '<div class="heya-card-foot"><span>'+total+' tracked '+(total===1?'rikishi':'rikishi')+'</span><span>View stable →</span></div></div></a>';
}
function filteredStables() {
  const q=state.query.trim().toLocaleLowerCase();
  let list=state.stables.filter(s=>(!q || s.name.toLocaleLowerCase().includes(q) ||
    s.members.some(w=>String(w.shikonaEn).toLocaleLowerCase().includes(q))) &&
    (state.filter==='all' ||
      (state.filter==='none' ? !s.members.length : s.byDivision[state.filter] > 0)));
  if(state.sort==='tracked') list.sort((a,b)=>b.members.length-a.members.length||a.name.localeCompare(b.name));
  else if(state.sort==='ranking') list.sort((a,b)=>(a.leader?ranking(a.leader):99999)-(b.leader?ranking(b.leader):99999)||a.name.localeCompare(b.name));
  else list.sort((a,b)=>a.name.localeCompare(b.name));
  return list;
}
function refreshResults() {
  const wrap=document.getElementById('heya-results');
  if(!wrap) return;
  const list=filteredStables();
  wrap.innerHTML='<p class="heya-countline"><span>Showing '+list.length+' of '+state.stables.length+' official stables</span><span>Tracked: Makuuchi · Jūryō · Makushita</span></p>'+
    (list.length?'<div class="heya-grid">'+list.map(renderCard).join('')+'</div>':
    '<div class="heya-empty">No stables match. Try another search or division.</div>');
  document.querySelectorAll('[data-heya-filter]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.heyaFilter===state.filter)));
}
function disclaimer(){
 return '<aside class="heya-disclaimer"><strong>Coverage note:</strong> The stable names come from the '+
 '<a href="'+JSA+'" target="_blank" rel="noopener noreferrer">official Japan Sumo Association directory</a>. '+
 'BEFN membership and totals show only the '+state.roster.length+' wrestlers tracked in the current Makuuchi, Jūryō and Makushita snapshot, not every wrestler in each stable. '+
 'A count of zero does not mean the stable is empty. Current ranks and affiliations are based on the cached Sumo API snapshot.</aside>';
}
function renderDirectory(){
 const represented=state.stables.filter(s=>s.members.length).length;
 root.innerHTML='<div class="sumo-stables"><header class="heya-top"><div><div class="heya-kicker">THE WORLD OF SUMO · HEYA</div>'+
  '<h1>Sumo stables</h1><p>Explore the training houses behind the rikishi. Find a stable, discover its highest-ranked wrestlers and open individual profiles.</p></div>'+
  '<a class="heya-source" href="'+JSA+'" target="_blank" rel="noopener noreferrer">Official JSA directory ↗</a></header>'+
  '<section class="heya-intro" aria-label="Directory statistics">'+
   '<div class="heya-stat"><strong>'+state.stables.length+'</strong><span>Official stables</span></div>'+
   '<div class="heya-stat"><strong>'+state.roster.length+'</strong><span>Tracked rikishi</span></div>'+
   '<div class="heya-stat"><strong>'+represented+'</strong><span>Stables represented</span></div></section>'+
  '<div class="heya-toolbar"><label class="heya-field heya-search"><span>Find a stable or rikishi</span>'+
   '<input id="heya-query" type="search" placeholder="Search e.g. Nishonoseki or Onosato" autocomplete="off" value="'+escapeHtml(state.query)+'"></label>'+
   '<label class="heya-field heya-sort"><span>Sort by</span><select id="heya-sort">'+
    '<option value="alpha"'+(state.sort==='alpha'?' selected':'')+'>Stable name A–Z</option>'+
    '<option value="tracked"'+(state.sort==='tracked'?' selected':'')+'>Most tracked wrestlers</option>'+
    '<option value="ranking"'+(state.sort==='ranking'?' selected':'')+'>Highest ranked wrestler</option></select></label></div>'+
  '<div class="heya-filterbar" role="group" aria-label="Filter by division">'+
   [['all','All stables'],['Makuuchi','Makuuchi'],['Juryo','Jūryō'],['Makushita','Makushita'],['none','No tracked rikishi']]
     .map(([v,l])=>'<button type="button" data-heya-filter="'+v+'" aria-pressed="'+(state.filter===v)+'">'+l+'</button>').join('')+
  '</div><section id="heya-results" aria-label="Sumo stable cards"></section>'+disclaimer()+'</div>';
 document.getElementById('heya-query').addEventListener('input',e=>{state.query=e.target.value;refreshResults();});
 document.getElementById('heya-sort').addEventListener('change',e=>{state.sort=e.target.value;refreshResults();});
 root.querySelectorAll('[data-heya-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.heyaFilter;refreshResults();}));
 refreshResults();
}
function recordFor(w){
 const divisions=state.details?.banzuke||{};
 const d=division(w.currentRank);
 const data=divisions[d]?.data;
 const entry=[...(data?.east||[]),...(data?.west||[])].find(r=>Number(r.rikishiID)===Number(w.sourceId));
 if(!entry?.record) return '';
 let wins=0,losses=0;
 for(const bout of entry.record){if(bout.result==='win')wins++;if(bout.result==='loss')losses++;}
 return 'Current basho: '+wins+'–'+losses;
}
function memberCard(w){
 const r=recordFor(w);
 return '<a class="heya-member" href="sumo.html#profile/'+encodeURIComponent(w.sourceId)+'">'+
  '<div class="heya-member-pic">'+photoMarkup(w,true)+'</div>'+
  '<div><strong class="heya-member-name">'+escapeHtml(w.shikonaEn)+'</strong>'+
  (w.shikonaJp?'<span class="heya-member-jp">'+escapeHtml(w.shikonaJp)+'</span>':'')+
  '<span class="heya-member-rank">'+escapeHtml(w.currentRank||'Rank unavailable')+'</span>'+
  (r?'<span class="heya-member-record">'+escapeHtml(r)+'</span>':'')+'</div></a>';
}
function renderStable(stable){
 const count=stable.byDivision,hero=stable.imageMember;
 root.innerHTML='<div class="sumo-stables"><a class="heya-back" href="sumo-stables.html">← All stables</a>'+
  '<section class="heya-hero"><div class="heya-hero-content"><div class="heya-hero-kicker">SUMO STABLE · HEYA</div>'+
  '<h1>'+escapeHtml(stable.name)+'</h1><p>'+(stable.leader?'Top-ranked tracked rikishi: '+escapeHtml(stable.leader.shikonaEn)+' · '+escapeHtml(stable.leader.currentRank):
   'No wrestlers currently represented in the BEFN top-three-division roster')+'</p></div>'+
  '<div class="heya-hero-fig">'+photoMarkup(hero,true)+'</div></section>'+
  '<div class="heya-detail-stats">'+
  '<div><strong>'+stable.members.length+'</strong><span>Tracked rikishi</span></div>'+
  '<div><strong>'+count.Makuuchi+'</strong><span>Makuuchi</span></div>'+
  '<div><strong>'+count.Juryo+'</strong><span>Jūryō</span></div>'+
  '<div><strong>'+count.Makushita+'</strong><span>Makushita</span></div></div>'+
  (stable.members.length ? ['Makuuchi','Juryo','Makushita'].map(d=>{
    const list=stable.members.filter(w=>division(w.currentRank)===d);
    if(!list.length) return '';
    return '<section class="heya-section"><header class="heya-section-head"><h2>'+escapeHtml(d==='Juryo'?'Jūryō':d)+'</h2>'+
     '<span>'+list.length+' tracked</span></header><div class="heya-members">'+list.map(memberCard).join('')+'</div></section>';
   }).join('') : '<div class="heya-no-tracked">This stable appears in the official JSA directory, but none of its wrestlers are in BEFN’s tracked Makuuchi, Jūryō or Makushita snapshot. The stable can still have active wrestlers in other divisions.</div>')+
  disclaimer()+'</div>';
}
function navigate(){
 const route=decodeURIComponent(location.hash.replace(/^#/,''));
 if(route.startsWith('stable/')){
   const stable=state.stables.find(x=>x.slug===route.slice(7));
   if(stable){renderStable(stable);return;}
   root.innerHTML='<div class="heya-empty"><h1>Stable not found</h1><p><a href="sumo-stables.html">Return to the stables directory</a></p></div>';
   return;
 }
 renderDirectory();
}
async function loadJson(path){
 const response=await fetch(path,{cache:'no-cache'});
 if(!response.ok) throw new Error('Could not load '+path);
 return response.json();
}
async function start(){
 try{
  const [roster,photos,details]=await Promise.all([
   loadJson('data/sumo/rikishi-index.json'),
   loadJson('data/sumo/approved-photos.json'),
   loadJson('data/sumo/preview-details.json').catch(()=>null)
  ]);
  if(!Array.isArray(roster?.rikishi)) throw new Error('Tracked roster is not available');
  state.roster=roster.rikishi;
  state.photos=photos?.bySourceId||{};
  state.details=details;
  prepareStables();
  if(OFFICIAL_STABLES.length!==45) throw new Error('Expected 45 official stables');
  window.addEventListener('hashchange',()=>{navigate();window.scrollTo({top:0,behavior:'instant'});});
  navigate();
 }catch(err){
  root.innerHTML='<div class="sumo-stables"><h1>Stables temporarily unavailable</h1><p>Could not load the source snapshot. No membership counts are shown until the data is available.</p><p><a href="sumo.html">Return to Sumo</a></p></div>';
  console.error('BEFN stables:',err);
 }
}
start();
