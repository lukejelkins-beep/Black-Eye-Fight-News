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
   if(c.kind==="ncaa"&&!["I","II","III"].includes(c.division))continue;
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
   c.kind==="ncaa"?'<span class="befn-credential-ncaa"><small>NCAA'+(["I","II","III"].indexOf(c.division)+1)+'</small><b>🤼</b></span>'+
     (medalIcon[c.medal]?'<em class="befn-credential-medal">'+medalIcon[c.medal]+'</em>':''):
   c.kind==="olympic-judo"?'<span class="befn-credential-judo"><small>JUDO</small><b>🥋</b><small>OG</small></span>'+
     (c.medal&&medalIcon[c.medal]?'<em class="befn-credential-medal">'+medalIcon[c.medal]+
       (c.medalCount>1?'<small>×'+c.medalCount+'</small>':'')+'</em>':''):
   c.kind==="adcc"?'<span aria-hidden="true">🏆</span>':
   c.kind==="sambo"?'<span aria-hidden="true">⭐</span>':
   c.kind==="golden-gloves"?'<span aria-hidden="true">🥊</span>':
   c.kind==="olympics"?'<span aria-hidden="true">'+medalIcon[c.medal]+'</span>':
   '<span aria-hidden="true">♛</span>';
  return '<button type="button" class="befn-credential" data-kind="'+escapeHTML(c.kind)+
   (c.verification==="reported"?'" data-credential-verification="reported':'')+
   '" data-credential-info="'+escapeHTML(detail)+'" data-credential-source="'+escapeHTML(c.source)+
   '" title="'+escapeHTML(detail)+'" aria-label="'+escapeHTML(detail)+'">'+content+'</button>';
 }
 const credentialsHTML=f=>{
  const list=credentialsFor(f);
  return list.length?'<div class="befn-credential-list">'+list.map(badge).join("")+'</div>':
   '<span class="befn-credential-empty">No verified credentials from the selected categories on file.</span>';
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
 function performanceMeter(m,reverse){
  const valid=Number.isInteger(m.score)&&m.score>=0&&m.score<=100;
  const type=valid&&levels[engine.level(m.score)]?engine.level(m.score):"unrated";
  return '<span class="befn-power-track is-'+type+(reverse?' befn-bar-left':'')+'" '+
   (valid?'role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+m.score+'"':
    'role="img" aria-label="Not rated: insufficient evidence"')+
   ' title="'+escapeHTML(m.description)+'">'+(valid?'<span class="befn-power-fill" style="--power-width:'+m.score+'%"></span>':'')+'</span>';
 }
 function credentialScoreDetail(m){
  if(!m?.credentialAdjustment)return '';
  const links=(m.credentialBreakdown||[]).map(x=>
    '<a href="'+escapeHTML(x.source)+'" target="_blank" rel="noopener noreferrer" title="'+
    escapeHTML(x.label)+'">+'+x.points+' '+escapeHTML(x.label)+'</a>').join(' · ');
  return '<div class="befn-credential-score-note">'+
   '<strong>'+escapeHTML(String(m.baseScore))+' stats + '+
     m.credentialAdjustment+' credentials = '+m.score+'</strong>'+
   (links?'<span>'+links+'</span>':'')+'</div>';
 }
 function profileMetric(m){
  return '<div class="befn-power-metric"><div class="befn-power-metric-label">'+
   '<span>'+escapeHTML(m.label)+'</span><b'+(m.score===null?' class="is-unrated"':'')+'>'+
   (m.score===null?'Not rated':m.score+' / 100')+'</b></div>'+
   performanceMeter(m,false)+credentialScoreDetail(m)+'</div>';
 }
 const scoreMethodHTML=sport=>sport==="Boxing"?
  '<p class="befn-score-note">Boxing uses a separate evidence-gated model. KO share is a finishing proxy, not measured punch force. Boxing technical assessments require verified data.</p>':
  '<details class="befn-rating-method"><summary>How are MMA scores and credential points calculated?</summary>'+
  '<p><b>Data model:</b> A 0–100 descriptive scouting index, not objective skill or win probability. Only available verified stats contribute. Knockdown and finish rates are measured per fight or per 15 minutes, not counted without denominators. Small samples are moderated toward 50.</p>'+
  '<ul>'+
  '<li><b>Striking:</b> 25% KO/TKO finishes, 20% knockdowns/15 (45% finishing combined), 22% significant-strike differential, 18% volume, 15% accuracy.</li>'+
  '<li><b>Grappling:</b> 50% submission finishes, 30% submission attempts/15, 15% reversals/15, 5% control time. Submission evidence is compulsory.</li>'+
  '<li><b>Wrestling:</b> 34% takedowns/15, 21% accuracy, 28% control share, 12% takedown defence, 5% reversals/15. Takedown activity is compulsory.</li>'+
  '<li><b>Defence:</b> 31% inverse strikes absorbed, 29% strike defence, 22% takedown defence, 12% inverse knockdowns received, 6% inverse opponent control.</li>'+
  '<li><b>Recent form:</b> Last five verified results, weighted 5–4–3–2–1; no-contests ignored.</li>'+
  '</ul>'+
  '<p><b>Fixed sourced credential bonuses, applied to existing stats only:</b></p>'+
  '<ul>'+
  '<li><b>NCAA wrestling:</b> Division I gold +11, silver +10, bronze +9; Division II gold +8, silver +7, bronze +6; Division III gold +5, silver +4, bronze +3. Division I/II/III participation: +3/+2/+1. Verified All-American top-eight without podium: up to +2 more. Wrestling only.</li>'+
  '<li><b>Olympic judo:</b> Gold +9 Wrestling/+7 Grappling, silver +7/+5, bronze +5/+4, participant +2/+1. A repeat medal adds +1 to each (max +2).</li>'+
  '<li><b>ADCC:</b> Gold +8, silver +6, bronze +4 Grappling. <b>BJJ:</b> Black +4, brown +3, purple +2, blue +1 Grappling. Reported or disputed ranks earn zero.</li>'+
  '<li><b>Sambo:</b> Gold +5 Wrestling/+5 Grappling, silver +4/+4, bronze +3/+3. Verified <b>Combat</b> Sambo adds +3/+2/+1 Striking respectively; Sport Sambo adds no Striking.</li>'+
  '<li><b>Golden Gloves:</b> National +5, state +4, regional +3, junior +2, unspecified +1 Striking.</li>'+
  '</ul><p>The highest achievement per credential family counts; duplicate records cannot stack. Different families may combine, capped at +12 points per attribute. No credential points create a score when the MMA statistical minimum is not met. Badge sources, stat bases and bonuses are shown separately. Bonuses are editorial heuristics, <b>not scientifically validated or opponent-adjusted ratings</b>.</p></details>';

 function ratingsEvidence(f){
  const v=f?.verifiedStats;
  const sample=Number.isInteger(v?.sampleBouts)?v.sampleBouts:null;
  const src=validSource(v?.source)?v.source:null;
  if(!src)return '<span class="befn-rating-source-note">Insufficient verified statistical coverage.</span>';
  return '<span class="befn-rating-source-note">'+
   (sample!==null?escapeHTML(String(sample))+(v.scope==="ufc-only"?' UFC bouts · ':' recorded bouts · '):'')+
   (v.observedOn?'Checked '+escapeHTML(v.observedOn)+' · ':'')+
   '<a href="'+escapeHTML(src)+'" target="_blank" rel="noopener noreferrer">View stats source</a>'+
   (validSource(v.submissionWinSource)?' · <a href="'+escapeHTML(v.submissionWinSource)+
    '" target="_blank" rel="noopener noreferrer" title="'+
    escapeHTML(v.grapplingEvidenceNote||'Verified submission finish evidence')+
    '">Submission finishes</a>':'')+'</span>';
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
  const recent=(d.recentBouts||[]).filter(x=>x?.date&&x?.opponent).slice(0,5);
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
   '<p class="befn-score-note">Updated from completed UFC bouts with archived round-by-round observations. '+
   '<b>'+d.trackedBouts+' recorded bouts</b>, latest '+escapeHTML(d.lastFightDate)+
   '. These are <b>tracked-sample totals, not career totals</b>. Missing round fields are not guessed.</p>'+
   (pending?'<p class="befn-postfight-warning">New fight observed. Career record, recent form and 0–100 ratings await source review.</p>':"")+
   '<div class="befn-postfight-grid">'+rows.map(cell).join("")+'</div>'+
   (fightRows?'<details class="befn-postfight-history"><summary>Show per-fight strike and control observations</summary>'+
    '<ul>'+fightRows+'</ul></details>':"")+
   '<p class="befn-rating-source-note">Source: saved UFC-only UFCalendar-derived fight observations. '+
   '<a href="https://www.ufcalendar.com/" target="_blank" rel="noopener noreferrer">UFCalendar</a>. '+
   'Source disagreements and incomplete rounds are withheld pending verification.</p>'+
   '</div></section>';
 }


 function classificationHTML(f){
  if(f?.sport!=="MMA")return "";
  const c=f.classification;
  if(!c)return "";
  const category=String(c.label||"Unassessed");
  const score=c.score===null?"Not scored":c.score+" / 100";
  const fmt=n=>typeof n==="number"?n.toFixed(1)+"/100":"Not scored";
  const v2=c.version===2&&c.eligible&&c.label!=="Champion";
  const v2Summary=v2?'<div class="befn-classifier-indices">'+
   '<span><b>Prospect Index</b><strong>'+fmt(c.prospectIndex)+'</strong></span>'+
   '<span><b>Contender Index</b><strong>'+fmt(c.contenderIndex)+'</strong></span></div>'+
   '<p class="befn-score-note"><b>Evidence confidence:</b> '+escapeHTML(c.confidence||"Limited")+
   '. A strong prospect score does not establish contender-level opposition.</p>'+
   (Array.isArray(c.evidenceGaps)&&c.evidenceGaps.length?
    '<details><summary>Unverified or missing evidence</summary><ul>'+
    c.evidenceGaps.map(s=>'<li>'+escapeHTML(s)+'</li>').join('')+
    '</ul></details>':''):"";
  return '<section class="befn-profile-block befn-scout-classification" data-befn-classification="'+
   escapeHTML(f.id||"")+'"><h3>BEFN scouting classification</h3><div class="befn-profile-body">'+
   '<p><strong>'+escapeHTML(category)+'</strong> · '+escapeHTML(score)+'</p>'+
   v2Summary+
   '<p class="befn-score-note">'+escapeHTML(c.reason||"Evidence review pending")+'</p>'+
   '<p class="befn-score-note">Editorial classification only, not an official UFC ranking. '+
   'No limit on the number of prospects or contenders in any division. '+
   'Results, dated opponent rankings and verified statistics determine eligibility; '+
   'missing information does not earn bonus points.</p></div></section>';
 }

 function renderProfile(f){
  const kind=f.sport==="Boxing"?"Boxing credentials":"Combat & grappling credentials";
  const metrics=ratingsFor(f);
  const medallist=credentialsFor(f).find(x=>x.kind==="champion");
  const reviewedChampion=f.sport==="MMA"&&f.organisation==="UFC"&&
    f.category==="Champion"&&f.championReview===true&&
    validSource(f.review?.championStatusSource);
  const championshipText=reviewedChampion?
    "UFC "+String(f.division||"")+" titleholder as checked "+
    String(f.review.checkedAt||"on the profile review date")+
    ". Title status is a dated snapshot, not a live confirmation.":
    medallist?"Former world champion (see linked source reports).":
    f.sport==="Boxing"?"No independently documented former world title in this profile.":
    /former\s+UFC\s+[\w\s-]{0,25}champion/i.test(sourceText(f))?"Former UFC champion (see source notes).":
    "Championship history is not confirmed in the current profile.";
  const championshipLink=reviewedChampion?
    ' <a href="'+escapeHTML(f.review.championStatusSource)+
    '" target="_blank" rel="noopener noreferrer">Check UFC titleholders</a>':'';
  return '<section class="befn-profile-insights" data-befn-profile="'+escapeHTML(f.id)+'" aria-label="Fighter performance insights">'+
   '<section class="befn-profile-block"><h3>Fighter ratings</h3><div class="befn-profile-body">'+
   '<div class="befn-power-bars">'+metrics.map(profileMetric).join("")+'</div>'+scoreMethodHTML(f.sport)+
   '<p class="befn-rating-source-row">'+ratingsEvidence(f)+'</p>'+
   '<p class="befn-score-note">0–100 descriptive indices, not win probabilities. Missing statistics remain unrated. '+(f.sport==="Boxing"?'Power uses documented KO-win share as a finishing proxy.':'MMA ratings use source-backed striking, grappling, wrestling, defence and recent form data.')+'</p></div></section>'+
   trackedMetricHTML(f)+
   classificationHTML(f)+
   '<section class="befn-profile-block"><h3>Recent form (last 5)</h3><div class="befn-profile-body">'+formHTML(f)+'</div></section>'+
   '<section class="befn-profile-block"><h3>'+escapeHTML(kind)+'</h3><div class="befn-profile-body">'+credentialsHTML(f)+'</div></section>'+
   '<section class="befn-profile-block"><h3>'+(reviewedChampion?'Championship status':'Championship history')+'</h3><div class="befn-profile-body"><p class="befn-score-note" style="margin:0">'+escapeHTML(championshipText)+championshipLink+'</p></div></section></section>';
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
   (f.some(x=>x?.reference?.sourceType==="user-screenshot")?
    'Cage times in the design sample are unverified references from the supplied comparison; confirm against official bout records before production.':
    'Cage time is total elapsed fight time, not control time; — means exact duration unavailable.')+
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
  const hasVerified=f.some(x=>statRecord(x)?.stats?.observedOn||trackedUfcStats.has(norm(x?.name)));
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
    body+'<p class="befn-snapshot-disclaimer">'+(hasVerified?
    'Rates come from separately verified fighter statistics; strike, control and finishing counts cover only completed UFC bouts with matching round archives. Missing values are not zeros.':
    'No independently sourced statistics for this matchup yet; screenshot reference values are excluded and missing fields show —.')+'</p></section>';
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
   rows.map(([label,fn,ref])=>{
    const values=f.map(x=>fn(x));
    if(values.every(v=>v==="—"))return "";
    return '<div class="befn-history-stat"><b>'+escapeHTML(values[0])+'</b><span>'+escapeHTML(label)+(ref?' *':'')+'</span><b>'+escapeHTML(values[1])+'</b></div>';
   }).join("")+
   '<p class="befn-snapshot-disclaimer">Official athlete biographies provide physical details. * Other comparison figures are included as a design reference from your screenshots pending verification.</p>'+
   '</details>';
 }
 function renderSnapshot(article){
  const names=[getName(article,0),getName(article,1)];
  if(names.some(x=>!x))return "";
  const f=names.map(profileFor),sport=sportFor(article,f[0],f[1]);
  const rows=f.map(x=>ratingsFor(x,sport)),labels=rows[0].map(x=>x.label);
  const metricHTML=labels.map((label,i)=>{
   const m0=rows[0][i],m1=rows[1][i];
   const bonus=(m,dir)=>m.credentialAdjustment?
     (dir==='left'?'← ':'')+'+'+m.credentialAdjustment+' badges'+(dir==='right'?' →':''):'';
   const tooltip=names[0]+': '+(m0.score===null?'Not rated':m0.baseScore+' stats +'+m0.credentialAdjustment+' badges = '+m0.score)+
    '; '+names[1]+': '+(m1.score===null?'Not rated':m1.baseScore+' stats +'+m1.credentialAdjustment+' badges = '+m1.score);
   return '<div class="befn-snapshot-metric" title="'+escapeHTML(tooltip)+'">'+
    '<b>'+(m0.score===null?'—':m0.score)+'</b>'+performanceMeter(m0,true)+
    '<span class="befn-snapshot-metric-label">'+escapeHTML(label)+
    (m0.credentialAdjustment||m1.credentialAdjustment?
       '<small class="befn-college-bonus">'+escapeHTML(bonus(m0,'left'))+
       ' '+escapeHTML(bonus(m1,'right'))+'</small>':'')+
    '</span>'+
    performanceMeter(m1,false)+'<b>'+(m1.score===null?'—':m1.score)+'</b></div>';
  }).join("");
  const sides=f.map((p,i)=>
   '<div><h4>'+escapeHTML(names[i])+' · recent form</h4>'+formHTML(p)+
   '<h4 style="margin-top:12px!important">Credentials</h4>'+credentialsHTML(p)+
   rows[i].map(m=>credentialScoreDetail(m)).join('')+'</div>'
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
   '<div class="befn-snapshot-head"><div><strong>'+escapeHTML(names[0])+'</strong>'+ratingsEvidence(f[0])+
   '</div><div><strong>'+escapeHTML(names[1])+'</strong>'+ratingsEvidence(f[1])+'</div></div>'+
   '<div class="befn-snapshot-bars">'+metricHTML+'</div>'+
   '<div class="befn-snapshot-extra">'+sides+'</div>'+
   historyTab+scoreMethodHTML(sport)+talePanel(f,names)+
   '<div class="befn-snapshot-links">'+buttons+'</div>'+
   '<p class="befn-snapshot-disclaimer">Fighter ratings are descriptive indices, not fight predictions. “—” means no reliable data; credentials appear only after expanding this panel.</p>'+
   '</div></details>';
 }
 let timer=null;
 function hydrate(){
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
 function update(){
  for(const el of document.querySelectorAll(".befn-profile-insights[data-befn-profile]")){
   const f=byId.get(el.dataset.befnProfile);
   if(f)el.outerHTML=renderProfile(f);
  }
  for(const el of document.querySelectorAll(".befn-fight-snapshot")){
   if(el.open)openSnapshots.add(el.dataset.snapshotKey);
   const article=el.closest("article.result-bout-compact");
   if(article){const html=renderSnapshot(article);if(html)el.outerHTML=html}
  }
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
  const link=document.createElement("a");
  const source=button.dataset.credentialSource||"";
  if(/^https:\/\//.test(source)){
   link.href=source;link.target="_blank";link.rel="noopener noreferrer";
   link.textContent=" · Source";note.appendChild(link);
  }
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
 window.BEFNFighterInsights={renderProfile,credentialsFor,ratingsFor,renderSnapshot,profileFor,hydrate};
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

 fetch("data/fighter-intelligence.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{
  if(!d||!Array.isArray(d.fighters))return;
  for(const rec of d.fighters){if(rec?.organisation==="UFC"&&rec.name)stats.set(norm(rec.name),rec)}
  update();
 }).catch(()=>{});
})();