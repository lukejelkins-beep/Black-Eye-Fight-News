/* BEFN fighter profile, design A "One profile" (owner, 2026-11-25).
 * One layout for UFC, boxing and other MMA (PFL, ONE, KSW, RIZIN, Cage Warriors):
 *   top bar (Back, sport and division, close) · hero (picture, name, record, rank pills, next fight) and, on the right,
 *   the BEFN rating or recent form with the last five · tabs Overview / Fights / Stats / Compare / News (only those
 *   with content) · a closed "About this profile" at the foot for provenance and verification notes (DIRECTION rule 6).
 * Fail closed: every field comes from data BEFN holds (the roster, the UFC stats build, data/results.json,
 * data/upcoming-cards.json, the title tracker); a missing field is left out, never shown as a placeholder.
 * The UFC depth (ratings, round by round, compare, amateur career) is still drawn by assets/fighter-insights.js; this
 * file moves those sections into the Fights, Stats and Compare tabs each time that file re-renders them.
 * Other-MMA and boxers without a roster profile open as #fighter/mma--<slug> and #fighter/boxing--<slug>: a basic
 * profile from results and upcoming cards only. */
(function(root){
 "use strict";
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
 const slugOf=n=>String(n||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
 const initials=n=>String(n||"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")||"•";
 const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 // "2026-06-15" -> "15 Jun 2026"; anything else ("12 Sep 2026") is shown as written.
 const dateText=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||""));return m?(+m[3])+" "+MONTHS[+m[2]-1]+" "+m[1]:String(v||"");};
 const dayKey=v=>{const m=/^(\d{4}-\d{2}-\d{2})/.exec(String(v||""));if(m)return m[1];const t=Date.parse(String(v||"")+" 12:00 UTC");return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):"";};
 const host=u=>{try{return new URL(u).hostname.replace(/^www\./,"")}catch(_){return ""}};
 const cap=s=>{s=String(s||"").trim();return s?s[0].toUpperCase()+s.slice(1):""};
 // Legacy roster rows sometimes prefix an opponent with their initials ("MM Mark Magsayo").
 const dropInitials=n=>{const m=/^([A-Z]{2,3})\s+(.+)$/.exec(String(n||"").trim());return m&&initials(m[2])===m[1].slice(0,2)?m[2]:String(n||"").trim();};

 // ---------- promotions ----------
 function promoName(s){
  const t=String(s||"");
  if(/\bUFC\b|^ufc-/i.test(t))return "UFC";
  if(/^ONE\b|^one-/i.test(t))return "ONE";
  if(/\bPFL\b|^pfl-/i.test(t))return "PFL";
  if(/\bKSW\b|^ksw-/i.test(t))return "KSW";
  if(/RIZIN/i.test(t))return "RIZIN";
  if(/cage warriors|^CW\b|^cage-/i.test(t))return "Cage Warriors";
  return t.trim();
 }
 // The sport a profile id belongs to (for the page behind a deep link): "mma", "boxing" or "".
 function sportOfId(id){
  const k=String(id||"").split("--")[0];
  if(/^(ufc|mma|mma-[a-z-]+)$/.test(k))return "mma";
  if(/^(boxing|boxing-[a-z-]+)$/.test(k))return "boxing";
  return "";
 }

 // ---------- records and fights ----------
 function parseRecord(r){
  const m=/^\s*(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?/.exec(String(r||""));
  if(!m)return null;
  const kos=/\((\d+)\s*KOs?\)/i.exec(String(r||""));
  return {w:+m[1],l:+m[2],d:m[3]?+m[3]:0,text:m[1]+"–"+m[2]+(m[3]&&m[3]!=="0"?"–"+m[3]:""),kos:kos?+kos[1]:null};
 }
 function outcomeOf(r,i){
  const m=String(r.method||"").toLowerCase();
  if(/no contest/.test(m))return "NC";
  if(/\bdraw\b/.test(m))return "D";
  if(Number.isInteger(r.winner))return r.winner===i?"W":"L";
  return "";
 }
 function methodOf(r){
  const m=cap(r.method);
  if(!m)return "";
  if(/decision|points|draw/i.test(m)||!r.round)return m;
  return m+" · R"+r.round+(r.time?" "+r.time:"");
 }
 const letter=o=>{const r=String(o||"").toUpperCase();return r==="W"||r==="WIN"?"W":r==="L"||r==="LOSS"?"L":r==="NC"||r==="NO CONTEST"?"NC":r==="D"||r==="DRAW"?"D":"";};

 // Every result BEFN holds for this fighter, newest first. kind "mma" leaves UFC events out (UFC has its own profile).
 function fightsFor(slug,kind,results){
  const sport=kind==="boxing"?"Boxing":"MMA",out=[];
  for(const r of (results&&results.results)||[]){
   if(!r||r.sport!==sport||!Array.isArray(r.fighters)||r.fighters.length!==2)continue;
   const promotion=kind==="mma"?promoName(r.eventId||r.event):"";
   if(kind==="mma"&&promotion==="UFC")continue;
   const i=r.fighters.findIndex(x=>x&&slugOf(x.name)===slug);
   if(i<0)continue;
   const outcome=outcomeOf(r,i);
   if(!outcome)continue;
   const me=r.fighters[i],opp=r.fighters[1-i];
   out.push({date:r.date,opponent:opp&&opp.name||"",outcome,method:methodOf(r),event:(root.BEFNEventTitle||(x=>x))(r.event||""),
    promotion,division:r.division||"",name:me.name,record:me.record||"",recordSource:me.recordSource||"",
    rank:me.rank||"",rankSource:me.rankSource||""});
  }
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 }
 // The next announced bout on or after today, from data/upcoming-cards.json.
 function nextFightFor(slug,kind,upcoming,today){
  let best=null;
  for(const e of (upcoming&&upcoming.events)||[]){
   if(!e||String(e.sport||"").toLowerCase()!==kind||!(String(e.date)>=today))continue;
   for(const b of e.bouts||[]){
    const i=(b.fighters||[]).findIndex(n=>slugOf(n)===slug);
    if(i<0)continue;
    if(!best||String(e.date)<best.date)best={date:String(e.date),opponent:b.fighters[1-i]||"",event:e.title||"",
     promotion:promoName(e.promotion),division:b.division||"",reported:b.status==="reported",
     name:b.fighters[i],record:(b.records||[])[i]||"",recordSource:(b.recordSources||[])[i]||""};
   }
  }
  return best;
 }
 // Belts a boxer holds in the title tracker (COMBAT_DATA.champions.boxing). Interim and vacant entries are left out.
 function boxingBelts(slug,champions){
  const out=[];
  for(const d of champions||[])for(const [org,xs] of Object.entries((d&&d.belts)||{}))for(const x of xs||[]){
   if(!x||!x.name||/vacant/i.test(x.name)||/interim/i.test(x.status||"")||slugOf(x.name)!==slug)continue;
   out.push({org:org==="Ring"?"The Ring":org,division:d.division,regular:/regular/i.test(x.status||""),name:x.name});
  }
  return out;
 }
 // Basic profile for #fighter/mma--<slug> or #fighter/boxing--<slug>. null when BEFN holds nothing on the name.
 function basicProfile(id,d,today){
  const m=/^(mma|boxing)--([a-z0-9-]+)$/.exec(String(id||""));
  if(!m||!d)return null;
  const kind=m[1],slug=m[2];
  const fights=fightsFor(slug,kind,d.results);
  const next=nextFightFor(slug,kind,d.upcoming,today);
  const belts=kind==="boxing"?boxingBelts(slug,d.champions):[];
  if(!fights.length&&!next&&!belts.length)return null;
  const name=(fights[0]&&fights[0].name)||(next&&next.name)||(belts[0]&&belts[0].name);
  // Record: only a sourced one that is current, i.e. after the newest result BEFN holds, else going into the next fight.
  // An older result's record is stale once a later fight is held without one, so it is not used.
  const https=u=>/^https:\/\//.test(u||"");
  let rec=null;
  if(fights[0]&&fights[0].record&&https(fights[0].recordSource))rec={text:fights[0].record,source:fights[0].recordSource,note:"after the "+dateText(fights[0].date)+" fight"};
  else if(next&&next.record&&https(next.recordSource))rec={text:next.record,source:next.recordSource,note:"going into "+next.event};
  const parsed=rec&&parseRecord(rec.text);
  const promotion=kind==="mma"?((fights[0]&&fights[0].promotion)||(next&&next.promotion)||""):"";
  const division=String((fights[0]&&fights[0].division)||(next&&next.division)||(belts[0]&&belts[0].division)||"").replace(/\s+MMA$/i,"");
  const ranked=fights.find(x=>x.rank&&/^https:\/\//.test(x.rankSource));
  return {id,basic:true,kind,slug,name,sport:kind==="boxing"?"Boxing":"MMA",promotion,division,
   record:parsed?rec.text:"",recordSource:parsed?rec.source:"",recordNote:parsed?rec.note:"",
   fights,next,belts,rank:ranked?{text:String(ranked.rank),source:ranked.rankSource,date:ranked.date}:null,
   latest:fights.slice(0,5).map(x=>({date:x.date,opponent:x.opponent,outcome:x.outcome,method:x.method}))};
 }
 // The profile id a card name opens. A roster or UFC profile wins; otherwise a basic one when BEFN holds the name.
 function idFor(name,kind){const s=slugOf(name);return s&&(kind==="mma"||kind==="boxing")?kind+"--"+s:"";}

 // ---------- the model ----------
 function winLoss(list){
  const w=list.filter(x=>x==="W").length,l=list.filter(x=>x==="L").length,d=list.filter(x=>x==="D").length;
  return w+"–"+l+(d?"–"+d:"");
 }
 // f: the profile object; ins: BEFNFighterInsights.modelFor(f) (UFC depth, boxing ratings); x: extra data.
 function model(f,ins,x){
  x=x||{};
  const today=x.today||new Date().toISOString().slice(0,10);
  const ufc=!!(ins&&ins.ufc);
  const kind=f.basic?f.kind:f.sport==="Boxing"?"boxing":"mma";
  const slug=f.slug||slugOf(f.name);
  const promotion=ufc?"UFC":f.basic?f.promotion:"";
  const division=(ufc&&ins.division)||f.division||"";
  // Fights: UFC from the stats build or reviewed rows; boxing roster rows plus any newer result BEFN holds; basic from results.
  let fights,newer=null;
  if(ufc)fights=ins.recent.map(r=>({...r}));
  else if(f.basic)fights=f.fights.map(r=>({...r}));
  else{
   const roster=(f.latest||[]).filter(r=>r&&r.opponent&&letter(r.outcome||r.result)).map(r=>({date:r.date,opponent:dropInitials(r.opponent),
    outcome:letter(r.outcome||r.result),method:r.method||"",event:""}));
   const newest=roster.length?dayKey(roster[0].date):"";
   const later=x.results?fightsFor(slug,kind,x.results).filter(r=>!newest||r.date>newest):[];
   fights=later.concat(roster);
   newer=later[0]||null;
  }
  const recent=fights.slice(0,5);
  // Record: a newer sourced result moves a roster boxer to the record that result carries (as on the Boxing hub).
  let record=f.record||"",recordLabel=f.basic?"pro record":/^UFC record$/i.test(f.recordLabel||"")?"UFC record":"pro record";
  let recordSource=f.recordSource||"",recordNote=f.recordNote||"";
  if(!ufc&&!f.basic&&newer&&newer.record&&/^https:\/\//.test(newer.recordSource)){
   record=newer.record;recordSource=newer.recordSource;recordNote="after the "+dateText(newer.date)+" fight";
  }
  const rec=parseRecord(record);
  // Pills: ranks and titles first (gold), then Unbeaten, then the rest. Never a label the data does not hold.
  const gold=[],plain=[];
  const belts=kind==="boxing"?boxingBelts(slug,x.champions):[];
  if(ufc)for(const p of ins.pills)(p.gold?gold:plain).push(p);
  for(const b of belts)gold.push({text:b.org+(b.regular?" (regular)":"")+" champion",gold:true});
  if(f.basic&&f.rank)plain.push({text:"Ranked "+f.rank.text});
  if(!ufc&&!f.basic&&kind==="boxing"&&["Contender","Prospect"].includes(f.category))plain.push({text:f.category});
  const unbeaten=rec&&rec.l===0&&rec.w>0&&!(rec.d>0)?[{text:"Unbeaten",gold:!gold.length}]:[];
  const pills=gold.concat(unbeaten,plain);
  const next=nextFightFor(slug,kind,x.upcoming,today);
  const form=recent.map(r=>r.outcome).filter(Boolean);
  // Key numbers: four at most, each only when the data holds it.
  let keys=[];
  if(ufc)keys=ins.keyNumbers.slice(0,4);
  else{
   if(rec)keys.push({value:rec.text,label:recordLabel==="UFC record"?"UFC record":"Pro record"});
   if(rec&&rec.kos!==null&&rec.w>0)keys.push({value:Math.round(rec.kos/rec.w*100)+"%",label:"KO rate"});
   if(form.length>1)keys.push({value:winLoss(form),label:"Last "+form.length+" fights"});
   const finishes=recent.filter(r=>r.outcome==="W"&&/\b(?:t?ko|knockout|submission|stoppage|rtd)\b/i.test(r.method)).length;
   if(form.length>1&&f.basic)keys.push({value:String(finishes),label:"Wins inside the distance, last "+form.length});
   if(belts.length)keys.push({value:String(belts.length),label:belts.length===1?"Title held":"Titles held"});
  }
  const about=[];
  if(ufc)about.push(...ins.about);
  if(recordSource&&rec)about.push("Record "+(recordNote?recordNote+", ":"")+"from "+host(recordSource)+".");
  if(f.basic){
 if(f.fights.length)about.push("Fights: the results BEFN holds for "+(f.promotion||(kind==="boxing"?"boxing":"MMA"))+" events, from official results pages.");
   if(f.rank)about.push("Rank: from "+host(f.rank.source)+", as of "+dateText(f.rank.date)+".");
  }
  if(!ufc&&!f.basic){
   about.push("Fights and record from BEFN’s "+(kind==="boxing"?"boxing":"MMA")+" roster, reviewed 7 Nov 2026"+(newer?", with later results from official results pages":"")+".");
   const srcs=(f.sources||[]).map(s=>host(s&&s.url)).filter(h=>h&&!/google\./.test(h));
   if(srcs.length)about.push("Sources checked: "+[...new Set(srcs)].join(", ")+".");
  }
  if(belts.length)about.push("Titles: BEFN’s title tracker (WBA, WBC, IBF, WBO and The Ring).");
  if(next)about.push("Next fight: from the "+(next.promotion||"promoter")+" card BEFN lists"+(next.reported?" (reported, not yet confirmed by the promoter)":"")+".");
  return {kind,ufc,basic:!!f.basic,name:f.name,slug,promotion,division,
   crumb:[kind==="boxing"?"Boxing":"MMA",kind==="boxing"?"":promotion,division].filter(Boolean).join(" · "),
   eyebrow:[kind==="boxing"?"Boxing":promotion||"MMA",division].filter(Boolean).join(" · "),
   record:rec?rec.text:"",recordSmall:rec&&rec.kos!==null?rec.kos+" KOs":rec?recordLabel:"",
   pills,next,rating:ufc?ins.rating:null,form,formLabel:ufc?ins.formLabel:form.length===1?"Last recorded fight":"Last "+form.length+" recorded fights",
   keyNumbers:keys,recent,fights,skills:ufc?ins.skills:(ins&&ins.ratings||[]).map(r=>({label:r.label,score:r.score})),
   credentials:ins&&ins.credentials||"",about};
 }

 // ---------- HTML ----------
 const chip=o=>'<b class="befn-pa-chip is-'+(o==="W"?"w":o==="L"?"l":"d")+'">'+esc(o)+'</b>';
 function oppFace(name,h){
  const url=(h.localImage&&h.localImage(name,"thumb"))||"";
  return '<span class="befn-pa-face" aria-hidden="true"><i>'+esc(initials(name))+'</i>'+
   (url?'<img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.remove()">':'')+'</span>';
 }
 function fightRow(r,h,full){
  const meta=[r.method,dateText(r.date),r.event].filter(Boolean).join(" · ");
  return '<li class="befn-pa-fight">'+chip(r.outcome)+oppFace(r.opponent,h)+
   '<span class="befn-pa-fight-main"><strong>vs '+esc(r.opponent)+'</strong>'+(meta?'<small>'+esc(meta)+'</small>':'')+
   (full&&r.record?'<small>Record after: '+esc(r.record)+'</small>':'')+'</span>'+
   (r.band?'<em class="befn-pa-band is-'+esc(r.band.toLowerCase())+'">'+esc(r.band)+' opponent</em>':'')+'</li>';
 }
 function sideHTML(m){
  if(!m.rating&&!m.form.length)return "";
  const chips=m.form.length?'<div class="befn-pa-form" role="img" aria-label="'+esc(m.formLabel+", newest first: "+m.form.join(" "))+'">'+m.form.map(chip).join("")+'</div>':"";
  if(m.rating){
   const r=m.rating;
   return '<aside class="befn-pro-score befn-pa-score" aria-label="BEFN rating"><span class="befn-pa-label">BEFN rating'+(r.provisional?' · provisional':'')+'</span>'+
    '<div class="befn-pa-scoreline"><strong class="befn-v3-score">'+esc(Number.isFinite(r.value)?r.value.toFixed(2):r.value)+'<small>/100</small></strong>'+
    (r.rank&&r.of?'<p class="befn-pa-standing">#'+esc(r.rank)+' of '+esc(r.of)+' rated UFC '+(r.pool==="women"?"women":r.pool==="men"?"men":"fighters")+'</p>':'')+'</div>'+
    (chips?'<div class="befn-pa-formwrap">'+chips+'<p class="befn-pa-formlabel">'+esc(m.formLabel)+'</p></div>':'')+'</aside>';
  }
  return '<aside class="befn-pro-score befn-pa-score is-form" aria-label="Recent form"><span class="befn-pa-label">Recent form</span>'+
   '<div class="befn-pa-scoreline"><strong class="befn-v3-score">'+esc(winLoss(m.form))+'</strong></div>'+
   '<div class="befn-pa-formwrap">'+chips+'<p class="befn-pa-formlabel">'+esc(m.formLabel)+'</p></div></aside>';
 }
 function pillsHTML(m,h){
  // A documented UFC title is drawn as its belt, so the plain "Champion" pill is not repeated beside it.
  const pills=m.pills.filter(p=>!(h.belts&&p.text==="Champion")).map(p=>'<span class="befn-pa-pill'+(p.gold?' is-gold':'')+(p.stage?' befn-form-chip is-'+esc(p.stage):'')+'">'+esc(p.text)+'</span>').join("");
  return (pills||h.belts)?'<div class="befn-pa-pills">'+pills+(h.belts||"")+'</div>':"";
 }
 function nextHTML(m){
  const n=m.next;
  if(!n)return '<p class="befn-pa-next">Next fight: <b>not announced</b></p>';
  return '<p class="befn-pa-next">Next fight: <b>vs '+esc(n.opponent)+' · '+esc(dateText(n.date))+'</b>'+
   (n.event&&!(slugOf(n.event).includes(slugOf(n.opponent).split("-").pop()))?'<span> · '+esc(n.event)+'</span>':'')+(n.reported?'<span> · reported</span>':'')+'</p>';
 }
 function keysHTML(m){
  return m.keyNumbers.length?'<div class="befn-pa-keys">'+m.keyNumbers.map(k=>'<div><b>'+esc(k.value)+'</b><span>'+esc(k.label)+'</span></div>').join("")+'</div>':"";
 }
 function skillsHTML(m){
  if(!m.skills.length)return "";
  const pct=m.ufc;
  return '<section class="befn-pa-sec befn-pa-skills"><h3>'+(pct?'Skills vs '+(m.rating&&m.rating.pool==="women"?'UFC women':m.rating&&m.rating.pool==="men"?'UFC men':'the UFC roster'):'BEFN ratings')+'</h3>'+
   m.skills.map(s=>'<div class="befn-pa-meter"><div><span>'+esc(s.label)+'</span><b>'+(pct?esc(ordinal(s.score))+' pct':esc(s.score)+' / 100')+'</b></div>'+
    '<i role="meter" aria-label="'+esc(s.label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+esc(s.score)+'"><s style="width:'+Math.max(2,Math.min(100,+s.score))+'%"></s></i></div>').join("")+
   (pct?'<p class="befn-pa-note">Percentiles against every rated UFC '+(m.rating&&m.rating.pool==="women"?"woman":m.rating&&m.rating.pool==="men"?"man":"fighter")+'. <button type="button" class="befn-pa-link" data-pa-tab="stats">How the rating works</button></p>':
    '<p class="befn-pa-note">BEFN’s estimate from the record and results on file.</p>')+'</section>';
 }
 function ordinal(n){n=+n;const t=n%100,o=n%10;return n+(t>=11&&t<=13?"th":o===1?"st":o===2?"nd":o===3?"rd":"th");}
 function overviewHTML(m,h){
  const fights=m.recent.length?'<section class="befn-pa-sec befn-pa-recent"><h3>Recent fights</h3><ul class="befn-pa-fights">'+m.recent.map(r=>fightRow(r,h)).join("")+'</ul></section>':"";
  const skills=skillsHTML(m);
  return keysHTML(m)+(fights||skills?'<div class="befn-pa-two'+(fights&&skills?'':' is-one')+'">'+fights+skills+'</div>':"")+
   (h.newsOne?'<div class="befn-pa-news1">'+h.newsOne+'</div>':"");
 }
 function fightsPanelHTML(m,h){
  if(m.ufc)return (h.reign||"")+'<div class="befn-pa-deep" data-pa-deep="fights"></div>';
  // A non-UFC Fights tab only when it holds more than the five on the Overview.
  if(m.fights.length<=m.recent.length)return "";
  return '<section class="befn-pa-sec"><h3>'+(m.basic?'Fights BEFN holds':'Recent results')+'</h3><ul class="befn-pa-fights is-full">'+m.fights.map(r=>fightRow(r,h,true)).join("")+'</ul></section>';
 }
 const TABS=[["overview","Overview"],["fights","Fights"],["stats","Stats"],["compare","Compare"],["news","News"]];
 // The whole dialog body. h: {portrait, src, news, newsOne, belts, reign}.
 function shellHTML(f,m,h){
  const panels={overview:overviewHTML(m,h),fights:fightsPanelHTML(m,h),
   stats:(m.ufc||!m.basic?'<div class="befn-pa-deep" data-pa-deep="stats"></div><div class="befn-pa-amateur" data-befn-amateur-slot></div>':""),
   compare:m.ufc?'<div class="befn-pa-deep" data-pa-deep="compare"></div>':"",news:h.news||""};
  return '<div class="befn-pro befn-pa" data-pa-kind="'+esc(m.kind)+'" data-pa-id="'+esc(f.id)+'">'+
   '<div class="befn-pro-bar befn-pa-bar"><button type="button" class="befn-pro-back befn-pa-back" data-close-fighter>← Back</button>'+
   '<span class="befn-pro-crumb befn-pa-crumb">'+esc(m.crumb)+'</span>'+
   '<button type="button" class="befn-pro-close befn-pa-close" id="closeFighter" aria-label="Close fighter profile">×</button></div>'+
   '<header class="befn-pro-hero befn-pa-hero">'+
    '<div class="befn-pro-photo befn-pa-pic" data-pa-pic>'+h.portrait+'</div>'+
    '<div class="befn-pro-id befn-pa-who" data-pa-who>'+whoHTML(m,h)+'</div>'+
    '<div class="befn-pro-rating befn-pa-side" data-befn-pro-rating data-pa-side>'+sideHTML(m)+'</div>'+
   '</header>'+
   '<nav class="befn-pa-tabs" role="tablist" aria-label="Profile sections">'+TABS.map(([k,l],i)=>
    '<button type="button" role="tab" id="befn-pa-tab-'+k+'" data-pa-tab="'+k+'" aria-controls="befn-pa-panel-'+k+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?0:-1)+'"'+
    (panels[k]?'':' hidden')+'>'+l+'</button>').join("")+'</nav>'+
   '<div class="befn-pro-body befn-pa-body">'+TABS.map(([k],i)=>'<section class="befn-pa-panel" role="tabpanel" id="befn-pa-panel-'+k+'" aria-labelledby="befn-pa-tab-'+k+'" data-pa-panel="'+k+'"'+(i===0?'':' hidden')+'>'+panels[k]+'</section>').join("")+
   '<div class="befn-pa-src" hidden>'+(h.src||"")+'</div></div>'+
   '<details class="befn-pa-about"><summary>About this profile</summary><ul data-pa-about-list>'+m.about.map(a=>'<li>'+esc(a)+'</li>').join("")+'</ul></details>'+
   '</div>';
 }
 // Where Sherdog lists a UFC fighter as training now (data/ufc-fighter-gyms.json, used with Sherdog's permission, 28 Nov 2026).
 // Not the gym at the time of any fight, so the label says "Trains at". No entry: no line, never a placeholder.
 function gymsOf(m){
  const g=m&&m.ufc&&typeof data!=="undefined"&&data.gyms?data.gyms[foldName(m.name)]:null;
  return Array.isArray(g)&&g.length?g:null;
 }
 function gymHTML(m){
  const g=gymsOf(m);
  return g?'<p class="befn-pa-gym">Trains at: <b>'+g.map(esc).join(", ")+'</b></p>':"";
 }
 function whoHTML(m,h){
  return '<small class="befn-pro-eyebrow befn-pa-eyebrow">'+esc(m.eyebrow)+'</small><h2 data-profile-name>'+esc(m.name)+'</h2>'+
   (m.record?'<div class="befn-pa-record"><strong>'+esc(m.record)+'</strong><span>'+esc(m.recordSmall)+'</span></div>':'')+
   pillsHTML(m,h)+gymHTML(m)+nextHTML(m)+'<div class="befn-top-credentials" data-befn-top-credentials></div>';
 }

 // ---------- browser ----------
 const data={results:null,upcoming:null,cuts:{ufc:null,boxing:null,mma:null},countries:null,gyms:null,loading:null,loaded:false};
 const basics=new Map();
 function load(){
  if(data.loading||typeof fetch!=="function")return data.loading||Promise.resolve();
  const get=u=>fetch(u).then(r=>r.ok?r.json():null).catch(()=>null);
  data.loading=Promise.all([get("data/results.json"),get("data/upcoming-cards.json"),get("data/ufc-cutout-register.json"),
   get("data/boxing-cutout-register.json"),get("data/mma-cutout-register.json"),get("data/ufc-fighter-countries.json"),get("data/ufc-fighter-gyms.json")]).then(([r,u,c1,c2,c3,cc,gg])=>{
   data.countries=cc&&cc.schema===1&&cc.fighters||null;
   data.gyms=gg&&gg.schema===1&&gg.fighters||null;
   data.results=r&&Array.isArray(r.results)?r:null;data.upcoming=u&&Array.isArray(u.events)?u:null;
   data.cuts={ufc:c1&&c1.cutouts||null,boxing:c2&&c2.cutouts||null,mma:c3&&c3.cutouts||null};
   data.loaded=true;
   // Fight snapshots drawn before this load lack the basic-profile buttons; removing them lets fighter-insights redraw them.
   if(root.document)for(const el of root.document.querySelectorAll(".befn-fight-snapshot"))if(el.querySelector(".befn-snapshot-links:not([data-pa])"))el.remove();
   const d=root.document&&root.document.querySelector("#fighterDialog");
   if(d&&d.open&&d.querySelector(".befn-pa"))layout(d,true);
  });
  return data.loading;
 }
 const todayKey=()=>new Date().toISOString().slice(0,10);
 const champions=()=>(root.COMBAT_DATA&&root.COMBAT_DATA.champions&&root.COMBAT_DATA.champions.boxing)||[];
 // For openFighter: the basic profile, or null while results load (ready() runs once they have).
 function basicFor(id,ready){
  if(!/^(mma|boxing)--[a-z0-9-]+$/.test(String(id||"")))return null;
  if(basics.has(id))return basics.get(id);
  if(!data.loaded){load().then(()=>{if(basicFor(id))ready&&ready();});return null;}
  const f=basicProfile(id,{results:data.results,upcoming:data.upcoming,champions:champions()},todayKey());
  if(f)basics.set(id,f);
  return f;
 }
 // Hero picture: a cut-out where the register approves one, else BEFN's local photo, else the roster photo.
 function pictureFor(f,m){
  const slug=m.slug,cut=m.kind==="boxing"?data.cuts.boxing:m.ufc?data.cuts.ufc:data.cuts.mma;
  if(cut&&cut[slug]&&cut[slug].ok===true)return {src:"assets/img/"+(m.kind==="boxing"?"boxing":m.ufc?"ufc":"mma")+"-cutouts/"+slug+".webp",cut:true};
  const local=root.BEFNLocalImages&&root.BEFNLocalImages.url(f.name,"portrait");
  if(local)return {src:local,cut:false};
  if(!f.basic&&!f.noPortrait&&typeof f.photo==="string"&&/^https:\/\//.test(f.photo))return {src:f.photo,cut:false};
  return null;
 }
 function portraitHTML(name,pic){
  return '<div class="befn-portrait-slot befn-pa-portrait" data-fighter-portrait="'+esc(name)+'" data-portrait-state="fallback">'+
   '<div class="befn-portrait-fallback" role="img" aria-label="Photograph unavailable for '+esc(name)+'"><strong aria-hidden="true">'+esc(initials(name))+'</strong><span aria-hidden="true">Photo unavailable</span></div>'+
   (pic?'<img loading="eager" src="'+esc(pic.src)+'" alt="Photograph of '+esc(name)+'"'+(pic.cut?'':' referrerpolicy="no-referrer"')+'>':'')+'</div>';
 }
 // Flag backdrop, option P2 "dark band" (owner, 24 Nov 2026, kept for design A on 25 Nov): a UFC fighter shown as a
 // cut-out stands over a faded half of their flag (data/ufc-fighter-countries.json, as shown on UFC telecasts). No
 // country held or no cut-out: the plain dark band.
 const foldName=s=>String(s==null?"":s).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 function heroFlag(hero,f,m,pic){
  if(!hero)return;
  const cc=m.ufc&&pic&&pic.cut&&data.countries?data.countries[foldName(f.name)]:null;
  const ok=/^[a-z]{2}(-[a-z]{3})?$/.test(cc||"");
  const old=hero.querySelector(":scope>.befn-pa-flag");
  if(old&&ok&&old.dataset.cc===cc)return;
  if(old)old.remove();
  if(!ok)return;
  hero.insertAdjacentHTML("afterbegin",'<div class="befn-pa-flag" aria-hidden="true" data-cc="'+esc(cc)+'"><img src="assets/img/flags/'+esc(cc)+'.svg" alt="" onerror="this.parentNode.remove()"></div>');
 }
 const ctxFor=dialog=>dialog&&dialog._paCtx;
 // Related news is read when drawn, so a profile opened before the news feed loads gains its News tab when it does.
 const newsFor=c=>({news:c&&c.newsFn?c.newsFn(3):"",newsOne:c&&c.newsFn?c.newsFn(1):""});
 // Render the dialog for f. ctx: {f, esc, localImage, src, news, newsOne, belts, reign} from openFighter.
 function render(dialog,f,ctx){
  load();
  const ins=!f.basic&&root.BEFNFighterInsights&&root.BEFNFighterInsights.modelFor?root.BEFNFighterInsights.modelFor(f):null;
  const m=model(f,ins,{results:data.results,upcoming:data.upcoming,champions:champions(),today:todayKey()});
  const pic=pictureFor(f,m);
  const h={...ctx,...newsFor(ctx),portrait:portraitHTML(f.name,pic)};
  dialog._paCtx={...ctx,f};
  dialog.querySelector("#fighter-dialog-content").innerHTML=shellHTML(f,m,h);
  const hero=dialog.querySelector(".befn-pa-hero");
  hero.classList.toggle("has-cutout",!!(pic&&pic.cut));
  hero.dataset.paPicSrc=pic?pic.src:"";
  heroFlag(hero,f,m,pic);
  dialog.dataset.paTab="overview";
  layout(dialog);
  return m;
 }
 // Re-draw the parts that depend on data arriving later, and move fighter-insights' sections into the tabs.
 function layout(dialog,refreshHero){
  const pa=dialog&&dialog.querySelector(".befn-pa"),c=ctxFor(dialog);
  if(!pa||!c)return;
  const f=c.f;
  const ins=!f.basic&&root.BEFNFighterInsights&&root.BEFNFighterInsights.modelFor?root.BEFNFighterInsights.modelFor(f):null;
  const m=model(f,ins,{results:data.results,upcoming:data.upcoming,champions:champions(),today:todayKey()});
  const h={...c,...newsFor(c)};
  // Hero: name column, side panel, picture (a cut-out may arrive after the first paint).
  const who=pa.querySelector("[data-pa-who]"),side=pa.querySelector("[data-pa-side]");
  const whoNew=whoHTML(m,h);
  if(who.dataset.paHtml!==whoNew){
   // Keep the credential badges fighter-insights and the amateur file put in the name column.
   const credentials=who.querySelector("[data-befn-top-credentials]"),badges=who.querySelector("[data-befn-amateur-badges]");
   who.innerHTML=whoNew;who.dataset.paHtml=whoNew;
   const top=who.querySelector("[data-befn-top-credentials]");
   if(credentials&&top)top.replaceWith(credentials);
   const anchor=who.querySelector("[data-befn-top-credentials]");
   if(badges&&anchor)anchor.before(badges);
  }
  const sideNew=sideHTML(m);
  if(side.dataset.paHtml!==sideNew){side.innerHTML=sideNew;side.dataset.paHtml=sideNew;}
  const pic=pictureFor(f,m),hero=pa.querySelector(".befn-pa-hero");
  if(pic&&hero.dataset.paPicSrc!==pic.src){
   hero.dataset.paPicSrc=pic.src;hero.classList.toggle("has-cutout",pic.cut);
   pa.querySelector("[data-pa-pic]").innerHTML=portraitHTML(f.name,pic);
  }
  heroFlag(hero,f,m,pic);
  pa.dataset.paCrumb=m.crumb;pa.querySelector(".befn-pa-crumb").textContent=m.crumb;
  // Overview and the plain Fights list follow the model too.
  const ov=pa.querySelector('[data-pa-panel="overview"]'),ovNew=overviewHTML(m,h);
  if(ov.dataset.paHtml!==ovNew){ov.innerHTML=ovNew;ov.dataset.paHtml=ovNew;}
  const np=pa.querySelector('[data-pa-panel="news"]');if(np.dataset.paHtml!==h.news){np.innerHTML=h.news;np.dataset.paHtml=h.news;}
  if(!m.ufc){const fp=pa.querySelector('[data-pa-panel="fights"]'),fNew=fightsPanelHTML(m,h);if(fp.dataset.paHtml!==fNew){fp.innerHTML=fNew;fp.dataset.paHtml=fNew;}}
  distribute(pa,m);
  absorb(dialog,m.about);
  if(root.BEFNFinishClips)root.BEFNFinishClips.decorate(dialog);
  tabsVisible(pa);
  select(pa,dialog.dataset.paTab||"overview",false);
 }
 const DEEP={overview:"fights",fights:"fights",bonuses:"fights",ratings:"stats",stats:"stats",profile:"stats",titles:"stats",compare:"compare"};
 function distribute(pa,m){
  const ins=pa.querySelector(".befn-pa-src .befn-profile-insights");
  if(!ins||!ins.children.length)return;
  for(const slot of pa.querySelectorAll("[data-pa-deep]"))slot.replaceChildren();
  const about=[];
  for(const n of ins.querySelectorAll("[data-pa-about],.bsp-career-note")){about.push(n.textContent.trim());n.remove();}
  for(const sec of [...ins.querySelectorAll("[data-pro-section]")]){
   const k=sec.dataset.proSection;
   // Boxing and older roster profiles: the Overview already shows the ratings.
   if(!m.ufc&&k==="ratings")continue;
   // Credentials are shown as badges in the hero, so the older credentials block is not repeated.
   if(k==="profile")continue;
   let node=sec;
   if(k==="overview"){node=sec.querySelector(".bsp-latest");if(!node)continue;}
   const slot=pa.querySelector('[data-pa-deep="'+DEEP[k]+'"]');
   if(slot&&node)slot.appendChild(node);
  }
  mergeLatest(pa);
  // The career line inside the full UFC history ("verified to …") is staff text: it moves to About.
  for(const sum of pa.querySelectorAll(".befn-pa-body .bsp-history>summary")){
   const small=sum.querySelector("small");
   if(small&&/verified|on record/i.test(sum.textContent)){
    about.push(sum.textContent.replace(/\s+/g," ").trim());
    const n=sum.parentNode.querySelectorAll(":scope>ul>li").length;
    sum.innerHTML="Earlier UFC fights <small>"+n+(n===1?" fight":" fights")+"</small>";
   }
  }
  ins.replaceChildren();
  pa._paDeepAbout=about;
 }
 // "Latest bout" (owner, 25 Nov 2026: it took a lot of space on desktop and repeated the first fight): its numbers
 // (sig. strikes, takedowns, control) go inside the first Recent fights row when that row is the same bout, and the
 // separate box is dropped. If the rows do not match (or are missing), the box stays as it was.
 function mergeLatest(pa){
  const box=pa.querySelector('[data-pa-deep="fights"] > .bsp-latest');
  if(!box)return;
  const first=pa.querySelector('[data-pa-deep="fights"] .befn-pro-fight-list > li');
  const main=first&&first.querySelector(".befn-pro-fight-main");
  const opp=s=>String(s||"").replace(/^\s*vs\.?\s+/i,"").replace(/\s+/g," ").trim().toLowerCase();
  const boxOpp=opp(box.querySelector(".bsp-latest-main strong")&&box.querySelector(".bsp-latest-main strong").textContent);
  const rowOpp=opp(main&&main.querySelector(".befn-v3-opponent")&&main.querySelector(".befn-v3-opponent").textContent);
  if(!main||!boxOpp||boxOpp!==rowOpp)return;
  const nums=box.querySelector(".bsp-latest-stats");
  if(nums){nums.classList.add("is-inline");main.appendChild(nums);}
  box.remove();
 }
 // Notes marked data-pa-about anywhere in the body (the amateur card adds one later) go to "About this profile".
 function absorb(dialog,base){
  const pa=dialog&&dialog.querySelector(".befn-pa");
  if(!pa)return;
  const extra=[];
  for(const n of pa.querySelectorAll(".befn-pa-body [data-pa-about]")){extra.push(n.textContent.trim());n.remove();}
  pa._paAmateurAbout=(pa._paAmateurAbout||[]).concat(extra);
  const list=pa.querySelector("[data-pa-about-list]");
  const lines=[...new Set([...(base||pa._paBaseAbout||[]),...(pa._paDeepAbout||[]),...pa._paAmateurAbout].filter(Boolean))];
  if(base)pa._paBaseAbout=base;
  const html=lines.map(a=>"<li>"+esc(a)+"</li>").join("");
  if(list&&list.dataset.paHtml!==html){list.innerHTML=html;list.dataset.paHtml=html;}
  const about=pa.querySelector(".befn-pa-about");if(about)about.hidden=!lines.length;
  tabsVisible(pa);
 }
 function tabsVisible(pa){
  let shown=0;
  for(const b of pa.querySelectorAll("[data-pa-tab]")){
   if(b.closest(".befn-pa-panel"))continue;
   const panel=pa.querySelector('[data-pa-panel="'+b.dataset.paTab+'"]');
   const has=b.dataset.paTab==="overview"||!!(panel&&[...panel.children].some(el=>el.children.length||el.textContent.trim()));
   b.hidden=!has;if(has)shown++;
  }
  // A lone Overview tab is not a choice: the bar is left out.
  const bar=pa.querySelector(".befn-pa-tabs");if(bar)bar.hidden=shown<2;
  const cur=pa.closest("dialog");
  if(cur&&pa.querySelector('[role="tab"][data-pa-tab="'+cur.dataset.paTab+'"]')?.hidden)select(pa,"overview",false);
 }
 function select(pa,tab,focus){
  const btn=pa.querySelector('[role="tab"][data-pa-tab="'+tab+'"]');
  if(!btn||btn.hidden)tab="overview";
  const dialog=pa.closest("dialog");if(dialog)dialog.dataset.paTab=tab;
  for(const b of pa.querySelectorAll('[role="tab"][data-pa-tab]')){
   const on=b.dataset.paTab===tab;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1;b.classList.toggle("is-on",on);
   if(on&&focus)b.focus({preventScroll:true});
  }
  for(const p of pa.querySelectorAll("[data-pa-panel]"))p.hidden=p.dataset.paPanel!==tab;
 }
 if(root.document){
  root.document.addEventListener("click",e=>{
   const b=e.target.closest&&e.target.closest("#fighterDialog [data-pa-tab]");
   if(!b)return;
   const pa=b.closest(".befn-pa");if(!pa)return;
   e.preventDefault();
   select(pa,b.dataset.paTab,b.getAttribute("role")!=="tab");
   const tabs=pa.querySelector(".befn-pa-tabs"),dialog=pa.closest("dialog");
   // Bring the tab bar to the top of the dialog when the reader was further down.
   if(tabs&&dialog&&tabs.getBoundingClientRect().top<dialog.getBoundingClientRect().top)tabs.scrollIntoView({block:"start"});
  });
  root.document.addEventListener("keydown",e=>{
   const tab=e.target.closest&&e.target.closest('#fighterDialog .befn-pa-tabs [role="tab"]');
   if(!tab)return;
   const tabs=[...tab.parentNode.querySelectorAll('[role="tab"]:not([hidden])')],i=tabs.indexOf(tab);
   const next={ArrowRight:(i+1)%tabs.length,ArrowLeft:(i-1+tabs.length)%tabs.length,Home:0,End:tabs.length-1}[e.key];
   if(next===undefined)return;
   e.preventDefault();select(tab.closest(".befn-pa"),tabs[next].dataset.paTab,true);
  });
 }
 const api={slugOf,promoName,sportOfId,parseRecord,dateText,dropInitials,fightsFor,nextFightFor,boxingBelts,basicProfile,idFor,model,shellHTML,
  render,layout,absorb,basicFor,load,select,_data:data};
 root.BEFNProfileA=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
