import {
  SOURCE_URL, JSA_URL, DIVISIONS, bashoLabel, divisionOf, recordSummary,
  rankTable, leadingRikishi, rankOrderedMatchups, currentDay, dailyResults, validMatchSamples, currentBashoMatchSample,
  techniqueDistribution, detailFor, banzukeFor, searchRikishi, snapshotDate,
  originCountry, banzukeMovement, dayMatchups, verifiedDayMatchups, lastCompletedBashoDay, verifiedHeadToHead, verifiedHighestRank,
  rankPositions, confirmedCareerHigh, publishedCurrentWeight
} from './sumo-data.mjs?v=20261116-ranked-matchups';
import { careerGraphs } from './sumo-editorial-charts.mjs?v=20261117-clean-profile-charts';
import { boutKey, mergeProfileBouts, filterAndSortOpponents, exactNamePriority } from './sumo-editorial-data.mjs';
import { validateSumoPreviewReadiness, wrestlerQuality } from './sumo-verification.mjs';
import { ageInJapan, nextDayForBasho, bashoDayForDate, h2hHistory, researchedHeadToHead, techniqueText } from './sumo-matchup.mjs';
import { dailyStats, dailyRecentMeetings, dailyDefaultDay, dailySelectedDate, dailyWinPercentage, heightFeetInches, highestRecordedDivision } from './sumo-daily.mjs?v=20261117-h2h-highest-division';
import { ordinalRank } from './sumo-career.mjs';
import { KIMARITE, renderKimariteGallery, hydrateKimariteGallery, linkKimariteMentions, setKimariteMediaManifest } from './sumo-kimarite-gallery.mjs?v=20261117-popup-translation-only';

const ROOT = document.querySelector('#sumo-main');
const tabs = [...document.querySelectorAll('[data-page]')];
const DIVS = ['Makuuchi','Juryo','Makushita'];
const STATE = {
  roster: null, details: null, careerHistory: null, officialStyles: null, photoIndex: null, apiTrust: null, divisionStats: null, error: null, query: '', division: 'All',
  visible: 24, directoryLayout: 'cards', bashoDivision: 'Makuuchi', bashoView: 'results', banzukeDivision: 'Makuuchi',
  day: null, matchupDivision: 'Makuuchi', matchupDay: null, homeLeaderDivision: 'Makuuchi', profileLimit: 5, h2hOldestFirst: false, h2hOpponentLimit: 16,
  profileMode: 'bouts', profilePeriod: 'current', rankRange: '2y', fullRankLadder: false,
  opponentQuery: '', opponentSort: 'meetings', h2hReturn: null,
  h2hSummary: null, h2hFull: null, h2hLoading: false, h2hLoadFailed: false,
  h2hOpponents: null, h2hOpponentsLoading: false, h2hOpponentsFailed: false
};
const TERMS = KIMARITE.map(x=>({term:x.name,label:x.english,detail:x.english}));

const e = (v) => String(v ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const number = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-AU') : '—';
const kebab = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9-]/g,'');
const cap = (v) => String(v ?? '').replace(/^./, x => x.toUpperCase());
const loc = (v) => v ? e(v) : 'Not available';
const dateOnly = (v) => {
  if (!v || !Number.isFinite(new Date(v).getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-AU', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(v));
};
function heading(label,title,more='',level='h2') {
  const tag=level==='h1'?'h1':'h2';
  return '<header class="section-head"><div><div class="eyebrow">'+e(label)+'</div><'+tag+'>'+e(title)+'</'+tag+'></div>'+more+'</header>';
}
/** One page header for every Sumo page: an uppercase title and, at most, one
 * line of context. Keeps pages consistent and puts content on the first screen. */
function pageHead(title,context='') {
  return '<header class="sumo-page-head"><h1>'+e(title)+'</h1>'+(context?'<p>'+e(context)+'</p>':'')+'</header>';
}
function note(text) { return '<p class="notice">'+e(text)+'</p>'; }
function richText(text) { return e(text).replace(/\n/g, '<br>'); }
function imageToken(rank, name, large=false) {
  return '<div class="profile-icon'+(large?' large':'')+'" role="img" aria-label="Illustrated silhouette placeholder; licensed wrestler photograph not available"><span aria-hidden="true">相</span></div>';
}

function flagMark(w) {
  const c=originCountry(w?.birthplace);
  // Visual flag only; accessible birthplace description remains available.
  return c?'<span class="sumo-country" title="Birthplace country: '+e(c.name)+'" aria-label="Birthplace country: '+e(c.name)+'"><span class="sumo-country-emoji" aria-hidden="true">'+c.flag+'</span></span>'
    :'<span class="sumo-country unknown" title="Birthplace country not supplied" aria-label="Birthplace country not supplied"><span aria-hidden="true">🌐</span></span>';
}
function flagBackdrop(w) {
  const c=originCountry(w?.birthplace);
  // Decoration only: never infer a flag for a missing or unrecognised source birthplace.
  // Country is mapped only from the source birthplace. The full-panel image is decorative; emoji is the offline fallback.
  return c?'<span class="sumo-flag-backdrop" style="--sumo-flag-url:url(https://flagcdn.com/w640/'+e(c.code.toLowerCase())+'.png)" aria-hidden="true">'+c.flag+'</span>':'';
}
/** Hero-only country flag. No emoji fallback: the country name remains accessible
 * text beside the rank and the image is strictly decorative. */
function heroFlagBackdrop(w){
  const country=originCountry(w?.birthplace);
  return country?'<span class="sumo-hero-flag" style="--sumo-flag-url:url(https://flagcdn.com/w640/'+
    e(country.code.toLowerCase())+'.png)" aria-hidden="true"></span>':'';
}
function portraitFor(w,size='sm',fallbackName=null){
  const photo=w && STATE.photoIndex?.[String(w.sourceId)];
  const valid=photo?.approved===true &&
    /^assets\/sumo-photos\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg)$/.test(String(photo.path||'')) &&
    typeof photo.license==='string' && photo.license.trim() &&
    typeof photo.credit==='string' && photo.credit.trim();
  const root='class="profile-icon sumo-photo '+e(size)+(size==='xl'?'':' sumo-headshot')+(valid?' has-photo':'')+'"';
  const name=w?.shikonaEn||fallbackName||'Unnamed rikishi';
  return '<div '+root+' role="img" aria-label="'+e(valid?'Photograph of '+name:'Portrait unavailable for '+name)+'">'+
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
  // Display the source precision, not a rounded API representation. The
  // canonical publishedCurrentWeight choice/review flag remains unchanged.
  const rawHeight=Number(w?.heightCm),rawKg=Number(w?.weightKg);
  const displayedHeight=listing.heightSource==='Sumo API roster listing'&&Number.isFinite(rawHeight)&&rawHeight>0
    ?rawHeight:listing.heightCm;
  const displayedKg=listing.source==='Sumo API roster listing'&&Number.isFinite(rawKg)&&rawKg>0
    ?rawKg:listing.kg;
  const h=Number.isFinite(displayedHeight)&&displayedHeight>0?displayedHeight+' cm':'—';
  const mass=displayedKg!==null?displayedKg+' kg':'—';
  return {h,mass,heightCm:displayedHeight,weightKg:displayedKg,heightSource:listing.heightSource,
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
function compactRank(rank) {
  const match=/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita)\s*(\d+)?\s*(East|West)?/i.exec(String(rank||''));
  if(!match)return String(rank||'—');
  const short={yokozuna:'Y',ozeki:'O',sekiwake:'S',komusubi:'K',maegashira:'M',juryo:'J',makushita:'Ms'}[match[1].toLowerCase()];
  return short+(match[2]||'')+(match[3]?match[3][0].toUpperCase():'');
}
function rankDirection(previous,current){
  const old=ordinalRank(previous),now=ordinalRank(current);
  if(old===null||now===null)return 'unavailable';
  return now<old?'up':now>old?'down':'same';
}
function priorBashoRecord(w){
  const id=Number(w?.sourceId);
  for(const div of DIVS){
    const b=previousBanzukeData()[div];
    if(!b)continue;
    const row=[...(b.east||[]),...(b.west||[])].find(x=>Number(x.rikishiID)===id);
    if(row){const summary=row.summary||(row.record!=null?recordSummary(row.record,div):null);
      if(summary && summary.win!=null && summary.loss!=null && Number.isFinite(Number(summary.win))&&Number.isFinite(Number(summary.loss)))
        return summary.win+' W · '+summary.loss+' L';
    }
  }
  return null;
}
function movementMarkup(w) {
  const id=Number(w?.sourceId);
  const current=rankPositions(currentBanzukeData());
  const previous=rankPositions(previousBanzukeData());
  const now=current?.get(id),old=previous?.get(id);
  if(!now)return '<span class="sumo-move unavailable">Current rank unavailable</span>';
  if(!old)return '<span class="sumo-move unavailable">Previous rank unavailable</span>';
  const shift=old.position-now.position;
  const direction=shift>0?'up':shift<0?'down':'same';
  const symbol=shift>0?'↑':shift<0?'↓':'↔';
  const title=old.rank+' → '+now.rank+' · '+(shift===0?'unchanged':Math.abs(shift)+' banzuke position'+(Math.abs(shift)===1?'':'s'));
  return '<span class="sumo-move '+direction+'" title="'+e(title)+'">'+symbol+' '+e(compactRank(old.rank))+' → '+e(compactRank(now.rank))+'</span>';
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
function techniqueMarkup(kimarite,text) {
  const term=TERMS.find(x=>x.term.toLowerCase()===String(kimarite||'').trim().toLowerCase());
  return term?'<a href="#kimarite?term='+kebab(term.term)+'" data-kimarite-term="'+e(kebab(term.term))+'" title="See '+e(term.term)+' in the kimarite guide">'+e(text)+'</a>':e(text);
}
function historyRowsMarkup(h2h,a,b,limit=5,reverse=false) {
  if(!h2h)return '<p class="missing">Head-to-head history is not yet available for this pairing.</p>';
  const rows=reverse?[...h2h.rows].reverse():h2h.rows;
  if(!rows.length)return '<p class="missing">No individually sourced historical bouts are cached for this pairing.</p>';
  return '<ol class="sumo-h2h-timeline">'+rows.slice(0,limit).map(m=>{
    const winner=headToHeadName(m.winnerId,a,b);
    return '<li class="sumo-h2h-bout"><span class="sumo-h2h-date">'+e(bashoLabel(m.bashoId))+' · Day '+e(m.day)+(m.eventType?' · '+e(m.eventType==='mae-zumo'?'Mae-zumo trial':'Playoff'):'')+'</span>'+
      '<span class="sumo-h2h-winner">Winner: '+e(winner)+'</span>'+
      '<span class="sumo-h2h-technique">'+e(techniqueText(m.kimarite))+'</span></li>';
  }).join('')+'</ol>';
}
function headToHeadPreview(a,b,h2h) {
  const link=headToHeadUrl(a,b);
  if(!h2h)return '<div class="sumo-h2h-preview"><p class="sumo-h2h-unavailable">Recorded meetings not available for this pair.</p>'+
    '<a class="sumo-h2h-link" href="'+link+'">Matchup details</a></div>';
  const shown=Math.min(5,h2h.rows.length);
  return '<div class="sumo-h2h-preview"><div class="sumo-h2h-title">Recent meetings ('+shown+' available)</div>'+
    historyRowsMarkup(h2h,a,b,5)+
    '<a class="sumo-h2h-link" href="'+link+'">View recorded series ('+h2h.total+')</a>'+
    (!h2h.complete?'<p class="footnote">Displaying '+shown+' individually sourced meeting'+(shown===1?'':'s')+' from '+h2h.total+' reported; full history may be incomplete.</p>':'')+
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
function fighterOnCard(w,id,label,opts) {
  const name=w?.shikonaEn||label||'Opponent';
  const link=w?'<a href="#profile/'+Number(w.sourceId)+'">'+e(name)+'</a>':'<span>'+e(name)+'</span>';
  // Head-to-head hero uses the approved style: plain country name plus a faded
  // flag behind the information column, not a small emoji beside the name.
  // The country comes only from the source birthplace; unknown shows nothing.
  const hero=opts&&opts.hero===true;
  const country=hero?originCountry(w?.birthplace):null;
  const mark=hero?(country?'<span class="sumo-hero-country">'+e(country.name)+'</span>':''):flagMark(w);
  return '<div class="sumo-match-person'+(hero?' has-flag-backdrop':'')+'">'+(hero?heroFlagBackdrop(w):'')+portraitFor(w,'md')+
    '<div class="sumo-match-identity"><div class="sumo-match-name">'+link+mark+'</div>'+bioLine(w)+'</div></div>';
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

/* Today's sourced matchups: a separate editorial view, not a replacement for
   the existing Basho results or the pair-specific career history page. */
function dailyFighterFacts(w,fallback,side){
  const name=w?.shikonaEn||fallback||'Rikishi not found';
  const country=w?originCountry(w.birthplace):null;
  const link=w?'<a href="#profile/'+Number(w.sourceId)+'">'+e(name)+'</a>':e(name);
  return '<div class="sumo-daily-facts '+side+'">'+flagBackdrop(w)+
    '<div class="sumo-daily-facts-content"><h2>'+link+'</h2>'+
    '<div class="sumo-daily-origin">'+(country?e(country.name):'Birthplace unavailable')+'</div>'+
    '<div class="sumo-daily-ranks"><strong>'+e(w?.currentRank||'Rank unavailable')+'</strong>'+
    '<small>Peak: '+e(w?knownHigh(w)||'Unavailable':'Unavailable')+'</small></div></div></div>';
}
function comparisonGrid(first,second,division=null) {
  const fact=w=>{
    if(!w)return null;
    const stats=detailStats(w),measure=weightHeight(w);
    const currentEntry=entryFor(w);
    const current=Array.isArray(currentEntry?.record)&&currentEntry.record.length>0
      ?recordSummary(currentEntry.record,divisionOf(w.currentRank)):null;
    const values=Object.fromEntries(dailyStats({
      currentRank:w.currentRank,highestRank:knownHigh(w),
      heightCm:measure.heightCm,weightKg:measure.weightKg,
      currentBashoWins:current?.win,currentBashoLosses:current?.loss,
      careerWins:stats?.totalWins,careerLosses:stats?.totalLosses,
      makuuchiWins:stats?.winsByDivision?.Makuuchi,
      makuuchiLosses:stats?.lossByDivision?.Makuuchi,
      juryoWins:stats?.winsByDivision?.Juryo,
      juryoLosses:stats?.lossByDivision?.Juryo,
      makushitaWins:stats?.winsByDivision?.Makushita,
      makushitaLosses:stats?.lossByDivision?.Makushita
    }));
    return {values,highest:highestRecordedDivision(stats)};
  };
  // Daily matchup cards supply their actual bout division. The career H2H page
  // passes no division, so each wrestler instead uses their highest division
  // with a source-backed W-L pair (Makuuchi first, then Juryo, etc.).
  const divisionScope=DIVS.includes(division)?division:null;
  const left=fact(first),right=fact(second);
  const sameTopDivision=!divisionScope&&left?.highest&&right?.highest&&
    left.highest.division===right.highest.division;
  const labelDivision=divisionScope||(sameTopDivision?left.highest.division:'Highest division');
  const displayDivision=scope=>scope==='Juryo'?'Jūryō':scope;
  const pair=(facts,label)=>facts?.values?.[label]||'Not available';
  const winsLosses=(facts,scope)=>{
    if(!facts||facts.values?.[scope+' wins']==='Not available'||
       facts.values?.[scope+' losses']==='Not available')return 'Not available';
    return facts.values[scope+' wins']+'–'+facts.values[scope+' losses'];
  };
  const topValue=(facts,isPercentage)=>{
    if(!facts?.highest)return 'Not available';
    const rankLabel=sameTopDivision?'':displayDivision(facts.highest.division)+' · ';
    return rankLabel+(isPercentage?facts.highest.percentage:facts.highest.record);
  };
  const scopedValue=(facts,isPercentage)=>divisionScope
    ?(isPercentage?pair(facts,divisionScope+' win %'):winsLosses(facts,divisionScope))
    :topValue(facts,isPercentage);
  const rows=[
    ['Height',f=>pair(f,'Height')],
    ['Weight',f=>pair(f,'Weight')],
    ['Current basho W–L',f=>winsLosses(f,'Current basho')],
    ['Career W–L',f=>winsLosses(f,'Career')],['Career win %',f=>pair(f,'Career win %')],
    [displayDivision(labelDivision)+' W–L',f=>scopedValue(f,false)],
    [displayDivision(labelDivision)+' win %',f=>scopedValue(f,true)]
  ];
  return '<div class="sumo-comparison" role="group" aria-label="Wrestler comparison, left and right values">'+
    '<div class="sumo-comparison-head"><span>'+e(first?.shikonaEn||'First wrestler')+'</span><span>Statistic</span><span>'+e(second?.shikonaEn||'Second wrestler')+'</span></div>'+
    rows.map(([label,formatter])=>'<div class="sumo-comparison-row"><strong>'+e(formatter(left))+'</strong><span>'+e(label)+'</span><strong>'+e(formatter(right))+'</strong></div>').join('')+
    '</div>';
}
function dailyMeetingMarkup(match,firstId,secondId){
  const history=headToHeadFor(firstId,secondId);
  const meetings=dailyRecentMeetings(history,firstId,secondId);
  if(!meetings.length)return '<div class="sumo-daily-history"><div class="sumo-daily-history-title">Recent meetings (0 available)</div>'+
    '<div class="sumo-daily-nohistory">Individual meeting history is not available for this pairing.</div></div>';
  const a=wrestler(firstId),b=wrestler(secondId);
  const tiles=meetings.map(m=>{
    const firstWon=m.winnerId===Number(firstId);
    const winner=firstWon?(a?.shikonaEn||'First wrestler'):(b?.shikonaEn||'Second wrestler');
    return '<div class="sumo-daily-meeting" title="'+
      e(winner+' · '+bashoLabel(m.bashoId)+' Day '+m.day+' · '+techniqueText(m.kimarite))+'">'+
      '<strong>Winner: '+e(winner)+'</strong><span>'+e(bashoLabel(m.bashoId))+' · Day '+m.day+'</span>'+
      '<em>'+e(techniqueText(m.kimarite))+'</em></div>';
  }).join('');
  return '<div class="sumo-daily-history"><div class="sumo-daily-history-title">Recent meetings ('+meetings.length+' available)</div>'+
    '<div class="sumo-daily-history-track" aria-label="'+meetings.length+' recent sourced meetings, newest first; scroll horizontally for more" tabindex="0">'+tiles+'</div></div>';
}
function renderDailyMatchups(){
  const division=STATE.matchupDivision,banzuke=getBanzuke(division);
  const startDate=details()?.basho?.data?.startDate||null;
  const jsToday=bashoDayForDate(new Date(),startDate);
  const today=Number.isInteger(jsToday)&&jsToday>=1&&jsToday<=15?jsToday:null;
  const announced=Number(details().announcedDay);
  const upcoming=getAnnouncedTorikumi(division,announced);
  const lastCompleted=banzuke?lastCompletedBashoDay(banzuke):0;
  const defaultDay=dailyDefaultDay({today,lastCompleted,announced,hasAnnounced:!!upcoming});
  const selected=Number.isInteger(STATE.matchupDay)?STATE.matchupDay:defaultDay;
  const day=Math.min(15,Math.max(1,selected));
  const pairing=banzuke?rankOrderedMatchups(banzuke,verifiedDayMatchups(banzuke,getAnnouncedTorikumi(division,day),{
    bashoId:details().bashoId,division,day
  })):[];
  const date=dailySelectedDate(startDate,day);
  const latestAction=!pairing.length&&lastCompleted&&day!==lastCompleted?
    '<button type="button" class="btn light" data-matchup-latest="'+lastCompleted+'">View latest results · Day '+lastCompleted+'</button>':'';
  const showingUpcoming=!!upcoming&&day===announced&&(!today||announced>today);
  const latestResults=banzuke&&lastCompleted?rankOrderedMatchups(banzuke,verifiedDayMatchups(banzuke,null,{
    bashoId:details().bashoId,division,day:lastCompleted
  })).filter(m=>m.finished):[];
  const resultsArchive=showingUpcoming&&latestResults.length?
    '<details class="sumo-latest-results"><summary>Day '+lastCompleted+' results · '+latestResults.length+' recorded bouts</summary>'+
    '<div class="sumo-compact-results">'+latestResults.map(compactBoutRow).join('')+'</div></details>':'';
  const dayTitle=showingUpcoming?'Upcoming head-to-heads':pairing.some(x=>x.finished)?'Results and head-to-heads':'Scheduled head-to-heads';
  return '<section class="sumo-daily-page">'+
    pageHead('Matchups',bashoLabel(details().bashoId)+' · '+division+' · Day '+day)+
    '<div class="sumo-daily-controls">'+divisionTabs(division,'data-matchup-division')+
    '<div class="sumo-daily-calendar"><label for="sumo-matchup-day">Day</label>'+
    '<select id="sumo-matchup-day">'+Array.from({length:15},(_,i)=>'<option value="'+(i+1)+'"'+(day===i+1?' selected':'')+'>Day '+(i+1)+'</option>').join('')+'</select>'+
    (lastCompleted&&day!==lastCompleted?'<button type="button" data-matchup-latest="'+lastCompleted+'">Results · Day '+lastCompleted+'</button>':'')+
    '</div></div>'+
    '<div class="sumo-daily-date"><strong>'+e(dayTitle)+' · Day '+day+'</strong>'+
    '<span>'+e(bashoLabel(details().bashoId))+(date?' · '+e(dateOnly(date)):'')+' · '+e(division)+'</span></div>'+
    '<div class="sumo-daily-grid">'+(pairing.length?pairing.map(dailyMatchupRow).join(''):
      '<div class="sumo-daily-empty">No confirmed pairings or completed results are cached for this division and selected day. '+latestAction+'</div>')+'</div>'+
    resultsArchive+
    '<details class="sumo-data-coverage"><summary>Data coverage and interpretation</summary><p>Win percentages are wins ÷ (wins + losses), excluding absences. Current basho is taken from the latest banzuke; all-time Makuuchi and Makushita records are sourced from Sumo API division statistics when available. Missing values are never zeroed. Historical records may use different source snapshots. <a href="sumo-photo-credits.html">Portrait credits</a>.</p></details>'+
    sourceFooter()+'</section>';
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
  return '<p class="footnote">Data snapshot: <strong>'+e(snapshotDate(details().dailyCollectedAt||details().collectedAt||STATE.roster?.collectedAt))+'</strong> · Third-party API records (not certified by the JSA). Source: <a target="_blank" rel="noopener noreferrer" href="'+SOURCE_URL+'">Sumo API</a> · Cross-check: <a target="_blank" rel="noopener noreferrer" href="'+JSA_URL+'">Japan Sumo Association</a>.</p>';
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
function standingsTable(rows,limit=10) {
  if (!rows?.length) return '<p class="missing">Current rankings are not available in the snapshot.</p>';
  const cards=rows.slice(0,limit).map(x=>{
    const id=Number(x.sourceId||x.rikishiID),w=wrestler(id);
    const title=x.shikonaEn||w?.shikonaEn||'Name unavailable';
    const rank=x.rank||w?.currentRank||'Rank not available';
    const summary=x.summary||recordSummary(x.record,divisionOf(rank));
    return '<a class="sumo-standings-row" role="listitem" href="#profile/'+id+'">'+
      (w?portraitFor(w,'sm',title):'<span class="sumo-standings-no-photo">No portrait</span>')+
      '<span class="sumo-standings-identity"><strong>'+e(title)+'</strong><small>'+e(rank)+'</small></span>'+
      '<span class="sumo-standings-record">'+recordLabels(summary)+'</span></a>';
  }).join('');
  return '<div class="sumo-standings-list" role="list" aria-label="Tournament standings with published rank and W-L-A">'+cards+'</div>';
}
/**
 * The home leader cards are sourced from the approved cached top-three
 * banzuke, recorded measurements, career stats and newest completed bout.
 */
function homeLeaderCard(row) {
  const id=Number(row.sourceId||row.rikishiID),w=wrestler(id);
  const name=row.shikonaEn||w?.shikonaEn||'Name unavailable';
  const rank=row.rank||w?.currentRank||'Rank unavailable';
  const summary=row.summary||recordSummary(row.record,divisionOf(rank));
  const measures=w?weightHeight(w):null;
  const height=typeof measures?.heightCm==='number'&&Number.isFinite(measures.heightCm)&&measures.heightCm>0
    ?heightFeetInches(measures.heightCm):'—';
  const weight=typeof measures?.weightKg==='number'&&Number.isFinite(measures.weightKg)&&measures.weightKg>0
    ?measures.weightKg+' kg':'—';
  const stats=w?detailStats(w):null;
  const knownCareer=Number.isSafeInteger(stats?.totalWins)&&stats.totalWins>=0&&
    Number.isSafeInteger(stats?.totalLosses)&&stats.totalLosses>=0;
  const career=knownCareer?number(stats.totalWins)+'–'+number(stats.totalLosses):'—';
  const entry=w?entryFor(w):null;
  const latest=entry?currentBashoMatchSample(entry,details().bashoId)[0]:null;
  const last=latest?
    '<div class="sumo-leader-last"><small>LAST COMPLETED · DAY '+e(latest.day)+'</small>'+
    '<span><b class="sumo-leader-outcome '+(latest.outcome==='win'?'win':'loss')+'">'+
    e(latest.outcome==='win'?'W':'L')+'</b> vs '+e(latest.opponent||'Opponent unavailable')+'</span>'+
    '<small>Kimarite: '+e(latest.kimarite?techniqueText(latest.kimarite):'Not recorded')+'</small></div>':
    '<div class="sumo-leader-last"><small>LATEST BOUT</small><span>Completed result not available</span></div>';
  return '<a class="sumo-standings-row sumo-leader-card" role="listitem" href="#profile/'+id+'">'+
    (w?portraitFor(w,'md',name):'<div class="sumo-standings-no-photo">Portrait unavailable</div>')+
    '<div class="sumo-leader-details"><div class="sumo-standings-identity"><strong>'+e(name)+'</strong><small>'+e(rank)+'</small></div>'+
    '<div class="sumo-standings-record">'+recordLabels(summary)+'</div>'+
    '<div class="sumo-leader-vitals"><span><small>HEIGHT</small><strong>'+e(height)+'</strong></span>'+
    '<span><small>WEIGHT</small><strong>'+e(weight)+'</strong></span></div>'+
    '<div class="sumo-leader-career"><small>RECORDED CAREER W–L</small><strong>'+e(career)+'</strong></div>'+
    last+'</div></a>';
}
function homeLeaderCards(division) {
  const data=getBanzuke(division),leaders=data?leadingRikishi(data,5):[];
  return leaders.length?'<div class="sumo-standings-list" role="list" aria-label="'+e(division)+
    ' tournament top five">'+leaders.map(homeLeaderCard).join('')+'</div>':
    '<p class="missing">No published '+e(division)+' leaders are available in this snapshot.</p>';
}
function homeLeaderTabs() {
  return '<div class="sumo-home-leader-controls" role="group" aria-label="Top five leaders by division">'+
    DIVS.map(d=>'<button type="button" class="pill '+(d===STATE.homeLeaderDivision?'active':'')+
      '" data-home-leader-division="'+d+'" aria-pressed="'+(d===STATE.homeLeaderDivision)+'">'+
      e(d==='Juryo'?'Jūryō':d)+'</button>').join('')+'</div>';
}
function refreshHomeLeaders() {
  const target=document.getElementById('sumo-home-leader-cards');
  if(target)target.innerHTML=homeLeaderCards(STATE.homeLeaderDivision);
  document.querySelectorAll('[data-home-leader-division]').forEach(el=>{
    const active=el.dataset.homeLeaderDivision===STATE.homeLeaderDivision;
    el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
  });
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
  const d=details(),b=getBanzuke('Makuuchi');
  const last=b?lastCompletedBashoDay(b):0;
  return '<section class="sumo-overview-lede"><div><div class="eyebrow">BEFN SUMO · TOURNAMENT DESK</div>'+
    '<h1>'+e(bashoLabel(d.bashoId))+'</h1><p>Recorded results through '+(last?'Day '+last:'an unavailable date')+
    ' · Snapshot '+e(snapshotDate(STATE.roster?.collectedAt))+' · Not live</p></div>'+
    '<a class="btn" href="#basho">Basho Centre</a></section>';
}
function renderHome() {
  const maku=getBanzuke('Makuuchi');
  const last=maku?lastCompletedBashoDay(maku):0;
  const bouts=maku&&last?rankOrderedMatchups(maku,verifiedDayMatchups(maku,getAnnouncedTorikumi('Makuuchi',last),
    {bashoId:details().bashoId,division:'Makuuchi',day:last})).filter(m=>m.finished):[];
  return previewHead()+
    '<div class="sumo-home-grid"><section class="sumo-home-results">'+
    heading('Latest available · Makuuchi','Day '+(last||'—')+' results','<a href="#basho">All results</a>')+
    (bouts.length?'<div class="sumo-compact-results">'+bouts.slice(0,7).map(compactBoutRow).join('')+'</div>':
      '<p class="missing">No completed results are available in this snapshot.</p>')+
    '<a class="sumo-inline-action" href="#matchups">Explore detailed matchups</a></section>'+
    '<section class="sumo-home-leaders">'+heading('Tournament standings','Five leaders','<a href="#basho" data-home-view-standings>View all standings</a>')+
    homeLeaderTabs()+'<div id="sumo-home-leader-cards" aria-live="polite">'+homeLeaderCards(STATE.homeLeaderDivision)+'</div></section></div>'+
    heading('Discover rikishi','Browse current ranks','<a href="#rikishi">Search all '+number(STATE.roster?.count)+' profiles</a>')+
    '<div class="sumo-home-feature">'+ranks().slice(0,4).map(featureCard).join('')+'</div>'+
    sourceFooter();
}
function directoryFacts(w){
  const record=entryFor(w),s=record?recordSummary(record.record,divisionOf(w.currentRank)):null;
  return '<div class="sumo-directory-facts"><span>Current basho: <b>'+e(s?s.win+' W · '+s.loss+' L':'Unavailable')+'</b></span></div>';
}
function directoryCard(w) {
  return '<a class="directory-card" href="#profile/'+w.sourceId+'"><div class="directory-upper">'+
    flagBackdrop(w)+portraitFor(w,'md',w.shikonaEn)+
    '<div class="sumo-directory-identity"><h3>'+e(w.shikonaEn)+'</h3><small>'+e(w.currentRank||'Rank unavailable')+'</small></div></div>'+
    '<div class="directory-lower"><div class="detail">'+e(w.heya||'Stable not supplied')+'</div>'+
    directoryFacts(w)+'<span class="cta">View rikishi profile</span></div></a>';
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
  const scoped=STATE.division==='All'?'all three divisions':STATE.division;
  const q=STATE.query.trim();
  const message='No matches in '+scoped+(q?' for “'+q+'”':'')+'.';
  const reset='<button type="button" class="btn light" data-directory-reset>Search all divisions</button>';
  return '<p class="directory-count" role="status" aria-live="polite">'+found.length+' matching current wrestler'+(found.length===1?'':'s')+' in '+e(scoped)+' · '+selected.length+' shown</p>'+
    '<div class="sumo-directory-layout" role="group" aria-label="Directory layout">'+
      '<button type="button" data-directory-layout="cards" aria-pressed="'+(STATE.directoryLayout==='cards')+'">Photo cards</button>'+
      '<button type="button" data-directory-layout="list" aria-pressed="'+(STATE.directoryLayout==='list')+'">Compact list</button></div>'+
    (selected.length?'<div class="directory-grid '+(STATE.directoryLayout==='list'?'is-list':'')+'">'+selected.map(directoryCard).join('')+'</div>':
      '<div class="sumo-empty-search">'+note(message)+reset+'</div>')+
    (found.length>STATE.visible?'<div class="more-wrap"><button type="button" class="btn light" data-more-rikishi>Show more ('+(found.length-STATE.visible)+' remain)</button></div>':'')+
    (STATE.visible>24?'<div class="more-wrap"><button type="button" class="btn light" data-fewer-rikishi>Show fewer</button></div>':'');
}
function renderDirectory() {
  return pageHead('Rikishi',number(STATE.roster?.count)+' wrestlers · Makuuchi, Jūryō and Makushita')+
    '<div class="filters"><input id="sumo-search" class="search" type="search" aria-label="Search wrestlers" placeholder="Search wrestler, stable or location…" value="'+e(STATE.query)+'" autocomplete="off"></div>'+
    '<div id="directory-filters">'+divisionTabs(STATE.division,'data-directory-division',true)+'</div>'+
    '<div id="directory-results">'+directoryResults()+'</div>'+sourceFooter();
}
function detailStats(w) {
  const enriched=detailFor(details(),w.sourceId);
  const fromApi=enriched?.stats?.status==='available'?enriched.stats.data:null;
  const cache=STATE.divisionStats?.bySourceId?.[String(w.sourceId)];
  const trustedCache=cache?.sourceId===Number(w.sourceId)&&cache?.shikonaEn===w.shikonaEn&&cache?.status==='available';
  // Merge source-listed division W/L without hiding unrelated API championship credentials.
  const stats=trustedCache?{...fromApi,...cache.stats}:fromApi;
  const research=STATE.h2hSummary?.profiles?.[String(w.sourceId)];
  return research?{...stats,totalWins:research.careerWins,totalLosses:research.careerLosses,
    totalMatches:research.careerWins+research.careerLosses,researchCareerSource:true}:stats;
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
    const unknownWins=all.filter(x=>/^(unknown|unrecorded)$/i.test(String(x.kimarite))).reduce((n,x)=>n+(Number(x.count)||0),0);
    const forfeitWins=all.filter(x=>/fusen/i.test(String(x.kimarite))).reduce((n,x)=>n+(Number(x.count)||0),0);
    const bar=x=>{const n=Number(x.count),pct=denominator?(n/denominator*100).toFixed(1):'0.0';
      return '<div class="chart-row"><span class="name">'+e(x.kimarite)+'</span><div class="bar-bg" role="meter" aria-label="'+e(x.kimarite)+' '+n+' of '+denominator+' named winning techniques" aria-valuemin="0" aria-valuemax="'+denominator+'" aria-valuenow="'+n+'"><div style="width:'+pct+'%"></div></div>'+
        '<strong>'+n+' · '+pct+'%</strong></div>';};
    return '<p class="footnote">'+denominator+' named non-forfeit winning results recorded in the source career ledger. '+(unknownWins?'Unrecorded techniques: '+unknownWins+'. ':'')+(forfeitWins?'Forfeit wins excluded: '+forfeitWins+'. ':'')+'Missing data are never zero.</p>'+
      filtered.slice(0,5).map(bar).join('')+
      (filtered.length>5?'<details class="sumo-tech-more"><summary>Show all '+filtered.length+' named technique rows</summary>'+
        filtered.slice(5).map(bar).join('')+'</details>':'')+
      '<p class="footnote">Source-trusted research records, not independent bout-by-bout certification. <a href="#kimarite">Kimarite reference</a>.</p>';
  }
  const enriched=detailFor(details(),w.sourceId),direct=Array.isArray(enriched?.matches?.data?.records)?enriched.matches.data.records:[];
  const fallback=currentBashoMatchSample(entryFor(w),details().bashoId)
    .filter(x=>x.outcome==='win').map(x=>({winnerId:w.sourceId,kimarite:x.kimarite}));
  const dist=techniqueDistribution(direct.length?direct:fallback,w.sourceId);
  if(!dist.sampleWins)return '<p class="missing">No supported, non-forfeit winning-technique breakdown is available for this period.</p>';
  const row=x=>'<div class="chart-row"><span class="name">'+e(x.technique)+'</span><div class="bar-bg" role="meter" aria-label="'+e(x.technique)+' '+x.percentage+' percent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+x.percentage+'"><div style="width:'+x.percentage+'%"></div></div><strong>'+Number(x.percentage).toFixed(1)+'%</strong></div>';
  return '<p class="footnote">'+dist.sampleWins+' wins with named techniques · '+e(direct.length?'recent cached sample':'current tournament')+' · not full career statistics.</p>'+
    dist.techniques.slice(0,5).map(row).join('')+
    (dist.techniques.length>5?'<details class="sumo-tech-more"><summary>Show all '+dist.techniques.length+' techniques</summary>'+dist.techniques.slice(5).map(row).join('')+'</details>':'');
}
function resultKey(row) {return boutKey(row);}
function currentProfileBouts(w) {
  const entry=entryFor(w),date=details().bashoId;
  const division=divisionOf(w.currentRank);
  const completed=(entry?.record||[]).flatMap((rec,i)=>{
    const status=String(rec?.result||'').toLowerCase();
    if(['absent','absence','kyujo'].includes(status)&&division!=='Makushita')
      return [{bashoId:date,day:i+1,opponentId:null,opponent:null,outcome:'absence',
        kimarite:null,scope:'Source-recorded upper-division absence; no bout or opponent inferred'}];
    if(!['win','loss'].includes(status))return [];
    const opponentId=Number(rec.opponentID);
    if(!Number.isSafeInteger(opponentId)||opponentId<1)return [];
    return [{bashoId:date,day:i+1,opponentId,opponent:rec.opponentShikonaEn||wrestler(opponentId)?.shikonaEn||'Opponent',
      outcome:status,kimarite:rec.kimarite||null,scope:'Current banzuke result'}];
  });
  const next=Number(details().announcedDay);
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
    // Keep playoffs and trial bouts available, separately from the regular career W–L.
    for(const m of pair.special||[]){
      if(!Array.isArray(m)||m.length<7||![a,b].includes(Number(m[2])))continue;
      rows.push({bashoId:String(m[0]),day:Number(m[1]),opponentId,
        opponent:headToHeadName(opponentId,id,opponentId),outcome:Number(m[2])===id?'win':'loss',
        kimarite:m[3]||null,matchNo:m[5]||null,eventType:String(m[6]),
        scope:'API non-regular meeting · excluded from regular career W–L'});
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
  const outcome=String(row.outcome||'').toLowerCase(),absence=outcome==='absence';
  const label=outcome==='win'?'W':outcome==='loss'?'L':outcome==='scheduled'?'Scheduled':absence?'A':'Not available';
  const technique=outcome==='scheduled'?'Result pending':absence?'Source-recorded absence — no bout':row.kimarite?techniqueText(row.kimarite):'Technique unavailable';
  const name=absence?'No opponent — recorded absence':opponent?.shikonaEn||row.opponent||'Opponent unavailable';
  const h2h=absence?null:headToHeadFor(w.sourceId,id);
  const personal=opponent?bioLine(opponent):absence?'No opponent is assigned to a sourced absence.':'Only the opponent identity is available in this snapshot.';
  return '<article class="sumo-ed-row" id="sumo-bout-'+e(resultKey(row))+'">'+
    '<div class="sumo-ed-row-main"><div class="sumo-ed-date"><strong>Day '+e(row.day||'N/A')+'</strong><small>'+e(bashoLabel(row.bashoId))+'</small></div>'+
    '<div class="sumo-ed-result '+e(outcome)+'">'+e(label)+'</div>'+
    '<div class="sumo-ed-person">'+portraitFor(opponent,'sm')+
    (opponent?'<a href="#profile/'+id+'">'+e(name)+'</a>':'<span>'+e(name)+'</span>')+'</div>'+
    '<div class="sumo-ed-rank"><span>'+e(opponent?.currentRank||'Not available')+'</span></div>'+
    '<div class="sumo-ed-tech">'+(row.eventType?'<small>'+e(row.eventType)+' · non-regular</small>':'')+techniqueMarkup(row.kimarite,technique)+'</div>'+
    '<div class="sumo-ed-h2h">'+(absence?'No H2H':'<a href="'+headToHeadUrl(w.sourceId,id)+'" aria-label="Head to head: '+e(w.shikonaEn)+' versus '+e(name)+'">H2H '+e(h2h?h2h.wins+'–'+h2h.losses:'↗')+'</a>')+'</div></div>'+
    '<details class="sumo-ed-extra"><summary>Details</summary><div class="sumo-details-grid">'+personal+
    '<span>Source: '+e(row.scope)+'</span><span>Completed result: '+e(outcome==='scheduled'?'No — confirmed scheduled pairing':absence?'No — recorded absence':'Yes')+'</span></div></details></article>';
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

function careerInfoTile(label,value,extra=''){
  return '<div class="sumo-career-data-tile"><small>'+e(label)+'</small><strong>'+
    e(value===null||value===undefined||value===''?'Not available':value)+'</strong>'+
    (extra?'<span>'+e(extra)+'</span>':'')+'</div>';
}
function careerDivisionTiles(stats){
  const wins=stats?.winsByDivision||{}, losses=stats?.lossByDivision||{};
  const priorities=['Makuuchi','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi'];
  const rank=key=>{const i=priorities.indexOf(key);return i<0?99:i;};
  const keys=[...new Set([...Object.keys(wins),...Object.keys(losses)])]
    .sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));
  const valid=keys.filter(k=>Number.isSafeInteger(wins[k])&&Number.isSafeInteger(losses[k])&&
    wins[k]>=0&&losses[k]>=0);
  return valid.length?valid.map(k=>careerInfoTile(k==='Juryo'?'Jūryō':k,
    wins[k]+' W – '+losses[k]+' L',dailyWinPercentage(wins[k],losses[k])||'')).join(''):
    '<p class="sumo-career-empty">Division records not available.</p>';
}
function careerPrizeTiles(stats){
  const prizes=Object.entries(stats?.sansho||{}).filter(([k,v])=>
    k&&v!==null&&v!==undefined&&String(v).trim()!=='');
  return prizes.length?prizes.map(([k,v])=>careerInfoTile(k,v)).join(''):
    '<p class="sumo-career-empty">Prize details not available.</p>';
}
function recentBashoTimeline(w){
  const history=STATE.careerHistory?.bySourceId?.[String(w.sourceId)]?.rank||[];
  const rows=history.filter(x=>x&&x.basho&&x.rank).slice().sort((a,b)=>String(b.basho).localeCompare(String(a.basho))).slice(0,6);
  if(!rows.length)return '<p class="missing">Historical rankings not available in the current cache.</p>';
  return '<div class="sumo-basho-timeline">'+rows.map((row,index)=>{
    const older=rows[index+1];
    const direction=older?rankDirection(older.rank,row.rank):'same';
    const cls=direction==='up'?' is-promotion':direction==='down'?' is-demotion':'';
    const movement=direction==='up'?'Promotion':direction==='down'?'Demotion':older?'Unchanged':'Oldest recorded rank';
    const bouts=profileBouts(w).filter(x=>String(x.bashoId)===String(row.basho));
    const completed=bouts.filter(x=>x.outcome==='win'||x.outcome==='loss');
    const record=completed.length===15?'<small>'+e(completed.filter(x=>x.outcome==='win').length+' W · '+completed.filter(x=>x.outcome==='loss').length+' L')+'</small>':'';
    return '<div class="sumo-basho-history-item'+cls+'" aria-label="'+e(bashoLabel(row.basho)+' · '+row.rank+' · '+movement)+'"><strong>'+e(bashoLabel(row.basho))+'</strong><span>'+e(row.rank)+'</span>'+record+'</div>';
  }).join('')+'</div>';
}
function recentTenStrip(w){
  const matches=profileBouts(w).filter(x=>x.outcome==='win'||x.outcome==='loss').slice(0,10);
  const wins=matches.filter(x=>x.outcome==='win').length,losses=matches.length-wins;
  const summary=matches.length?'<span class="sumo-recent-record"><b>'+wins+' W</b> · <b>'+losses+' L</b></span>':'';
  const cards=matches.map(row=>{
    const opponent=wrestler(row.opponentId);
    const name=opponent?.shikonaEn||row.opponent||'Opponent unavailable';
    const technique=row.kimarite?techniqueText(row.kimarite):'Not recorded';
    return '<a class="sumo-recent-bout '+e(row.outcome)+'" data-result-link="'+e(resultKey(row))+'" data-result-period="'+e(row.bashoId)+
      '" href="#profile/'+Number(w.sourceId)+'?result='+e(resultKey(row))+'" aria-label="'+
      e((row.outcome==='win'?'Win':'Loss')+' versus '+name+' · '+bashoLabel(row.bashoId)+' · Day '+(row.day??'unknown')+' · '+technique)+'">'+
      '<span class="sumo-recent-portrait">'+portraitFor(opponent,'sm',name)+'</span>'+
      '<span class="sumo-recent-info">'+
      (opponent?flagBackdrop(opponent):'')+
      '<strong class="sumo-recent-person">'+e(name)+'</strong>'+
      '<span class="sumo-recent-result-line"><b class="sumo-recent-outcome">'+(row.outcome==='win'?'W':'L')+'</b>'+
      '<span class="sumo-recent-day">'+e('Day '+(row.day??'—'))+'</span></span>'+
      '<small class="sumo-recent-technique">'+e(technique)+'</small></span></a>';
  }).join('');
  return '<section class="sumo-recent-strip" aria-label="Recent performance">'+
    '<header class="sumo-recent-header"><h2>Recent form</h2><span>Last '+matches.length+' recorded bouts</span></header>'+
    (matches.length?'<div class="sumo-recent-summary">'+summary+
      '<span>Newest first</span></div>'+
      '<div class="sumo-recent-carousel"><div class="sumo-recent-list" id="sumo-recent-track" role="group" aria-label="Ten most recent recorded completed bouts, when available">'+cards+'</div></div>':
      '<p class="missing">No completed source-backed bouts available.</p>')+'</section>';
}
function summaryStat(value,label){return '<div class="sumo-summary-stat"><strong>'+e(value===null||value===undefined?'Not available':value)+'</strong><span>'+e(label)+'</span></div>';}
function sectionHead(id,label,title){return '<section class="sumo-section" id="sumo-'+id+'">'+heading(label,title);}
function sectionNav(id){
  const parts=[['results','Results'],['career','Career'],['charts','Analysis'],['opponents','Opponents']];
  const secondary=[['techniques','Techniques']];
  return '<nav class="sumo-section-nav" aria-label="On this profile">'+parts.map(([key,label])=>
    '<a href="#profile/'+id+'?section='+key+'" data-profile-section="'+key+'">'+label+'</a>').join('')+
    '<details class="sumo-profile-more"><summary>More</summary>'+secondary.map(([key,label])=>
      '<a href="#profile/'+id+'?section='+key+'" data-profile-section="'+key+'">'+label+'</a>').join('')+'</details></nav>'+
    '<div class="sumo-section-menu"><label>On this profile <select id="sumo-profile-section">'+
    [...parts,...secondary].map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label></div>';
}
function renderProfile(id) {
  const w=wrestler(id);
  if(!w)return '<a class="back-link" href="#rikishi">← All rikishi</a>'+note('Wrestler not in the tracked snapshot.');
  const item=entryFor(w),r=item?recordSummary(item.record,divisionOf(w.currentRank)):null,s=detailStats(w);
  const current=weightHeight(w),age=ageInJapan(w.birthDate);
  const country=originCountry(w.birthplace);
  const style=STATE.officialStyles?.byNskId?.[String(w.officialNskId)];
  const styleOkay=style&&Number(style.sumoApiId)===Number(w.sourceId)&&Array.isArray(style.signature)&&
    /^https:\/\/www\.sumo\.or\.jp\/EnSumoDataRikishi\/profile\/\d+\/$/.test(style.sourceUrl);
  const fact=(label,value,extra='')=>'<div><span>'+e(label)+'</span><strong>'+e(value===null||value===undefined?'Not available':value)+'</strong>'+
    (extra?'<span>'+e(extra)+'</span>':'')+'</div>';
  const wins=Number.isInteger(s?.totalWins)?s.totalWins:null;
  const losses=Number.isInteger(s?.totalLosses)?s.totalLosses:null;
  const mWins=s?.winsByDivision?.Makuuchi,mLosses=s?.lossByDivision?.Makuuchi;
  const career=wins!==null&&losses!==null?wins+'–'+losses:'Not available';
  const maku=Number.isInteger(mWins)&&Number.isInteger(mLosses)?mWins+'–'+mLosses:'Not available';
  const careerPercent=dailyWinPercentage(wins,losses)||'Not available';
  const makuPercent=dailyWinPercentage(mWins,mLosses)||'Not available';
  const titleCount=s?.yushoByDivision?.Makuuchi;
  const currentBlock=r?'<div class="sumo-current-record"><span><b>'+r.win+'</b><small>Wins</small></span>'+
    '<span><b>'+r.loss+'</b><small>Losses</small></span><span><b class="'+(r.absence===null?'unavailable':'')+'">'+e(r.absence===null?'N/A':r.absence)+'</b><small>'+
    e(r.absence===null?'Absences not supplied':'Absences')+'</small></span></div>':
    '<p>Current tournament record not available.</p>';
  return '<a class="back-link" href="#rikishi">← Rikishi directory</a>'+
    '<section class="profile-hero">'+portraitFor(w,'xl')+heroFlagBackdrop(w)+
    '<div class="profile-title"><div class="eyebrow">BEFN SUMO · '+e(divisionOf(w.currentRank))+'</div>'+
    '<h1>'+e(w.shikonaEn)+'</h1><div class="jp">'+e(w.shikonaJp||'')+'</div>'+
    '<div class="sumo-hero-rank"><strong>'+e(w.currentRank||'Rank not available')+'</strong>'+
    (country?'<span class="sumo-hero-country">'+e(country.name)+'</span>':'')+'</div>'+
    '<div class="sumo-hero-peak">Peak rank: <strong>'+e(knownHigh(w)||'Not available')+'</strong></div>'+
    '<div class="sumo-hero-career"><div><span>Scope</span><span>Wins–losses</span><span>Win %</span></div>'+
    '<div><strong>Career</strong><b>'+e(career)+'</b><b>'+e(careerPercent)+'</b></div>'+
    '<div><strong>Makuuchi</strong><b>'+e(maku)+'</b><b>'+e(makuPercent)+'</b></div></div>'+ 
    '</div><div class="profile-current"><span class="tag">'+e(bashoLabel(details().bashoId))+' · SNAPSHOT · NOT LIVE</span>'+
    currentBlock+(divisionOf(w.currentRank)==='Makushita'?'<p class="footnote">Makushita non-bout days are not absences.</p>':'')+'</div>'+
    '<div class="profile-facts profile-meta">'+fact('Stable',w.heya)+fact('Age',age===null?'Not available':age+' years')+
    fact('Height',current.h==='—'?'Not available':current.h+' · '+heightFeetInches(current.heightCm))+
    fact('Weight · undated',current.mass==='—'?'Not available':current.mass)+'</div></section>'+
    sectionNav(w.sourceId)+recentTenStrip(w)+
    sectionHead('results','Tournament and career ledger','Results')+resultDesk(w)+'</section>'+
    sectionHead('career','Historical context','Career')+
    '<div class="sumo-career-strip" aria-label="Career tournament and championship totals"><div><span>Basho</span><strong>'+e(s?.basho??'Not available')+'</strong></div>'+
    '<div><span>Makuuchi Championships</span><strong>'+e(titleCount??'Not available')+'</strong></div></div>'+
    '<div class="sumo-career-detail-section"><h3>Biography</h3><div class="sumo-career-data-grid">'+
    careerInfoTile('Born',dateOnly(w.birthDate))+
    careerInfoTile('Birthplace',w.birthplace||'Not available')+
    careerInfoTile('Professional debut',w.debutBasho?bashoLabel(w.debutBasho):'Not available')+
    careerInfoTile('Stable',w.heya||'Not available')+'</div></div>'+
    '<div class="sumo-career-detail-section"><h3>Division records</h3><div class="sumo-career-data-grid">'+careerDivisionTiles(s)+'</div></div>'+
    '<div class="sumo-career-detail-section"><h3>Prizes</h3><div class="sumo-career-data-grid">'+careerPrizeTiles(s)+'</div></div>'+
    '<div class="sumo-career-detail-section"><h3>Last six banzuke positions</h3>'+recentBashoTimeline(w)+'</div></section>'+
    sectionHead('charts','Rank and weight trends','Analysis')+
    careerGraphs(w,STATE.careerHistory,details().bashoId,details().previousBashoId,movementFor(w).previousRank,
      {rankRange:STATE.rankRange,fullLadder:STATE.fullRankLadder})+'</section>'+
    sectionHead('opponents','Career matchups','Opponents and head-to-head')+profileRivalries(w)+'</section>'+
    sectionHead('techniques','Kimarite recorded for wins','Winning techniques')+
    '<div class="sumo-techniques-list">'+profileTechniques(w)+'</div>'+
    (styleOkay?'<div class="sumo-signature"><h3>Signature manoeuvres</h3><p>'+style.signature.map(t=>e(t)).join(' · ')+'</p></div>':'')+'</section>';
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
      return '<a class="sumo-rival" href="'+headToHeadUrl(w.sourceId,r.id)+
        '" aria-label="'+e(label)+' head to head: '+e(r.wins)+' wins, '+e(r.losses)+' losses; open chronology">'+
        '<div class="sumo-rival-portrait">'+portraitFor(opponent,'sm')+'</div>'+
        '<div class="sumo-rival-info">'+
        (opponent?flagBackdrop(opponent):'')+
        '<div class="sumo-rival-main"><span class="sumo-rival-name">'+e(label)+'</span></div>'+
        '<strong class="sumo-rival-record" aria-label="'+e(r.wins)+' wins and '+e(r.losses)+' losses">'+
        e(r.wins)+' W – '+e(r.losses)+' L</strong></div></a>';
    }).join('')+'</div>'+
    (shown.length<matches.length?'<button type="button" class="btn light" data-h2h-more>Show more opponents ('+(matches.length-shown.length)+' remain)</button>':'')+
    (STATE.h2hOpponentLimit>16?'<button type="button" class="btn light" data-h2h-fewer>Show fewer opponents</button>':'');
}
function profileRivalries(w){
  return '<p class="section-intro">Search for an opponent or select a tile to see the full head-to-head history.</p>'+
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
  const old=movementFor(w);
  return '<article class="sumo-rank-card">'+
    '<div class="sumo-rank-published"><strong>'+e(w.currentRank||'Rank unavailable')+'</strong></div>'+
    '<div class="sumo-rank-person">'+portraitFor(w,'sm')+
    '<div><a href="#profile/'+Number(w.sourceId)+'">'+e(w.shikonaEn)+'</a>'+
    '<small>'+e(w.heya||'Stable unavailable')+'</small></div></div>'+
    '<div class="sumo-rank-prior"><span>Previous</span><strong>'+e(old.previousRank||'Unavailable')+'</strong></div>'+
    '<div class="sumo-rank-movement">'+movementMarkup(w)+'</div>'+
    '<div class="sumo-rank-record">'+recordLabels(row.summary)+'</div></article>';
}
function renderBanzuke() {
  const d=STATE.banzukeDivision,data=getBanzuke(d),rows=data?rankTable(data):[];
  return pageHead('Rankings',bashoLabel(details().bashoId)+' banzuke · current and previous rank')+
    divisionTabs(d,'data-banzuke-division')+
    '<div class="panel-head"><h2>'+e(bashoLabel(details().bashoId))+' · '+e(d)+'</h2><span>'+rows.length+' wrestlers</span></div>'+
    '<div class="sumo-rank-table-head" aria-hidden="true"><span>Rank</span><span>Wrestler</span><span>Previous</span><span>Movement</span><span>Current W–L–A</span></div>'+
    (rows.length?'<div class="sumo-rank-grid">'+rows.map(banzukeCard).join('')+'</div>':
      '<p class="missing">Current banzuke unavailable for this division.</p>')+
    '<details class="sumo-data-coverage"><summary>Rank movement interpretation</summary>'+
    '<p>↑ / ↓ describe a verified change in sourced ordinal banzuke position, including East/West. ↔ means an unchanged position. Unknown previous positions are separate from unchanged. A title may remain the same while the ordinal position changes. Birthplace flags and photo credits do not imply nationality.</p></details>'+
    sourceFooter();
}
function h2hKimariteChart(history,firstId,firstName,secondName,winning){
  const bouts=history?.rows||[];
  const selected=bouts.filter(m=>winning?Number(m.winnerId)===Number(firstId):Number(m.winnerId)!==Number(firstId));
  const counts=new Map();let unknown=0;
  for(const m of selected){
    const k=String(m.kimarite||'').trim().toLowerCase();
    if(!k||k==='unknown'||k==='unrecorded'||k.startsWith('fusen')){unknown++;continue;}
    counts.set(k,(counts.get(k)||0)+1);
  }
  const known=selected.length-unknown;
  const title=winning?firstName+' wins':firstName+' losses';
  if(!selected.length)return '<section class="sumo-kimarite-panel"><h3>'+e(title)+'</h3><p>'+
    e(winning?'No recorded wins against '+secondName+'.':'No recorded losses against '+secondName+'.')+'</p></section>';
  if(!known)return '<section class="sumo-kimarite-panel"><h3>'+e(title)+'</h3><p>Technique details unavailable for '+selected.length+' recorded result'+(selected.length===1?'':'s')+'.</p></section>';
  const sorted=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const bars=sorted.slice(0,5).map(([name,n])=>{
    const percent=(n/known*100).toFixed(1);
    return '<div class="sumo-kimarite-bar"><span>'+e(name)+'</span>'+
      '<div class="bar-bg" role="meter" aria-label="'+e(name)+' '+percent+' percent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><div style="width:'+percent+'%"></div></div>'+
      '<strong>'+n+' · '+percent+'%</strong></div>';
  }).join('');
  const remainder=sorted.slice(5).map(([name,n])=>'<li>'+e(name)+' · '+n+' · '+(n/known*100).toFixed(1)+'%</li>').join('');
  return '<section class="sumo-kimarite-panel"><h3>'+e(title)+'</h3>'+bars+
    (remainder?'<details><summary>Show all '+sorted.length+' named techniques</summary><ul>'+remainder+'</ul></details>':'')+
    (unknown?'<p class="footnote">'+unknown+' results excluded from named-technique percentages because their technique was unrecorded or a forfeit.</p>':'')+
    '</section>';
}
function h2hKimaritePanel(history,a,firstName,secondName){
  if(!history?.rows?.length)return '';
  return '<section class="sumo-h2h-kimarite"><h2>Kimarite breakdown</h2><p class="section-intro">Techniques in '+e(firstName)+'’s wins and losses against '+e(secondName)+'. Only named techniques from '+history.rows.length+' cached meetings are included; these are '+(history.complete?'all recorded regular meetings':'a partial historical sample')+'.</p><div class="sumo-kimarite-grid">'+h2hKimariteChart(history,a,firstName,secondName,true)+h2hKimariteChart(history,a,firstName,secondName,false)+'</div></section>';
}
function renderHeadToHead(a,b) {
  const first=wrestler(a),second=wrestler(b);
  if(!first&&!second)return '<a href="#rikishi">← Rikishi directory</a>'+note('Neither wrestler is in the tracked roster.');
  const firstName=first?.shikonaEn||headToHeadName(a,b,a);
  const secondName=second?.shikonaEn||headToHeadName(b,a,b);
  const history=headToHeadFor(a,b);
  const origin=STATE.h2hReturn;
  const from=origin?.hash||'#basho';
  const label=origin?.hash?.startsWith('#profile/')?'Back to originating profile':
    origin?.hash?.startsWith('#matchups')?'Back to Day '+(origin.matchupDay||'selected')+' matchups':
    origin?.hash?.startsWith('#basho')?'Back to Day '+(origin.day||'selected')+' in Basho Centre':'Basho Centre';
  const back='<a class="back-link" href="'+e(from)+'">← '+e(label)+'</a>';
  let coverage;
  if(history?.complete) coverage='All '+history.rows.length+' of '+history.total+' regular cached meetings shown. Third-party API source; not independently bout-certified.';
  else if(STATE.h2hLoading)coverage='Loading '+(history?.rows.length||0)+' of '+(history?.total||'available')+' recorded meetings…';
  else if(STATE.h2hLoadFailed)coverage='Complete chronology could not load. Showing '+(history?.rows.length||0)+' of '+(history?.total||'unknown')+' meetings.';
  else coverage='Showing '+(history?.rows.length||0)+' of '+(history?.total||'unknown')+' sourced meetings. Full cache has not yet loaded.';
  return back+pageHead('Head-to-head',firstName+' vs '+secondName)+
    '<div class="sumo-h2h-hero"><div>'+fighterOnCard(first,a,firstName,{hero:true})+'</div>'+
    '<div class="sumo-h2h-score"><span>Career series · regular recorded bouts</span>'+
    '<strong>'+e(history?history.wins+'–'+history.losses:'Unavailable')+'</strong>'+
    '<small>'+e(history?history.total+' recorded meetings':'Series loading')+'</small></div>'+
    '<div>'+fighterOnCard(second,b,secondName,{hero:true})+'</div></div>'+
    '<div class="sumo-h2h-comparison">'+comparisonGrid(first,second)+'</div>'+
    h2hKimaritePanel(history,a,firstName,secondName)+
    heading('Calendar chronology','Every historical meeting')+
    '<p class="section-intro">Source-backed dates, winners and original kimarite; forfeits and special meetings remain distinct.</p>'+
    '<p role="status" aria-live="polite">'+e(coverage)+'</p>'+
    (history?'<div class="sumo-h2h-order" role="group" aria-label="Chronology order">'+
      '<button type="button" data-h2h-order="newest" aria-pressed="'+(!STATE.h2hOldestFirst)+'" class="'+(!STATE.h2hOldestFirst?'active':'')+'">Newest first</button>'+
      '<button type="button" data-h2h-order="oldest" aria-pressed="'+(STATE.h2hOldestFirst)+'" class="'+(STATE.h2hOldestFirst?'active':'')+'">Oldest first</button></div>'+
      historyRowsMarkup(history,a,b,Number.MAX_SAFE_INTEGER,STATE.h2hOldestFirst):'<p>Pairwise history unavailable.</p>')+
    (STATE.h2hLoadFailed?'<button type="button" data-h2h-retry class="btn light">Retry cached chronology</button>':'')+
    (history?.complete&&history.special?.length?heading('Non-regular meetings','Playoffs and trials')+
      historyRowsMarkup({rows:history.special},a,b,Number.MAX_SAFE_INTEGER,STATE.h2hOldestFirst):'')+
    '<details class="sumo-data-coverage"><summary>Source and completeness</summary><p>Complete API cache does not establish independent JSA certification; individual review flags are preserved.</p></details>'+sourceFooter();
}
function getAnnouncedTorikumi(div,day){
  const next=Number(details().announcedDay);
  const item=details().torikumi?.[div];
  return day===next && item?.status==='available' ? item.data : null;
}
function daysPanel(d,data) {
  const completedDay=lastCompletedBashoDay(data);
  const announced=Number(details().announcedDay);
  const today=bashoDayForDate(new Date(),details().basho?.data?.startDate);
  const day=STATE.day===null?Math.max(1,completedDay):Math.min(15,Math.max(1,STATE.day));
  const pairings=rankOrderedMatchups(data,verifiedDayMatchups(data,getAnnouncedTorikumi(d,day),{
    bashoId:details().bashoId,division:d,day
  }));
  const view=STATE.bashoView;
  const latestAction=!pairings.length&&completedDay&&day!==completedDay?
    '<button type="button" class="btn light" data-jump-day="'+completedDay+'">View latest results · Day '+completedDay+'</button>':'';
  const calendar='<div class="sumo-day-quick"><span>Today (JST): '+(today>=1&&today<=15?'Day '+today:'outside this basho')+
    ' · Results through '+(completedDay?'Day '+completedDay:'an unavailable date')+
    ' · Scheduled day '+(getAnnouncedTorikumi(d,announced)?announced:'not available')+'</span></div>'+
    '<div class="day-select" role="group" aria-label="Basho calendar day">'+
    Array.from({length:15},(_,i)=>'<button type="button" data-day="'+(i+1)+'" class="'+(day===i+1?'active':'')+
      '" aria-pressed="'+(day===i+1)+'">'+(i+1)+'</button>').join('')+'</div>';
  const tabs='<div class="sumo-basho-views" role="group" aria-label="Tournament view">'+
    [['results','Results'],['matchups','Matchups'],['standings','Standings']].map(([key,label])=>
      '<button type="button" data-basho-view="'+key+'" aria-pressed="'+(view===key)+'">'+label+'</button>').join('')+'</div>';
  const lead=heading('Selected tournament day','Day '+day+' · '+d);
  const empty='<p class="sumo-empty-bout">No completed results or confirmed pairings are available for Day '+day+'. No future opponents have been inferred. '+latestAction+'</p>';
  const content=view==='standings'?
    '<div class="sumo-standings-workspace">'+standingsTable(leadingRikishi(data,20),20)+'</div>':
    pairings.length?(view==='matchups'?'<div class="sumo-daily-grid">'+pairings.map(dailyMatchupRow).join('')+'</div>':
      '<div class="sumo-compact-results">'+pairings.map(compactBoutRow).join('')+'</div>'):empty;
  return calendar+tabs+(view!=='standings'?lead:'')+content+
    (d==='Makushita'?'<p class="footnote">Makushita non-bout days are not recorded absences; most wrestlers compete seven times across 15 tournament days.</p>':'');
}
function rankShort(label){
  const m=String(label||'').match(/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\s+(\d+)\s+(East|West)$/);
  if(!m)return String(label||'');
  const abbr={Yokozuna:'Y',Ozeki:'O',Sekiwake:'S',Komusubi:'K',Maegashira:'M',Juryo:'J',Makushita:'Ms',Sandanme:'Sd',Jonidan:'Jd',Jonokuchi:'Jk'}[m[1]];
  return abbr+m[2]+(m[3]==='East'?'e':'w');
}
function boutRowMarkup(match) {
  const a=wrestler(match.rikishiId),b=wrestler(match.opponentId);
  const left=a?.shikonaEn||match.rikishi||'Wrestler';
  const right=b?.shikonaEn||match.opponent||'Wrestler';
  const finished=match.finished===true;
  const winnerIsLeft=finished&&Number(match.winnerId)===Number(match.rikishiId);
  const winnerIsRight=finished&&Number(match.winnerId)===Number(match.opponentId);
  const winner=winnerIsLeft?left:winnerIsRight?right:null;
  const method=finished?techniqueText(match.kimarite):'Result pending';
  const h2h=headToHeadFor(match.rikishiId,match.opponentId);
  const hasRecord=h2h&&Number.isInteger(h2h.wins)&&Number.isInteger(h2h.losses);
  const side=(w,name,pos,won,lost)=>{
    const tag=w?'a':'span';
    const href=w?' href="#profile/'+Number(w.sourceId)+'"':'';
    const photo='<'+tag+' class="bout-photo"'+href+(w?' aria-label="View '+e(name)+' profile"':'')+'>'+portraitFor(w,'md',name)+'</'+tag+'>';
    const id='<span class="bout-id"><'+tag+' class="bout-name"'+href+'>'+e(name)+'</'+tag+'>'+
      '<small title="'+e(w?.currentRank||'')+'">'+e(rankShort(w?.currentRank)||'Unranked')+'</small></span>';
    return '<div class="bout-side '+pos+(won?' is-winner':'')+(lost?' is-loser':'')+'">'+
      (pos==='left'?photo+id:id+photo)+'</div>';
  };
  const mid=finished?'<span class="bout-mid" aria-hidden="true">'+(winnerIsLeft?'◀':winnerIsRight?'▶':'–')+'</span>':
    '<span class="bout-mid bout-vs" aria-hidden="true">VS</span>';
  const verdict=finished?(winner?e(winner)+' won':'Result recorded'):'Awaiting result';
  const tech=finished?' · '+techniqueMarkup(match.kimarite,method):'';
  return '<article class="bout-row '+(finished?'is-finished':'is-scheduled')+
    '" aria-label="'+e(left+' versus '+right+': '+(finished?(winner?winner+' won by '+method:'result recorded'):'scheduled'))+'">'+
    side(a,left,'left',winnerIsLeft,winnerIsRight)+mid+side(b,right,'right',winnerIsRight,winnerIsLeft)+
    '<div class="bout-foot"><span class="bout-verdict">'+verdict+tech+'</span>'+
    '<a class="bout-h2h" href="'+headToHeadUrl(match.rikishiId,match.opponentId)+
    '" aria-label="View '+e(left)+' versus '+e(right)+' head to head">H2H '+e(hasRecord?h2h.wins+'–'+h2h.losses:'—')+' <span aria-hidden="true">›</span></a></div>'+
    '</article>';
}
function compactBoutRow(match) {
  return boutRowMarkup(match);
}
function dailyMatchupRow(match) {
  const first=wrestler(match.rikishiId),second=wrestler(match.opponentId);
  const history=headToHeadFor(match.rikishiId,match.opponentId);
  return '<div class="bout-item">'+boutRowMarkup(match)+
    '<details class="bout-compare"><summary>Compare</summary>'+
    comparisonGrid(first,second,match.division||STATE.matchupDivision)+dailyMeetingMarkup(match,match.rikishiId,match.opponentId)+
    (history&&!history.complete?'<p class="sumo-daily-result-note">Individual history is source-limited; open the full series for coverage.</p>':'')+
    '</details></div>';
}
function renderBasho() {
  const d=STATE.bashoDivision,data=getBanzuke(d);
  const lastday=data?lastCompletedBashoDay(data):0;
  return pageHead('Results',bashoLabel(details().bashoId)+' · '+(lastday?'Results through Day '+lastday:'No results yet')+' · Snapshot, not live')+
    divisionTabs(d,'data-basho-division')+
    (data?daysPanel(d,data):'<p class="missing">No banzuke snapshot available for this division.</p>')+
    sourceFooter();
}
function renderKimarite() {
  return renderKimariteGallery();
}

function render() {
  const hash=decodeURIComponent(location.hash.slice(1)||'basho').split('?')[0];
  let [page,id]=hash.split('/');
  if(page==='home')page='basho';
  tabs.forEach(a=>{
    const active=(page==='profile'?'rikishi':page==='matchups'?'basho':page)===a.dataset.page;
    a.classList.toggle('active',active);
    if(active)a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
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
    case 'matchups': ROOT.innerHTML=renderDailyMatchups();break;
    case 'kimarite': ROOT.innerHTML=renderKimarite();break;
    default: ROOT.innerHTML=renderBasho();
  }
  if(page==='kimarite')hydrateKimariteGallery();
  else linkKimariteMentions(ROOT);
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
  if(t?.id==='sumo-matchup-day'){STATE.matchupDay=Number(t.value);render();document.getElementById('sumo-matchup-day')?.focus({preventScroll:true});}
});
document.addEventListener('click',ev=>{
  const h2hLink=ev.target.closest?.('a[href^="#headtohead/"]');
  if(h2hLink&&location.hash.startsWith('#')&&!location.hash.startsWith('#headtohead/')){
    STATE.h2hReturn={hash:location.hash,scrollY:window.scrollY,
      period:STATE.profilePeriod,mode:STATE.profileMode,
      bashoDivision:STATE.bashoDivision,day:STATE.day,
      matchupDivision:STATE.matchupDivision,matchupDay:STATE.matchupDay};
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
  const el=ev.target.closest?.('[data-home-leader-division],[data-home-view-standings],[data-directory-layout],[data-basho-view],[data-matchup-latest],[data-directory-reset],[data-matchup-division],[data-matchup-today],[data-directory-division],[data-more-rikishi],[data-fewer-rikishi],[data-banzuke-division],[data-basho-division],[data-day],[data-jump-day],[data-profile-limit],[data-h2h-order],[data-h2h-more],[data-h2h-fewer],[data-results-mode],[data-rank-range],[data-rank-ladder],[data-h2h-retry],[data-opponent-retry]');
  if(!el)return;
  if(el.hasAttribute('data-home-leader-division')){STATE.homeLeaderDivision=el.dataset.homeLeaderDivision;refreshHomeLeaders();return;}
  if(el.hasAttribute('data-home-view-standings')){ev.preventDefault();STATE.bashoDivision=STATE.homeLeaderDivision;STATE.bashoView='standings';location.hash='#basho';render();return;}
  if(el.dataset.matchupDivision){STATE.matchupDivision=el.dataset.matchupDivision;render();}
  if(el.dataset.matchupToday){STATE.matchupDay=Number(el.dataset.matchupToday);render();}
  if(el.dataset.matchupLatest){STATE.matchupDay=Number(el.dataset.matchupLatest);render();}
  if(el.dataset.bashoView){STATE.bashoView=el.dataset.bashoView;render();}
  if(el.hasAttribute('data-directory-reset')){STATE.division='All';STATE.visible=24;refreshDir();}
  if(el.dataset.directoryLayout){STATE.directoryLayout=el.dataset.directoryLayout;refreshDir();}
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
  if(route!==lastRoute&&route.startsWith('profile/')&&STATE.h2hReturn?.hash?.split('?')[0]==='#'+route){
    STATE.profilePeriod=STATE.h2hReturn.period;
    STATE.profileMode=STATE.h2hReturn.mode;
  }else if(route!==lastRoute&&route.startsWith('profile/')){
    STATE.profilePeriod='current';STATE.profileMode='bouts';
    STATE.opponentQuery='';STATE.h2hOpponentLimit=16;
    STATE.rankRange='2y';STATE.fullRankLadder=false;
  }
  if(STATE.h2hReturn?.hash?.split('?')[0]==='#'+route&&(route==='basho'||route==='matchups')){
    STATE.bashoDivision=STATE.h2hReturn.bashoDivision;
    STATE.day=STATE.h2hReturn.day;
    STATE.matchupDivision=STATE.h2hReturn.matchupDivision;
    STATE.matchupDay=STATE.h2hReturn.matchupDay;
  }
  lastRoute=route;STATE.h2hOldestFirst=false;render();
  const requestedTerm=route==='kimarite'?new URLSearchParams(location.hash.split('?')[1]||'').get('term'):null;
  if(requestedTerm&&/^[a-z-]+$/.test(requestedTerm)&&document.getElementById('kimarite-'+requestedTerm)){
    requestAnimationFrame(()=>document.getElementById('kimarite-'+requestedTerm)?.scrollIntoView({block:'start'}));
    return;
  }
  if(STATE.h2hReturn?.hash?.split('?')[0]==='#'+route){
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
    if(data?.schemaVersion!==1||data?.cohortSize!==STATE.roster?.rikishi?.length||data?.profileCount<data?.cohortSize||data.certified!==false||!data.profiles)
      throw new Error('Opponent index failed research cache checks');
    STATE.h2hOpponents=data;
  } catch(error){
    console.warn('Opponent index not synchronized:',error?.message||error);
    STATE.h2hOpponentsFailed=true;
  } finally {
    STATE.h2hOpponentsLoading=false;
    if(location.hash.startsWith('#profile/'))refreshOpponents();
    else if(location.hash.startsWith('#headtohead/'))render();
  }
}
async function loadCompleteH2h(){
  STATE.h2hLoading=true;
  try {
    const result=await loadJson('data/sumo/research-h2h-history.json');
    if(result?.schemaVersion!==1||result?.cohortSize!==STATE.roster?.rikishi?.length||result?.certified!==false||!result.pairs)
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
    const [roster,details,styles,photos,careerHistory,h2hSummary,readiness,divisionStats,kimariteMedia]=await Promise.all([loadJson('data/sumo/rikishi-index.json'),loadJson('data/sumo/preview-details.json'),loadJson('data/sumo/official-style-evidence.json'),loadJson('data/sumo/approved-photos.json'),loadJson('data/sumo/career-history.json'),
      loadJson('data/sumo/research-h2h-summary.json').catch(()=>null),loadJson('data/sumo/api-trusted-status.json'),
      loadJson('data/sumo/division-stats.json').catch(()=>null),loadJson('data/sumo/kimarite-media.json').catch(()=>null)]);
    if(!Array.isArray(roster?.rikishi)||!Array.isArray(details?.featured)||roster?.count!==roster.rikishi.length) throw new Error('Sumo cache schema or roster total not valid');
    if((roster?.trackedDivisions||[]).join(',')!==DIVS.join(','))throw new Error('Sumo cache does not match the approved three-division scope');
    if(roster.rikishi.some(x=>!DIVS.includes(divisionOf(x.currentRank))))throw new Error('Out-of-scope division in Sumo index');
    if(styles?.schemaVersion!==1||!styles.byNskId)throw new Error('Official style evidence cache unavailable or malformed');
    if(photos?.schemaVersion!==1||!photos.bySourceId||typeof photos.bySourceId!=='object')throw new Error('Licensed Sumo photo manifest missing or malformed');
    if(careerHistory?.schemaVersion!==1||!careerHistory.bySourceId)throw new Error('Sumo career timeline snapshot invalid');
    if(h2hSummary&&(h2hSummary.schemaVersion!==1||h2hSummary.cohortSize!==roster?.rikishi?.length||h2hSummary.certified!==false))throw new Error('Research H2H summary failed schema validation');
    validateSumoPreviewReadiness(readiness,roster);
    STATE.roster=roster;STATE.details=details;STATE.officialStyles=styles;STATE.photoIndex=photos.bySourceId;STATE.careerHistory=careerHistory;STATE.h2hSummary=h2hSummary;STATE.apiTrust=readiness;
    STATE.divisionStats=divisionStats?.schemaVersion===1&&divisionStats?.cohortSize===roster.count&&divisionStats?.source==='https://www.sumo-api.com/api'?divisionStats:null;
    setKimariteMediaManifest(kimariteMedia);
    render();
  } catch(error){
    STATE.error=error.message || 'Unable to load the preview dataset';
    render();
  }
}
// Refresh ages when the Japan-local date changes, including on an existing open page.
let lastAgeDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function refreshAgeOnDateChange(){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(today!==lastAgeDate){lastAgeDate=today;if(STATE.roster)render();}
}
setInterval(refreshAgeOnDateChange,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAgeOnDateChange();});
init();
