import {
  SOURCE_URL, JSA_URL, DIVISIONS, bashoLabel, divisionOf, recordSummary,
  rankTable, leadingRikishi, currentDay, dailyResults, validMatchSamples, currentBashoMatchSample,
  techniqueDistribution, detailFor, banzukeFor, searchRikishi, snapshotDate
} from './sumo-data.mjs';

const ROOT = document.querySelector('#sumo-main');
const tabs = [...document.querySelectorAll('[data-page]')];
const DIVS = ['Makuuchi','Juryo','Makushita'];
const STATE = {
  roster: null, details: null, error: null, query: '', division: 'All',
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
    rows.slice(0,limit).map(x=>'<tr><td>'+wrestlerLink(x)+'</td><td>'+e(x.rank||'—')+'</td><td class="number-win">'+x.summary.win+'</td><td class="number-loss">'+x.summary.loss+'</td><td class="number-abs">'+x.summary.absence+'</td></tr>').join('') +
    '</tbody></table></div>';
}
function featureCard(w) {
  const ent=entryFor(w), s=recordSummary(ent?.record);
  return '<a href="#profile/'+w.sourceId+'" class="feature-card"><div class="feature-top">' +
    imageToken(w.currentRank,w.shikonaEn) +
    '<div class="feature-info"><span class="rank">'+e(w.currentRank)+'</span><h3>'+e(w.shikonaEn)+'</h3><small>'+e(w.heya||'Stable not supplied')+'</small></div></div>' +
    '<div class="feature-bottom"><span>'+e(divisionOf(w.currentRank))+'</span><span>'+(ent?e(s.win+'-'+s.loss+(s.absence?'-'+s.absence:'')):'RECORD NOT CACHED')+'</span></div></a>';
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
    imageToken(w.currentRank,w.shikonaEn)+'<div><small>'+e(divisionOf(w.currentRank))+'</small><h3>'+e(w.shikonaEn)+'</h3><small>'+e(w.shikonaJp||'')+'</small></div></div>' +
    '<div class="directory-lower"><div class="rank">'+e(w.currentRank||'Rank not supplied')+'</div>'+
    '<div class="detail">'+e(w.heya||'Stable not supplied')+' · '+e(w.birthplace||'Origin unavailable')+'</div>'+
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
    statTile(cur?cur.win+'-'+cur.loss+(cur.absence?'-'+cur.absence:''):'—','Current basho W–L–A')+
    statTile(Number.isInteger(wins)&&Number.isInteger(losses)?wins+'-'+losses:'—','Recorded career W–L · source sample')+
    statTile(s?.winsByDivision?.Makuuchi!==undefined && s?.lossByDivision?.Makuuchi!==undefined ?
       s.winsByDivision.Makuuchi+'-'+s.lossByDivision.Makuuchi:'—','Makuuchi W–L · source sample')+
    statTile(s?.yushoByDivision?.Makuuchi ?? '—','Makuuchi championships')+
    statTile(s?.basho ?? '—','Recorded basho · API stats')+
  '</div>';
}
function recordChart(item) {
  const s=recordSummary(item?.record);
  if(!item) return '<p class="missing">This rikishi’s current banzuke entry is not available.</p>';
  const list=Array.isArray(item.record)?item.record:[];
  const div=divisionOf(item.rank);
  const labelled=div==='Makushita'?'BOUT':'DAY';
  return '<div class="results-grid">'+list.map((r,i)=>{
    const outcome=String(r.result||'pending').toLowerCase();
    const cl=outcome==='win'?'win':outcome==='loss'?'loss':'pending';
    return '<div class="result-item"><div class="result-head"><span>'+labelled+' '+(i+1)+'</span><span class="outcome '+cl+'">'+e(outcome.toUpperCase())+'</span></div>'+
      '<span class="opponent">'+e(r.opponentShikonaEn||'—')+'</span><span class="method">'+e(r.kimarite||'No technique listed')+'</span></div>';
  }).join('')+'</div>' +
  '<p class="footnote">Current banzuke record: '+s.win+' W / '+s.loss+' L / '+s.absence+' absences. '+(div==='Makushita'?'Lower division bout sequence is shown; exact calendar day is not inferred.':'Completed result entries only; future days may be unavailable.')+'</p>';
}
function profileResults(w, limit) {
  const enriched=detailFor(details(),w.sourceId);
  const sourced=validMatchSamples(enriched,w.sourceId);
  const matches=sourced.length ? sourced : currentBashoMatchSample(entryFor(w),details().bashoId);
  if(!matches.length) return '<p class="missing">No completed opponent records are available for this rikishi in the current snapshot. Missing results are not inferred.</p>';
  const subset=matches.slice(0,limit);
  const link=x=>Number.isSafeInteger(x.opponentId)&&x.opponentId>0&&wrestler(x.opponentId)
    ?'<a class="method" href="#profile/'+x.opponentId+'">Opponent profile ↗</a>'
    :'<span class="method">Opponent profile outside current tracked cohort</span>';
  const label=x=>x.day?'Day '+x.day:(x.boutSequence?'Bout '+x.boutSequence:'Day unavailable');
  const maxNext=limit===5?10:18;
  return '<div class="results-grid">'+subset.map(x=>
    '<div class="result-item"><div class="result-head"><span>'+e(bashoLabel(x.bashoId))+' · '+e(label(x))+'</span><span class="outcome '+x.outcome+'">'+e(x.outcome.toUpperCase())+'</span></div>'+
    '<span class="opponent">'+e(x.opponent)+'</span>'+link(x)+'<p class="method">'+e(x.isFusen?'Fusen (forfeit)':x.kimarite||'Technique not supplied')+'</p></div>'
  ).join('')+'</div>'+
  (matches.length>limit?'<div class="more-wrap"><button class="btn light" data-profile-limit="'+maxNext+'">VIEW LATEST '+Math.min(maxNext,matches.length)+' CACHED BOUTS</button></div>':'')+
  '<p class="footnote">'+(sourced.length
    ?'Only '+matches.length+' recent bout records were fetched for this featured rikishi. These are not the complete career history.'
    :'Current '+e(bashoLabel(details().bashoId))+' banzuke only: '+matches.length+' completed bouts with recorded opponents. The dates of Makushita bouts are not inferred from their sequence.')+'</p>';
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
  const item=entryFor(w), r=recordSummary(item?.record), s=detailStats(w), enriched=detailFor(details(),w.sourceId);
  const perf=detailFor(details(),w.sourceId)?'Featured sample data available':'Career data collection pending';
  const pct=r.win+r.loss?Math.round(r.win/(r.win+r.loss)*100):0;
  const officialId=Number(w.officialNskId);
  const officialLink=Number.isSafeInteger(officialId)&&officialId>0
    ?'<a href="https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+officialId+'/" target="_blank" rel="noopener noreferrer">JSA OFFICIAL RIKISHI PROFILE ↗</a>'
    :'<a href="'+JSA_URL+'" target="_blank" rel="noopener noreferrer">JSA OFFICIAL WRESTLER DIRECTORY ↗</a>';
  const meta=[
    ['Stable (heya)',w.heya],['Birthplace',w.birthplace],['Height',Number.isFinite(w.heightCm)?w.heightCm+' cm':null],
    ['Weight',Number.isFinite(w.weightKg)?w.weightKg+' kg':null],
    ['Date of birth',dateOnly(w.birthDate)],['Professional debut',bashoLabel(w.debutBasho)]
  ];
  const cards=meta.map(([k,v])=>'<div><span>'+e(k)+'</span><strong>'+loc(v)+'</strong></div>').join('');
  const honors=[];
  if(s?.yusho!==undefined) honors.push([s.yusho,'Division championships recorded']);
  for(const [name,n] of Object.entries(s?.sansho||{})) honors.push([n,name+' awards']);
  const honHtml=honors.length?'<div class="tiles">'+honors.map(([val,label])=>statTile(val,label)).join('')+'</div>':'<div class="sumo-history">Awards and tournament titles will appear after full source-backed career collection and JSA reconciliation.</div>';
  return '<a class="back-link" href="#rikishi">← ALL RIKISHI</a>'+
    '<section class="profile-hero">'+imageToken(w.currentRank,w.shikonaEn,true)+
    '<div class="profile-title"><div class="eyebrow" style="color:#f3c332">BEFN SUMO · '+e(divisionOf(w.currentRank))+'</div>'+
    '<h1>'+e(w.shikonaEn)+'</h1><div class="jp">'+e(w.shikonaJp||'')+'</div>'+
    '<div class="hero-rank">'+e(w.currentRank||'Rank not supplied')+'</div><div class="profile-meta">'+cards+'</div></div>'+
    '<div class="profile-current"><span class="tag">'+e(bashoLabel(details().bashoId))+' · CURRENT BASHO</span>'+
    '<div class="big-record">'+(item?r.win+'<span>–</span>'+r.loss+'<small>–'+r.absence+'</small>':'—')+'</div><p>'+e(perf)+' · W–L–A, current ranking only. '+(item?'':'Current banzuke record unavailable.')+'</p>'+
    '<div class="progress" aria-hidden="true"><div style="width:'+pct+'%"></div></div>'+
    '<p>Current tournament results · snapshot, not live</p></div></section>'+
    '<div class="official-source-link">'+officialLink+'<span>BEFN is independent of the Japan Sumo Association.</span></div>'+
    formatStats(w,item?r:null)+
    heading('Latest tournament · source-backed','Basho performance')+
    (item?recordChart(item):'<p class="missing">No current tournament data cached.</p>')+
    heading('Scouting · verified sample only','Winning techniques')+
    '<div class="columns"><section class="panel"><div class="panel-head"><h3>Kimarite usage</h3><span>RECENT BOUT SAMPLE</span></div><div class="panel-body">'+profileTechniques(w)+'</div></section>'+
    '<section class="panel"><div class="panel-head"><h3>Technical profile</h3><span>NO UNVERIFIED RATING</span></div><div class="panel-body"><p><strong>Stylistic identity:</strong> Not classified from the available sample. Official signature manoeuvres and longer-term style observations require separate verification.</p>'+
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
  if(lower) return note('Makushita wrestlers compete across 15 days but do not fight every day. This preview shows their recorded bout sequence in the banzuke, not a fabricated daily schedule.');
  const day = STATE.day===null ? maxday : Math.min(maxday,Math.max(1,STATE.day));
  if (!maxday) return '<p class="missing">No recorded completed tournament days.</p>';
  const results=dailyResults(data,day);
  return '<div class="day-select" role="group" aria-label="Basho day">' +
    Array.from({length:maxday},(_,i)=>'<button type="button" data-day="'+(i+1)+'" class="'+(day===i+1?'active':'')+'" aria-pressed="'+(day===i+1)+'">'+(i+1)+'</button>').join('')+'</div>'+
    '<div class="bout-list">'+(results.length?results.map(r=>'<div class="bout"><span class="name '+(r.winnerId===r.rikishiId?'winner':'')+'"><a href="#profile/'+r.rikishiId+'">'+e(r.rikishi)+'</a></span><span class="vs">VS</span>'+
      '<span class="name '+(r.winnerId===r.opponentId?'winner':'')+'"><a href="#profile/'+r.opponentId+'">'+e(r.opponent)+'</a></span>'+
      '<span class="kim">Winner: '+e(r.winner||'Not supplied')+' · '+e(r.kimarite||'Winning technique not supplied')+'</span></div>').join(''):'<p class="missing">No completed matches for this day in this snapshot.</p>')+'</div>'+
    '<p class="footnote">Recorded results on day '+day+' · based on the cached banzuke; not a live event feed.</p>';
}
function renderBasho() {
  const d=STATE.bashoDivision, data=getBanzuke(d), rows=data?leadingRikishi(data,20):[];
  const target=details().basho?.data;
  const lastday=data?currentDay(data):0;
  return '<section class="basho-hero"><div><div class="eyebrow" style="color:#f3c332">GRAND SUMO · SIX TOURNAMENTS EACH YEAR</div>'+
    '<h1>'+e(bashoLabel(details().bashoId))+'</h1><p>'+e(target?.startDate?dateOnly(target.startDate):'Start date unavailable')+' – '+e(target?.endDate?dateOnly(target.endDate):'End date unavailable')+' · Japan · third-party source snapshot</p></div>'+
    '<div><span class="basho-day">'+(lastday?(d==='Makushita'?'BOUT '+lastday:'DAY '+lastday):'—')+'</span><p>'+(d==='Makushita'?'LONGEST RECORDED BOUT SEQUENCE':'LATEST RECORDED DAY')+'</p></div></section>'+
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
    const [roster,details]=await Promise.all([loadJson('data/sumo/rikishi-index.json'),loadJson('data/sumo/preview-details.json')]);
    if(!Array.isArray(roster?.rikishi)||!Array.isArray(details?.featured)||roster?.count!==roster.rikishi.length) throw new Error('Sumo cache schema or roster total not valid');
    if((roster?.trackedDivisions||[]).join(',')!==DIVS.join(','))throw new Error('Sumo cache does not match the approved three-division scope');
    if(roster.rikishi.some(x=>!DIVS.includes(divisionOf(x.currentRank))))throw new Error('Out-of-scope division in Sumo index');
    STATE.roster=roster;STATE.details=details;
    render();
  } catch(error){
    STATE.error=error.message || 'Unable to load the preview dataset';
    render();
  }
}
init();
