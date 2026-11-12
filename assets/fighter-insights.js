/* BEFN Fighter Insights — one read-only profile model for boxing and MMA.
 * Every score is derived from recorded evidence; missing ratings stay unrated.
 * This module augments profile dialogs and fight cards, never replaces live results. */
(function(){
 "use strict";
 const engine=window.BEFNPowerIndex;
 if(!engine)return;
 const escapeHTML=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const norm=engine.normalize;
 const profiles=(window.COMBAT_DATA?.fighters||[]);
 const byId=new Map(profiles.map(f=>[f.id,f]));
 const byName=new Map();
 for(const f of profiles){const k=norm(f.name);if(!byName.has(k))byName.set(k,f)}
 const stats=new Map();
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
  MMA:new Set(["ncaa","bjj","adcc","sambo","golden-gloves"])
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
   adcc:"ADCC "+c.medal+" medal",
   sambo:"Sambo "+c.medal+" medal",
   "golden-gloves":"Golden Gloves "+c.level+" achievement",
   olympics:"Olympic boxing "+c.medal+" medal",
   champion:"Former boxing world champion"
  }[c.kind]||"Verified credential");
  const content=c.kind==="bjj"?'<span class="befn-belt" style="--belt:'+beltColors[c.belt]+'"></span>':
   c.kind==="ncaa"?'<span class="befn-credential-ncaa"><small>NCAA'+(["I","II","III"].indexOf(c.division)+1)+'</small><b>🤼</b></span>'+
     (medalIcon[c.medal]?'<em class="befn-credential-medal">'+medalIcon[c.medal]+'</em>':''):
   c.kind==="adcc"?'<span aria-hidden="true">🏆</span>':
   c.kind==="sambo"?'<span aria-hidden="true">⭐</span>':
   c.kind==="golden-gloves"?'<span aria-hidden="true">🥊</span>':
   c.kind==="olympics"?'<span aria-hidden="true">'+medalIcon[c.medal]+'</span>':
   '<span aria-hidden="true">♛</span>';
  return '<button type="button" class="befn-credential" data-kind="'+escapeHTML(c.kind)+
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
  const record=statRecord(f);
  const evidence=f?.performanceEvidence;
  return engine.evaluate(evidence?{...(record||{}),performanceEvidence:evidence}:record,historyFor(f));
 }
 function resultSymbol(outcome){
  const text=String(outcome||"").toLowerCase();
  if(text==="w"||text==="win")return ["W","is-win"];
  if(text==="l"||text==="loss")return ["L","is-loss"];
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
 function profileMetric(m){
  return '<div class="befn-power-metric"><div class="befn-power-metric-label">'+
   '<span>'+escapeHTML(m.label)+'</span><b'+(m.score===null?' class="is-unrated"':'')+'>'+
   (m.score===null?'Not rated':m.score+' / 100')+'</b></div>'+
   performanceMeter(m,false)+'</div>';
 }
 const scoreMethodHTML=sport=>sport==="Boxing"?
  '<p class="befn-score-note">Boxing uses a separate evidence-gated model. A recorded KO share is a finishing proxy, not direct punch power; other attributes await verified technical scouting.</p>':
  '<details class="befn-rating-method"><summary>How MMA ratings are calculated</summary>'+
  '<p>All scores are descriptive 0–100 indices, <strong>not ability rankings or win predictions</strong>. Each observed metric is scaled against a fixed reference range; only recorded statistics contribute. Categories need at least two independent inputs and sufficient weighted coverage.</p>'+
  '<ul>'+
  '<li><b>Striking:</b> 25% significant strikes landed/min, 30% landed-minus-absorbed differential/min, 17% accuracy, 17% knockdowns/15, 11% KO/TKO wins per observed bout.</li>'+
  '<li><b>Grappling:</b> 42% submission attempts/15, 30% submission finishes, 18% reversals/15, 10% control share. Submission or reversal evidence is compulsory.</li>'+
  '<li><b>Wrestling:</b> 34% takedowns/15, 21% accuracy, 28% control share, 12% takedown defence, 5% reversals/15. Takedown activity is compulsory.</li>'+
  '<li><b>Defence:</b> 31% inverse strikes absorbed/min, 29% strike defence, 22% takedown defence, 12% inverse knockdowns received/15, 6% inverse opponent control.</li>'+
  '<li><b>Recent form:</b> verified wins=1, draws=½, losses=0, no-contests omitted; last five fights weighted 5,4,3,2,1 with a neutral prior.</li>'+
  '</ul><p>When the provider omits a statistic, its weight is redistributed among available inputs only if the category still meets evidence coverage thresholds. Ratings shrink toward 50 according to the observed bout count (n/(n+4)); insufficient samples remain unrated. Statistical sources and samples differ by promotion.</p></details>';
 function renderProfile(f){
  const kind=f.sport==="Boxing"?"Boxing credentials":"Combat & grappling credentials";
  const metrics=ratingsFor(f);
  const medallist=credentialsFor(f).find(x=>x.kind==="champion");
  const championshipText=medallist?"Former world champion (see linked source reports).":
    f.sport==="Boxing"?"No independently documented former world title in this profile.":
    /former\s+UFC\s+[\w\s-]{0,25}champion/i.test(sourceText(f))?"Former UFC champion (see source notes).":
    "Championship history is not confirmed in the current profile.";
  return '<section class="befn-profile-insights" data-befn-profile="'+escapeHTML(f.id)+'" aria-label="Fighter performance insights">'+
   '<section class="befn-profile-block"><h3>Fighter ratings</h3><div class="befn-profile-body">'+
   '<div class="befn-power-bars">'+metrics.map(profileMetric).join("")+'</div>'+scoreMethodHTML(f.sport)+
   '<p class="befn-score-note">0–100 descriptive indices, not win probabilities. Missing statistics remain unrated. '+(f.sport==="Boxing"?'Power uses documented KO-win share as a finishing proxy.':'MMA ratings use source-backed striking, grappling, wrestling, defence and recent form data.')+'</p></div></section>'+
   '<section class="befn-profile-block"><h3>Recent form (last 5)</h3><div class="befn-profile-body">'+formHTML(f)+'</div></section>'+
   '<section class="befn-profile-block"><h3>'+escapeHTML(kind)+'</h3><div class="befn-profile-body">'+credentialsHTML(f)+'</div></section>'+
   '<section class="befn-profile-block"><h3>Championship history</h3><div class="befn-profile-body"><p class="befn-score-note" style="margin:0">'+escapeHTML(championshipText)+'</p></div></section></section>';
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
   ["Knockdowns landed","knockdowns","count"],
   ["Grappling",null],
   ["Control time","controlSec","time"],
   ["Takedowns landed","takedowns","count"],
   ["Takedowns defended","takedownsDefended","count"],
   ["Submission attempts","submissionAttempts","count"]
  ];
  const hasVerified=f.some(x=>statRecord(x)?.stats?.observedOn);
  const body=rows.map(([label,key,fmt])=>{
   if(!key)return '<h4 class="befn-history-stat-heading">'+escapeHTML(label)+'</h4>';
   const values=f.map(x=>referenceStat(x,key));
   const value=x=>x===null?"—":fmt==="rate"?availableNumber(x,2):fmt==="percent"?availableNumber(x)+"%":fmt==="time"?secTime(x):String(x);
   return '<div class="befn-history-stat"><b>'+escapeHTML(value(values[0]))+'</b>'+
    '<span>'+escapeHTML(label)+'</span><b>'+escapeHTML(value(values[1]))+'</b></div>';
  }).join("");
  return '<section class="befn-history-stats"><div class="befn-history-stats-head"><strong>'+
    escapeHTML(names[0])+'</strong><span>Last five / available sample</span><strong>'+escapeHTML(names[1])+'</strong></div>'+
    body+'<p class="befn-snapshot-disclaimer">'+(hasVerified?
    'Only source-backed rate statistics are shown. Some counts are unavailable until additional fight records have been checked.':
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
   return '<div class="befn-snapshot-metric">'+
    '<b>'+(m0.score===null?'—':m0.score)+'</b>'+performanceMeter(m0,true)+
    '<span class="befn-snapshot-metric-label">'+escapeHTML(label)+'</span>'+
    performanceMeter(m1,false)+'<b>'+(m1.score===null?'—':m1.score)+'</b></div>';
  }).join("");
  const sides=f.map((p,i)=>
   '<div><h4>'+escapeHTML(names[i])+' · recent form</h4>'+formHTML(p)+
   '<h4 style="margin-top:12px!important">Credentials</h4>'+credentialsHTML(p)+'</div>'
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
   '<div class="befn-snapshot-head"><div><strong>'+escapeHTML(names[0])+'</strong></div><div><strong>'+escapeHTML(names[1])+'</strong></div></div>'+
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
   if(!fighter||fighter.sport!=="MMA")continue;
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
    // Preserve canonical editorial records, photos, and citations; add only
    // reference comparison dimensions and independently supplied timing data.
    if(Array.isArray(fighter.credentials))existing.credentials=[...(existing.credentials||[]),...fighter.credentials.filter(x=>!(existing.credentials||[]).some(y=>y.kind===x.kind&&y.source===x.source))];
    if(fighter.tale)existing.tale=fighter.tale;
    existing.taleReference=fighter.taleReference;
    existing.statsReference=fighter.statsReference;
    existing.reference=fighter.reference;
    if(Array.isArray(fighter.credentials)){
     // Only explicitly source-linked credentials from the reviewed sample.
     const current=Array.isArray(existing.credentials)?existing.credentials:[];
     for(const c of fighter.credentials){
      if(!current.some(x=>x.kind===c.kind&&x.division===c.division))current.push(c);
     }
     existing.credentials=current;
    }
    if(Array.isArray(fighter.latest)&&Array.isArray(existing.latest)){
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
   if(roundObservations.has(key)&&target?.sport==="MMA")target.performanceEvidence=roundObservations.get(key);
   sampleEvidence.set(key,target);
  }
  update();
 }).catch(()=>{});
 fetch("data/fighter-intelligence.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{
  if(!d||!Array.isArray(d.fighters))return;
  for(const rec of d.fighters){if(rec?.organisation==="UFC"&&rec.name)stats.set(norm(rec.name),rec)}
  update();
 }).catch(()=>{});
})();