/* BEFN Fighter Insights — one read-only profile model for boxing and MMA.
 * Every score is derived from recorded evidence; missing ratings stay unrated.
 * This module augments profile dialogs and fight cards, never replaces live results. */
(function(){
 "use strict";
 const engine=window.BEFNPowerIndex;
 const classifier=window.BEFNUfcClassifier;
 if(!engine)return;
 const escapeHTML=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const norm=engine.normalize;
 const profiles=(window.COMBAT_DATA?.fighters||[]);
 // Individually source-reviewed UFC records always override old previews,
 // regardless of asynchronous fetch completion order.
 const isReviewedUfc=f=>f?.championReview===true||f?.reviewedUfcProfile===true;
 // Legacy MMA scouting labels predate the evidence-backed UFC classifier.
 // Preserve all legacy cards but do not display old curated tags as algorithmic.
 for(const fighter of profiles){
  if(fighter?.sport==="MMA"&&["Prospect","Contender"].includes(fighter.category)){
   fighter.category="Unassessed";
   fighter.classification={label:"Unassessed",score:null,eligible:false,
    reason:"Historical scouting entry; pending a complete individually sourced UFC-only record."};
  }
 }
 const byId=new Map(profiles.map(f=>[f.id,f]));
 const byName=new Map();
 for(const f of profiles){const k=norm(f.name);if(!byName.has(k))byName.set(k,f)}
 let ufcV3=null;
 const v3For=f=>isReviewedUfc(f)?ufcV3?.fighters[norm(f.name)]:null;
 const stats=new Map();
 const trackedUfcStats=new Map();
 const openSnapshots=new Set();
 const selectedTabs=new Map();
 const sampleEvidence=new Map();
 const roundObservations=new Map();
 const levels={red:"red",orange:"orange",gold:"gold",green:"green"};
 const profileFor=name=>byName.get(norm(name))||sampleEvidence.get(norm(name))||null;
 const sourceText=f=>[f?.meta||"",...(f?.analysis||[])].join(" ");
 // Only source-linked, explicitly entered credentials qualify. NCAA division
 // participation is separate from NCAA tournament medals/individual titles.
 const permitted={
  Boxing:new Set(["champion","golden-gloves","olympics"]),
  MMA:new Set(["ncaa","bjj","adcc","sambo","golden-gloves","olympic-judo"])
 };
 const medalIcon={gold:"🥇",silver:"🥈",bronze:"🥉"};
 const beltColors={white:"#ececec",blue:"#2875cf",purple:"#843fc8",brown:"#89512d",black:"#181a1e"};
 const validSource=x=>/^https:\/\//i.test(x||"")&&!/google\.com\/search/i.test(x);
 function credentialsFor(f){
  if(!f)return [];
  const allowed=permitted[f.sport]||permitted.MMA;
  const out=[],seen=new Set();
  for(const c of (Array.isArray(f.credentials)?f.credentials:[])){
   if(!c||!allowed.has(c.kind)||!validSource(c.source)||seen.has(c.kind==="ncaa"?c.kind+":"+c.division:c.kind))continue;
   if(c.kind==="ncaa"&&(!["I","II","III"].includes(c.division)||(c.medal&&!medalIcon[c.medal])))continue;
   if(c.kind==="olympic-judo"&&(c.participated!==true||
      (c.medal&&!medalIcon[c.medal])||
      (c.medalCount!==undefined&&(!Number.isInteger(c.medalCount)||c.medalCount<1||c.medalCount>15))||
      (!c.medal&&c.medalCount)))continue;
   if(c.kind==="bjj"&&!Object.keys(beltColors).includes(c.belt))continue;
   if(["adcc","sambo","olympics"].includes(c.kind)&&!medalIcon[c.medal])continue;
   if(c.kind==="golden-gloves"&&!["national","junior","regional","state","unspecified"].includes(c.level))continue;
   seen.add(c.kind==="ncaa"?c.kind+":"+c.division:c.kind);
   out.push({...c,detail:String(c.detail||"").trim()});
  }
  return out;
 }
 function badge(c){
  const detail=c.detail||({
   bjj:"Brazilian jiu-jitsu "+c.belt+" belt",
   ncaa:"NCAA Division "+c.division+(c.medal?" wrestling championship "+c.medal+" medal":" wrestling participant"),
   "olympic-judo":"Olympic judo "+(c.medal?c.medal+" medal":"participant"),
   adcc:"ADCC "+c.medal+" medal",
   sambo:"Sambo "+c.medal+" medal",
   "golden-gloves":"Golden Gloves "+c.level+" achievement",
   olympics:"Olympic boxing "+c.medal+" medal",
   champion:"Former boxing world champion"
  }[c.kind]||"Verified credential");
  const content=c.kind==="bjj"?'<span class="befn-belt" style="--belt:'+beltColors[c.belt]+'"></span>':
   c.kind==="ncaa"?'<span class="befn-credential-ncaa"><small>NCAA</small><b>DIV '+escapeHTML(c.division)+'</b></span>'+
     (medalIcon[c.medal]?'<em class="befn-credential-medal is-'+c.medal+'" aria-hidden="true">'+
      ({gold:"1",silver:"2",bronze:"3"}[c.medal])+'</em>':''):
   c.kind==="olympic-judo"?'<span class="befn-credential-judo"><small>JUDO</small><b>🥋</b><small>OG</small></span>'+
     (c.medal&&medalIcon[c.medal]?'<em class="befn-credential-medal">'+medalIcon[c.medal]+
       (c.medalCount>1?'<small>×'+c.medalCount+'</small>':'')+'</em>':''):
   c.kind==="adcc"?'<span aria-hidden="true">🏆</span>':
   c.kind==="sambo"?'<span aria-hidden="true">⭐</span>':
   c.kind==="golden-gloves"?'<span aria-hidden="true">🥊</span>':
   c.kind==="olympics"?'<span aria-hidden="true">'+medalIcon[c.medal]+'</span>':
   '<span aria-hidden="true">♛</span>';
  return '<button type="button" class="befn-credential" data-kind="'+escapeHTML(c.kind)+
   '" data-credential-info="'+escapeHTML(detail)+
   '" title="'+escapeHTML(detail)+'" aria-label="'+escapeHTML(detail)+'">'+content+'</button>';
 }
 const credentialsHTML=f=>{
  const list=credentialsFor(f);
  return list.length?'<div class="befn-credential-list">'+list.map(badge).join("")+'</div>':
   '<span class="befn-credential-empty">No credentials listed.</span>';
 };
 function historyFor(f){
  return engine.normalizeHistory((f?.latest||[]).map(x=>({
   date:x.date,opponent:x.opponent,method:x.method,result:x.outcome||x.result
  })));
 }
 function statRecord(f){return stats.get(norm(f?.name))||null}
 function ratingsFor(f,sportHint){
  const sport=f?.sport||sportHint||"MMA";
  if(sport==="Boxing")return engine.evaluateBoxing(f);
  // Prefer the individually researched and linked UFC 334 observations over
  // the older general scouting feed; keep completed-round evidence separate.
  const archival=statRecord(f);
  const verified=f?.verifiedStats;
  // Reviewed UFC profiles must never fall back to other promotions'
  // statistical samples merely because a category is missing.
  const strictlyUfc=f?.championReview===true||f?.reviewedUfcProfile===true;
  const sourceRecord=verified?{stats:verified,recent:{fights:verified.sampleBouts}}:
    strictlyUfc?{stats:null,recent:{fights:0}}:archival;
  const evidence=strictlyUfc?null:f?.performanceEvidence;
  // Source-verified credentials contribute only to matching measured skills.
  // The shared model caps stacking and never creates an absent statistic.
  const input={...(sourceRecord||{}),credentials:credentialsFor(f)};
  if(evidence)input.performanceEvidence=evidence;
  return engine.evaluate(input,historyFor(f));
 }
 function resultSymbol(outcome){
  const text=String(outcome||"").toLowerCase();
  if(text==="w"||text==="win")return ["W","is-win"];
  if(text==="l"||text==="loss")return ["L","is-loss"];
  if(text==="nc"||text==="no contest")return ["NC","is-no-contest"];
  return ["D","is-draw"];
 }
 function formHTML(f){
  const h=historyFor(f);
  if(!h.length)return '<span class="befn-credential-empty">Recent results not yet available</span>';
  return '<div class="befn-profile-form">'+h.map(x=>{
   const [symbol,klass]=resultSymbol(x.result);
   return '<span class="befn-power-result '+klass+'" title="'+escapeHTML((x.date||"")+" · "+(x.opponent||""))+'">'+symbol+'</span>';
  }).join("")+'</div>';
 }
 function performanceMeter(m,reverse,tier){
  const valid=Number.isInteger(m.score)&&m.score>=0&&m.score<=100;
  const type=tier||(valid&&levels[engine.level(m.score)]?engine.level(m.score):"unrated");
  return '<span class="befn-power-track is-'+type+(reverse?' befn-bar-left':'')+'" '+
   (valid?'role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+m.score+'"':
    'role="img" aria-label="Not rated: insufficient evidence"')+
   ' title="'+escapeHTML(m.label)+': '+(valid?m.score+' / 100':'Not rated')+'">'+(valid?'<span class="befn-power-fill" style="--power-width:'+m.score+'%"></span>':'')+'</span>';
 }
 function profileMetric(m,tier){
  return '<div class="befn-power-metric"><div class="befn-power-metric-label">'+
   '<span>'+escapeHTML(m.label)+'</span><b'+(m.score===null?' class="is-unrated"':'')+'>'+
   (m.score===null?'Not rated':m.score+' / 100')+'</b></div>'+
   performanceMeter(m,false,tier)+'</div>';
 }
 function trackedMetric(v,format){
  if(!Number.isInteger(v))return "—";
  if(format==="time"){
   const sign=v<0?"−":v>0?"+":"";
   const absolute=Math.abs(v);
   return sign+Math.floor(absolute/60)+":"+String(absolute%60).padStart(2,"0");
  }
  if(format==="duration"){
   return Math.floor(v/60)+":"+String(v%60).padStart(2,"0");
  }
  return (v>0&&format==="signed"?"+":"")+v.toLocaleString("en-AU");
 }
 function trackedMetricHTML(f){
  if(!f||f.sport!=="MMA")return "";
  const d=trackedUfcStats.get(norm(f.name));
  if(!d||!Number.isInteger(d.trackedBouts)||d.trackedBouts<1)return "";
  const rows=[
   ["Total strikes landed","totalLanded"],
   ["Total strikes received","totalAbsorbed"],
   ["Total strike differential","totalStrikeDifferential","signed"],
   ["Significant strikes landed","sigLanded"],
   ["Significant strikes received","sigAbsorbed"],
   ["Significant strike differential","sigStrikeDifferential","signed"],
   ["Control time","controlSec","duration"],
   ["Control differential","controlDifferentialSec","time"],
   ["Knockdowns","knockdowns"],
   ["Takedowns landed","takedowns"],
   ["Submission attempts","subAttempts"]
  ];
  const cell=([label,key,format])=>{
   const entry=d.totals?.[key];
   const covered=Number.isInteger(entry?.coveredBouts)?entry.coveredBouts:0;
   return '<div class="befn-postfight-stat"><span>'+escapeHTML(label)+'</span>'+
    '<strong>'+escapeHTML(trackedMetric(entry?.value,format))+'</strong>'+
    '<small>'+covered+'/'+d.trackedBouts+' tracked UFC bouts</small></div>';
  };
  // Coverage must be measured against the most recent *reviewed UFC fights*,
  // not just the subset of archived bouts that happened to have round metrics.
  // UFCalendar dates may use the following calendar day in another timezone.
  const latestUfc=isReviewedUfc(f)?(f.latest||[]).filter(x=>x?.date&&x?.opponent).slice(0,5):[];
  const trackedBouts=(d.recentBouts||[]).filter(x=>x?.date&&x?.opponent);
  const matchedBout=b=>trackedBouts.find(x=>{
   if(norm(x.opponent)!==norm(b.opponent))return false;
   const a=Date.parse(String(x.date)+"T00:00:00Z");
   const z=Date.parse(String(b.date)+"T00:00:00Z");
   return Number.isFinite(a)&&Number.isFinite(z)&&Math.abs(a-z)<=86400000;
  });
  const coveredLatest=latestUfc.filter(matchedBout).length;
  const coveragePanel=latestUfc.length?
   '<details class="befn-postfight-history befn-recent-five-coverage" data-befn-recent-five="'+
    escapeHTML(f.id)+'"><summary>Latest UFC fights: '+coveredLatest+'/'+latestUfc.length+
    ' with round statistics</summary><ul>'+
    latestUfc.map(b=>'<li class="befn-postfight-bout"><span><b>'+escapeHTML(b.opponent)+
     '</b><small>'+escapeHTML(b.date)+' · '+escapeHTML(b.method||"UFC result")+'</small></span>'+
     '<span><small>'+(matchedBout(b)?'Round statistics available':'Statistics unavailable')+
     '</small></span></li>').join('')+
   '</ul></details>':"";
  const recent=trackedBouts.slice(0,5);
  const fightRows=recent.map(b=>{
   const m=b.metrics||{};
   const delta=m.totalStrikeDifferential;
   return '<li class="befn-postfight-bout"><span><b>'+escapeHTML(b.opponent)+
    '</b><small>'+escapeHTML(b.date)+' · '+escapeHTML(b.event||"UFC")+'</small></span>'+
    '<span><b>'+escapeHTML(trackedMetric(m.totalLanded))+' total strikes</b>'+
    '<small>Difference '+escapeHTML(trackedMetric(delta,"signed"))+
    ' · Control '+escapeHTML(trackedMetric(m.controlSec,"duration"))+'</small></span></li>';
  }).join("");
  const lastReviewed=String(f.latest?.[0]?.date||"").slice(0,10);
  const pending=lastReviewed&&d.lastFightDate>lastReviewed;
  return '<section class="befn-profile-block" data-befn-postfight="'+escapeHTML(f.id)+
   '"><h3>Tracked UFC fight statistics</h3><div class="befn-profile-body">'+
   '<p class="befn-score-note"><b>'+d.trackedBouts+' UFC bouts in this sample</b> · not career totals.</p>'+
   (pending?'<p class="befn-postfight-warning">Latest result pending an update.</p>':"")+
   coveragePanel+
   '<div class="befn-postfight-grid">'+rows.map(cell).join("")+'</div>'+
   (fightRows?'<details class="befn-postfight-history"><summary>Show per-fight strike and control observations</summary>'+
    '<ul>'+fightRows+'</ul></details>':"")+
   '</div></section>';
 }


 function classificationHTML(f){
  if(f?.sport!=="MMA"||!f.classification)return "";
  const c=f.classification;
  const category=String(c.label||"Unassessed");
  const score=Number.isFinite(c.score)&&!["Champion","Unassessed"].includes(category)?
   '<span class="befn-scout-score">'+escapeHTML(String(c.score))+' / 100</span>':"";
  return '<section class="befn-profile-block befn-scout-classification" data-befn-classification="'+
   escapeHTML(f.id||"")+'"><h3>Scouting</h3><div class="befn-profile-body">'+
   '<p><strong>'+escapeHTML(category)+'</strong> '+score+'</p></div></section>';
 }
 function renderProfile(f){
  const kind=f.sport==="Boxing"?"Boxing credentials":"Combat & grappling credentials";
  const v3=v3For(f);
  if(v3)return renderV3Profile(f,v3,kind);
  const metrics=ratingsFor(f);
  const medallist=credentialsFor(f).some(x=>x.kind==="champion");
  const reviewedChampion=f.sport==="MMA"&&f.organisation==="UFC"&&
    f.category==="Champion"&&f.championReview===true&&
    validSource(f.review?.championStatusSource);
  const title=reviewedChampion?"UFC "+String(f.division||"")+" champion":
    medallist?"Former world champion":
    f.sport==="Boxing"?"No title history listed":
    /former\s+UFC\s+[\w\s-]{0,25}champion/i.test(sourceText(f))?
     "Former UFC champion":"No championship history listed";
  return '<section class="befn-profile-insights" data-befn-profile="'+escapeHTML(f.id)+
   '" aria-label="Fighter performance insights">'+
   '<section class="befn-profile-block"><h3>Fighter ratings</h3><div class="befn-profile-body">'+
   '<div class="befn-power-bars">'+metrics.map(profileMetric).join("")+'</div></div></section>'+
   trackedMetricHTML(f)+classificationHTML(f)+
   '<section class="befn-profile-block"><h3>Recent form (last 5)</h3><div class="befn-profile-body">'+formHTML(f)+'</div></section>'+
   '<section class="befn-profile-block"><h3>'+escapeHTML(kind)+'</h3><div class="befn-profile-body">'+credentialsHTML(f)+'</div></section>'+
   '<section class="befn-profile-block"><h3>Championship history</h3><div class="befn-profile-body"><p>'+escapeHTML(title)+'</p></div></section></section>';
 }
 function scoreTier(value){
  return value===null?'unrated':value>=90?'legendary':value>=80?'emerald':value>=70?'lime':value>=50?'amber':'red';
 }
 function metricValue(row,type){
  if(type==='count')return String(row.value);
  return type==='pct'?Math.round(row.value)+'%':row.value.toFixed(1);
 }

 const highlightGroups={slpm:'Striking',sapm:'Defence',diff:'Striking',kd:'Power',td:'Wrestling',control:'Control',net:'Control',sub:'Grappling',acc:'Striking',tdDef:'Defence',ko:'Power',submission:'Grappling'};
 function renderPerformanceHighlights(f,v3){
  if(!ufcV3||ufcV3.schema<4||v3.recent.filter(b=>b.outcome!=='NC').length<3)return '';
  const choices=ufcV3.boards.flatMap(b=>{
   const m=v3.metrics?.[b.id];if(!m||m.bouts<3||m.bouts>5||!Number.isFinite(m.value))return [];
   const division=Number.isInteger(m.divisionRank)?m.divisionRank:Number.isInteger(m.divisionalRank)?m.divisionalRank:null;
   const all=Number.isInteger(m.rank)?m.rank:null;
   if(![division,all].some(n=>n!==null&&n>=1&&n<=30))return [];
   const divisionSize=m.divisionEligible||m.divisionalEligible||0;
   const strength=Math.min(division&&divisionSize>=3?division/divisionSize:Infinity,all&&b.eligible>=3?all/b.eligible:Infinity);
   const value=['control','net'].includes(b.id)?(m.value<0?'−':'')+Math.floor(Math.abs(m.value)/60)+':'+String(Math.round(Math.abs(m.value)%60)).padStart(2,'0'):metricValue(m,b.type==='def'?'pct':b.type);
   return [{id:b.id,label:b.label,group:highlightGroups[b.id]||'Other',value,division,all,strength,best:Math.min(division||Infinity,all||Infinity)}];
  }).sort((a,b)=>a.strength-b.strength||a.best-b.best);
  const selected=[],counts={};
  for(const x of choices){if(selected.length>=4)break;if((counts[x.group]||0)>=2)continue;selected.push(x);counts[x.group]=(counts[x.group]||0)+1}
  if(!selected.length)return '';
  return '<section class="befn-performance-highlights" aria-label="Performance highlights"><header><h3>Performance Highlights</h3><small>Top 30 · Recent UFC performance</small></header>'+
   '<div class="befn-highlight-grid">'+selected.map((x,i)=>'<div class="befn-highlight-slot '+(i>=2?'is-extra':'')+'"><div class="befn-highlight-card '+(x.best<=3?'is-podium':x.best<=10?'is-elite':'')+'">'+
    '<span>'+escapeHTML(x.label)+'</span><strong>'+escapeHTML(x.value)+'</strong><footer>'+
    (x.division&&x.division<=30?'<b class="'+(x.division<=10?'is-gold':'')+'">#'+x.division+' Division</b>':'')+
    (x.all&&x.all<=30?'<b class="'+(x.all<=10?'is-gold':'')+'">#'+x.all+' All UFC</b>':'')+
    '</footer></div></div>').join('')+'</div>'+
    (selected.length>2?'<button type="button" data-befn-highlights-toggle aria-expanded="false">Show all '+selected.length+' highlights</button>':'')+'</section>';
 }
 document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-befn-highlights-toggle]');if(!btn)return;
  const root=btn.closest('.befn-performance-highlights');const on=!root.classList.contains('is-expanded');
  root.classList.toggle('is-expanded',on);btn.setAttribute('aria-expanded',String(on));
  btn.textContent=on?'Show fewer highlights':'Show all '+root.querySelectorAll('.befn-highlight-slot').length+' highlights';
 },true);
 function renderV3Profile(f,v3,kind){
  const score=v3.power;
  const tier=scoreTier(score);
  const ratings=[['striking','Striking'],['wrestling','Wrestling'],['grappling','Grappling'],['defence','Defence'],['form','Recent Form']];
  const readableLabels={
   slpm:'Significant strikes landed per minute',sapm:'Significant strikes absorbed per minute',
   diff:'Net significant strikes per 15 min',kd:'Knockdowns per 15 min',
   td:'Takedowns per 15 min',control:'Control time per 15 min',
   net:'Net control time per 15 min',sub:'Submission attempts per 15 min',
   acc:'Significant strike accuracy',tdDef:'Takedown defence',
   ko:'KO/TKO wins',submission:'Submission wins'
  };
  const statRows=ufcV3.boards.filter(b=>v3.metrics[b.id]).map(b=>{
   const m=v3.metrics[b.id];
   const qualified=v3.recent.filter(f=>f.outcome!=='NC').length>=3&&m.bouts>=3;
   const rank=qualified&&ufcV3.schema>=4?m.rank:null;
   const topTen=Number.isInteger(rank)&&rank>=1&&rank<=10;
   const label=readableLabels[b.id]||b.label;
   const value=b.id==='control'||b.id==='net'
    ?(m.value<0?'−':'')+Math.floor(Math.abs(m.value)/60)+':'+String(Math.round(Math.abs(m.value)%60)).padStart(2,'0')
    :metricValue(m,b.type==='def'?'pct':b.type);
   return '<li class="'+(topTen?'is-top-ten':'')+'"><span>'+escapeHTML(label)+'</span><strong>'+escapeHTML(value)+'</strong>'+
    (topTen?'<b class="befn-v3-top-ten">TOP 10 · UFC-WIDE</b>':'')+
    '<small>'+(rank?'UFC-wide rank #'+rank+' of '+b.eligible+' eligible':'Ranking requires at least 3 measured UFC fights and recalculation')+
    ' · '+m.bouts+' recorded '+(m.bouts===1?'fight':'fights')+'</small></li>';
  }).join('');
  const decided=v3.recent.filter(b=>['W','L','D'].includes(b.outcome));
  const record=['W','L','D'].map(x=>decided.filter(b=>b.outcome===x).length);
  const tiles=[];
  if(decided.length)tiles.push([record[0]+'–'+record[1]+(record[2]?'–'+record[2]:''),'Record',decided.length+' fights']);
  for(const [id,label] of [
   ['ko','KO/TKO wins'],['submission','Submission wins'],
   ['slpm','Sig. strikes/min'],['acc','Strike accuracy'],
   ['kd','Knockdowns/15 min'],['td','Takedowns/15 min'],
   ['tdDef','TD defence'],['control','Control/15 min']
  ]){
   const metric=v3.metrics[id];
   if(!metric)continue;
   const value=id==='control'?Math.floor(metric.value/60)+':'+String(Math.round(metric.value)%60).padStart(2,'0'):
    metricValue(metric,id==='ko'||id==='submission'?'count':id==='tdDef'||id==='acc'?'pct':'rate');
   tiles.push([value,label,metric.bouts+' fights']);
  }
  return '<section class="befn-profile-insights befn-v3" data-befn-profile="'+escapeHTML(f.id)+'" aria-label="UFC Fighter V3">'+
   '<div class="befn-v3-hero" aria-label="Overall fighter rating"><div class="befn-overall-main"><span class="befn-overall-label">Overall</span><strong class="befn-v3-score is-'+tier+'">'+
   (score===null?'Unrated':score+'<small> / 100</small>')+'</strong>'+
   '<span class="befn-overall-meter" aria-hidden="true"><span class="is-'+tier+'" style="width:'+(score===null?0:Math.max(0,Math.min(100,score)))+'%"></span></span></div>'+
   '<div class="befn-v3-status befn-scout-classification">'+
   (v3.category!=='Champion'?'<span>'+escapeHTML(v3.category)+'</span>':'')+
   (v3.officialRank?'<small>UFC division #'+v3.officialRank+'</small>':'')+
   '</div></div>'+
   '<section class="befn-profile-block befn-v3-technical"><h3>Technical ratings</h3><div class="befn-profile-body"><div class="befn-power-bars">'+
   ratings.map(([id,label])=>{
    const m=v3.technical[id];
    return profileMetric({label,score:m.score},scoreTier(m.score));
   }).join('')+'</div></div></section>'+
   '<div class="befn-v3-bottom-grid">'+
   '<details class="befn-v3-history" open><summary>Recent fights <small>Up to five documented UFC fights</small></summary>'+
   '<ul class="befn-v3-fights">'+v3.recent.map(b=>{
    const [symbol,klass]=resultSymbol(b.outcome);
    return '<li><span class="befn-power-result '+klass+'">'+symbol+'</span>'+
     '<strong class="befn-v3-opponent">'+escapeHTML(b.opponent)+'</strong>'+
     '<span class="befn-v3-method">'+escapeHTML((b.method||'Method unavailable').replaceAll('_',' '))+'</span>'+
     '<time class="befn-v3-date">'+escapeHTML(b.date||'Date unavailable')+'</time></li>';
   }).join('')+'</ul></details>'+
   '<div class="befn-v3-data-side">'+
   (tiles.length?'<section class="befn-v3-stat-panel"><h3>Recent Performance</h3><div class="befn-v3-tiles">'+tiles.map(([value,label,sample])=>'<div><strong>'+escapeHTML(value)+'</strong><span>'+escapeHTML(label)+'</span><small>'+escapeHTML(sample)+'</small></div>').join('')+'</div></section>':'')+
   '</div>'+
   '</div>'+
   renderPerformanceHighlights(f,v3)+
   (statRows?'<details class="befn-v3-statistics befn-v3-rank-full"><summary>All recent statistics</summary><ul class="befn-v3-rank-tiles">'+statRows+'</ul></details>':'')+
   '</section>';
 }
 function renderV3Boards(){
  const root=document.querySelector('[data-befn-v3-leaderboards]');
  if(!root||root.dataset.ready||!ufcV3)return;
  root.dataset.ready='true';
  root.innerHTML='<summary>UFC statistical leaderboards</summary><p>'+ufcV3.population+
   ' fighters with documented UFC activity since '+escapeHTML(ufcV3.cutoff)+'. Snapshot '+escapeHTML(ufcV3.asOf)+
   '. Rankings require at least three measured UFC bouts; five recent fights are the target. Incomplete snapshots do not display stale ranks.</p>'+
   '<label>Statistic <select aria-label="UFC leaderboard statistic">'+ufcV3.boards.map(b=>
    '<option value="'+escapeHTML(b.id)+'">'+escapeHTML(b.label)+'</option>').join('')+
   '</select></label><div class="befn-v3-board-results"></div>';
  const select=root.querySelector('select'), results=root.querySelector('.befn-v3-board-results');
  const show=()=>{
   const board=ufcV3.boards.find(b=>b.id===select.value);
   // Legacy snapshots include 2-bout athletes and ranks based on that old
   // pool. Do not display either until a schema 4 rebuild recalculates ranks.
   const fresh=ufcV3.schema>=4;
   const qualifying=board.leaders.filter(row=>row.bouts>=3);
   const display=qualifying.slice(0,10);
   const summary=fresh?board.eligible+' eligible fighters · minimum 3 recorded UFC bouts':
    'Minimum 3 recorded UFC bouts · previous rankings are being recalculated';
   results.innerHTML='<p>'+summary+
    (board.id==='sapm'?' · lower is better':'')+'</p>'+
    (display.length?'<ul>'+display.map(row=>
    '<li><span>'+(fresh?'#'+row.rank+' · ':'')+escapeHTML(row.name)+'</span><strong>'+
    metricValue(row,board.type==='def'?'pct':board.type)+'</strong><small>'+
    row.bouts+' recorded UFC bouts'+(fresh?'':' · provisional top-performer sample')+
    '</small></li>').join('')+'</ul>':
    '<p>No qualifying fighters in this leaderboard snapshot. A full rebuild is required.</p>');
  };
  select.addEventListener('change',show);
  show();
 }
 function applyV3(f){
  const record=v3For(f);
  if(record){
   f.category=record.category;
   f.classification={...f.classification,label:record.category,score:record.trajectory,version:3};
  }
 }
 function getName(article,side){
  const el=article.querySelectorAll(".result-contender-info > strong")[side];
  if(!el)return "";
  const nodes=[...el.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join(" ").trim();
  return nodes||el.textContent.replace(/\s+#\d+\s*$/,"").trim();
 }
 function sportFor(article,a,b){
  if(a?.sport)return a.sport;
  if(b?.sport)return b.sport;
  const explicit=article.closest("[data-befn-sport]")?.dataset?.befnSport;
  if(explicit)return explicit==="boxing"?"Boxing":"MMA";
  const root=article.closest("#upcoming-cards-root");
  const sport=root?.dataset?.upcomingSport ||window.BEFNSport?.get()||"";
  return sport==="boxing"?"Boxing":"MMA";
 }
 function matchupKey(article,names){
  const card=article.closest("[data-upcoming-card],[data-result-event]");
  const id=card?.dataset?.upcomingCard||card?.dataset?.resultEvent||"";
  return id+":"+names.map(norm).join(":");
 }

 const secTime=s=>Number.isInteger(s)&&s>=0?
  Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):"—";
 const plainDate=str=>String(str||"").replace(/^\s+/,"");
 function latestRows(f){
  if(!f||!Array.isArray(f.latest))return [];
  return f.latest.filter(x=>x&&x.opponent&&/^(W|L|D|NC|WIN|LOSS|DRAW|NO CONTEST)$/i.test(String(x.outcome||x.result||"")))
    .slice(0,5);
 }
 function shortRecord(f){
  return f?.record?String(f.record).replace(/\s*\([^()]*KOs?\)/i,""):"Record unavailable";
 }
 function outcomeTag(item){
  const result=String(item.outcome||item.result||"").toUpperCase().trim();
  const mark=result==="W"||result==="WIN"?"W":result==="L"||result==="LOSS"?"L":result==="NC"||result==="NO CONTEST"?"NC":"D";
  const className=mark==="W"?"is-win":mark==="L"?"is-loss":mark==="NC"?"is-no-contest":"is-draw";
  const meth=String(item.method||"").toUpperCase();
  const tag=/KO|TKO/.test(meth)?"TKO":/SUB|CHOKE|ARMBAR/.test(meth)?"SUB":/DEC|UD|SD|MD/.test(meth)?"DEC":mark==="NC"?"NC":"";
  return '<span class="befn-history-outcome '+className+'"><b>'+mark+'</b>'+(tag?'<small>'+tag+'</small>':'')+'</span>';
 }
 function fightHistoryColumn(f,heading){
  const fights=latestRows(f);
  return '<section class="befn-history-side"><div class="befn-history-fighter"><b>'+escapeHTML(heading)+'</b>'+
   '<span>'+escapeHTML(f?shortRecord(f):"Profile not yet available")+'</span></div>'+
   '<div class="befn-history-table-head" aria-hidden="true"><span>Result / opponent</span><span>Cage time</span></div>'+
   (fights.length?fights.map(h=>
    '<div class="befn-history-fight">'+outcomeTag(h)+
    '<div class="befn-history-desc"><small>'+escapeHTML(plainDate(h.date))+'</small>'+
    '<strong>'+escapeHTML(h.opponent)+'</strong>'+
    '<span>'+escapeHTML(h.method||"Method not recorded")+'</span></div>'+
    '<div class="befn-history-duration" title="Total cage time, not control time" aria-label="Total cage time '+escapeHTML(secTime(h.cageSec))+'">'+
    '<strong>'+escapeHTML(secTime(h.cageSec))+'</strong></div></div>').join(""):
    '<p class="befn-history-empty">Last five verified results not yet available.</p>')+'</section>';
 }
 const lastFivePanel=(f,names)=>{
  return '<section class="befn-history-two befn-history-with-cage" aria-label="Last five fights and cage time side-by-side">'+
   fightHistoryColumn(f[0],names[0])+fightHistoryColumn(f[1],names[1])+'</section>'+
   '<p class="befn-snapshot-disclaimer befn-history-cage-note">'+
   'Cage time is total elapsed fight time; — means exact duration unavailable.'+
   '</p>';
 };
 const availableNumber=(v,digits)=>{
  return typeof v==="number"&&Number.isFinite(v)?v.toFixed(digits??0):"—";
 };
 const referenceStat=(f,key)=>{
  // Screenshot comparison figures are illustrative and never treated as sourced observations.
  const data=statRecord(f)?.stats;
  if(!data)return null;
  const map={sigLandedPerMin:"slpm",sigAbsorbedPerMin:"sapm",sigAccuracy:"strAcc"};
  const val=data[map[key]];
  return typeof val==="number"&&Number.isFinite(val)?val:null;
 };
 function statsPanel(f,names){
  const rows=[
   ["Striking",null],
   ["Significant strikes / min","sigLandedPerMin","rate"],
   ["Strikes absorbed / min","sigAbsorbedPerMin","rate"],
   ["Striking accuracy","sigAccuracy","percent"],
   ["Total strikes landed (tracked)","totalLanded","count"],
   ["Total strike differential (tracked)","totalStrikeDifferential","signed"],
   ["Significant strike differential (tracked)","sigStrikeDifferential","signed"],
   ["Knockdowns landed","knockdowns","count"],
   ["Grappling",null],
   ["Control time","controlSec","time"],
   ["Takedowns landed","takedowns","count"],
   ["Takedowns defended","takedownsDefended","count"],
   ["Submission attempts","submissionAttempts","count"]
  ];
  const body=rows.map(([label,key,fmt])=>{
   if(!key)return '<h4 class="befn-history-stat-heading">'+escapeHTML(label)+'</h4>';
   const values=f.map(x=>{
    const d=trackedUfcStats.get(norm(x?.name));
    const field=key==="knockdowns"?"knockdowns":
     key==="controlSec"?"controlSec":
     key==="takedowns"?"takedowns":
     key==="submissionAttempts"?"subAttempts":key;
    const entry=d?.totals?.[field];
    if(Number.isInteger(entry?.value))return entry.value;
    return referenceStat(x,key);
   });
   const value=x=>x===null?"—":fmt==="rate"?availableNumber(x,2):
    fmt==="percent"?availableNumber(x)+"%":fmt==="time"?secTime(x):
    fmt==="signed"?trackedMetric(x,"signed"):String(x);
   return '<div class="befn-history-stat"><b>'+escapeHTML(value(values[0]))+'</b>'+
    '<span>'+escapeHTML(label)+'</span><b>'+escapeHTML(value(values[1]))+'</b></div>';
  }).join("");
  return '<section class="befn-history-stats"><div class="befn-history-stats-head"><strong>'+
    escapeHTML(names[0])+'</strong><span>Last five / available sample</span><strong>'+escapeHTML(names[1])+'</strong></div>'+
    body+'<p class="befn-snapshot-disclaimer">— indicates unavailable statistics.</p></section>';
 }
 const inchesText=inches=>typeof inches==="number"&&Number.isFinite(inches)?
  Math.floor(inches/12)+"′"+(inches%12===0?0:Math.round((inches%12)*10)/10)+"″":"—";
 function talePanel(f,names){
  const rows=[
   ["Age",x=>Number.isInteger(x?.tale?.age)?String(x.tale.age):"—",false],
   ["Height",x=>inchesText(x?.tale?.heightIn),false],
   ["Arm reach",x=>inchesText(x?.tale?.reachIn),false],
   ["Professional record",x=>x?.record?shortRecord(x):"—",false],
   ["UFC record",x=>x?.tale?.ufcRecord||"—",false],
   ["Record outside UFC",x=>x?.taleReference?.recordOutsideUFC||"—",true],
   ["UFC title fights",x=>x?.taleReference?.ufcTitleFights||"—",true],
   ["Total finishes",x=>x?.taleReference?.totalFinishes||"—",true],
   ["KO/TKO",x=>x?.taleReference?.koTko||"—",true],
   ["Submission",x=>x?.taleReference?.submissions||"—",true],
   ["Unanimous decisions",x=>x?.taleReference?.unanimousDecisions||"—",true],
   ["Split decisions",x=>x?.taleReference?.splitDecisions||"—",true]
  ];
  return '<details class="befn-tale"><summary>Tale of the Tape <span>Age · height · reach · career</span></summary>'+
   '<div class="befn-history-stats-head"><strong>'+escapeHTML(names[0])+'</strong><span>Comparison</span><strong>'+escapeHTML(names[1])+'</strong></div>'+
   rows.filter(row=>!row[2]).map(([label,fn,ref])=>{
    const values=f.map(x=>fn(x));
    if(values.every(v=>v==="—"))return "";
    return '<div class="befn-history-stat"><b>'+escapeHTML(values[0])+'</b><span>'+escapeHTML(label)+'</span><b>'+escapeHTML(values[1])+'</b></div>';
   }).join("")+

   '</details>';
 }
 function renderSnapshot(article){
  const names=[getName(article,0),getName(article,1)];
  if(names.some(x=>!x))return "";
  const f=names.map(profileFor),sport=sportFor(article,f[0],f[1]);
  const rows=f.map(x=>ratingsFor(x,sport)),labels=rows[0].map(x=>x.label);
  const metricHTML=labels.map((label,i)=>{
   const m0=rows[0][i],m1=rows[1][i];
   return '<div class="befn-snapshot-metric">'+
    '<b>'+(m0.score===null?'—':m0.score)+'</b>'+performanceMeter(m0,true)+
    '<span class="befn-snapshot-metric-label">'+escapeHTML(label)+'</span>'+
    performanceMeter(m1,false)+'<b>'+(m1.score===null?'—':m1.score)+'</b></div>';
  }).join("");
  const sides=f.map((p,i)=>
   '<div><h4>'+escapeHTML(names[i])+' · recent form</h4>'+formHTML(p)+
   '<h4 style="margin-top:12px!important">Credentials</h4>'+credentialsHTML(p)+
   '</div>'
  ).join("");
  const buttons=f.map((p,i)=>p?
   '<button type="button" data-fighter="'+escapeHTML(p.id)+'" aria-label="Open '+escapeHTML(p.name)+' full fighter profile">'+escapeHTML(p.name)+' profile</button>':
   '<span class="befn-link-unavailable">Profile not yet available</span>').join("");
  const key=matchupKey(article,names),active=selectedTabs.get(key)==="stats"?"stats":"fights";
  const tabOptions=[["fights","Last 5 Fights"],["stats","Stats"]];
  const historyTab='<section class="befn-recent-history" aria-label="Recent fight history">'+
   '<h3 class="befn-comparison-heading">Recent fight history</h3>'+
   '<div class="befn-history-tabs" role="tablist" aria-label="Choose fight history view">'+
   tabOptions.map(([id,label])=>
    '<button type="button" role="tab" data-befn-history-tab="'+id+
    '" aria-selected="'+String(active===id)+'" class="'+(active===id?'is-active':'')+'">'+label+'</button>'
   ).join("")+'</div>'+
   '<div class="befn-history-panel">'+(active==="stats"?statsPanel(f,names):lastFivePanel(f,names))+'</div></section>';
  return '<details class="befn-fight-snapshot" data-snapshot-key="'+escapeHTML(key)+'" '+(openSnapshots.has(key)?'open':'')+'>'+
   '<summary><span>Fight snapshot</span></summary>'+
   '<div class="befn-snapshot-body">'+
   '<div class="befn-snapshot-head"><div><strong>'+escapeHTML(names[0])+'</strong>'+
   '</div><div><strong>'+escapeHTML(names[1])+'</strong></div></div>'+
   '<div class="befn-snapshot-bars">'+metricHTML+'</div>'+
   '<div class="befn-snapshot-extra">'+sides+'</div>'+
   historyTab+talePanel(f,names)+
   '<div class="befn-snapshot-links">'+buttons+'</div>'+
   '<p class="befn-snapshot-disclaimer">— indicates unavailable data.</p>'+
   '</div></details>';
 }
 let timer=null;
 function hydrate(){
  renderV3Boards();
  for(const article of document.querySelectorAll("article.result-bout-compact")){
   if(article.querySelector(":scope > .befn-fight-snapshot"))continue;
   const html=renderSnapshot(article);
   if(html)article.insertAdjacentHTML("beforeend",html);
  }
 }
 function schedule(){
  if(timer!==null)return;
  timer=requestAnimationFrame(()=>{timer=null;hydrate()});
 }
 function layoutV3Dialog(){
  const dialog=document.querySelector('#fighterDialog.befn-v3-dialog');
  const profile=dialog?.querySelector('.befn-profile-insights.befn-v3');
  const bio=dialog?.querySelector('.dialog-bio');
  const meta=bio?.querySelector('.befn-bio-meta');
  if(!profile||!bio||!meta)return;
  const hero=profile.querySelector(':scope > .befn-v3-hero');
  const technical=profile.querySelector(':scope > .befn-v3-technical');
  // Async profile refreshes rebuild the profile. Remove stale moved panels.
  if(hero){meta.querySelectorAll(':scope > .befn-v3-hero').forEach(el=>el.remove());meta.append(hero);}
  if(technical){bio.querySelectorAll(':scope > .befn-v3-technical').forEach(el=>el.remove());bio.append(technical);}
 }
 function update(){
  renderV3Boards();
  const top=document.querySelector("#fighterDialog [data-befn-top-credentials]");
  const current=document.querySelector("#fighterDialog .befn-profile-insights[data-befn-profile]");
  const fighter=current&&byId.get(current.dataset.befnProfile);
  if(top&&fighter)top.innerHTML=credentialsFor(fighter).length?credentialsHTML(fighter):"";
  for(const el of document.querySelectorAll(".befn-profile-insights[data-befn-profile]")){
   const f=byId.get(el.dataset.befnProfile);
   if(f){
    if(v3For(f))el.closest(".dialog-content")?.querySelector("[data-befn-legacy-results]")?.remove();
    el.outerHTML=renderProfile(f);
   }
  }
  for(const el of document.querySelectorAll(".befn-fight-snapshot")){
   if(el.open)openSnapshots.add(el.dataset.snapshotKey);
   const article=el.closest("article.result-bout-compact");
   if(article){const html=renderSnapshot(article);if(html)el.outerHTML=html}
  }
  layoutV3Dialog();
  schedule();
 }

 document.addEventListener("click",e=>{
  const btn=e.target.closest?.("[data-befn-history-tab]");
  if(!btn)return;
  const snap=btn.closest(".befn-fight-snapshot");
  if(!snap)return;
  const key=snap.dataset.snapshotKey;
  const id=btn.dataset.befnHistoryTab;
  if(!["fights","stats"].includes(id))return;
  selectedTabs.set(key,id);
  for(const tab of snap.querySelectorAll("[data-befn-history-tab]")){
   const active=tab.dataset.befnHistoryTab===id;
   tab.classList.toggle("is-active",active);
   tab.setAttribute("aria-selected",String(active));
  }
  const article=snap.closest("article.result-bout-compact");
  if(!article)return;
  const names=[getName(article,0),getName(article,1)];
  const f=names.map(profileFor);
  const panel=snap.querySelector(".befn-history-panel");
  if(panel)panel.innerHTML=id==="stats"?statsPanel(f,names):lastFivePanel(f,names);
 },true);
 document.addEventListener("click",e=>{
  const button=e.target.closest?.("[data-credential-info]");
  if(!button)return;
  const strip=button.closest(".befn-credential-list");
  if(!strip)return;
  e.stopPropagation();
  let note=strip.nextElementSibling;
  if(!note?.classList.contains("befn-credential-help")){
   note=document.createElement("p");note.className="befn-credential-help";
   strip.insertAdjacentElement("afterend",note);
  }
  const label=document.createElement("span");label.textContent=button.dataset.credentialInfo||"Verified credential";
  note.replaceChildren(label);
 },true);
 document.addEventListener("toggle",event=>{
  const el=event.target;
  if(!el?.matches?.(".befn-fight-snapshot"))return;
  if(el.open)openSnapshots.add(el.dataset.snapshotKey);
  else openSnapshots.delete(el.dataset.snapshotKey);
 },true);
 const mount=document.getElementById("main")||document.body;
 if(mount&&typeof MutationObserver!=="undefined")new MutationObserver(schedule).observe(mount,{subtree:true,childList:true});
 window.addEventListener("befn:round-previews-ready",event=>{
  const aggregate=engine.aggregateRoundPreviews?.(event.detail?.events);
  if(!(aggregate instanceof Map))return;
  let added=0;
  for(const [key,observation] of aggregate){
   roundObservations.set(key,observation);
   const fighter=byName.get(key)||sampleEvidence.get(key);
   if(!fighter||fighter.sport!=="MMA"||isReviewedUfc(fighter))continue;
   fighter.performanceEvidence=observation;
   added++;
  }
  if(added)update();
 });
 window.BEFNFighterInsights={renderProfile,credentialsFor,ratingsFor,renderSnapshot,profileFor,hydrate,layoutV3Dialog,topCredentials:f=>credentialsFor(f).length?credentialsHTML(f):"",hasV3:f=>!!v3For(f)};
 schedule();

 fetch("data/fighter-comparison-sample.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>{
  if(!data||data.schema!==1||!data.fighters)return;
  for(const fighter of Object.values(data.fighters)){
   if(!fighter?.name||!fighter.id)continue;
   const key=norm(fighter.name);
   const existing=byName.get(key);
   if(existing){
    if(isReviewedUfc(existing)){
     sampleEvidence.set(key,existing);
     continue;
    }
    // Preserve canonical editorial records, photos, and citations; add only
    // reference comparison dimensions and independently supplied timing data.
    // Do not overwrite the newer, source-checked card credentials with an
    // older comparison sample, regardless of which fetch resolves first.
    if(!existing.verifiedStats&&Array.isArray(fighter.credentials))
     existing.credentials=[...(existing.credentials||[]),...fighter.credentials.filter(x=>
      !(existing.credentials||[]).some(y=>y.kind===x.kind&&y.division===x.division))];
    if(fighter.tale)existing.tale=fighter.tale;
    existing.taleReference=fighter.taleReference;
    existing.statsReference=fighter.statsReference;
    existing.reference=fighter.reference;
    if(!existing.verifiedStats&&Array.isArray(fighter.credentials)){
     // Source-linked preview-only credentials, deduplicated by category.
     const current=Array.isArray(existing.credentials)?existing.credentials:[];
     for(const c of fighter.credentials){
      if(!current.some(x=>x.kind===c.kind&&x.division===c.division))current.push(c);
     }
     existing.credentials=current;
    }
    if(!existing.verifiedStats && Array.isArray(fighter.latest)&&Array.isArray(existing.latest)){
     // Do not overwrite curated, source-checked cage times with earlier
     // screenshot-derived comparison examples.
     for(const item of existing.latest){
      const same=fighter.latest.find(x=>norm(item.opponent)===norm(x.opponent)||norm(item.opponent).includes(norm(x.opponent)));
      if(same&&Number.isInteger(same.cageSec))item.cageSec=same.cageSec;
     }
    }
   }else{
    const p={...fighter,photo:"",report:"mma-contenders",sources:[{label:"Official UFC athlete biography",url:fighter.source}],analysis:[],verificationNote:"Biographical details from UFC; example fight-by-fight times from supplied comparison screenshot need independent verification."};
    profiles.push(p);byId.set(p.id,p);byName.set(key,p);
   }
   const target=byName.get(key);
   if(roundObservations.has(key)&&target?.sport==="MMA"&&!isReviewedUfc(target))
    target.performanceEvidence=roundObservations.get(key);
   sampleEvidence.set(key,target);
  }
  update();
 }).catch(()=>{});
 fetch("data/ufc334-fighter-evidence.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>{
  if(!data||data.schema!==1||data.eventId!=="ufc-334-2026-11-14"||!data.fighters)return;
  for(const item of Object.values(data.fighters)){
   if(!item?.name||item.sport!=="MMA"||!validSource(item.source))continue;
   const key=norm(item.name);
   let fighter=byName.get(key);
   if(isReviewedUfc(fighter)){
    // Never overwrite authoritative UFC-only bouts with event preview results.
    sampleEvidence.set(key,fighter);
    continue;
   }
   if(!fighter){
    fighter={...item,latest:[],analysis:[],photo:"",report:"mma-contenders",
     category:item.category||"Featured card",
     meta:"Upcoming at UFC 334. Stats are descriptive, not an ability prediction.",
     sources:[{label:"Fighter statistics and verified results",url:item.source}],
     verificationNote:"Research snapshot checked "+data.reviewedOn+
       "; incomplete categories remain unrated."};
    profiles.push(fighter);
    byName.set(key,fighter);
    byId.set(fighter.id,fighter);
   }else{
    if(!Array.isArray(fighter.sources))fighter.sources=[];
    if(!fighter.sources.some(x=>x.url===item.source))
     fighter.sources.push({label:"UFC 334 research and statistical source",url:item.source});
   }
   if(!fighter.championReview&&item.verifiedStats&&validSource(item.verifiedStats.source)&&
      Number.isInteger(item.verifiedStats.sampleBouts))
    fighter.verifiedStats=item.verifiedStats;
   if(!fighter.championReview&&Array.isArray(item.credentials)){
    const original=Array.isArray(fighter.credentials)?fighter.credentials:[];
    for(const c of item.credentials){
     if(!c||!validSource(c.source))continue;
     const i=original.findIndex(x=>x.kind===c.kind&&x.division===c.division);
     // Replace older preview references with newly checked primary evidence.
     if(i>=0)original[i]=c;else original.push(c);
    }
    fighter.credentials=original;
   }
   // Curated verified result summaries replace screenshot-only timing examples
   // only for this card, never for unrelated fighter records.
   if(!fighter.championReview&&Array.isArray(item.latest)&&item.latest.length)
    fighter.latest=item.latest.map(x=>({...x}));
   const round=roundObservations.get(key);
   if(round&&!isReviewedUfc(fighter))fighter.performanceEvidence=round;
   sampleEvidence.set(key,fighter);
  }
  update();
 }).catch(()=>{});
 // UFC champions are the first fully researched athlete cohort.
 // This may resolve before or after the UFC 334 card sample: the reviewed
 // champion profile is authoritative for its UFC-only statistics and history.
 fetch("data/ufc-champion-profiles.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{
  if(!d||d.schema!==1||d.scope!=="ufc-champions"||
    !Array.isArray(d.divisions)||d.divisions.length!==11||!d.fighters)return;
  for(const source of Object.values(d.fighters)){
   if(!source?.name||source.organisation!=="UFC"||source.sport!=="MMA"||
      source.category!=="Champion"||!validSource(source.source)||!source.review?.credentialsChecked)continue;
   const key=norm(source.name);
   let target=byName.get(key);
   if(!target){
    target={...source,photo:"",report:"mma-champions",
     sources:[],analysis:[]};
    profiles.push(target);byName.set(key,target);
   }
   // The champion ID is canonical for links in the Champions and Fighters pages.
   if(target.id!==source.id){
    byId.delete(target.id);
    target.id=source.id;
   }
   byId.set(source.id,target);
   target.organisation="UFC";
   target.sport="MMA";target.category="Champion";
   target.division=source.division;target.record=source.record;
   target.meta=source.meta;target.review=source.review;
   target.verificationNote=source.verificationNote;
   target.latest=source.latest.map(x=>({...x}));
   target.analysis=source.review?.notes?.length?source.review.notes:
      ["Individual credential review completed; no confirmed qualifying award entered."];
   target.sources=[
    {label:"Official UFC athlete biography & fight history",url:source.source},
    {label:"UFC-only statistics and sample size",url:source.statSource},
    {label:"UFC titleholders",url:d.sources?.champions}
   ].filter(x=>validSource(x.url));
   for(const c of source.credentials||[]){
    if(validSource(c?.source)&&!target.sources.some(x=>x.url===c.source))
     target.sources.push({label:"Credential: "+c.kind,url:c.source});
   }
   target.credentials=(source.credentials||[]).filter(c=>validSource(c.source)).map(x=>({...x}));
   const covered=source.verifiedStats;
   if(covered&&covered.scope==="ufc-only"&&validSource(covered.source)&&
      Number.isInteger(covered.sampleBouts)&&covered.sampleBouts>=2)
    target.verifiedStats={...covered};
   target.championReview=true;
   target.classification=classifier?.classify(source,engine)||{label:"Champion",score:null,
    reason:"Dated verified UFC titleholder",eligible:true};
   applyV3(target);
   // Independently reviewed UFC stats must not inherit partial preview
   // observations, even when the preview fetched before this champion cohort.
   delete target.performanceEvidence;
   sampleEvidence.set(key,target);
  }
  update();
  window.dispatchEvent(new CustomEvent("befn:champion-profiles-ready",{detail:{count:11}}));
 }).catch(()=>{});
 // Progressive UFC-only scouting roll-out: cards are added ONLY from reviewed
 // cohorts. The five-minute GitHub queue is never published as fighter data.
 const reviewedFiles=["data/ufc-ranked-profiles.json",
   "data/ufc-contender-profiles.json","data/ufc-prospect-profiles.json",
   "data/ufc-roster-profiles.json"];
 Promise.all(reviewedFiles.map(url=>fetch(url,{cache:"no-store"})
   .then(r=>r.ok?r.json():null).catch(()=>null))).then(cohorts=>{
  let count=0;
  const duplicates=new Set();
  const champions=new Set((window.COMBAT_DATA?.champions?.mma||[]).map(x=>norm(x.name)));
  for(const d of cohorts){
   if(!d||d.schema!==1||d.scope!=="ufc-only"||!d.fighters)continue;
   for(const source of Object.values(d.fighters)){
    if(!source?.id||!source?.name||!source?.division||!source?.record||
       source.organisation!=="UFC"||source.sport!=="MMA"||
       !["Contender","Prospect","Roster"].includes(source.category)||
       !validSource(source.source)||!source.review?.credentialsChecked||
       !Array.isArray(source.review.notes)||!source.review.notes.length||
       !Array.isArray(source.latest)||!source.latest.length||
       !Array.isArray(source.credentials))continue;
    // Source-review is necessary but not sufficient: the BEFN algorithm
    // independently classifies every athlete, with no division quotas.
    const classified=classifier?.classify(source,engine);
    if(!classified||(!classified.eligible&&source.category!=="Roster")||
       (classified.eligible&&!["Contender","Prospect","Roster"].includes(classified.label)))continue;
    const key=norm(source.name);
    if(duplicates.has(key)||champions.has(key))continue;
    if(!source.latest.every(x=>x?.opponent&&x?.method&&
       /^\d{4}-\d{2}-\d{2}$/.test(String(x.date||""))&&
       ["W","L","D","NC"].includes(x.outcome)))continue;
    duplicates.add(key);
    let target=byName.get(key);
    if(target?.championReview===true)continue;
    if(!target){
     target={...source,photo:"",report:"mma-contenders",analysis:[]};
     profiles.push(target);
     byName.set(key,target);
    }else if(target.id!==source.id){
     byId.delete(target.id);
    }
    target.id=source.id;
    byId.set(source.id,target);
    target.organisation="UFC";target.sport="MMA";
    target.category=classified.eligible?classified.label:"Unassessed";
    target.classification=classified;
    target.division=source.division;
    target.record=source.record;
    target.reviewedUfcProfile=true;
    applyV3(target);
    target.review=source.review;
    target.meta=source.meta||("UFC · individually reviewed "+source.review.checkedAt);
    // Legacy scouting snapshots can contain past "upcoming" fights. A
    // completed result must never remain displayed as a future booking.
    // Only independently verified future fixtures from the reviewed profile
    // are permitted here; otherwise make the unknown status explicit.
    target.next=source.nextVerified===true&&typeof source.next==="string"?
      source.next:"Not currently verified";
    target.analysis=[...source.review.notes];
    target.latest=source.latest.map(x=>({...x}));
    target.verificationNote=source.verificationNote||"Checked UFC evidence. Incomplete metrics remain unrated.";
    target.credentials=source.credentials.filter(c=>validSource(c?.source)).map(c=>({...c}));
    target.sources=[
     {label:"Official UFC fighter biography",url:source.source},
     {label:"UFC statistical sample",url:source.verifiedStats?.source}
    ].filter(x=>validSource(x.url));
    for(const c of target.credentials)if(!target.sources.some(x=>x.url===c.source))
     target.sources.push({label:"Credential: "+c.kind,url:c.source});
    const checked=source.verifiedStats;
    if(checked&&checked.scope==="ufc-only"&&validSource(checked.source)&&
       Number.isInteger(checked.sampleBouts)&&checked.sampleBouts>=2)
     target.verifiedStats={...checked};
    else delete target.verifiedStats;
    // Do not let partial UFC/PFL round snapshots override reviewed UFC-only rates.
    delete target.performanceEvidence;
    if(source.photoRightsVerified===true&&validSource(source.photo))
      target.photo=source.photo;
    sampleEvidence.set(key,target);
    count++;
   }
  }
  if(count){
   update();
   // The main page's router owns the profile grid, while this module owns
   // shared fighter data. Re-render only when viewing the fighter grid.
   if(document.querySelector("#fighterGrid"))
     window.dispatchEvent(new Event("hashchange"));
   window.dispatchEvent(new CustomEvent("befn:reviewed-ufc-profiles-ready",
     {detail:{count}}));
  }
 }).catch(()=>{});


 // Live-derived post-fight sample totals are independent of the career-wide
 // rating snapshot; they must not silently replace a longer audited sample.
 fetch("data/ufc-postfight-metrics.json",{cache:"no-store"})
  .then(r=>r.ok?r.json():null).then(d=>{
   if(!d||d.schema!==1||d.scope!=="ufc-only"||!d.fighters)return;
   let added=0;
   for(const value of Object.values(d.fighters)){
    if(!value?.name||!Array.isArray(value.recentBouts)||
       !Number.isInteger(value.trackedBouts)||value.trackedBouts<1)continue;
    if(!value.recentBouts.every(b=>b?.boutId&&b?.opponent&&
       /^\d{4}-\d\d-\d\d$/.test(String(b.date||""))))continue;
    trackedUfcStats.set(norm(value.name),value);added++;
   }
   if(added){
    update();
    window.dispatchEvent(new CustomEvent("befn:ufc-postfight-stats-ready",
      {detail:{count:added}}));
   }
  }).catch(()=>{});

 fetch("data/ufc-fighter-v3.json").then(r=>r.ok?r.json():null).then(data=>{
  if(![3,4].includes(data?.schema)||!Array.isArray(data.boards)||!data.fighters)return;
  ufcV3=data;
  for(const f of profiles)applyV3(f);
  if(document.querySelector('#fighterGrid'))window.dispatchEvent(new Event('hashchange'));
  update();
 }).catch(()=>{});
 fetch("data/fighter-intelligence.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{
  if(!d||!Array.isArray(d.fighters))return;
  for(const rec of d.fighters){if(rec?.organisation==="UFC"&&rec.name)stats.set(norm(rec.name),rec)}
  update();
 }).catch(()=>{});
})();