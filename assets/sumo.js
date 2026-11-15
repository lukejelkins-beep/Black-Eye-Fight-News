import {
  SOURCE_URL, JSA_URL, DIVISIONS, bashoLabel, divisionOf, recordSummary,
  rankTable, leadingRikishi, currentDay, dailyResults, validMatchSamples, currentBashoMatchSample,
  techniqueDistribution, detailFor, banzukeFor, searchRikishi, snapshotDate,
  originCountry, banzukeMovement, dayMatchups, verifiedDayMatchups, lastCompletedBashoDay, verifiedHeadToHead, verifiedHighestRank,
  rankPositions, confirmedCareerHigh, publishedCurrentWeight
} from './sumo-data.mjs';
import { careerGraphs } from './sumo-editorial-charts.mjs';
import { boutKey, mergeProfileBouts, filterAndSortOpponents, exactNamePriority } from './sumo-editorial-data.mjs';
import { validateSumoPreviewReadiness, wrestlerQuality } from './sumo-verification.mjs';
import { ageInJapan, nextDayForBasho, bashoDayForDate, h2hHistory, researchedHeadToHead, techniqueText } from './sumo-matchup.mjs';

const ROOT = document.querySelector('#sumo-main');
const tabs = [...document.querySelectorAll('[data-page]')];
const DIVS = ['Makuuchi','Juryo','Makushita'];
const STATE = {
  roster: null, details: null, careerHistory: null, officialStyles: null, photoIndex: null, apiTrust: null, error: null, query: '', division: 'All',
  visible: 24, bashoDivision: 'Makuuchi', banzukeDivision: 'Makuuchi',
  day: null, profileLimit: 5, h2hOldestFirst: false, h2hOpponentLimit: 16,
  profileMode: 'bouts', profilePeriod: 'current', rankRange: 'career', fullRankLadder: false,
  opponentQuery: '', opponentSort: 'meetings', h2hReturn: null,
  h2hSummary: null, h2hFull: null, h2hLoading: false, h2hLoadFailed: false,
  h2hOpponents: null, h2hOpponentsLoading: false, h2hOpponentsFailed: false
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
    '<span aria-hidden="true">相</span>'+(valid?'':'<small class="sumo-photo-fallback">Photo unavailable</small>')+'</div>';
}
function knownHigh(w){
  const research=STATE.h2hSummary?.profiles?.[String(w?.sourceId)];
  if(typeof research?.careerHigh==='string'&&research.careerHigh.trim())return research.careerHigh;
  const rich=details()?.featuredExtras?.find(x=>Number(x.id)===Number(w?.sourceId))?.rikishi;
  const official=rich?.status==='available'?rich.data:null;
  const curated=details()?.careerHighs?.[String(w?.sourceId)];
  const fromSource=typeof curated==='string'&&curated.trim()?{rank:curated,evidence:'curated-official-source'}:null;
  const previousRank=movementFor(w).previousRank||null;
  const careerHigh=fromSource||confirmedCareerHigh({
    currentRank:w?.currentRank,previousRank,apiDetail:official
  });
  return careerHigh?.rank||null;
}
function weightHeight(w) {
  const listing=publishedCurrentWeight(w,STATE.careerHistory);
  const h=listing.heightCm!==null?listing.heightCm+' cm':'—';
  const mass=listing.kg!==null?listing.kg+' kg':'—';
  return {h,mass,heightSource:listing.heightSource,
    heightUnderReview:listing.heightUnderReview,
    currentHeightCm:listing.heightCm,apiHeightCm:listing.apiHeightCm,
    weightSource:listing.source,underReview:listing.underReview,
    apiKg:listing.apiKg,currentKg:listing.kg};
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
  return researchedHeadToHead(STATE.h2hSummary,STATE.h2hFull,a,b)||h2hHistory(details(),a,b);
}
function headToHeadName(id,a,b){
  const current=wrestler(id);
  if(current)return current.shikonaEn;
  const fromFirst=STATE.h2hOpponents?.profiles?.[String(a)]?.find(x=>Number(x.id)===Number(id));
  const fromSecond=STATE.h2hOpponents?.profiles?.[String(b)]?.find(x=>Number(x.id)===Number(id));
  return fromFirst?.name||fromSecond?.name||('Rikishi #'+id);
}
function headToHeadUrl(a,b) {
  return '#headtohead/'+Number(a)+'/'+Number(b);
}
function historyRowsMarkup(h2h,a,b,limit=5,reverse=false) {
  if(!h2h)return '<p class="missing">Full head-to-head history has not been sourced for this pairing.</p>';
  const rows=reverse?[...h2h.rows].reverse():h2h.rows;
  if(!rows.length)return '<p class="missing">No individually sourced historical bouts are cached for this pairing.</p>';
  return '<ol class="sumo-h2h-timeline">'+rows.slice(0,limit).map(m=>{
    const winner=headToHeadName(m.winnerId,a,b);
    const firstWon=m.winnerId===Number(a);
    return '<li class="sumo-h2h-bout"><span class="sumo-h2h-date">'+e(bashoLabel(m.bashoId))+' · Day '+e(m.day)+(m.eventType?' · '+e(m.eventType==='mae-zumo'?'Mae-zumo trial':'Playoff'):'')+'</span>'+
      '<span class="sumo-h2h-winner '+(firstWon?'won':'lost')+'">WINNER · '+e(winner)+'</span>'+
      '<span class="sumo-h2h-technique">'+e(techniqueText(m.kimarite))+'</span></li>';
  }).join('')+'</ol>';
}
function headToHeadPreview(a,b,h2h) {
  const link=headToHeadUrl(a,b);
  if(!h2h)return '<div class="sumo-h2h-preview"><p class="sumo-h2h-unavailable">Historical meetings not yet collected for this pair.</p>'+
    '<a class="sumo-h2h-link" href="'+link+'">MATCHUP DETAILS ↗</a></div>';
  return '<div class="sumo-h2h-preview"><div class="sumo-h2h-title">LAST '+Math.min(5,h2h.rows.length)+' HEAD-TO-HEAD RESULTS</div>'+
    historyRowsMarkup(h2h,a,b,5)+
    '<a class="sumo-h2h-link" href="'+link+'">VIEW ALL '+h2h.total+' MEETINGS ↗</a>'+
    (!h2h.complete?'<p class="footnote">'+(h2h.source.includes('190-rikishi')?'Showing five recent source-recorded meetings. Open the full matchup to see every career meeting.':'Only '+h2h.rows.length+' bout details cached; the individual history is incomplete.')+'</p>':'')+
    '</div>';
}
function bioLine(w){
  if(!w)return '<span class="sumo-bio-line">Stats not available</span>';
  const measurements=weightHeight(w),age=ageInJapan(w.birthDate),stats=detailStats(w);
  const career=Number.isInteger(stats?.totalWins)&&Number.isInteger(stats?.totalLosses)
    ?stats.totalWins+'–'+stats.totalLosses:'not yet sourced';
  return '<span class="sumo-bio-line"><b>'+e(w.currentRank||'Unranked')+'</b></span>'+
    '<span class="sumo-bio-line">Peak: '+e(knownHigh(w)||'not yet verified')+'</span>'+
    '<span class="sumo-bio-line">'+e(measurements.h)+' · '+e(measurements.mass)+(age===null?'':' · Age '+age)+'</span>'+
    '<span class="sumo-bio-line">Career W–L: '+e(career)+'</span>';
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
    '<span>'+e(isFinished?'Winner: '+winner+' · '+techniqueText(match.kimarite):'Pairing listed in API · awaiting official result')+'</span></div>'+
    headToHeadPreview(match.rikishiId,match.opponentId,h2h)+'</article>';
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
    '<div class="sumo-result-extra"><a href="'+headToHeadUrl(w.sourceId,id)+'">H2H '+e(h2h?h2h.wins+'–'+h2h.losses:'not yet sourced')+' ↗</a><span>'+e(techniqueText(rec?.kimarite))+'</span></div></article>';
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
  return '<a href="#profile/'+Number(row.sourceId||row.rikishiID)+'">'+flagMark(wrestler(row.sourceId||row.rikishiID))+' '+e(row.shikonaEn || 'Name unavailable')+(small?' ↗':'')+'</a>';
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
  const exact=STATE.query.trim().toLocaleLowerCase();
  // Preserve upstream order (source identity) unless rank rankValue exists in full banzuke.
  const indexed=new Map();
  for(const d of DIVS) for(const [i,row] of (getBanzuke(d)?rankTable(getBanzuke(d)):[]).entries()) indexed.set(Number(row.rikishiID), DIVS.indexOf(d)*1000+i);
  found.sort((a,b)=>{
    const priority=w=>exactNamePriority(w,exact);
    return priority(a)-priority(b)||(indexed.get(a.sourceId)??9999)-(indexed.get(b.sourceId)??9999)||a.shikonaEn.localeCompare(b.shikonaEn);
  });
  return found;
}
function directoryResults() {
  const found=directoryMatches(), selected=found.slice(0,STATE.visible);
  return '<p class="directory-count">'+found.length+' matching current wrestler'+(found.length===1?'':'s')+' · '+selected.length+' shown</p>' +
    (selected.length?'<div class="directory-grid">'+selected.map(directoryCard).join('')+'</div>':note('No matching rikishi in the three tracked divisions.')) +
    (found.length>STATE.visible?'<div class="more-wrap"><button type="button" class="btn light" data-more-rikishi>SHOW MORE ('+(found.length-STATE.visible)+' REMAIN)</button></div>':'')+
    (STATE.visible>24?'<div class="more-wrap"><button type="button" class="btn light" data-fewer-rikishi>SHOW FEWER</button></div>':'');
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
  const fromApi=enriched?.stats?.status==='available'?enriched.stats.data:null;
  const research=STATE.h2hSummary?.profiles?.[String(w.sourceId)];
  return research?{...fromApi,totalWins:research.careerWins,totalLosses:research.careerLosses,
    totalMatches:research.careerWins+research.careerLosses,researchCareerSource:true}:fromApi;
}
function formatStats(w,cur) {
  const s=detailStats(w), total=s?.totalMatches, wins=s?.totalWins, losses=s?.totalLosses;
  // Do not imply totalMatches includes absences: keep record fields separate.
  return '<div class="tiles">'+
    statTile(w.currentRank||'—','Current banzuke rank')+
    statTile(cur?cur.win+'-'+cur.loss+(cur.absence===null?'':'-'+cur.absence):'—',divisionOf(w.currentRank)==='Makushita'?'Current basho W–L':'Current basho W–L–A')+
    statTile(Number.isInteger(wins)&&Number.isInteger(losses)?wins+'-'+losses:'—',s?.researchCareerSource?'Career W–L · full source ledger':'Recorded career W–L · source sample')+
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
    (div==='Makushita'?'Makushita non-bout days are not counted as losses or injuries.':'Results and published upcoming opponents are separated.')+'</p>';
}
function profileResults(w,limit){
  const enriched=detailFor(details(),w.sourceId);
  const research=STATE.h2hSummary?.profiles?.[String(w.sourceId)];
  const careerRecent=Array.isArray(research?.recentPerformance)?research.recentPerformance.map(m=>({
    bashoId:m.bashoId,day:m.day,opponentId:m.opponentId,opponent:m.opponentName,
    outcome:m.outcome,kimarite:m.kimarite
  })):[];
  const sourced=validMatchSamples(enriched,w.sourceId);
  const matches=careerRecent.length?careerRecent:(sourced.length?sourced:currentBashoMatchSample(entryFor(w),details().bashoId));
  if(!matches.length)return '<p class="missing">No completed source-backed opponent records are available for this rikishi.</p>';
  const subset=matches.slice(0,limit),maxNext=limit===5?10:18;
  return '<div class="sumo-result-grid">'+subset.map(x=>{
    const opponent=wrestler(x.opponentId),h2h=headToHeadFor(w.sourceId,x.opponentId);
    return '<article class="sumo-result-card"><div class="sumo-result-top"><span>'+e(bashoLabel(x.bashoId))+' · '+
      e(x.day?'Day '+x.day:'Bout '+(x.boutSequence||'—'))+'</span><span class="outcome '+e(x.outcome)+'">'+e(x.outcome.toUpperCase())+'</span></div>'+
      fighterOnCard(opponent,x.opponentId,x.opponent)+
      '<div class="sumo-result-extra"><a href="'+headToHeadUrl(w.sourceId,x.opponentId)+'">ALL-TIME H2H '+e(h2h?h2h.wins+'–'+h2h.losses:'history loading')+' ↗</a>'+
      '<span>'+e(techniqueText(x.kimarite))+'</span></div></article>';
  }).join('')+'</div>'+
  (matches.length>limit?'<div class="more-wrap"><button class="btn light" data-profile-limit="'+maxNext+
    '">VIEW LATEST '+Math.min(maxNext,matches.length)+' CACHED BOUTS</button></div>':'')+
  '<p class="footnote">'+(careerRecent.length?'Recent results from the complete API career ledger; historical career-result verification status is shown above.':
    sourced.length?'This is a partial, recently cached bout sample, not the full career record.':
    'Current '+e(bashoLabel(details().bashoId))+' banzuke bouts only.')+'</p>';
}
function profileTechniques(w){
  const research=STATE.h2hSummary?.profiles?.[String(w.sourceId)];
  const all=research?.kimarite?.wins;
  const total=Array.isArray(all)?all.reduce((n,x)=>n+(Number.isFinite(Number(x.count))&&Number(x.count)>0?Number(x.count):0),0):0;
  if(Array.isArray(all)&&total>0){
    const filtered=all.filter(x=>Number.isFinite(Number(x.count))&&Number(x.count)>0&&
      !/^(fusen|unknown)$/i.test(String(x.kimarite))).slice().sort((a,b)=>Number(b.count)-Number(a.count)||String(a.kimarite).localeCompare(String(b.kimarite)));
    const denominator=filtered.reduce((n,x)=>n+Number(x.count),0);
    return '<p class="footnote">'+denominator+' recorded non-forfeit winning techniques across the source career ledger. Percentages use wins with a named physical kimarite, not every career victory. Unknown technique wins and forfeits are not assigned a technique.</p>'+
      filtered.map(x=>{const n=Number(x.count),pct=denominator?Math.round(n/denominator*1000)/10:0;
        return '<div class="chart-row"><span class="name">'+e(x.kimarite)+'</span><div class="bar-bg" role="meter" aria-label="'+e(x.kimarite)+' '+n+' of '+denominator+' recorded non-forfeit technique wins" aria-valuemin="0" aria-valuemax="'+denominator+'" aria-valuenow="'+n+'"><div style="width:'+pct+'%"></div></div>'+
          '<strong>'+n+' · '+pct+'%</strong></div>';
      }).join('')+'<p class="footnote">API-trusted career source, not independent bout-by-bout certification. <a href="#kimarite">Kimarite reference</a> provides sourced explanations where available.</p>';
  }
  const enriched=detailFor(details(),w.sourceId),direct=Array.isArray(enriched?.matches?.data?.records)?enriched.matches.data.records:[];
  const fallback=currentBashoMatchSample(entryFor(w),details().bashoId)
    .filter(x=>x.outcome==='win').map(x=>({winnerId:w.sourceId,kimarite:x.kimarite}));
  const dist=techniqueDistribution(direct.length?direct:fallback,w.sourceId);
  if(!dist.sampleWins)return '<p class="missing">No supported, non-forfeit winning-technique breakdown is available for this period.</p>';
  return '<p class="footnote">'+dist.sampleWins+' wins with recorded techniques · '+e(direct.length?'recent cached sample':'current tournament')+' · not career percentages.</p>'+
    dist.techniques.map(x=>'<div class="chart-row"><span class="name">'+e(x.technique)+'</span><div class="bar-bg" role="meter" aria-label="'+e(x.technique)+' '+x.percentage+' percent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+x.percentage+'"><div style="width:'+x.percentage+'%"></div></div><strong>'+x.percentage+'%</strong></div>').join('');
}
/* Presentation-only results model. One canonical renderer; no cache records are rewritten. */
function resultKey(row) {return boutKey(row);}
function currentProfileBouts(w) {
  const entry=entryFor(w),date=details().bashoId;
  const completed=(entry?.record||[]).flatMap((rec,i)=>{
    const status=String(rec?.result||'').toLowerCase();
    if(!['win','loss'].includes(status))return [];
    const opponentId=Number(rec.opponentID);
    if(!Number.isSafeInteger(opponentId)||opponentId<1)return [];
    return [{bashoId:date,day:i+1,opponentId,opponent:rec.opponentShikonaEn||wrestler(opponentId)?.shikonaEn||'Opponent',
      outcome:status,kimarite:rec.kimarite||null,scope:'Current banzuke result'}];
  });
  const division=divisionOf(w.currentRank),next=Number(details().announcedDay);
  const announcements=verifiedDayMatchups(getBanzuke(division),getAnnouncedTorikumi(division,next),
    {bashoId:date,division,day:next}).filter(x=>!x.finished&&[x.rikishiId,x.opponentId].includes(Number(w.sourceId)));
  const scheduled=announcements.map(x=>{
    const opponentId=x.rikishiId===Number(w.sourceId)?x.opponentId:x.rikishiId;
    return {bashoId:date,day:x.day,opponentId,opponent:wrestler(opponentId)?.shikonaEn||'Confirmed opponent',
      outcome:'scheduled',kimarite:null,scope:'Announced day-specific torikumi'};
  });
  return [...completed,...scheduled];
}
function sourceCareerBouts(w) {
  const id=Number(w.sourceId),full=STATE.h2hFull?.pairs,rows=[];
  if(full)for(const pair of Object.values(full)){
    const a=Number(pair?.a),b=Number(pair?.b);
    if(a!==id&&b!==id)continue;
    const opponentId=a===id?b:a;
    for(const m of pair.regular||[]){
      if(!Array.isArray(m)||m.length<6||![a,b].includes(Number(m[2])))continue;
      rows.push({bashoId:String(m[0]),day:Number(m[1]),opponentId,
        opponent:headToHeadName(opponentId,id,opponentId),outcome:Number(m[2])===id?'win':'loss',
        kimarite:m[3]||null,scope:'API full career research ledger',matchNo:m[5]||null});
    }
  }
  if(rows.length)return rows;
  const research=STATE.h2hSummary?.profiles?.[String(id)];
  if(Array.isArray(research?.recentPerformance))return research.recentPerformance.map(m=>({
    bashoId:String(m.bashoId),day:Number(m.day),opponentId:Number(m.opponentId),
    opponent:m.opponentName,outcome:m.outcome,kimarite:m.kimarite||null,
    scope:'Recent API career source sample'
  }));
  return validMatchSamples(detailFor(details(),id),id).map(m=>({...m,scope:'Cached recent results sample'}));
}
function profileBouts(w){return mergeProfileBouts(currentProfileBouts(w),sourceCareerBouts(w));}

function profileBoutRow(w,row){
  const id=Number(row.opponentId),opponent=wrestler(id);
  const outcome=String(row.outcome||'').toLowerCase();
  const label=outcome==='win'?'W':outcome==='loss'?'L':outcome==='scheduled'?'Scheduled':'Not available';
  const technique=outcome==='scheduled'?'Result pending':row.kimarite?techniqueText(row.kimarite):'Technique unavailable';
  const name=opponent?.shikonaEn||row.opponent||'Opponent unavailable';
  const h2h=headToHeadFor(w.sourceId,id);
  const personal=opponent?bioLine(opponent):'Only the opponent identity is available in this snapshot.';
  return '<article class="sumo-ed-row" id="sumo-bout-'+e(resultKey(row))+'">'+
    '<div class="sumo-ed-row-main"><div class="sumo-ed-date"><strong>Day '+e(row.day||'N/A')+'</strong><small>'+e(bashoLabel(row.bashoId))+'</small></div>'+
    '<div class="sumo-ed-result '+e(outcome)+'">'+e(label)+'</div>'+
    '<div class="sumo-ed-person">'+portraitFor(opponent,'sm')+
    (opponent?'<a href="#profile/'+id+'">'+e(name)+'</a>':'<span>'+e(name)+'</span>')+'</div>'+
    '<div class="sumo-ed-rank"><span>'+e(opponent?.currentRank||'Not available')+'</span><small>Current rank only</small></div>'+
    '<div class="sumo-ed-tech">'+e(technique)+'</div>'+
    '<div class="sumo-ed-h2h"><a href="'+headToHeadUrl(w.sourceId,id)+'" aria-label="Head to head: '+e(w.shikonaEn)+' versus '+e(name)+'">H2H '+e(h2h?h2h.wins+'–'+h2h.losses:'↗')+'</a></div></div>'+
    '<details class="sumo-ed-extra"><summary>Opponent details · '+e(name)+'</summary><div class="sumo-details-grid">'+personal+
    '<span>Source: '+e(row.scope)+'</span><span>Completed result: '+e(outcome==='scheduled'?'No — confirmed scheduled pairing':'Yes')+'</span></div></details></article>';
}
function resultDesk(w){
  const all=profileBouts(w),mode=STATE.profileMode,period=STATE.profilePeriod;
  const periods=[...new Set(all.map(x=>x.bashoId).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const shown=period==='all'?all:all.filter(x=>String(x.bashoId)===String(period==='current'?details().bashoId:period));
  const select='<label for="sumo-period">Period</label><select id="sumo-period">'+
    '<option value="current"'+(period==='current'?' selected':'')+'>Current · '+e(bashoLabel(details().bashoId))+'</option>'+
    '<option value="all"'+(period==='all'?' selected':'')+'>All recorded in cache</option>'+
    periods.filter(x=>x!==String(details().bashoId)).map(x=>'<option value="'+e(x)+'"'+(period===x?' selected':'')+'>'+e(bashoLabel(x))+'</option>').join('')+'</select>';
  const controls='<div class="sumo-workspace-controls"><div class="sumo-segmented" role="group" aria-label="Results view">'+
    '<button type="button" data-results-mode="bouts" aria-pressed="'+(mode==='bouts')+'">Bouts</button>'+
    '<button type="button" data-results-mode="tournaments" aria-pressed="'+(mode==='tournaments')+'">By tournament</button></div>'+select+'</div>';
  const rowhead='<div class="sumo-result-header" aria-hidden="true"><span>Day / period</span><span>Result</span><span>Opponent</span><span>Rank</span><span>Technique</span><span>Comparison</span></div>';
  const messages=(period==='all'&&!STATE.h2hFull?'<p class="notice">'+(STATE.h2hLoading?'Loading the complete cached career ledger…':STATE.h2hLoadFailed?'Full ledger unavailable; only a recent source sample is shown.':'Open All recorded to load complete career history from cache.')+'</p>':'')+
    '<p class="footnote" role="status" aria-live="polite">'+shown.length+' bouts shown from '+all.length+' currently accessible source rows. Tournament totals are never inferred from partial caches.</p>';
  if(mode==='tournaments'){
    const groups=new Map();
    for(const row of shown){if(!groups.has(row.bashoId))groups.set(row.bashoId,[]);groups.get(row.bashoId).push(row);}
    return controls+'<div class="sumo-results-desk sumo-tournament-list">'+([...groups.entries()].map(([basho,rows])=>{
      const ranks=STATE.careerHistory?.bySourceId?.[String(w.sourceId)]?.rank||[];
      const observed=ranks.find(x=>String(x.basho)===String(basho));
      return '<details><summary>'+e(bashoLabel(basho))+' · '+rows.length+' cached bout'+(rows.length===1?'':'s')+
        ' · rank '+e(observed?.rank||'Not available')+' <span>· full W–L–A totals '+(basho===String(details().bashoId)&&entryFor(w)?'provided in current tournament block':'not available from this bout subset')+'</span></summary>'+
        '<div class="sumo-results-desk">'+rowhead+rows.map(r=>profileBoutRow(w,r)).join('')+'</div></details>';
    }).join('')||'<p class="missing">No individually sourced bouts are available for this period.</p>')+'</div>'+messages;
  }
  return controls+'<div class="sumo-results-desk">'+rowhead+
    (shown.length?shown.map(row=>profileBoutRow(w,row)).join(''):'<p class="missing">No completed or confirmed scheduled bouts in this selection.</p>')+
    '</div>'+messages;
}
function lastFiveStrip(w){
  const matches=profileBouts(w).filter(x=>x.outcome==='win'||x.outcome==='loss').slice(0,5);
  return '<div class="sumo-recent-strip"><span class="label">LATEST '+matches.length+' COMPLETED · NEWEST FIRST</span>'+
    matches.map(row=>'<a class="'+e(row.outcome)+'" data-result-link="'+e(resultKey(row))+'" data-result-period="'+e(row.bashoId)+'" href="#profile/'+Number(w.sourceId)+'?result='+e(resultKey(row))+
    '" aria-label="'+e(row.outcome)+' versus '+e(row.opponent)+' · '+e(bashoLabel(row.bashoId))+' day '+e(row.day)+' · '+e(row.kimarite?techniqueText(row.kimarite):'technique unavailable')+'"><strong>'+e(row.outcome==='win'?'W':'L')+'</strong><small>Day '+e(row.day)+'</small></a>').join('')+
    (matches.length?'':'<span>No completed source-backed bouts available.</span>')+'</div>';
}
function summaryStat(value,label){return '<div class="sumo-summary-stat"><strong>'+e(value===null||value===undefined?'Not available':value)+'</strong><span>'+e(label)+'</span></div>';}
function sectionHead(id,label,title){return '<section class="sumo-section" id="sumo-'+id+'">'+heading(label,title);}
function sectionNav(id){
  const parts=[['results','Results'],['career','Career'],['charts','Charts'],['opponents','Opponents'],['techniques','Techniques'],['sources','Sources']];
  return '<nav class="sumo-section-nav" aria-label="On this profile">'+parts.map(([key,label])=>
    '<a href="#profile/'+id+'?section='+key+'" data-profile-section="'+key+'">'+label+'</a>').join('')+'</nav>'+
    '<div class="sumo-section-menu"><label>On this profile <select id="sumo-profile-section">'+
    parts.map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label></div>';
}

function renderApiQuality(w){
 const quality=wrestlerQuality(w,STATE.apiTrust);
 if(!quality)return '<p class="footnote">Source data status is unavailable; this profile has not been independently certified.</p>';
 return '<aside class="sumo-api-quality" data-sumo-source-id="'+Number(w.sourceId)+'" aria-label="Research data quality">'+
  '<div class="sumo-api-quality-label">API-TRUSTED · NON-PRODUCTION PREVIEW</div>'+
  '<strong>'+e(quality.careerResultsStatus)+'</strong>'+
  '<p>Complete cached Sumo API career data is accepted for development. This is not full-profile certification, bout-by-bout JSA certification or production approval.</p>'+
  (quality.historicalReview?'<p class="sumo-api-review">Review: an older JSA career-record snapshot needs a matched-date follow-up. The current API record remains available for preview.</p>':'')+
  '</aside>';
}
function renderProfile(id) {
  const w=wrestler(id);
  if(!w)return '<a class="back-link" href="#rikishi">← All rikishi</a>'+note('Wrestler not in the tracked snapshot.');
  const item=entryFor(w),r=item?recordSummary(item.record,divisionOf(w.currentRank)):null,s=detailStats(w);
  const current=weightHeight(w),age=ageInJapan(w.birthDate,STATE.roster?.collectedAt?new Date(STATE.roster.collectedAt):new Date());
  const officialId=Number(w.officialNskId);
  const officialLink=Number.isSafeInteger(officialId)&&officialId>0?
    'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+officialId+'/':JSA_URL;
  const style=STATE.officialStyles?.byNskId?.[String(w.officialNskId)];
  const styleOkay=style&&Number(style.sumoApiId)===Number(w.sourceId)&&Array.isArray(style.signature)&&
    /^https:\/\/www\.sumo\.or\.jp\/EnSumoDataRikishi\/profile\/\d+\/$/.test(style.sourceUrl);
  const sourceNotes=[];
  if(current.underReview)sourceNotes.push('Weight source/date/precision review is unresolved. JSA listing: '+current.currentKg+' kg; API roster: '+current.apiKg+' kg. Displayed values may agree at their shown precision; the review flag remains open.');
  if(current.heightUnderReview)sourceNotes.push('Height source/date/precision review is unresolved. JSA listing: '+current.currentHeightCm+' cm; API roster: '+current.apiHeightCm+' cm.');
  const fact=(label,value,extra='')=>'<div><span>'+e(label)+'</span><strong>'+e(value||'Not available')+'</strong>'+(extra?'<span>'+e(extra)+'</span>':'')+'</div>';
  const currentBlock=r?'<div class="sumo-current-record"><span><b>'+r.win+'</b><small>Wins</small></span>'+
    '<span><b>'+r.loss+'</b><small>Losses</small></span><span><b class="'+(r.absence===null?'unavailable':'')+'">'+e(r.absence===null?'N/A':r.absence)+'</b><small>'+e(r.absence===null?'Absences not supplied':'Absences')+'</small></span></div>'
    :'<p>Current record not available.</p>';
  const mWins=s?.winsByDivision?.Makuuchi,mLosses=s?.lossByDivision?.Makuuchi;
  const career=Number.isInteger(s?.totalWins)&&Number.isInteger(s?.totalLosses)?s.totalWins+'–'+s.totalLosses:'Not available';
  const titleCount=s?.yushoByDivision?.Makuuchi;
  const noTitles=titleCount===null||titleCount===undefined?'Not available':titleCount;
  const careerAwards=Object.entries(s?.sansho||{}).map(([k,v])=>'<li>'+e(k)+': '+e(v)+'</li>').join('');
  return '<a class="back-link" href="#rikishi">← Rikishi directory</a>'+
    '<section class="profile-hero">'+portraitFor(w,'xl')+
    '<div class="profile-title"><div class="eyebrow">BEFN SUMO · '+e(divisionOf(w.currentRank))+'</div>'+
    '<h1>'+e(w.shikonaEn)+'</h1><div class="jp">'+e(w.shikonaJp||'')+'</div>'+
    flagMark(w)+'<div class="hero-rank">'+e(w.currentRank||'Rank not available')+' · '+movementMarkup(w)+'</div>'+
    '</div><div class="profile-facts profile-meta">'+fact('Stable',w.heya)+fact('Age at snapshot',age===null?'Not available':age+' years')+
    fact('Height',current.h,current.heightSource)+fact('Weight · undated',current.mass,current.weightSource)+'</div>'+
    '<div class="profile-current"><span class="tag">'+e(bashoLabel(details().bashoId))+' · CURRENT BASHO</span>'+
    currentBlock+'<p>Cached tournament snapshot, not live. '+(divisionOf(w.currentRank)==='Makushita'?'Makushita non-bout days are not absences.':'Scheduled pairings appear only when confirmed in published torikumi.')+'</p></div></section>'+
    '<div class="sumo-summary-strip">'+summaryStat(career,'Career W–L · API ledger')+
    summaryStat(knownHigh(w)||'Not available','Highest sourced rank')+
    summaryStat(Number.isInteger(mWins)&&Number.isInteger(mLosses)?mWins+'–'+mLosses:'Not available','Makuuchi W–L · API scope')+
    summaryStat(noTitles,'Makuuchi championships · API stats')+'</div>'+
    lastFiveStrip(w)+sectionNav(w.sourceId)+
    sectionHead('results','Tournament and career ledger','Results')+resultDesk(w)+'</section>'+
    sectionHead('career','Historical context','Career')+
    '<div class="sumo-career-strip">'+
    '<div><strong>'+e(career)+'</strong><span>Career wins–losses · API ledger</span></div>'+
    '<div><strong>'+e(s?.basho??'Not available')+'</strong><span>Bashos in API statistics (not rank-chart count)</span></div>'+
    '<div><strong>'+e(s?.yusho??'Not available')+'</strong><span>Division championships · all recorded divisions</span></div></div>'+
    '<details class="sumo-career-facts"><summary>Biography, prizes and available division records</summary><dl>'+
    '<div><dt>Birth date</dt><dd>'+e(dateOnly(w.birthDate))+'</dd></div>'+
    '<div><dt>Source-listed birthplace</dt><dd>'+e(w.birthplace||'Not available')+'</dd></div>'+
    '<div><dt>Professional debut</dt><dd>'+e(w.debutBasho?bashoLabel(w.debutBasho):'Not available')+'</dd></div>'+
    '<div><dt>Stable</dt><dd>'+e(w.heya||'Not available')+'</dd></div>'+
    '</dl><p>Division wins/losses and championships are shown only where provided by the source. No record is inferred from rank entries.</p>'+
    (careerAwards?'<ul>'+careerAwards+'</ul>':'<p>Prize breakdown not available in the cached source.</p>')+'</details></section>'+
    sectionHead('charts','Source observations · with data tables','Charts')+
    careerGraphs(w,STATE.careerHistory,details().bashoId,details().previousBashoId,movementFor(w).previousRank,
      {rankRange:STATE.rankRange,fullLadder:STATE.fullRankLadder})+'</section>'+
    sectionHead('opponents','Complete source-backed catalogue','Opponents and head-to-head')+profileRivalries(w)+'</section>'+
    sectionHead('techniques','Kimarite recorded for wins','Winning techniques')+
    '<div class="sumo-techniques-list">'+profileTechniques(w)+'</div>'+
    (styleOkay?'<div class="sumo-sources"><h3>JSA-listed signature manoeuvres</h3><p>'+style.signature.map(t=>e(t)).join(' · ')+'</p><p>These sourced labels are not win percentages. <a href="'+e(style.sourceUrl)+'" target="_blank" rel="noopener noreferrer">JSA evidence</a></p></div>':'')+'</section>'+
    sectionHead('sources','Provenance and limitations','Sources & data coverage')+
    '<div class="sumo-sources">'+renderApiQuality(w)+
    '<p><strong>Snapshot:</strong> '+e(snapshotDate(STATE.roster.collectedAt))+' · trusted third-party API inputs, not universal independent certification.</p>'+
    '<p><strong>Current height and weight:</strong> '+e(current.heightSource)+' / '+e(current.weightSource)+'. Listed measurements are undated; historical dated values are separate.</p>'+
    sourceNotes.map(x=>'<p class="sumo-api-review">'+e(x)+'</p>').join('')+
    '<details><summary>Source links, review scope and image credits</summary>'+
    '<p><a href="'+e(officialLink)+'" target="_blank" rel="noopener noreferrer">Official JSA wrestler profile or directory</a> · <a href="'+SOURCE_URL+'" target="_blank" rel="noopener noreferrer">Sumo API guide</a> · <a href="sumo-photo-credits.html">Photo credits & licences</a></p>'+
    '<p>Recorded source data may be trusted for preview without independent per-bout or full-profile corroboration. Historical JSA comparisons retain the scopes and dates described in the quality register.</p></details></div></section>';
}
function opponentResults(w){
  const profile=STATE.h2hSummary?.profiles?.[String(w.sourceId)];
  const original=STATE.h2hOpponents?.profiles?.[String(w.sourceId)];
  if(!profile||!Array.isArray(original))
    return '<p role="status">'+e(STATE.h2hOpponentsFailed?'Opponent directory could not load.':'Loading the complete opponent index…')+'</p>'+
      (STATE.h2hOpponentsFailed?'<button type="button" data-opponent-retry>Retry opponent index</button>':'');
  const name=r=>String(wrestler(r.id)?.shikonaEn||r.name||'Rikishi #'+r.id);
  const matches=filterAndSortOpponents(original,STATE.opponentQuery,STATE.opponentSort,name);
  const shown=matches.slice(0,STATE.h2hOpponentLimit);
  return '<p class="directory-count" role="status" aria-live="polite">'+shown.length+' shown of '+matches.length+
    ' matching opponents · '+original.length+' recorded opponents total</p>'+
    '<div class="sumo-rival-grid">'+shown.map(r=>{
      const opponent=wrestler(r.id),label=name(r);
      return '<a class="sumo-rival" href="'+headToHeadUrl(w.sourceId,r.id)+'">'+
        '<span class="sumo-rival-name">'+e(label)+'</span><strong>'+e(r.wins)+' W · '+e(r.losses)+' L</strong>'+
        '<small>'+e(r.meetings)+' recorded meetings · open full chronology</small></a>';
    }).join('')+'</div>'+
    (shown.length<matches.length?'<button type="button" class="btn light" data-h2h-more>Show more opponents ('+(matches.length-shown.length)+' remain)</button>':'')+
    (STATE.h2hOpponentLimit>16?'<button type="button" class="btn light" data-h2h-fewer>Show fewer opponents</button>':'');
}
function profileRivalries(w){
  return '<p class="section-intro">All source-recorded opponents remain available for search and head-to-head comparison. Records are API research data, not blanket JSA certification.</p>'+
    '<div class="sumo-opponent-controls"><label for="sumo-opponent-search">Search opponent</label>'+
    '<input id="sumo-opponent-search" type="search" value="'+e(STATE.opponentQuery)+'" placeholder="Ring name…" autocomplete="off">'+
    '<label for="sumo-opponent-sort">Sort opponents</label><select id="sumo-opponent-sort">'+
    [['meetings','Most meetings'],['name','Name A–Z'],['record','Best W–L difference']].map(([val,text])=>
      '<option value="'+val+'"'+(STATE.opponentSort===val?' selected':'')+'>'+text+'</option>').join('')+'</select></div>'+
    '<div id="sumo-opponent-results">'+opponentResults(w)+'</div>';
}
function banzukeCard(row) {
  const w=wrestler(row.rikishiID);
  if(!w)return '';
  const m=movementFor(w),size=weightHeight(w);
  return '<article class="sumo-rank-card"><div class="sumo-rank-card-head"><span>'+e(divisionOf(w.currentRank))+'</span>'+
    '<span>'+recordLabels(row.summary)+'</span></div>'+
    '<div class="sumo-rank-card-body">'+portraitFor(w,'lg')+
    '<div class="sumo-rank-card-data"><div class="sumo-rank-name">'+flagMark(w)+
    '<a href="#profile/'+Number(w.sourceId)+'">'+e(w.shikonaEn)+'</a></div>'+
    '<div class="sumo-rank-strong">'+e(w.currentRank||'Rank not supplied')+'</div>'+
    '<div class="sumo-rank-info"><span>Highest rank: <b>'+e(knownHigh(w)||'Not yet sourced')+'</b></span>'+
    '<span>Height: <b>'+e(size.h)+'</b></span><span>Weight: <b>'+e(size.mass)+'</b></span></div>'+
    '<div class="sumo-rank-change">'+movementMarkup(w)+
    '<span>'+e(m.previousRank?'Previous: '+m.previousRank:m.status==='new'?'Not on the previous top-three banzuke':'Previous rank not available')+'</span></div></div></div></article>';
}
function renderBanzuke() {
  const d=STATE.banzukeDivision,data=getBanzuke(d),rows=data?rankTable(data):[];
  const previous=details().previousBashoId;
  return heading('Grand Sumo · Current rankings','Banzuke')+
    '<p class="section-intro">Every active '+e(d)+' rikishi is shown with their origin flag, image-ready portrait, current rank, measurements and movement since '+
    e(bashoLabel(previous))+' (when both banzuke entries are available). Movement counts refer to individual East/West positions across the combined three-division banzuke, not a change in world ranking. Highest ranks are shown when supported by source data; unavailable fields remain explicitly unavailable. NEW means new to the tracked top three, not career debut.</p>'+
    divisionTabs(d,'data-banzuke-division')+
    '<div class="panel-head"><h3>'+e(bashoLabel(details().bashoId))+' · '+e(d)+'</h3><span>'+rows.length+' RIKISHI · CURRENT BANZUKE</span></div>'+
    (rows.length?'<div class="sumo-rank-grid">'+rows.map(banzukeCard).join('')+'</div>':
      '<p class="missing">The current banzuke for this division is unavailable.</p>')+
    '<p class="footnote">Green ↑ = promotion, red ↓ = demotion, ↔ = unchanged. NEW indicates an entry not present in the previous top-three banzuke, which must not be treated as a verified career debut. Flags refer to the source-recorded birthplace country, not nationality.</p>'+
    sourceFooter();
}
function renderHeadToHead(a,b) {
  const first=wrestler(a),second=wrestler(b);
  if(!first&&!second)return '<a href="#rikishi">← Rikishi directory</a>'+note('Neither wrestler is in this tracked roster.');
  const firstName=first?.shikonaEn||headToHeadName(a,b,a);
  const secondName=second?.shikonaEn||headToHeadName(b,a,b);
  const history=headToHeadFor(a,b);
  const back=STATE.h2hReturn&&STATE.h2hReturn.hash?.startsWith('#profile/')?
    '<a class="back-link" href="'+e(STATE.h2hReturn.hash)+'">← Back to originating profile</a> · ':'';
  let coverage;
  if(history?.complete) coverage='All '+history.rows.length+' of '+history.total+' regular cached meetings shown. API-sourced, not independently bout-certified.';
  else if(STATE.h2hLoading)coverage='Loading '+(history?.rows.length||0)+' of '+(history?.total||'available')+' recorded meetings…';
  else if(STATE.h2hLoadFailed)coverage='Full chronology could not load. Showing '+(history?.rows.length||0)+' of '+(history?.total||'unknown')+' meetings; retry to retrieve cached rows.';
  else coverage='Showing '+(history?.rows.length||0)+' of '+(history?.total||'unknown')+' source-recorded meetings. Full cached chronology has not loaded.';
  return '<div>'+back+'<a class="back-link" href="#basho">Basho Centre</a></div>'+
    heading('Rikishi versus rikishi','Career head-to-head')+
    '<div class="sumo-h2h-hero"><div>'+fighterOnCard(first,a,firstName)+'</div>'+
    '<div class="sumo-h2h-score"><span>API CAREER SERIES · REGULAR BOUTS</span>'+
    '<strong>'+e(history?history.wins+'–'+history.losses:'Not available')+'</strong>'+
    '<small>'+e(firstName)+' wins: '+e(history?history.wins:'Not available')+'</small>'+
    '<small>'+e(secondName)+' wins: '+e(history?history.losses:'Not available')+'</small>'+
    '<small>'+e(history?history.total+' recorded meetings':'Series loading')+'</small></div>'+
    '<div>'+fighterOnCard(second,b,secondName)+'</div></div>'+
    heading('Calendar chronology','Every historical meeting')+
    '<p class="section-intro">Each source-recorded match retains basho, calendar day, winner and original kimarite; forfeits and special meetings remain distinct.</p>'+
    '<p role="status" aria-live="polite">'+e(coverage)+'</p>'+
    (history?'<div class="sumo-h2h-order" role="group" aria-label="Chronology order">'+
      '<button type="button" data-h2h-order="newest" aria-pressed="'+(!STATE.h2hOldestFirst)+'" class="'+(!STATE.h2hOldestFirst?'active':'')+'">Newest first</button>'+
      '<button type="button" data-h2h-order="oldest" aria-pressed="'+(STATE.h2hOldestFirst)+'" class="'+(STATE.h2hOldestFirst?'active':'')+'">Oldest first</button></div>'+
      historyRowsMarkup(history,a,b,Number.MAX_SAFE_INTEGER,STATE.h2hOldestFirst):'<p>No pair-specific history is currently available.</p>')+
    (STATE.h2hLoadFailed?'<button type="button" data-h2h-retry class="btn light">Retry cached chronology</button>':'')+
    (history?.complete&&history.special?.length?heading('Non-regular meetings','Playoffs and trials')+
      historyRowsMarkup({rows:history.special},a,b,Number.MAX_SAFE_INTEGER,STATE.h2hOldestFirst):'')+
    '<p class="footnote">A complete cache does not establish independent JSA certification. Data source scope and individual review flags are preserved.</p>'+sourceFooter();
}
function getAnnouncedTorikumi(div,day){
  const next=Number(details().announcedDay);
  const item=details().torikumi?.[div];
  return day===next && item?.status==='available' ? item.data : null;
}
function daysPanel(d,data) {
  const completedDay=lastCompletedBashoDay(data);
  const upcoming=Number(details().announcedDay);
  const scheduled=getAnnouncedTorikumi(d,upcoming);
  const today=bashoDayForDate(new Date(),details().basho?.data?.startDate);
  const tomorrow=nextDayForBasho(new Date(),details().basho?.data?.startDate);
  const defaultDay=tomorrow||(scheduled&&upcoming>=1&&upcoming<=15?upcoming:Math.max(1,completedDay));
  const day=STATE.day===null?defaultDay:Math.min(15,Math.max(1,STATE.day));
  const pairings=verifiedDayMatchups(data,getAnnouncedTorikumi(d,day),{
    bashoId:details().bashoId,division:d,day
  });
  const pending=pairings.filter(x=>!x.finished).length;
  return '<p class="section-intro">Completed results come from the source banzuke. Upcoming pairings appear only when the separate day-specific torikumi list has been fetched. Cards show wrestler flags, ranks, height, weight and sourced all-time head-to-head records when available.</p>'+
    '<div class="sumo-day-quick">'+
      (today>=1&&today<=15?'<button type="button" data-jump-day="'+today+'">TODAY · DAY '+today+'</button>':'')+
      (tomorrow?'<button type="button" data-jump-day="'+tomorrow+'" class="'+(day===tomorrow?'active':'')+'">TOMORROW · DAY '+tomorrow+'</button>':'')+
      '<span>Dates follow Japan Standard Time (JST)</span></div>'+
    '<div class="day-select" role="group" aria-label="Basho calendar day">'+
    Array.from({length:15},(_,i)=>'<button type="button" data-day="'+(i+1)+'" class="'+(day===i+1?'active':'')+
      '" aria-pressed="'+(day===i+1)+'">'+(i+1)+'</button>').join('')+'</div>'+
    (d==='Makushita'?note('Makushita rikishi generally fight seven times across 15 tournament days. Days without recorded matches are not counted as losses or injury absences.'):'')+
    (day===tomorrow&&!getAnnouncedTorikumi(d,day)?'<p class="sumo-schedule-source">Tomorrow’s Day '+day+' torikumi has not been captured in this snapshot. No opponents will be guessed; this preview is not live.</p>':'')+
    (day===upcoming&&scheduled?'<p class="sumo-schedule-source">Day '+day+' pairings sourced from the tournament torikumi announcement · snapshot, not live.</p>':'')+
    '<div class="sumo-match-list">'+(pairings.length?pairings.map(matchupCard).join(''):
      '<p class="sumo-empty-bout">No completed results or confirmed upcoming torikumi are cached for this day. Future opponents are not inferred from incomplete banzuke slots.</p>')+'</div>'+
    '<p class="footnote">Day '+day+' · '+pairings.length+' individually sourced matchups ('+pending+' scheduled / pending). All-time H2H appears only with a verified pair-specific record. Photo placeholders await licence approval.</p>';
}
function renderBasho() {
  const d=STATE.bashoDivision, data=getBanzuke(d), rows=data?leadingRikishi(data,20):[];
  const target=details().basho?.data;
  const lastday=data?lastCompletedBashoDay(data):0;
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
    case 'profile': ROOT.innerHTML=renderProfile(id);
      if(STATE.h2hSummary&&!STATE.h2hOpponents&&!STATE.h2hOpponentsLoading&&!STATE.h2hOpponentsFailed)void loadOpponentIndex();break;
    case 'headtohead': ROOT.innerHTML=renderHeadToHead(id,hash.split('/')[2]);
      if(!STATE.h2hFull&&!STATE.h2hLoading&&!STATE.h2hLoadFailed)void loadCompleteH2h();
      if(!wrestler(hash.split('/')[2])&&STATE.h2hSummary&&!STATE.h2hOpponents&&!STATE.h2hOpponentsLoading&&!STATE.h2hOpponentsFailed)void loadOpponentIndex();
      break;
    case 'banzuke': ROOT.innerHTML=renderBanzuke();break;
    case 'basho': ROOT.innerHTML=renderBasho();break;
    case 'kimarite': ROOT.innerHTML=renderKimarite();break;
    default: ROOT.innerHTML=renderHome();
  }
}
function refreshDir() {
  const target=document.getElementById('directory-results');
  if(target)target.innerHTML=directoryResults();
  document.querySelectorAll('[data-directory-division]').forEach(el=>{
    const selected=el.dataset.directoryDivision===STATE.division;
    el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected));
  });
}
function refreshOpponents(){
  const id=Number(location.hash.split('/')[1]?.split('?')[0]);
  const w=wrestler(id),target=document.getElementById('sumo-opponent-results');
  if(w&&target)target.innerHTML=opponentResults(w);
}
function activeProfileSection(name){
  document.querySelectorAll('[data-profile-section]').forEach(a=>{
    if(a.dataset.profileSection===name)a.setAttribute('aria-current','location');
    else a.removeAttribute('aria-current');
  });
  const sel=document.getElementById('sumo-profile-section');
  if(sel&&sel.value!==name)sel.value=name;
}
function navigateSection(name){
  const target=document.getElementById('sumo-'+name);
  if(!target)return;
  activeProfileSection(name);
  // Keep the canonical #profile/{id} route, not a competing #results hash route.
  const id=location.hash.slice(1).split('?')[0];
  history.replaceState(null,'','#'+id+'?section='+name);
  target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
function updateSectionFromScroll(){
  if(!location.hash.startsWith('#profile/'))return;
  const nodes=[...document.querySelectorAll('.sumo-section')];
  const selected=nodes.filter(x=>x.getBoundingClientRect().top<=110).at(-1)||nodes[0];
  if(selected)activeProfileSection(selected.id.replace('sumo-',''));
}
window.addEventListener('scroll',updateSectionFromScroll,{passive:true});
document.addEventListener('input',ev=>{
  if(ev.target?.id==='sumo-search'){
    STATE.query=ev.target.value;STATE.visible=24;refreshDir();
  }
  if(ev.target?.id==='sumo-opponent-search'){
    STATE.opponentQuery=ev.target.value;STATE.h2hOpponentLimit=16;refreshOpponents();
  }
});
document.addEventListener('change',ev=>{
  const t=ev.target;
  if(t?.id==='sumo-period'){
    STATE.profilePeriod=t.value;
    if(t.value==='all'&&!STATE.h2hFull&&!STATE.h2hLoading&&!STATE.h2hLoadFailed)void loadCompleteH2h();
    render();
    document.getElementById('sumo-period')?.focus({preventScroll:true});
  }
  if(t?.id==='sumo-opponent-sort'){
    STATE.opponentSort=t.value;STATE.h2hOpponentLimit=16;refreshOpponents();
    document.getElementById('sumo-opponent-sort')?.focus({preventScroll:true});
  }
  if(t?.id==='sumo-profile-section')navigateSection(t.value);
});
document.addEventListener('click',ev=>{
  const h2hLink=ev.target.closest?.('a[href^="#headtohead/"]');
  if(h2hLink&&location.hash.startsWith('#profile/')){
    STATE.h2hReturn={hash:location.hash.split('?')[0],scrollY:window.scrollY,
      period:STATE.profilePeriod,mode:STATE.profileMode};
  }
  const jump=ev.target.closest?.('[data-profile-section]');
  if(jump){ev.preventDefault();navigateSection(jump.dataset.profileSection);return;}
  const last=ev.target.closest?.('[data-result-link]');
  if(last){
    ev.preventDefault();STATE.profileMode='bouts';
    STATE.profilePeriod=last.dataset.resultPeriod===String(details().bashoId)?'current':last.dataset.resultPeriod;
    render();
    document.getElementById('sumo-bout-'+last.dataset.resultLink)?.scrollIntoView({block:'center'});
    document.getElementById('sumo-bout-'+last.dataset.resultLink)?.querySelector('a')?.focus({preventScroll:true});
    return;
  }
  const el=ev.target.closest?.('[data-directory-division],[data-more-rikishi],[data-fewer-rikishi],[data-banzuke-division],[data-basho-division],[data-day],[data-jump-day],[data-profile-limit],[data-h2h-order],[data-h2h-more],[data-h2h-fewer],[data-results-mode],[data-rank-range],[data-rank-ladder],[data-h2h-retry],[data-opponent-retry]');
  if(!el)return;
  if(el.dataset.directoryDivision){STATE.division=el.dataset.directoryDivision;STATE.visible=24;refreshDir();}
  if(el.hasAttribute('data-more-rikishi')){
    const before=STATE.visible;STATE.visible+=24;refreshDir();
    document.querySelectorAll('#directory-results .directory-card')[before]?.focus({preventScroll:true});
  }
  if(el.hasAttribute('data-fewer-rikishi')){
    STATE.visible=24;refreshDir();
    document.querySelector('[data-more-rikishi]')?.focus({preventScroll:true});
  }
  if(el.dataset.banzukeDivision){STATE.banzukeDivision=el.dataset.banzukeDivision;render();}
  if(el.dataset.bashoDivision){STATE.bashoDivision=el.dataset.bashoDivision;STATE.day=null;render();}
  if(el.dataset.day||el.dataset.jumpDay){STATE.day=Number(el.dataset.day||el.dataset.jumpDay);render();}
  if(el.dataset.profileLimit){STATE.profileLimit=Number(el.dataset.profileLimit);render();}
  if(el.dataset.h2hOrder){STATE.h2hOldestFirst=el.dataset.h2hOrder==='oldest';render();}
  if(el.dataset.resultsMode){
    STATE.profileMode=el.dataset.resultsMode;render();
    document.querySelector('[data-results-mode="'+STATE.profileMode+'"]')?.focus({preventScroll:true});
  }
  if(el.dataset.rankRange){
    STATE.rankRange=el.dataset.rankRange;render();
    document.querySelector('[data-rank-range="'+STATE.rankRange+'"]')?.focus({preventScroll:true});
  }
  if(el.hasAttribute('data-rank-ladder')){
    STATE.fullRankLadder=!STATE.fullRankLadder;render();
    document.querySelector('[data-rank-ladder]')?.focus({preventScroll:true});
  }
  if(el.hasAttribute('data-h2h-more')){
    STATE.h2hOpponentLimit+=32;refreshOpponents();
    document.querySelector('[data-h2h-more],[data-h2h-fewer]')?.focus({preventScroll:true});
  }
  if(el.hasAttribute('data-h2h-fewer')){
    STATE.h2hOpponentLimit=16;refreshOpponents();
    document.querySelector('[data-h2h-more]')?.focus({preventScroll:true});
  }
  if(el.hasAttribute('data-h2h-retry')){
    STATE.h2hLoadFailed=false;void loadCompleteH2h();render();
  }
  if(el.hasAttribute('data-opponent-retry')){
    STATE.h2hOpponentsFailed=false;void loadOpponentIndex();refreshOpponents();
  }
});
let lastRoute=location.hash.slice(1).split('?')[0];
window.addEventListener('hashchange',()=>{
  const route=location.hash.slice(1).split('?')[0];
  if(route!==lastRoute&&route.startsWith('profile/')&&STATE.h2hReturn?.hash==='#'+route){
    STATE.profilePeriod=STATE.h2hReturn.period;
    STATE.profileMode=STATE.h2hReturn.mode;
  }else if(route!==lastRoute&&route.startsWith('profile/')){
    STATE.profilePeriod='current';STATE.profileMode='bouts';
    STATE.opponentQuery='';STATE.h2hOpponentLimit=16;
    STATE.rankRange='career';STATE.fullRankLadder=false;
  }
  lastRoute=route;STATE.h2hOldestFirst=false;render();
  if(route.startsWith('profile/')&&STATE.h2hReturn?.hash==='#'+route){
    const prior=STATE.h2hReturn.scrollY;
    requestAnimationFrame(()=>window.scrollTo({top:prior,behavior:'instant'}));
  }else window.scrollTo({top:0,behavior:'instant'});
});
async function loadJson(url){
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok)throw new Error('Cached Sumo data returned HTTP '+response.status);
  return response.json();
}
async function loadOpponentIndex(){
  STATE.h2hOpponentsLoading=true;
  try {
    const data=await loadJson('data/sumo/research-h2h-opponents.json');
    if(data?.schemaVersion!==1||data?.cohortSize!==190||data?.profileCount!==190||data.certified!==false||!data.profiles)
      throw new Error('Opponent index failed research cache checks');
    STATE.h2hOpponents=data;
  } catch(error){
    console.warn('Opponent index not synchronized:',error?.message||error);
    STATE.h2hOpponentsFailed=true;
  } finally {
    STATE.h2hOpponentsLoading=false;
    if(location.hash.startsWith('#profile/')||location.hash.startsWith('#headtohead/'))render();
  }
}
async function loadCompleteH2h(){
  STATE.h2hLoading=true;
  try {
    const result=await loadJson('data/sumo/research-h2h-history.json');
    if(result?.schemaVersion!==1||result?.cohortSize!==190||result?.certified!==false||!result.pairs)
      throw new Error('Full research chronology cache failed validation');
    STATE.h2hFull=result;
  } catch(error){
    console.warn('Source H2H chronology not yet synchronized:',error?.message||error);
    STATE.h2hLoadFailed=true;
  } finally {
    STATE.h2hLoading=false;
    if(location.hash.startsWith('#headtohead/')||(location.hash.startsWith('#profile/')&&STATE.profilePeriod==='all'))render();
  }
}
async function init(){
  try {
    const [roster,details,styles,photos,careerHistory,h2hSummary,readiness]=await Promise.all([loadJson('data/sumo/rikishi-index.json'),loadJson('data/sumo/preview-details.json'),loadJson('data/sumo/official-style-evidence.json'),loadJson('data/sumo/approved-photos.json'),loadJson('data/sumo/career-history.json'),
      loadJson('data/sumo/research-h2h-summary.json').catch(()=>null),loadJson('data/sumo/api-trusted-status.json')]);
    if(!Array.isArray(roster?.rikishi)||!Array.isArray(details?.featured)||roster?.count!==roster.rikishi.length) throw new Error('Sumo cache schema or roster total not valid');
    if((roster?.trackedDivisions||[]).join(',')!==DIVS.join(','))throw new Error('Sumo cache does not match the approved three-division scope');
    if(roster.rikishi.some(x=>!DIVS.includes(divisionOf(x.currentRank))))throw new Error('Out-of-scope division in Sumo index');
    if(styles?.schemaVersion!==1||!styles.byNskId)throw new Error('Official style evidence cache unavailable or malformed');
    if(photos?.schemaVersion!==1||!photos.bySourceId||typeof photos.bySourceId!=='object')throw new Error('Licensed Sumo photo manifest missing or malformed');
    if(careerHistory?.schemaVersion!==1||!careerHistory.bySourceId)throw new Error('Sumo career timeline snapshot invalid');
    if(h2hSummary&&(h2hSummary.schemaVersion!==1||h2hSummary.cohortSize!==190||h2hSummary.certified!==false))throw new Error('Research H2H summary failed schema validation');
    validateSumoPreviewReadiness(readiness,roster);
    STATE.roster=roster;STATE.details=details;STATE.officialStyles=styles;STATE.photoIndex=photos.bySourceId;STATE.careerHistory=careerHistory;STATE.h2hSummary=h2hSummary;STATE.apiTrust=readiness;
    render();
  } catch(error){
    STATE.error=error.message || 'Unable to load the preview dataset';
    render();
  }
}
init();
