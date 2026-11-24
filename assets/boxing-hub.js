/* Fighters hub (Boxing), in the MMA hub's style (owner selector, 24 Nov 2026).
 * Overall: every division's champion, then unbeaten, contender and prospect rails. A division tab: its
 * champion and other belt holders, then its contenders and prospects. Search finds anyone on the page.
 * Data: window.COMBAT_DATA (champions.boxing and the boxing scouting roster). No Form score: BEFN holds
 * no fight-by-fight boxing statistics to make one. Pictures: only BEFN's own approved photos and cut-outs.
 * Mounts into [data-befn-boxing-hub]. Uses the .fh classes from fighters-hub.css. */
(function(root){
 "use strict";
 const ORGS=["WBA","WBC","IBF","WBO"];
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
 const slug=n=>String(n||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 const norm=s=>String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase();
 const record=f=>/^\d+[–-]\d+/.test(f.record||"")?String(f.record).replace(/-/g,"–"):"";
 const wl=r=>{const m=/^(\d+)[–-](\d+)/.exec(r||"");return m?[+m[1],+m[2]]:null;};

 /* Each division: holders of the four major belts (regular and interim titles left out), most belts first. */
 function champions(divisions){
  return (divisions||[]).map(d=>{
   const held=new Map();
   for(const org of ORGS.concat(["The Ring"]))for(const x of (d.belts&&d.belts[org])||[]){
    if(!x||!x.name||/vacant/i.test(x.name)||/regular|interim/i.test(x.status||""))continue;
    if(!held.has(x.name))held.set(x.name,{name:x.name,belts:[],defences:null});
    const h=held.get(x.name);h.belts.push(org);if(Number.isInteger(x.defences))h.defences=Math.max(h.defences??0,x.defences);
   }
   const holders=[...held.values()].sort((a,b)=>b.belts.filter(o=>ORGS.includes(o)).length-a.belts.filter(o=>ORGS.includes(o)).length);
   return {division:d.division,holders,undisputed:!!holders[0]&&ORGS.every(o=>holders[0].belts.includes(o))};
  });
 }
 /* The scouting roster is dated ROSTER_DATE. A verified result after that date (data/results.json) moves the
    boxer's record to the post-fight record that result carries, and adds the fight to the last five. */
 const ROSTER_DATE="2026-11-07";
 const tidy=r=>{const m=/^(\d+)[–-](\d+)(?:[–-](\d+))?/.exec(r||"");return m?m[1]+"–"+m[2]+(m[3]&&m[3]!=="0"?"–"+m[3]:""):"";};
 function later(results){
  const out=new Map();
  for(const b of (results&&results.results)||[]){
   if(!b||b.sport!=="Boxing"||!(b.date>ROSTER_DATE)||!Array.isArray(b.fighters)||b.fighters.length!==2)continue;
   const m=String(b.method||"").toLowerCase();
   b.fighters.forEach((f,i)=>{
    if(!f||!f.name)return;
    const o=/no contest/.test(m)?"NC":/draw/.test(m)?"D":Number.isInteger(b.winner)?(b.winner===i?"W":"L"):null;
    if(!o)return;
    const k=slug(f.name);if(!out.has(k))out.set(k,[]);
    out.get(k).push({date:b.date,o,record:tidy(f.record)});
   });
  }
  for(const xs of out.values())xs.sort((a,b)=>b.date.localeCompare(a.date));
  return out;
 }
 function roster(fighters,results){
  const upd=later(results);
  return (fighters||[]).filter(f=>f&&f.sport==="Boxing"&&f.name&&f.id).map(f=>{
   const x={id:f.id,name:f.name,division:f.division,category:f.category,record:record(f),
    last:(f.latest||[]).map(y=>y&&y.outcome).filter(o=>["W","L","D","NC"].includes(o)).slice(0,5)};
   const u=upd.get(slug(f.name));
   if(u&&u.length){x.last=u.map(y=>y.o).concat(x.last).slice(0,5);x.record=u[0].record||"";x.updated=u[0].date;}
   return x;
  });
 }
 /* Unbeaten: no losses on a stated record, most wins first. */
 const unbeaten=list=>list.filter(f=>{const r=wl(f.record);return r&&r[1]===0;}).sort((a,b)=>wl(b.record)[0]-wl(a.record)[0]||a.name.localeCompare(b.name));
 function search(q,list,champs){
  const k=norm(q).trim();if(k.length<2)return [];
  const out=list.filter(f=>norm(f.name).includes(k)).map(f=>({...f,kind:f.category}));
  for(const c of champs)for(const h of c.holders)if(norm(h.name).includes(k)&&!out.some(o=>o.name===h.name))out.push({name:h.name,division:c.division,kind:"Champion",belts:h.belts});
  return out.slice(0,20);
 }

 /* ---------- browser ---------- */
 const st={view:"overall",q:"",cuts:null,results:null};
 const pic=(name,kind)=>{
  const k=slug(name),c=st.cuts&&st.cuts[k];
  if(c&&c.ok===true)return "assets/img/boxing-cutouts/"+k+".webp";
  return root.BEFNLocalImages?root.BEFNLocalImages.url(name,kind||"portrait"):"";
 };
 const SIL='<span class="fh-face fh-none" aria-hidden="true"><svg viewBox="0 0 90 120"><circle cx="45" cy="38" r="22"/><path d="M4 120c0-30 18-50 41-50s41 20 41 50z"/></svg></span>';
 const face=(name,cls)=>{const u=pic(name);return u?'<img class="fh-face'+(cls?" "+cls:"")+'" src="'+esc(u)+'" alt="" loading="lazy">':SIL;};
 const href=f=>f.id?'#fighter/'+encodeURIComponent(f.id):"";
 const tag=(f,inner,cls)=>{const h=href(f);return h?'<a class="'+cls+'" href="'+h+'">'+inner+"</a>":'<div class="'+cls+'">'+inner+"</div>";};
 const l5=f=>f.last&&f.last.length?'<span class="fh-l5" aria-label="Last fights, newest first: '+esc(f.last.join(" "))+'">'+f.last.map(o=>'<b class="is-'+(o==="W"?"w":o==="L"?"l":"d")+'">'+esc(o==="NC"?"N":o)+"</b>").join("")+"</span>":"";
 const belts=b=>'<span class="bxh-belts">'+b.map(o=>"<i>"+esc(o)+"</i>").join("")+"</span>";
 const head=(t,sub)=>'<div class="fh-head"><h2>'+esc(t)+"</h2>"+(sub?"<span>"+esc(sub)+"</span>":"")+"</div>";

 function card(f){
  return tag(f,'<span class="fh-pic">'+face(f.name)+'</span><span class="fh-body"><span class="fh-name">'+esc(f.name)+"</span>"+
   '<span class="fh-meta">'+esc(f.division)+(f.record?" · "+esc(f.record):"")+"</span>"+l5(f)+"</span>","fh-card bxh-card");
 }
 function rail(title,sub,list){
  return list.length?'<section class="fh-sec">'+head(title,sub)+'<div class="fh-rail">'+list.map(card).join("")+"</div></section>":"";
 }
 function champGrid(champs){
  const rows=champs.filter(c=>c.holders.length);
  if(!rows.length)return "";
  return '<section class="fh-sec fh-padded">'+head("Champions","Whoever holds the most belts in each division. Gold edge: undisputed.")+'<div class="bxh-champs">'+
   rows.map(c=>{const h=c.holders[0];return '<button type="button" class="bxh-champ'+(c.undisputed?" is-und":"")+'" data-fh-div="'+esc(c.division)+'">'+
    '<span class="bxh-champ-pic">'+face(h.name)+'</span><span class="bxh-champ-body"><span class="fh-kicker">'+esc(c.division)+"</span>"+
    '<span class="fh-name">'+esc(h.name)+"</span>"+belts(h.belts)+(c.holders.length>1?'<span class="fh-meta">Also: '+esc(c.holders.slice(1,3).map(x=>x.name).join(", "))+"</span>":"")+
    "</span></button>";}).join("")+"</div></section>";
 }
 function nextCards(list){
  return '<div class="fh-next">'+list.map(f=>tag(f,'<span class="fh-pic">'+face(f.name)+'</span><span class="fh-body"><span class="fh-stage-text">'+esc(f.category)+"</span>"+
   '<span class="fh-name">'+esc(f.name)+'</span><span class="fh-meta">'+esc(f.record||"Record not confirmed")+"</span>"+l5(f)+"</span>","fh-nextcard")).join("")+"</div>";
 }
 function divisionHTML(div,list,champs){
  const c=champs.find(x=>x.division===div)||{holders:[]},h=c.holders[0];
  let out="";
  if(h)out+='<section class="fh-champ"><div class="fh-champ-body"><span class="fh-kicker">'+esc(div)+(c.undisputed?" · undisputed champion":" champion")+"</span>"+
   '<span class="fh-champ-name">'+esc(h.name)+"</span>"+belts(h.belts)+
   (Number.isInteger(h.defences)?'<span class="fh-soft">'+h.defences+(h.defences===1?" defence":" defences")+"</span>":"")+
   (c.holders.length>1?'<span class="bxh-others">'+c.holders.slice(1).map(x=>"<span><b>"+esc(x.name)+"</b> "+esc(x.belts.join(", "))+"</span>").join("")+"</span>":"")+
   '</div><span class="fh-champ-pic">'+face(h.name)+"</span></section>";
  else out+='<p class="fh-note fh-padded">No major belt holder recorded in this division.</p>';
  const inDiv=list.filter(f=>f.division===div);
  for(const [cat,sub] of [["Contender","Closest to a world title shot"],["Prospect","Coming through"]]){
   const xs=inDiv.filter(f=>f.category===cat);
   if(xs.length)out+='<section class="fh-sec fh-padded">'+head(cat+"s",sub)+nextCards(xs)+"</section>";
  }
  return out;
 }
 function resultsHTML(found){
  if(!found.length)return '<p class="fh-note fh-padded bxh-none">No boxer on this page matches “'+esc(st.q)+"”.</p>";
  return '<section class="fh-sec fh-padded">'+head("Search results")+'<div class="fh-list">'+found.map(f=>tag(f,'<span class="fh-row-pic">'+face(f.name)+'</span><span class="fh-row-body"><span>'+
   '<span class="fh-name">'+esc(f.name)+'</span><span class="fh-meta">'+esc(f.division)+(f.record?" · "+esc(f.record):"")+"</span>"+(f.belts?belts(f.belts):l5(f))+"</span>"+
   '<span class="fh-meta">'+esc(f.kind)+"</span></span>","fh-row")).join("")+"</div></section>";
 }
 function body(list,champs){
  let h="";
  if(st.q.trim().length>=2)h+=resultsHTML(search(st.q,list,champs));
  else if(st.view==="overall"){
   const by=c=>list.filter(f=>f.category===c);
   h+=champGrid(champs)+rail("Unbeaten","Contenders and prospects without a loss on their record",unbeaten(list).slice(0,12))+
    rail("Contenders","Closest to a world title shot. Pick a division for all of them.",by("Contender").filter(f=>f.record).slice(0,13))+
    rail("Prospects","Coming through. Pick a division for all of them.",by("Prospect").filter(f=>f.record).slice(0,13));
  }else h+=divisionHTML(st.view,list,champs);
  return h+'<p class="fh-foot">Champions from BEFN\u2019s title tracker. Contenders and prospects from the BEFN scouting roster of 7 November 2026, with records brought up to date from the verified results since then. The coloured squares are the last five fights, newest first.</p>';
 }
 /* The top bar and search box are drawn once; typing only redraws the pills and the body, so the phone keyboard stays put. */
 function render(mount){
  const D=root.COMBAT_DATA||{},list=roster(D.fighters,st.results),champs=champions(D.champions&&D.champions.boxing);
  const divs=champs.map(c=>c.division).filter(d=>list.some(f=>f.division===d)||champs.some(c=>c.division===d&&c.holders.length));
  if(!mount.querySelector("[data-bxh-body]"))mount.innerHTML='<div class="fh-top"><h2>Boxing fighters</h2><label class="bxh-find"><span class="bxh-sr">Find a boxer</span><input type="search" data-bxh-q placeholder="Find a boxer" autocomplete="off"></label></div>'+
   '<nav class="fh-pills" aria-label="Divisions" data-bxh-pills></nav><div data-bxh-body></div>';
  mount.querySelector("[data-bxh-pills]").innerHTML=[["overall","Overall"],...divs.map(d=>[d,d])].map(([k,n])=>'<button type="button" data-fh-div="'+esc(k)+'" aria-pressed="'+(st.view===k&&st.q.trim().length<2)+'">'+esc(n)+"</button>").join("");
  mount.querySelector("[data-bxh-body]").innerHTML=body(list,champs);
 }
 function bind(mount){
  if(mount.dataset.bxhBound)return;mount.dataset.bxhBound="1";
  mount.addEventListener("click",e=>{const d=e.target.closest("[data-fh-div]");if(!d)return;st.view=d.dataset.fhDiv;st.q="";const q=mount.querySelector("[data-bxh-q]");if(q)q.value="";render(mount);mount.scrollIntoView({block:"start"});});
  mount.addEventListener("input",e=>{if(!e.target.matches("[data-bxh-q]"))return;st.q=e.target.value;render(mount);});
 }
 function scan(){
  if(typeof document==="undefined")return;
  document.querySelectorAll("[data-befn-boxing-hub]").forEach(m=>{
   if(m.dataset.bxhDone)return;m.dataset.bxhDone="1";bind(m);render(m);
   if(!st.cuts)Promise.all([fetch("data/boxing-cutout-register.json").then(r=>r.ok?r.json():null).catch(()=>null),fetch("data/results.json").then(r=>r.ok?r.json():null).catch(()=>null)])
    .then(([c,r])=>{st.cuts=(c&&c.cutouts)||{};st.results=r;document.querySelectorAll("[data-befn-boxing-hub]").forEach(render);});
  });
 }
 const api={champions,roster,unbeaten,search,scan};
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.BEFNBoxingHub=api;
 if(typeof document!=="undefined"){
  if(typeof MutationObserver!=="undefined")new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();
 }
})(typeof window!=="undefined"?window:globalThis);
