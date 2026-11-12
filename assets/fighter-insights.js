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
 const levels={red:"red",orange:"orange",gold:"gold",green:"green"};
 const supported=f=>Array.isArray(f?.sources)&&f.sources.some(x=>/^https:\/\//.test(x.url||"")&&!/google\.com\/search/.test(x.url));
 const profileFor=name=>byName.get(norm(name))||null;
 const sourceText=f=>[f?.meta||"",...(f?.analysis||[])].join(" ");
 const achievement=(kind,label,content,detail)=>({kind,label,content,detail});
 function credentialsFor(f){
  if(!f||!supported(f))return [];
  const text=sourceText(f);
  const all=[];
  const push=(kind,label,content,detail)=>{if(!all.some(x=>x.kind===kind))all.push(achievement(kind,label,content,detail))};
  const golden=/\bGolden Gloves\b/i.test(text);
  const level=/\b(?:national|USA)\b[^.!]{0,45}\bGolden Gloves\b|\bGolden Gloves\b[^.!]{0,45}\b(?:national|USA)\b/i.test(text)?"National":
   /\bJunior Golden Gloves\b/i.test(text)?"Junior":"Level unspecified";
  if(f.sport==="Boxing"){
    const former=/\b(?:former|previous)\s+(?:(?:WBA|WBC|WBO|IBF|the ring|unified|world)\b[\w\s/-]{0,58})champion\b/i.test(text);
    if(former)push("champion","Former world champion","♛","Previously held a recognised professional world title");
    if(golden)push("golden-gloves","Golden Gloves","🥊","Golden Gloves · "+level);
    const olympic=text.match(/\b(?:Olympic|Olympics)\s+(gold|silver|bronze)\s+(?:medalli?st|medal|medallist)|\b(gold|silver|bronze)\s+(?:Olympic|Olympics)\s+(?:medal|medalli?st)/i);
    if(olympic){const medal=(olympic[1]||olympic[2]).toLowerCase();push("olympics","Olympic "+medal,medal==="gold"?"🥇":medal==="silver"?"🥈":"🥉","Olympic "+medal+" medal")}
  }else{
    const bjj=text.match(/\b(?:BJJ|Brazilian\s+jiu[-\s]?jitsu)\s+(black|brown|purple|blue|white)\s+belt\b|\b(?:second|third|fourth|first)[-\s]degree\s+Brazilian\s+jiu[-\s]?jitsu\s+(black|brown)\s+belt/i);
    if(bjj){const belt=(bjj[1]||bjj[2]).toLowerCase();push("bjj","BJJ "+belt+" belt",belt,"Brazilian jiu-jitsu "+belt+" belt")}
    const adcc=/\bADCC\b[^.!]{0,70}\b(?:world\s+)?champion\b|\bADCC\b[^.!]{0,70}\b(?:gold|winner)\b/i.test(text);
    if(adcc)push("adcc","ADCC champion","🏆","ADCC championship gold");
    else if(/\bADCC\b[^.!]{0,70}\b(?:runner[-\s]?up|silver)\b/i.test(text))push("adcc","ADCC silver","🥈","ADCC silver medal");
    const ncaa=text.match(/\bNCAA\s+Division\s+(I{1,3}|[123])\b[^.!]{0,65}\b(champion|runner[-\s]?up|silver|bronze|third\s+place)\b/i);
    if(ncaa){
      const roman=/^[123]$/.test(ncaa[1])?["","I","II","III"][Number(ncaa[1])]:ncaa[1];
      const medal=/champion/i.test(ncaa[2])?"🥇":/runner|silver/i.test(ncaa[2])?"🥈":"🥉";
      push("ncaa","NCAA Division "+roman+" "+({ "🥇":"gold","🥈":"silver","🥉":"bronze"})[medal],{division:roman,medal}, "NCAA Division "+roman+" wrestling "+(medal==="🥇"?"champion":medal==="🥈"?"runner-up":"third place"));
    }
    const sambo=/\bsambo\b[^.!]{0,45}\bchampion\b|\bchampion\b[^.!]{0,35}\bsambo\b/i.test(text);
    if(sambo)push("sambo","Sambo gold","⭐","Verified sambo championship; the competition level is described in the fighter’s report");
    else if(/\bsambo\b[^.!]{0,45}\bbronze\b/i.test(text))push("sambo","Sambo bronze","🥉","Sambo bronze medal");
    if(golden)push("golden-gloves","Golden Gloves","🥊","Golden Gloves · "+level);
  }
  return all;
 }
 function badge(x){
  const content=x.kind==="bjj"?'<span class="befn-belt" style="--belt:'+({white:"#ececec",blue:"#2875cf",purple:"#843fc8",brown:"#89512d",black:"#181a1e"}[x.content]||"#777")+'"></span>':
   x.kind==="ncaa"?'<span class="befn-credential-ncaa"><small>NCAA '+escapeHTML(x.content.division)+'</small><b>'+escapeHTML(x.content.medal)+'</b></span>':
   '<span aria-hidden="true">'+escapeHTML(x.content)+'</span>';
  return '<span class="befn-credential" data-kind="'+escapeHTML(x.kind)+'" title="'+escapeHTML(x.detail)+'" role="img" aria-label="'+escapeHTML(x.detail)+'">'+content+'</span>';
 }
 const credentialsHTML=f=>{
  const list=credentialsFor(f);
  return list.length?'<div class="befn-credential-list">'+list.map(badge).join("")+'</div>':
   '<span class="befn-credential-empty">No supported credentials recorded in this profile.</span>';
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
  return engine.evaluate(record,historyFor(f),[]);
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
   '<div class="befn-power-bars">'+metrics.map(profileMetric).join("")+'</div>'+
   '<p class="befn-score-note">Performance indices (0–100), not win probabilities. Unrated means no reliable statistic. '+(f.sport==="Boxing"?'Power uses verified KO-win share as a finishing proxy.':'Activity ratings use available strikes, takedowns and submissions.')+'</p></div></section>'+
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
  const root=article.closest("#upcoming-cards-root");
  const sport=root?.dataset?.upcomingSport ||window.BEFNSport?.get()||"";
  return sport==="boxing"?"Boxing":"MMA";
 }
 function matchupKey(article,names){
  const card=article.closest("[data-upcoming-card],[data-result-event]");
  const id=card?.dataset?.upcomingCard||card?.dataset?.resultEvent||"";
  return id+":"+names.map(norm).join(":");
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
  const key=matchupKey(article,names);
  return '<details class="befn-fight-snapshot" data-snapshot-key="'+escapeHTML(key)+'" '+(openSnapshots.has(key)?'open':'')+'>'+
   '<summary><span>Fight snapshot</span></summary>'+
   '<div class="befn-snapshot-body">'+
   '<div class="befn-snapshot-head"><div><strong>'+escapeHTML(names[0])+'</strong></div><div><strong>'+escapeHTML(names[1])+'</strong></div></div>'+
   '<div class="befn-snapshot-bars">'+metricHTML+'</div>'+
   '<div class="befn-snapshot-extra">'+sides+'</div>'+
   '<div class="befn-snapshot-links">'+buttons+'</div>'+
   '<p class="befn-snapshot-disclaimer">Scores are evidence-based descriptive indices, not predictions; “—” means insufficient information. Credentials are displayed only in this expanded view and in the fighter profiles.</p>'+
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
 document.addEventListener("toggle",event=>{
  const el=event.target;
  if(!el?.matches?.(".befn-fight-snapshot"))return;
  if(el.open)openSnapshots.add(el.dataset.snapshotKey);
  else openSnapshots.delete(el.dataset.snapshotKey);
 },true);
 const mount=document.getElementById("main")||document.body;
 if(mount&&typeof MutationObserver!=="undefined")new MutationObserver(schedule).observe(mount,{subtree:true,childList:true});
 window.BEFNFighterInsights={renderProfile,credentialsFor,ratingsFor,renderSnapshot,profileFor,hydrate};
 schedule();
 fetch("data/fighter-intelligence.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{
  if(!d||!Array.isArray(d.fighters))return;
  for(const rec of d.fighters){if(rec?.organisation==="UFC"&&rec.name)stats.set(norm(rec.name),rec)}
  update();
 }).catch(()=>{});
})();