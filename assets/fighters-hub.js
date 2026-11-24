/* Fighters hub (MMA): one Form score with the BEFN Overall beside it.
 *
 * Design: docs/design/FIGHTERS-HUB-FORM.md section 6 (canvas "B v4" at 390 px and "Desktop · Fighters hub" at 1280 px).
 * Data: data/ufc-fighter-form.json (scripts/build-ufc-fighter-form.py), the same file the profile reads, so Form,
 * stage and badges are identical everywhere. Overall is the BEFN rating carried in that file.
 * Mounts into any [data-befn-fighters-hub] element that the Fighters page renders when the sport is MMA.
 */
(function(){
 "use strict";
 const DIVS=[["flyweight","Flyweight"],["bantamweight","Bantamweight"],["featherweight","Featherweight"],
  ["lightweight","Lightweight"],["welterweight","Welterweight"],["middleweight","Middleweight"],
  ["light-heavyweight","Light heavyweight"],["heavyweight","Heavyweight"],["womens-strawweight","Women's strawweight"],
  ["womens-flyweight","Women's flyweight"],["womens-bantamweight","Women's bantamweight"],
  ["womens-featherweight","Women's featherweight"]];
 const LABEL=Object.fromEntries(DIVS);
 const SHORT=s=>(LABEL[s]||"").replace("Women's ","W ").replace("Light heavyweight","Light heavy");
 const STAGE={"Champion":"is-champion","Title contender":"is-title","Contender":"is-contender","Slipping":"is-slipping",
  "Rising star":"is-rising","Prospect":"is-prospect","Breakout":"is-breakout","Established":"is-established",
  "Inactive":"is-inactive"};
 const st={data:null,cuts:null,view:"overall",sex:"men",loading:false};

 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
 const url=f=>"#fighter/ufc--"+encodeURIComponent(f.slug);
 const ovr=f=>f.overall==null?"new":f.overall;
 const form=f=>(window.BEFNFormRule?window.BEFNFormRule.shown(f):(f.certified===true&&Number.isFinite(f.form)))?f.form:"–";
 const rec=f=>{const r=f.record;if(!r)return "";return r[0]+"–"+r[1]+(r[2]?"–"+r[2]:"")+(r[3]?" ("+r[3]+" NC)":"");};
 const dateText=d=>d?new Date(d+"T12:00:00Z").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}):"";

 function img(f,cls){
  const alt=esc(f.name);
  const c=cls?" "+cls:"";
  if(st.cuts?.[f.slug]?.ok===true)
   return '<img class="fh-face'+c+'" src="assets/img/ufc-cutouts/'+esc(f.slug)+'.webp" alt="'+alt+'" loading="lazy">';
  return '<img class="fh-face is-photo'+c+'" src="assets/img/ufc/'+esc(f.slug)+'-portrait.webp" alt="'+alt+
   '" loading="lazy" onerror="this.replaceWith(BEFNFightersHub.silhouette(\''+(cls||"")+'\'))">';
 }
 function silhouette(cls){
  const s=document.createElement("span");
  s.className="fh-face fh-none"+(cls?" "+cls:"");s.setAttribute("aria-hidden","true");
  s.innerHTML='<svg viewBox="0 0 90 120"><circle cx="45" cy="38" r="22"/><path d="M4 120c0-30 18-50 41-50s41 20 41 50z"/></svg>';
  return s;
 }
 const last5=f=>'<span class="fh-l5" aria-label="Last five: '+esc((f.last5||[]).join(" "))+'">'+
  (f.last5||[]).map(o=>'<b class="is-'+(o==="W"?"w":o==="L"?"l":"d")+'">'+esc(o==="NC"?"N":o)+"</b>").join("")+"</span>";
 const nums=f=>'<span class="fh-nums">Form <b class="fh-red">'+form(f)+"</b> · Overall <b>"+ovr(f)+"</b></span>";
 const chip=f=>'<span class="fh-chip '+(STAGE[f.stage]||"")+'">'+esc(f.stage)+"</span>";

 // ---- selections (section 6). Certified fighters only; the Overall tab has no champions.
 function pool(){
  const all=Object.values(st.data.fighters).filter(f=>f.certified);
  return all.filter(f=>f.women===(st.sex==="women"));
 }
 const byForm=(a,b)=>(b.points??-1)-(a.points??-1)||a.name.localeCompare(b.name);
 const formShown=f=>window.BEFNFormRule?window.BEFNFormRule.shown(f):(f.certified===true&&Number.isFinite(f.form));
 const scored=f=>formShown(f)&&!f.injured&&f.stage!=="Inactive";

 function overall(){
  const P=pool().filter(f=>!f.champion);
  const hot=P.filter(scored).sort(byForm);
  const podium=hot.slice(0,3);
  const fire=P.filter(f=>f.badges.includes("On fire")&&!podium.includes(f)).sort(byForm);
  const ranked=P.filter(f=>f.formRank&&f.rank>=1&&f.rank<=15);
  const ahead=ranked.filter(f=>f.rank>f.formRank).sort((a,b)=>(b.rank-b.formRank)-(a.rank-a.formRank)||byForm(a,b)).slice(0,4);
  const behind=ranked.filter(f=>f.formRank>f.rank).sort((a,b)=>(b.formRank-b.rank)-(a.formRank-a.rank)||a.rank-b.rank).slice(0,4);
  const rising=P.filter(f=>f.stage==="Rising star").sort(byForm);
  const breakout=P.filter(f=>f.stage==="Breakout").sort(byForm);
  const slipping=P.filter(f=>f.stage==="Slipping").sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name));
  const pulse=DIVS.filter(([s])=>s.startsWith("womens")===(st.sex==="women")&&st.data.divisions[s]?.top5Form!=null)
   .map(([s])=>({slug:s,...st.data.divisions[s]})).sort((a,b)=>b.top5Form-a.top5Form);
  // Caps keep the page short (desktop shows these as grids): 12 on fire, 9 rising stars, 8 breakouts, 8 slipping.
  return {podium,fire:fire.slice(0,12),ahead,behind,rising:rising.slice(0,9),breakout:breakout.slice(0,8),
   slipping:slipping.slice(0,8),pulse};
 }

 function podiumHTML(list){
  if(!list.length)return "";
  const order=list.length===3?[list[1],list[0],list[2]]:list;
  return '<section class="fh-panel fh-podium"><span class="fh-kicker">Hottest right now</span><div class="fh-podium-row">'+
   order.map(f=>'<a class="fh-pod'+(f===list[0]?" is-top":"")+'" href="'+url(f)+'">'+
    '<span class="fh-big">'+form(f)+'</span><span class="fh-soft">form · overall '+ovr(f)+"</span>"+
    '<span class="fh-name">'+esc(f.name)+'</span><span class="fh-soft">'+esc(SHORT(f.division))+" · "+(f.rank?"#"+f.rank:"unranked")+"</span>"+
    img(f)+"</a>").join("")+"</div></section>";
 }
 const head=(t,sub,icon)=>'<div class="fh-head">'+(icon||"")+'<h2>'+t+"</h2>"+(sub?'<span>'+sub+"</span>":"")+"</div>";
 const FLAME='<svg class="fh-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/></svg>';

 function fireHTML(list){
  if(!list.length)return "";
  return '<section class="fh-sec">'+head("On fire","",FLAME)+'<div class="fh-rail fh-fire">'+
   list.map(f=>'<a class="fh-card" href="'+url(f)+'"><span class="fh-pic">'+img(f)+'</span><span class="fh-body">'+
    '<span class="fh-name">'+esc(f.name)+'</span><span class="fh-meta">'+esc(SHORT(f.division))+" · "+(f.rank?"#"+f.rank:"Unranked")+"</span>"+
    '<span class="fh-mid"><b class="fh-red">'+form(f)+'</b> <small>form</small></span><span class="fh-meta">Overall '+ovr(f)+"</span></span></a>").join("")+
   "</div></section>";
 }

 function dumb(f,up){
  const pos=r=>((r-1)/14*100).toFixed(2)+"%";
  const lo=Math.min(f.rank,f.formRank),gap=Math.abs(f.rank-f.formRank);
  return '<a class="fh-rv '+(up?"is-up":"is-down")+'" href="'+url(f)+'">'+img(f,up?"":"is-dim")+'<span class="fh-rv-body">'+
   '<span class="fh-rv-top"><b>'+esc(f.name)+'</b><span>'+(up?"▲ ":"▼ ")+gap+" places</span></span>"+
   '<span class="fh-track" aria-hidden="true"><i class="fh-line"></i><i class="fh-span" style="left:'+pos(lo)+";width:"+(gap/14*100).toFixed(2)+'%"></i>'+
   '<i class="fh-ring" style="left:'+pos(f.rank)+'"></i><i class="fh-dot" style="left:'+pos(f.formRank)+'"></i></span>'+
   '<span class="fh-soft">'+esc(SHORT(f.division))+" · UFC #"+f.rank+" → form #"+f.formRank+" · overall "+ovr(f)+"</span></span></a>";
 }
 function rankVsFormHTML(ahead,behind){
  if(!ahead.length&&!behind.length)return "";
  return '<section class="fh-panel fh-rvf"><div class="fh-head is-dark"><h2>Rank vs form</h2>'+
   "<span>Where the UFC ranks them, and where their form says they should be.</span>"+
   '<span class="fh-key"><span><i class="fh-ring"></i>UFC rank</span><span><i class="fh-dot"></i>Form rank</span></span></div>'+
   '<div class="fh-rv-groups">'+
   (ahead.length?'<div class="fh-rv-group"><span class="fh-kicker is-green">Fighting above their rank</span>'+ahead.map(f=>dumb(f,true)).join("")+"</div>":"")+
   (behind.length?'<div class="fh-rv-group"><span class="fh-kicker is-blue">Ranked above their form</span>'+behind.map(f=>dumb(f,false)).join("")+"</div>":"")+
   "</div></section>";
 }

 function risingHTML(list){
  if(!list.length)return "";
  return '<section class="fh-sec">'+head("Rising stars","3–6 UFC fights, debut in the last 3 years, aged 32 or under")+'<div class="fh-rail fh-rising">'+
   list.map(f=>'<a class="fh-rise" href="'+url(f)+'">'+img(f)+'<span class="fh-name">'+esc(f.name)+"</span>"+
    '<span class="fh-meta">'+esc(SHORT(f.division))+" · "+rec(f)+"</span>"+nums(f)+last5(f)+"</a>").join("")+"</div></section>";
 }
 function breakoutHTML(list){
  if(!list.length)return "";
  return '<section class="fh-sec fh-padded">'+head("Breakout","Unranked, winning their way towards the top 15")+'<div class="fh-list">'+
   list.map(f=>'<a class="fh-row" href="'+url(f)+'"><span class="fh-row-pic">'+img(f)+'</span><span class="fh-row-body"><span>'+
    '<span class="fh-name">'+esc(f.name)+'</span><span class="fh-meta">'+esc(SHORT(f.division))+" · "+rec(f)+" UFC</span>"+last5(f)+"</span>"+
    '<span class="fh-row-score"><b class="fh-red">'+form(f)+'</b><small>form</small><span class="fh-meta">Overall '+ovr(f)+"</span></span></span></a>").join("")+
   "</div></section>";
 }
 function slippingHTML(list){
  if(!list.length)return "";
  return '<section class="fh-sec">'+head("Slipping","In the UFC top 15, failing the form check")+'<div class="fh-rail fh-slip">'+
   list.map(f=>'<a class="fh-card is-slip" href="'+url(f)+'"><span class="fh-pic">'+img(f,"is-dim")+'</span><span class="fh-body">'+
    '<span class="fh-name">'+esc(f.name)+'</span><span class="fh-meta is-blue">'+esc(SHORT(f.division))+" · UFC #"+f.rank+"</span>"+
    '<span class="fh-meta">'+esc(f.why?.[0]||"")+'</span><span class="fh-meta">Form '+form(f)+" · Overall "+ovr(f)+"</span></span></a>").join("")+
   "</div></section>";
 }
 function pulseHTML(list){
  if(!list.length)return "";
  const d=list.map(p=>p.top5Form),lo=Math.min(...d),hi=Math.max(...d);
  const mix=t=>{const a=[42,30,34],b=[207,24,36];return "rgb("+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(",")+")";};
  return '<section class="fh-sec fh-padded">'+head("Division pulse","How the top 5 in each division are going right now. Redder means hotter.")+'<div class="fh-pulse">'+
   list.map((p,i)=>{
    const t=hi===lo?1:(p.top5Form-lo)/(hi-lo),h=p.hottest,f=h&&st.data.fighters[h.slug];
    return '<div class="fh-tile'+(i===0?" is-top":"")+'" style="background:linear-gradient(135deg,'+mix(t)+" 0%,"+mix(Math.max(0,t-.35))+' 100%)">'+
     (f?'<a class="fh-tile-pic" href="'+url(f)+'" aria-label="'+esc(f.name)+' profile">'+img(f)+"</a>":"")+
     '<div class="fh-tile-body"><button type="button" data-fh-div="'+esc(p.slug)+'"><span class="fh-tag">'+(i===0?"Hottest division":"#"+(i+1))+
     "</span><span>"+esc(LABEL[p.slug])+"</span></button>"+
     '<span class="fh-depth">'+p.top5Form+'</span><span class="fh-soft">Top-5 form</span>'+
     '<span class="fh-counts"><span>'+p.onFire+" on fire</span><span>▲ "+p.rising+" rising</span><span>▼ "+p.slipping+" slipping</span></span>"+
     (f?'<a class="fh-tile-name" href="'+url(f)+'">'+esc(f.name)+" · "+form(f)+"</a>":"")+"</div></div>";
   }).join("")+'</div><p class="fh-note">Tap a division name to open it, or a fighter to open their profile.</p></section>';
 }

 // ---- division tab
 function divisionHTML(div){
  const all=Object.values(st.data.fighters).filter(f=>f.division===div);
  const champ=all.find(f=>f.champion);
  const ladder=all.filter(f=>f.rank>=1&&f.rank<=15).sort((a,b)=>a.rank-b.rank);
  const next=all.filter(f=>f.certified&&["Rising star","Prospect","Breakout"].includes(f.stage)).sort(byForm);
  let h="";
  if(champ)h+='<section class="fh-champ"><div class="fh-champ-body"><span class="fh-kicker">'+esc(LABEL[div])+" champion</span>"+
   '<a class="fh-champ-name" href="'+url(champ)+'">'+esc(champ.name)+"</a>"+
   '<span class="fh-soft">'+rec(champ)+" in the UFC</span>"+last5(champ)+
   '<span class="fh-champ-form"><b class="fh-red">'+form(champ)+'</b><span class="fh-soft">Form</span></span>'+
   '<span class="fh-champ-ovr">Overall <b>'+ovr(champ)+"</b></span>"+badgesHTML(champ)+"</div>"+
   '<a class="fh-champ-pic" href="'+url(champ)+'">'+img(champ)+"</a></section>";
  if(ladder.length)h+='<section class="fh-sec fh-padded">'+head("Top 15","UFC rank · stage · form · overall")+
   '<div class="fh-ladder"><div class="fh-ladder-head" aria-hidden="true"><span>Rank</span><span></span><span>Fighter</span><span>Stage</span><span>Form</span><span>Overall</span><span>Form rank</span></div>'+
   ladder.map(ladderRow).join("")+"</div></section>";
  if(next.length)h+='<section class="fh-sec fh-padded">'+head("Coming through","Rising stars, prospects and breakouts in the division")+
   '<div class="fh-next">'+next.map(f=>'<a class="fh-nextcard" href="'+url(f)+'"><span class="fh-pic">'+img(f)+'</span><span class="fh-body">'+
    '<span class="fh-stage-text">'+esc(f.stage)+'</span><span class="fh-name">'+esc(f.name)+'</span><span class="fh-meta">'+rec(f)+" UFC</span>"+nums(f)+
    "</span></a>").join("")+"</div></section>";
  return h||'<p class="fh-note fh-padded">No ranked fighters in this division yet.</p>';
 }
 function badgesHTML(f){
  return (f.badges||[]).length?'<span class="fh-badges">'+f.badges.map(b=>'<span class="fh-badge is-'+b.toLowerCase().replace(/\s+/g,"-")+'">'+esc(b)+"</span>").join("")+"</span>":"";
 }
 function ladderRow(f){
  const fire=f.badges?.includes("On fire"),cool=f.badges?.includes("Cooling");
  const mv=f.formRank?f.rank-f.formRank:0;
  const arrow=mv>2?'<span class="fh-mv is-up" title="Form rank '+f.formRank+'">▲</span>':mv<-2?'<span class="fh-mv is-down" title="Form rank '+f.formRank+'">▼</span>':"";
  const bar=fire?"is-fire":f.stage==="Slipping"?"is-slip":"";
  if(!f.certified)
   return '<a class="fh-lrow" href="'+url(f)+'"><span class="fh-lrank">#'+f.rank+"</span>"+'<span class="fh-lpic">'+img(f)+"</span>"+
    '<span class="fh-lname"><b>'+esc(f.name)+'</b><span class="fh-meta">Form not shown until this record is certified</span></span></a>';
  return '<a class="fh-lrow'+(f.stage==="Slipping"?" is-slip":"")+'" href="'+url(f)+'"><span class="fh-lrank">#'+f.rank+arrow+"</span>"+
   '<span class="fh-lpic">'+img(f,f.stage==="Slipping"?"is-dim":"")+"</span>"+
   '<span class="fh-lname"><b>'+esc(f.name)+"</b>"+last5(f)+"</span>"+
   '<span class="fh-lstage">'+chip(f)+"</span>"+
   '<span class="fh-lbar"><i><i class="'+bar+'" style="width:'+(f.form||0)+'%"></i></i><span class="'+(fire?"fh-red":cool?"is-blue":"")+'">'+
    (fire?"On fire · ":cool?"Cooling · ":"")+"Form "+form(f)+'<span class="fh-ovr-inline"> · Ovr '+ovr(f)+"</span></span></span>"+
   '<span class="fh-lovr">'+ovr(f)+'<small> overall</small></span>'+
   '<span class="fh-lfr">'+(f.formRank?"form #"+f.formRank:f.injured?"injured":"–")+"</span></a>";
 }

 function render(mount){
  const d=st.data;
  if(!d){mount.innerHTML='<p class="fh-note">'+(st.loading?"Loading Form…":"Form data is unavailable right now.")+"</p>";return;}
  const pills=[["overall","Overall"],...DIVS.filter(([s])=>Object.values(d.fighters).some(f=>f.division===s&&(f.champion||f.rank)))];
  let h='<div class="fh-top"><h2>Fighters hub</h2><a class="fh-find" href="#leaderboards">Find a fighter ›</a></div>'+
   '<nav class="fh-pills" aria-label="Divisions">'+pills.map(([s,n])=>'<button type="button" data-fh-div="'+s+'" aria-pressed="'+(st.view===s)+'">'+esc(n)+"</button>").join("")+"</nav>";
  if(st.view==="overall"){
   const o=overall();
   h+='<div class="fh-sexrow"><div class="fh-sex" role="tablist" aria-label="Men or women">'+
    [["men","Men"],["women","Women"]].map(([k,n])=>'<button type="button" role="tab" data-fh-sex="'+k+'" aria-selected="'+(st.sex===k)+'">'+n+"</button>").join("")+
    '</div><span class="fh-soft-dark">Certified fighters · no champions</span></div>'+
    '<div class="fh-grid-a">'+podiumHTML(o.podium)+rankVsFormHTML(o.ahead,o.behind)+"</div>"+
    fireHTML(o.fire)+'<div class="fh-grid-b">'+risingHTML(o.rising)+breakoutHTML(o.breakout)+"</div>"+
    slippingHTML(o.slipping)+pulseHTML(o.pulse);
  }else h+=divisionHTML(st.view);
  h+='<p class="fh-foot">BEFN data of '+esc(dateText(d.asOf))+(d.rankingDate?" · UFC ranks of "+esc(dateText(d.rankingDate)):"")+
   ". Form (out of 100) is how a fighter is going right now: 90 means going better than 90% of active UFC fighters. "+
   "Overall is their BEFN rating. Neither is a prediction.</p>";
  mount.innerHTML=h;
 }

 function bind(mount){
  if(mount.dataset.fhBound)return;
  mount.dataset.fhBound="1";
  mount.addEventListener("click",e=>{
   const div=e.target.closest("[data-fh-div]"),sex=e.target.closest("[data-fh-sex]");
   if(div){st.view=div.dataset.fhDiv;render(mount);mount.scrollIntoView({block:"start"});}
   else if(sex){st.sex=sex.dataset.fhSex;render(mount);}
  });
 }
 function load(){
  if(st.data||st.loading)return;
  st.loading=true;
  Promise.all([fetch("data/ufc-fighter-form.json").then(r=>r.ok?r.json():null).catch(()=>null),
   fetch("data/ufc-cutout-register.json").then(r=>r.ok?r.json():null).catch(()=>null)]).then(([f,c])=>{
   st.loading=false;st.data=f&&f.fighters?f:null;st.cuts=c?.cutouts||{};
   document.querySelectorAll("[data-befn-fighters-hub]").forEach(render);
  });
 }
 function scan(){
  document.querySelectorAll("[data-befn-fighters-hub]").forEach(m=>{
   if(m.dataset.fhDone)return;
   m.dataset.fhDone="1";bind(m);render(m);load();
  });
 }
 window.BEFNFightersHub={silhouette,scan};
 if(typeof MutationObserver!=="undefined")new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true});
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();
})();
