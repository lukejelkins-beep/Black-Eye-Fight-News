import {
  SOURCE_URL, JSA_URL, DIVISIONS, bashoLabel, divisionOf, recordSummary,
  rankTable, leadingRikishi, currentDay, dailyResults, validMatchSamples, currentBashoMatchSample,
  techniqueDistribution, detailFor, banzukeFor, searchRikishi, snapshotDate,
  originCountry, banzukeMovement, dayMatchups, verifiedHeadToHead, verifiedHighestRank,
  rankPositions
} from './sumo-data.mjs';

const ROOT = document.querySelector('#sumo-main');
const tabs = [...document.querySelectorAll('[data-page]')];
const DIVS = ['Makuuchi','Juryo','Makushita'];
const STATE = {
  roster: null, details: null, officialStyles: null, photoIndex: null, error: null, query: '', division: 'All',
  visible: 24, bashoDivision: 'Makuuchi', banzukeDivision: 'Makuuchi',
  day: null, profileLimit: 5
};
const TERMS = [
  {term:'Yorikiri',label:'Frontal force-out',detail:'The wrestler drives the opponent out while holding the mawashi (belt).'},
  {term:'Oshidashi',label:'Frontal push-out',detail:'The opponent is pushed out of the ring without a firm belt grip.'},
  {term:'Hatakikomi',label:'Slap-down',detail:'A downward slap to the shoulder, neck or back causes the opponent to fall.'},
  {term:'Uwatenage',label:'Overarm throw',detail:'A throw using an overarm grip on the opponent’s mawashi.'},
  {term:'Shitatenage',label:'Underarm throw',detail:'A throw using a grip taken underneath the opponent’s arm.'},
  {term:'Tsukiotoshi',label:'Thrust-down',detail:'The wrestler thrusts the opponent downward and off balance.'},
  {term:'Sukuinage',label:'Beltless arm throw',detail:'An arm-led scoop throw carried out without gripping the mawashi.'},
  {term:'Oshitaoshi',label:'Frontal push-down',detail:'A forward push makes the opponent fall inside or outside the ring.'},
  {term:'Yoritaoshi',label:'Frontal crush-out',detail:'A forward driving attack forces the opponent to fall backward.'}
];

const e = (v) => String(v ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const number = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-AU') : '—';
const kebab = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9-]/g,'');
const cap = (v) => String(v ?? '').replace(/^./, x => x.toUpperCase());
const loc = (v) => v ? e(v) : 'Not available';
const dateOnly = (v) => {
  if (!v || !Number.isFinite(new Date(v).getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-AU', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(v));
};
function heading(label,title,more='') {
  return '<header class="section-head"><div><div class="eyebrow">'+e(label)+'</div><h2>'+e(title)+'</h2></div>'+more+'</header>';
}
function note(text) { return '<p class="notice">'+e(text)+'</p>'; }
function richText(text) { return e(text).replace(/\n/g, '<br>'); }
function imageToken(rank, name, large=false) {
  return '<div class="profile-icon'+(large?' large':'')+'" role="img" aria-label="Illustrated silhouette placeholder; licensed wrestler photograph not available"><span aria-hidden="true">相</span></div>';
}

function flagMark(w) {
  const c=originCountry(w?.birthplace);
  return c?'<span class="sumo-country" title="Birthplace country: '+e(c.name)+'" aria-label="Birthplace country: '+e(c.name)+'"><span class="sumo-country-emoji" aria-hidden="true">'+c.flag+'</span><span class="sumo-country-name">'+e(c.name)+'</span></span>'
    :'<span class="sumo-country unknown" title="Birthplace country not supplied">🌐 <span class="sumo-country-name">Unspecified origin</span></span>';
}
function portraitFor(w,size='sm'){
  const photo=w && STATE.photoIndex?.[String(w.sourceId)];
  const valid=photo?.approved===true &&
    /^assets\/sumo-photos\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg)$/.test(String(photo.path||'')) &&
    typeof photo.license==='string' && photo.license.trim() &&
    typeof photo.credit==='string' && photo.credit.trim();
  const root='class="profile-icon sumo-photo '+e(size)+(valid?' has-photo':'')+'"';
  const name=w?.shikonaEn||'Unknown rikishi';
  return '<div '+root+' role="img" aria-label="'+e(valid?'Photograph of '+name:'Illustrated portrait placeholder for '+name)+'">'+
    (valid?'<img src="'+e(photo.path)+'" alt="" loading="lazy" decoding="async">':'')+
    '<span aria-hidden="true">相</span></div>';
}
function knownHigh(w){
  const full=details()?.featuredExtras?.find(x=>Number(x.id)===Number(w?.sourceId))?.rikishi;
  const candidate=full?.status==='available'?verifiedHighestRank(full.data):null;
  const curated=details()?.careerHighs?.[String(w?.sourceId)];
  return typeof curated==='string'&&curated.trim() ?curated:candidate;
}
function weightHeight(w) {
  const h=Number.isFinite(Number(w?.heightCm))&&Number(w.heightCm)>0?Math.round(Number(w.heightCm))+' cm':'—';
  const mass=Number.isFinite(Number(w?.weightKg))&&Number(w.weightKg)>0?Math.round(Number(w.weightKg))+' kg':'—';
  return {h,mass};
}
function previousBanzukeData() {
  const out={};
  for(const d of DIVS) {
    const rec=details()?.previousBanzuke?.[d];
    if(rec?.status==='available'&&rec.data?.east&&rec.data?.west) out[d]=rec.data;
  }
  return out;
}
function currentBanzukeData(){
  return Object.fromEntries(DIVS.map(d=>[d,getBanzuke(d)]));
}
let movementCache=new Map();
function movementFor(w) {
  const id=Number(w?.sourceId);
  if(!Number.isSafeInteger(id))return {status:'unavailable',label:'No prior rank'};
  if(!movementCache.has(id)) movementCache.set(id,banzukeMovement(id,currentBanzukeData(),previousBanzukeData()));
  return movementCache.get(id);
}
function movementMarkup(w) {
  const m=movementFor(w);
  const clazz=['up','down','same','new'].includes(m.status)?m.status:'unavailable';
  const symbol=m.status==='up'?'↑':m.status==='down'?'↓':m.status==='same'?'↔':m.status==='new'?'✦':'—';
  const detail=m.previousRank?(' · previous: '+m.previousRank):'';
  return '<span class="sumo-move '+clazz+'" title="'+e(m.label+detail)+'"><span aria-hidden="true">'+symbol+'</span> '+e(m.status==='up'||m.status==='down'?m.places+' places':m.status==='new'?'NEW':m.status==='same'?'0':'—')+'</span>';
}
function headToHeadFor(a,b) {
  const extras=details()?.featuredExtras||[];
  for(const x of extras){
    const id=Number(x.id), other=Number(x.headToHead?.opponentId), source=x.headToHead?.record;
    if(source?.status!=='available' || !source.data)continue;
    if(id===Number(a)&&other===Number(b)){
      const trusted={...source.data,rikishiId:id,opponentId:other};
      return verifiedHeadToHead(trusted,id,other);
    }
    if(id===Number(b)&&other===Number(a)){
      const trusted={...source.data,rikishiId:id,opponentId:other};
      const inverted=verifiedHeadToHead(trusted,id,other);
      return inverted?{wins:inverted.losses,losses:inverted.wins,total:inverted.total,source:inverted.source}:null;
    }
  }
  return null;
}
function bioLine(w){
  if(!w)return '<span class="sumo-bio-line">Stats not available</span>';
  const measurements=weightHeight(w);
  return '<span class="sumo-bio-line"><b>'+e(w.currentRank||'Unranked')+'</b></span>'+
    '<span class="sumo-bio-line">Peak: '+e(knownHigh(w)||'not yet verified')+'</span>'+
    '<span class="sumo-bio-line">'+e(measurements.h)+' · '+e(measurements.mass)+'</span>';
}
function fighterOnCard(w,id,label) {
  const name=w?.shikonaEn||label||'Opponent';
  const link=w?'<a href="#profile/'+Number(w.sourceId)+'">'+e(name)+'</a>':'<span>'+e(name)+'</span>';
  return '<div class="sumo-match-person">'+portraitFor(w,'md')+
    '<div class="sumo-match-identity"><div class="sumo-match-name">'+flagMark(w)+link+'</div>'+bioLine(w)+'</div></div>';
}
function matchupCard(match) {
  const a=wrestler(match.rikishiId),b=wrestler(match.opponentId);
  const h2h=headToHeadFor(match.rikishiId,match.opponentId);
  const isFinished=match.finished===true;
  const outcome=isFinished?'<span class="sumo-match-status completed">RESULT</span>':'<span class="sumo-match-status scheduled">RESULT PENDING</span>';
  const winner=isFinished?(match.winnerId===match.rikishiId?(a?.shikonaEn||match.rikishi):(b?.shikonaEn||match.opponent)):'';
  return '<article class="sumo-match-card"><div class="sumo-match-top"><strong>DAY '+e(match.day||'—')+'</strong>'+outcome+'</div>'+
    '<div class="sumo-match-people">'+fighterOnCard(a,match.rikishiId,match.rikishi)+
    '<div class="sumo-versus">VS</div>'+
    fighterOnCard(b,match.opponentId,match.opponent)+'</div>'+
    '<div class="sumo-match-footer"><span class="sumo-h2h">ALL-TIME H2H: <strong>'+e(h2h?h2h.wins+'–'+h2h.losses:'not yet sourced')+'</strong></span>'+
    '<span>'+e(isFinished?'Winner: '+winner+' · '+(match.kimarite||'Technique unavailable'):'Pairing listed in API · awaiting official result')+'</span></div></article>';
}
function opponentBoutCard(w,rec,i,div){
  const status=String(rec?.result||'').toLowerCase();
  const day=div==='Makushita'?'DAY '+(i+1):'DAY '+(i+1);
  const id=Number(rec?.opponentID);
  const other=wrestler(id);
  const name=rec?.opponentShikonaEn||other?.shikonaEn||'Opponent not supplied';
  const h2h=headToHeadFor(Number(w.sourceId),id);
  const result=status==='win'?'WIN':status==='loss'?'LOSS':'PENDING';
  const clazz=status==='win'?'win':status==='loss'?'loss':'pending';
  return '<article class="sumo-result-card"><div class="sumo-result-top"><span>'+e(day)+'</span><span class="outcome '+clazz+'">'+result+'</span></div>'+
    fighterOnCard(other,id,name)+
    '<div class="sumo-result-extra"><span>H2H '+e(h2h?h2h.wins+'–'+h2h.losses:'not yet sourced')+'</span><span>'+e(rec?.kimarite||'No kimarite recorded')+'</span></div></article>';
}

function ranks() {
  return STATE.roster?.rikishi || [];
}
function details() { return STATE.details || {}; }
function getBanzuke(div) {
  const item=details().banzuke?.[div];
  return item?.status === 'available' && item?.data ? item.data : null;
}
function counts() {
  return STATE.roster?.divisionCounts || Object.fromEntries(DIVS.map(d=>[d,ranks().filter(x=>divisionOf(x.currentRank)===d).length]));
}
function wrestler(id) {return ranks().find(r=>r.sourceId===Number(id));}
function entryFor(w) { const b=getBanzuke(divisionOf(w?.currentRank));return b ? banzukeFor(b,w.sourceId):null; }
function sourceFooter() {
  return '<p class="footnote">Data snapshot: <strong>'+e(snapshotDate(STATE.roster?.collectedAt))+'</strong> · Third-party API records (not certified by the JSA). Source: <a target="_blank" rel="noopener noreferrer" href="'+SOURCE_URL+'">Sumo API</a> · Cross-check: <a target="_blank" rel="noopener noreferrer" href="'+JSA_URL+'">Japan Sumo Association</a>.</p>';
}
function statBlock(value,label) {
  return '<div class="stat"><div class="value">'+e(value)+'</div><div class="label">'+e(label)+'</div></div>';
}
function statTile(value,label) {
  return '<div class="tile"><strong>'+e(value)+'</strong><span>'+e(label)+'</span></div>';
}
function recordLabels(s) {
  return '<span class="number-win">'+s.win+' W</span> · <span class="number-loss">'+s.loss+' L</span>'+(s.absence?' · <span class="number-abs">'+s.absence+' A</span>':'');
}
function wrestlerLink(row,small=false) {
  return '<a href="#profile/'+Number(row.sourceId||row.rikishiID)+'">'+e(row.shikonaEn || 'Name unavailable')+(small?' ↗':'')+'</a>';
}
function divisionTabs(active, attr, all=false) {
  return '<div class="division-tabs" role="group" aria-label="Choose division">' +
    (all?'<button type="button" class="pill '+(active==='All'?'active':'')+'" '+attr+'="All">All 3 divisions</button>':'') +
    DIVS.map(d=>'<button type="button" class="pill '+(active===d?'active':'')+'" '+attr+'="'+d+'">'+e(d)+(all?'<span class="count">'+(counts()[d]||0)+'</span>':'')+'</button>').join('') +
    '</div>';
}
function standingsTable(rows, limit=10) {
  if (!rows?.length) return '<p class="missing">No independently checked current rankings are cached.</p>';
  return '<div class="table-scroll"><table class="standings"><thead><tr><th>Rikishi</th><th>Rank</th><th>W</th><th>L</th><th>A</th></tr></thead><tbody>' +
    rows.slice(0,limit).map(x=>'<tr><td>'+wrestlerLink(x)+'</td><td>'+e(x.rank||'—')+'</td><td class="number-win">'+x.summary.win+'</td><td class="number-loss">'+x.summary.loss+'</td><td class="number-abs">'+(x.summary.absence===null?'—':x.summary.absence)+'</td></tr>').join('') +
    '</tbody></table></div>';
}
function featureCard(w) {
  const ent=entryFor(w),s=recordSummary(ent?.record, divisionOf(w.currentRank));
  return '<a href="#profile/'+w.sourceId+'" class="feature-card"><div class="feature-top">'+
    portraitFor(w,'md')+
    '<div class="feature-info"><span class="rank">'+e(w.currentRank)+'</span><h3>'+flagMark(w)+' '+e(w.shikonaEn)+'</h3>'+
    '<small>'+e(w.heya||'Stable not supplied')+'</small></div></div>'+
    '<div class="feature-bottom"><span>'+e(divisionOf(w.currentRank))+'</span><span>'+
    (ent?e(s.win+'-'+s.loss):'RECORD NOT CACHED')+'</span></div></a>';
}
function previewHead() {
  const n=counts();
  return '<section class="hero"><div class="hero-left"><div class="hero-kicker">THE SPORT OF SUMO · BEFN SPECIALIST COVERAGE</div>' +
  '<h1>THE <em>SUMO</em><br>DIVISION</h1><p>Profiles, rankings, technique breakdowns and tournament results for the top three professional divisions of Japan’s Grand Sumo circuit.</p>' +
  '<div class="hero-foot"><a class="btn" href="#rikishi">EXPLORE '+number(STATE.roster?.count)+' RIKISHI</a><a class="btn secondary" href="#basho">CURRENT BASHO</a></div></div>' +
  '<div class="hero-side"><div class="ring-art" role="img" aria-label="Stylised sumo ring with a kanji emblem"><span>相</span></div></div></section>' +
  '<div class="stats">'+statBlock(n.Makuuchi,'Makuuchi · highest division')+statBlock(n.Juryo,'Jūryō · second division')+
  statBlock(n.Makushita,'Makushita · third division')+statBlock(number(STATE.roster?.count),'Total actively tracked')+'</div>';
}
function renderHome() {
  const featuredNames=['Onosato','Wakatakakage','Nishikigi'];
  const picks=featuredNames.map(name=>ranks().find(r=>r.shikonaEn===name)).filter(Boolean);
  const maku=getBanzuke('Makuuchi');
  const leaders=maku?leadingRikishi(maku,7):[];
  return previewHead() +
    heading('Featured · Three divisions','Rikishi in focus','<a href="#rikishi">Browse all rikishi →</a>')+
    '<div class="feature-grid">'+picks.map(featureCard).join('')+'</div>' +
    heading('November 2026 tournament','Basho Centre','<a href="#basho">Full basho results →</a>') +
    '<div class="columns"><section class="panel"><div class="panel-head"><h3>'+e(bashoLabel(details().bashoId))+' · Makuuchi</h3><span>SNAPSHOT · NOT LIVE</span></div>' +
      '<div class="panel-body">'+standingsTable(leaders)+'</div></section>' +
    '<section class="panel"><div class="panel-head"><h3>Three-division coverage</h3><span>CURRENT ROSTER</span></div>' +
    '<div class="panel-body"><p>Unlike boxing and MMA, Sumo uses tournament-by-tournament ranking tables. BEFN follows the current banzuke rather than retaining an arbitrary fixed list.</p>' +
    '<p>All <b>'+counts().Makuuchi+' Makuuchi</b>, <b>'+counts().Juryo+' Jūryō</b> and <b>'+counts().Makushita+' Makushita</b> places are covered in this source snapshot. Lower-division wrestlers normally compete in seven bouts per 15-day basho.</p>' +
    '<a class="btn light" href="#banzuke">VIEW FULL BANZUKE</a></div></section></div>' +
    heading('Explore the roster','All ranked rikishi','<a href="#rikishi">Search 190 profiles →</a>')+
    '<div class="directory-grid">'+ranks().slice(0,8).map(directoryCard).join('')+'</div>'+
    sourceFooter();
}
function directoryCard(w) {
  return '<a class="directory-card" href="#profile/'+w.sourceId+'"><div class="directory-upper">'+
    portraitFor(w,'md')+'<div><small>'+e(divisionOf(w.currentRank))+'</small>'+
    '<h3>'+flagMark(w)+' '+e(w.shikonaEn)+'</h3>'+
    '<small>'+e(w.shikonaJp||'')+'</small></div></div>'+
    '<div class="directory-lower"><div class="rank">'+e(w.currentRank||'Rank not supplied')+'</div>'+
    '<div class="detail">'+e(w.heya||'Stable not supplied')+'</div>'+
    bioLine(w)+'<div class="sumo-directory-move">'+movementMarkup(w)+'</div>'+
    '<span class="cta">VIEW RIKISHI PROFILE →</span></div></a>';
}
function directoryMatches() {
  const found=searchRikishi(ranks(),{query:STATE.query,division:STATE.division});
  // Preserve upstream order (source identity) unless rank rankValue exists in full banzuke.
  const indexed=new Map();
  for(const d of DIVS) for(const [i,row] of (getBanzuke(d)?rankTable(getBanzuke(d)):[]).entries()) indexed.set(Number(row.rikishiID), DIVS.indexOf(d)*1000+i);
  found.sort((a,b)=>(indexed.get(a.sourceId)??9999)-(indexed.get(b.sourceId)??9999)||a.shikonaEn.localeCompare(b.shikonaEn));
  return found;
}
function directoryResults() {
  const found=directoryMatches(), selected=found.slice(0,STATE.visible);
  return '<p class="directory-count">'+found.length+' matching current wrestler'+(found.length===1?'':'s')+' · '+selected.length+' shown</p>' +
    (selected.length?'<div class="directory-grid">'+selected.map(directoryCard).join('')+'</div>':note('No matching rikishi in the three tracked divisions.')) +
    (found.length>STATE.visible?'<div class="more-wrap"><button type="button" class="btn light" data-more-rikishi>SHOW MORE ('+(found.length-STATE.visible)+' REMAIN)</button></div>':'');
}
function renderDirectory() {
  return heading('Banzuke-based eligibility','Rikishi directory') +
    '<p class="section-intro">Every currently ranked athlete in Makuuchi, Jūryō and Makushita is included. Use the filters to search by ring name, Japanese name, stable or birthplace. This is a current-rank snapshot; rankings change after each tournament.</p>'+
    '<div class="filters"><input id="sumo-search" class="search" type="search" aria-label="Search wrestlers" placeholder="Search wrestler, stable or location…" value="'+e(STATE.query)+'" autocomplete="off"></div>'+
    '<div id="directory-filters">'+divisionTabs(STATE.division,'data-directory-division',true)+'</div>'+
    '<div id="directory-results">'+directoryResults()+'</div>'+sourceFooter();
}
function detailStats(w) {
  const enriched=detailFor(details(),w.sourceId);
  return enriched?.stats?.status==='available'?enriched.stats.data:null;
}
function formatStats(w,cur) {
  const s=detailStats(w), total=s?.totalMatches, wins=s?.totalWins, losses=s?.totalLosses;
  // Do not imply totalMatches includes absences: keep record fields separate.
  return '<div class="tiles">'+
    statTile(w.currentRank||'—','Current banzuke rank')+
    statTile(cur?cur.win+'-'+cur.loss+(cur.absence===null?'':'-'+cur.absence):'—',divisionOf(w.currentRank)==='Makushita'?'Current basho W–L':'Current basho W–L–A')+
    statTile(Number.isInteger(wins)&&Number.isInteger(losses)?wins+'-'+losses:'—','Recorded career W–L · source sample')+
    statTile(s?.winsByDivision?.Makuuchi!==undefined && s?.lossByDivision?.Makuuchi!==undefined ?
       s.winsByDivision.Makuuchi+'-'+s.lossByDivision.Makuuchi:'—','Makuuchi W–L · source sample')+
    statTile(s?.yushoByDivision?.Makuuchi ?? '—','Makuuchi championships')+
    statTile(s?.basho ?? '—','Recorded basho · API stats')+
  '</div>';
}
function recordChart(item) {
  if(!item) return '<p class="missing">Current tournament record is not available for this rikishi.</p>';
  const w=wrestler(item.rikishiID),div=divisionOf(item.rank),s=recordSummary(item.record,div);
  const rows=(item.record||[]).map((rec,i)=>({rec,i})).filter(({rec})=>
    Number(rec?.opponentID)>0 && (rec?.opponentShikonaEn || wrestler(rec?.opponentID))
  );
  const completed=rows.filter(({rec})=>['win','loss'].includes(String(rec?.result||'').toLowerCase())).length;
  return (rows.length?'<div class="sumo-result-grid">'+rows.map(({rec,i})=>opponentBoutCard(w||{sourceId:item.rikishiID},rec,i,div)).join('')+'</div>'
    :'<p class="missing">No identified opponents are included in the current tournament snapshot.</p>')+
    '<p class="footnote">'+s.win+' wins and '+s.loss+' losses recorded; '+completed+' completed matchups displayed. Unassigned future bouts are omitted rather than shown as empty cards. '+
    (div==='Makushita'?'No-bout calendar days are not counted as losses or injuries.':'Results and published upcoming opponents are separated.')+'</p>';
}
function profileResults(w, limit) {
  const enriched=detailFor(details(),w.sourceId);
  const sourced=validMatchSamples(enriched,w.sourceId);
  const matches=sourced.length ? sourced : currentBashoMatchSample(entryFor(w),details().bashoId);
  if(!matches.length) return '<p class="missing">No completed opponent records are available for this rikishi in this snapshot.</p>';
  const subset=matches.slice(0,limit),maxNext=limit===5?10:18;
  return '<div class="sumo-result-grid">'+subset.map(x=>{
    const opponent=wrestler(x.opponentId);
    const h2h=headToHeadFor(w.sourceId,x.opponentId);
    return '<article class="sumo-result-card"><div class="sumo-result-top"><span>'+e(bashoLabel(x.bashoId))+' · '+
      e(x.day?'Day '+x.day:'Bout '+(x.boutSequence||'—'))+'</span><span class="outcome '+e(x.outcome)+'">'+e(x.outcome.toUpperCase())+'</span></div>'+
      fighterOnCard(opponent,x.opponentId,x.opponent)+
      '<div class="sumo-result-extra"><span>ALL-TIME H2H '+e(h2h?h2h.wins+'–'+h2h.losses:'not yet sourced')+'</span>'+
      '<span>'+e(x.isFusen?'Forfeit':x.kimarite||'Kimarite not supplied')+'</span></div></article>';
  }).join('')+'</div>'+
  (matches.length>limit?'<div class="more-wrap"><button class="btn light" data-profile-limit="'+maxNext+
    '">VIEW LATEST '+Math.min(maxNext,matches.length)+' CACHED BOUTS</button></div>':'')+
  '<p class="footnote">'+(sourced.length?'This is a partial, recently cached bout sample, not the full career record.':
    'These are completed opponents recorded in the current '+e(bashoLabel(details().bashoId))+' banzuke only.')+'</p>';
}
function profileTechniques(w) {
  const enriched=detailFor(details(),w.sourceId);
  const direct=Array.isArray(enriched?.matches?.data?.records)?enriched.matches.data.records:[];
  const fallback=currentBashoMatchSample(entryFor(w),details().bashoId)
    .filter(x=>x.outcome==='win').map(x=>({winnerId:w.sourceId,kimarite:x.kimarite}));
  const sample=direct.length?direct:fallback;
  const dist=techniqueDistribution(sample,w.sourceId);
  if(!dist.sampleWins) return '<p class="missing">Not enough recorded non-forfeit wins to calculate a meaningful technique breakdown. No fighting-style scores are inferred.</p>';
  const scope=direct.length?'cached recent bout sample':'current '+bashoLabel(details().bashoId)+' tournament only';
  return '<div>'+dist.techniques.slice(0,7).map(x=>
    '<div class="chart-row"><span class="name">'+e(x.technique)+'</span><div class="bar-bg" role="meter" aria-label="'+e(x.technique)+' percentage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+x.percentage+'"><div style="width:'+x.percentage+'%"></div></div><strong>'+x.percentage+'%</strong></div>'
  ).join('')+'</div><p class="footnote">Distribution of '+dist.sampleWins+' recorded winning techniques from the <strong>'+e(scope)+'</strong>. These are not career percentages or verified stylistic preferences. Forfeits excluded.</p>';
}
function renderProfile(id) {
  const w=wrestler(id);
  if(!w) return '<a class="back-link" href="#rikishi">← All rikishi</a>'+note('That wrestler is outside the current top three tracked divisions, or is not present in this snapshot.');
  const item=entryFor(w), r=recordSummary(item?.record,divisionOf(w.currentRank)), s=detailStats(w), enriched=detailFor(details(),w.sourceId);
  const perf=detailFor(details(),w.sourceId)?'Featured sample data available':'Career data collection pending';
  const pct=r.win+r.loss?Math.round(r.win/(r.win+r.loss)*100):0;
  const styleEvidence=STATE.officialStyles?.byNskId?.[String(w.officialNskId)];
  const verifiedStyle=styleEvidence && Number(styleEvidence.sumoApiId)===Number(w.sourceId) &&
    Array.isArray(styleEvidence.signature) && styleEvidence.signature.length &&
    /^https:\/\/www\.sumo\.or\.jp\/EnSumoDataRikishi\/profile\/\d+\/$/.test(styleEvidence.sourceUrl);
  const officialStyleMarkup=verifiedStyle
    ?'<p><strong>Official JSA-listed signature manoeuvres</strong></p><div class="style-tags">'+
      styleEvidence.signature.map(t=>'<span>'+e(t)+'</span>').join('')+'</div>'+
      '<p class="footnote">These manoeuvres are listed on the <a href="'+e(styleEvidence.sourceUrl)+'" target="_blank" rel="noopener noreferrer">official JSA wrestler profile ↗</a>. '+
      (styleEvidence.sourcePageLatestBasho!==details().bashoId?'The source profile may be older than this banzuke. ':'')+
      'They are descriptive labels, not performance percentages or a BEFN rating.</p>'
    :'<p><strong>Official signature manoeuvres:</strong> not yet independently collected for this wrestler.</p>';
  const officialId=Number(w.officialNskId);
  const officialLink=Number.isSafeInteger(officialId)&&officialId>0
    ?'<a href="https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+officialId+'/" target="_blank" rel="noopener noreferrer">JSA OFFICIAL RIKISHI PROFILE ↗</a>'
    :'<a href="'+JSA_URL+'" target="_blank" rel="noopener noreferrer">JSA OFFICIAL WRESTLER DIRECTORY ↗</a>';
  const meta=[
    ['Stable (heya)',w.heya],['Birthplace',w.birthplace],['Height',Number.isFinite(w.heightCm)?w.heightCm+' cm':null],
    ['Weight',Number.isFinite(w.weightKg)?w.weightKg+' kg':null],
    ['Highest career rank',knownHigh(w)||'Not yet sourced'],
    ['Date of birth',dateOnly(w.birthDate)],['Professional debut',bashoLabel(w.debutBasho)]
  ];
  const cards=meta.map(([k,v])=>'<div><span>'+e(k)+'</span><strong>'+loc(v)+'</strong></div>').join('');
  const honors=[];
  if(s?.yusho!==undefined) honors.push([s.yusho,'Division championships recorded']);
  for(const [name,n] of Object.entries(s?.sansho||{})) honors.push([n,name+' awards']);
  const honHtml=honors.length?'<div class="tiles">'+honors.map(([val,label])=>statTile(val,label)).join('')+'</div>':'<div class="sumo-history">Awards and tournament titles will appear after full source-backed career collection and JSA reconciliation.</div>';
  return '<a class="back-link" href="#rikishi">← ALL RIKISHI</a>'+
    '<section class="profile-hero">'+portraitFor(w,'xl')+
    '<div class="profile-title"><div class="eyebrow" style="color:#f3c332">BEFN SUMO · '+e(divisionOf(w.currentRank))+'</div>'+
    '<h1>'+flagMark(w)+' '+e(w.shikonaEn)+'</h1><div class="jp">'+e(w.shikonaJp||'')+'</div>'+
    '<div class="hero-rank">'+e(w.currentRank||'Rank not supplied')+' '+movementMarkup(w)+'</div><div class="profile-meta">'+cards+'</div></div>'+
    '<div class="profile-current"><span class="tag">'+e(bashoLabel(details().bashoId))+' · CURRENT BASHO</span>'+
    '<div class="big-record">'+(item?r.win+'<span>–</span>'+r.loss+(r.absence===null?'':'<small>–'+r.absence+'</small>'):'—')+'</div><p>'+e(perf)+' · '+(r.absence===null?'W–L (non-bout days excluded)':'W–L–A')+', current ranking only. '+(item?'':'Current banzuke record unavailable.')+'</p>'+
    '<div class="progress" aria-hidden="true"><div style="width:'+pct+'%"></div></div>'+
    '<p>Current tournament results · snapshot, not live</p></div></section>'+
    '<div class="official-source-link">'+officialLink+'<span>BEFN is independent of the Japan Sumo Association.</span></div>'+
    formatStats(w,item?r:null)+
    heading('Latest tournament · source-backed','Basho performance')+
    (item?recordChart(item):'<p class="missing">No current tournament data cached.</p>')+
    heading('Scouting · verified sample only','Winning techniques')+
    '<div class="columns"><section class="panel"><div class="panel-head"><h3>Kimarite usage</h3><span>'+(detailFor(details(),w.sourceId)?'RECENT BOUT SAMPLE':'CURRENT BASHO SAMPLE')+'</span></div><div class="panel-body">'+profileTechniques(w)+'</div></section>'+
    '<section class="panel"><div class="panel-head"><h3>Technical profile</h3><span>JSA STYLES WHERE SOURCED</span></div><div class="panel-body">'+officialStyleMarkup+
    '<p><strong>BEFN overall:</strong> withheld pending a defensible, sumo-specific model. No invented technique or strength scores.</p>'+
    '<a class="btn light" href="#kimarite">LEARN THE KIMARITE</a></div></section></div>'+
    heading('Recorded opponents','Recent performance')+
    '<p class="section-intro">All tracked rikishi show available results from the current banzuke, and featured wrestlers can show a larger recent match sample. Switch between five and up to ten or eighteen cached bouts where available; a full-career view requires verified historical collection.</p>'+
    profileResults(w,STATE.profileLimit)+
    heading('Wins, titles, prizes','Career honours')+honHtml+
    heading('Rise through the ranks','Banzuke history')+
    '<div class="sumo-history">Historical promotion, rank progression and full per-basho results are planned. They will remain unavailable until the relevant source records are fetched and verified. Current rank: <strong>'+e(w.currentRank||'—')+'</strong>.</div>'+
    sourceFooter();
}
function renderBanzuke() {
  const d=STATE.banzukeDivision, data=getBanzuke(d);
  const rows=data?rankTable(data):[];
  return heading('Grand Sumo · Current rankings','Official-format banzuke')+
    '<p class="section-intro">The banzuke is sumo’s tournament ranking list, with ranks assigned East and West. BEFN tracks every current Makuuchi, Jūryō and Makushita wrestler. Rank lists are from the API and await JSA reconciliation.</p>'+
    divisionTabs(d,'data-banzuke-division')+
    '<div class="panel"><div class="panel-head"><h3>'+e(bashoLabel(details().bashoId))+' · '+e(d)+'</h3><span>'+rows.length+' RIKISHI</span></div>'+
    '<div class="panel-body">'+standingsTable(rows,rows.length)+'</div></div>'+
    '<p class="footnote">Lower division competitors typically take seven bouts throughout 15 days; absence, forfeits and unanswered matches must not be transformed into assumed losses.</p>'+
    sourceFooter();
}
function daysPanel(d,data) {
  const lower=d==='Makushita', maxday=currentDay(data);
  if (!maxday) return '<p class="missing">No recorded completed tournament days.</p>';
  const day = STATE.day===null ? maxday : Math.min(maxday,Math.max(1,STATE.day));
  const results=dailyResults(data,day);
  const context=lower
    ?note('Makushita banzuke contains 15 calendar-day positions with up to seven competitive bouts. Days without a recorded bout are not automatically injury absences or losses.')
    :'';
  return context+'<div class="day-select" role="group" aria-label="Basho day">' +
    Array.from({length:maxday},(_,i)=>'<button type="button" data-day="'+(i+1)+'" class="'+(day===i+1?'active':'')+'" aria-pressed="'+(day===i+1)+'">'+(i+1)+'</button>').join('')+'</div>'+
    '<div class="bout-list">'+(results.length?results.map(r=>'<div class="bout"><span class="name '+(r.winnerId===r.rikishiId?'winner':'')+'"><a href="#profile/'+r.rikishiId+'">'+e(r.rikishi)+'</a></span><span class="vs">VS</span>'+
      '<span class="name '+(r.winnerId===r.opponentId?'winner':'')+'"><a href="#profile/'+r.opponentId+'">'+e(r.opponent)+'</a></span>'+
      '<span class="kim">Winner: '+e(r.winner||'Not supplied')+' · '+e(r.kimarite||'Winning technique not supplied')+'</span></div>').join(''):'<p class="missing">No completed matches for this calendar day in the cached banzuke.</p>')+'</div>'+
    '<p class="footnote">Recorded results on calendar day '+day+' · sourced from the current '+e(d)+' banzuke; not a live event feed.</p>';
}
function renderBasho() {
  const d=STATE.bashoDivision, data=getBanzuke(d), rows=data?leadingRikishi(data,20):[];
  const target=details().basho?.data;
  const lastday=data?currentDay(data):0;
  return '<section class="basho-hero"><div><div class="eyebrow" style="color:#f3c332">GRAND SUMO · SIX TOURNAMENTS EACH YEAR</div>'+
    '<h1>'+e(bashoLabel(details().bashoId))+'</h1><p>'+e(target?.startDate?dateOnly(target.startDate):'Start date unavailable')+' – '+e(target?.endDate?dateOnly(target.endDate):'End date unavailable')+' · Japan · third-party source snapshot</p></div>'+
    '<div><span class="basho-day">'+(lastday?'DAY '+lastday:'—')+'</span><p>'+'LATEST RECORDED DAY'+'</p></div></section>'+
    divisionTabs(d,'data-basho-division')+
    heading('Top of this division','Tournament standings')+
    '<div class="panel"><div class="panel-head"><h3>'+e(d)+' · '+e(bashoLabel(details().bashoId))+'</h3><span>AS-OF SNAPSHOT</span></div>'+
    '<div class="panel-body">'+(data?standingsTable(rows,20):'<p class="missing">Banzuke snapshot unavailable for this division.</p>')+'</div></div>'+
    heading('Tournament by tournament','Bout results and opponents')+
    (data?daysPanel(d,data):'<p class="missing">No day-by-day records cached.</p>')+
    (d==='Makushita'&&data?heading('Lower division competition','Recorded seven-bout records')+
      '<div class="panel"><div class="panel-body">'+standingsTable(rankTable(data),20)+'</div></div>':'')+
    sourceFooter();
}
function renderKimarite() {
  return heading('Technical encyclopaedia','Winning techniques')+
    '<p class="section-intro">Kimarite are the recognised winning techniques of sumo. BEFN uses them in wrestler results and in sample-based technical charts. Descriptions below are introductory; use the Japan Sumo Association for the definitive catalogue.</p>'+
    '<div class="technical-terms">'+TERMS.map(t=>'<article class="term"><div class="eyebrow">KIMARITE · '+e(t.label)+'</div><h3>'+e(t.term)+'</h3><p>'+e(t.detail)+'</p></article>').join('')+'</div>'+
    heading('A sumo-specific model','How BEFN will analyse technique')+
    '<div class="columns"><section class="panel"><div class="panel-head"><h3>Descriptive analysis first</h3></div><div class="panel-body">'+
    '<p>Winning technique shares are calculated only from bouts for which the winner and kimarite are recorded. Where only 18 recent bouts have been collected, the chart is clearly labelled as a sample rather than a career total.</p>'+
    '<p>We will avoid invented technique ratings, strength grades and preferred-style claims until a complete historical sample is available.</p></div></section>'+
    '<section class="panel"><div class="panel-head"><h3>Distinguishing result types</h3></div><div class="panel-body"><p>Wins and losses, <strong>kyūjō</strong> (absence), <strong>fusen</strong> (forfeit), and a scheduled bout not yet fought are distinct states. They must not be merged or counted as a performed technique.</p>'+
    '<a class="btn light" href="https://www.sumo.or.jp/Kimarite/show/" target="_blank" rel="noopener noreferrer">JSA KIMARITE REFERENCE ↗</a></div></section></div>'+
    sourceFooter();
}
function render() {
  const hash=decodeURIComponent(location.hash.slice(1)||'home').split('?')[0];
  const [page,id]=hash.split('/');
  tabs.forEach(a=>a.classList.toggle('active',(page==='profile'?'rikishi':page)===a.dataset.page));
  if (STATE.error) { ROOT.innerHTML='<h1>Sumo snapshot unavailable</h1>'+note(STATE.error)+'<p>Existing BEFN pages are unaffected. Try again later.</p>';return;}
  if (!STATE.roster) { ROOT.innerHTML='<div class="loading">Loading sourced Sumo data…</div>';return; }
  switch(page) {
    case 'rikishi': ROOT.innerHTML=renderDirectory();break;
    case 'profile': ROOT.innerHTML=renderProfile(id);break;
    case 'banzuke': ROOT.innerHTML=renderBanzuke();break;
    case 'basho': ROOT.innerHTML=renderBasho();break;
    case 'kimarite': ROOT.innerHTML=renderKimarite();break;
    default: ROOT.innerHTML=renderHome();
  }
}
function refreshDir() {
  const target=document.getElementById('directory-results');
  if (target) target.innerHTML=directoryResults();
  document.querySelectorAll('[data-directory-division]').forEach(el=>{
    el.classList.toggle('active',el.dataset.directoryDivision===STATE.division);
  });
}
document.addEventListener('input',ev=>{
  if(ev.target?.id==='sumo-search') {
    STATE.query=ev.target.value;
    STATE.visible=24;
    refreshDir();
  }
});
document.addEventListener('click',ev=>{
  const el=ev.target.closest?.('[data-directory-division],[data-more-rikishi],[data-banzuke-division],[data-basho-division],[data-day],[data-profile-limit]');
  if(!el) return;
  if(el.dataset.directoryDivision){STATE.division=el.dataset.directoryDivision;STATE.visible=24;refreshDir();}
  if(el.hasAttribute('data-more-rikishi')){STATE.visible+=24;refreshDir();}
  if(el.dataset.banzukeDivision){STATE.banzukeDivision=el.dataset.banzukeDivision;render();}
  if(el.dataset.bashoDivision){STATE.bashoDivision=el.dataset.bashoDivision;STATE.day=null;render();}
  if(el.dataset.day){STATE.day=Number(el.dataset.day);render();}
  if(el.dataset.profileLimit){STATE.profileLimit=Number(el.dataset.profileLimit);render();}
});
window.addEventListener('hashchange',()=>{STATE.profileLimit=5;render();window.scrollTo({top:0,behavior:'instant'});});
async function loadJson(url){
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok)throw new Error('Cached Sumo data returned HTTP '+response.status);
  return response.json();
}
async function init(){
  try {
    const [roster,details,styles]=await Promise.all([loadJson('data/sumo/rikishi-index.json'),loadJson('data/sumo/preview-details.json'),loadJson('data/sumo/official-style-evidence.json')]);
    if(!Array.isArray(roster?.rikishi)||!Array.isArray(details?.featured)||roster?.count!==roster.rikishi.length) throw new Error('Sumo cache schema or roster total not valid');
    if((roster?.trackedDivisions||[]).join(',')!==DIVS.join(','))throw new Error('Sumo cache does not match the approved three-division scope');
    if(roster.rikishi.some(x=>!DIVS.includes(divisionOf(x.currentRank))))throw new Error('Out-of-scope division in Sumo index');
    if(styles?.schemaVersion!==1||!styles.byNskId)throw new Error('Official style evidence cache unavailable or malformed');
    STATE.roster=roster;STATE.details=details;STATE.officialStyles=styles;
    render();
  } catch(error){
    STATE.error=error.message || 'Unable to load the preview dataset';
    render();
  }
}
init();
