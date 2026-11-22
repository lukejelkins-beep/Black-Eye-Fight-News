/* BEFN fighter profile, stats sections (stage 4).
 * Renders from one fighter's file built by scripts/build-ufc-stats.py
 * (data/ufc-stats/fighters/<slug>.json) and data/ufc-stats/divisions.json.
 * Reader-facing only: no sources, research notes or verification text.
 * Missing numbers stay "—"; nothing is estimated. */
(function(scope){
 "use strict";
 const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const norm=s=>String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const eventTitle=t=>(scope.BEFNEventTitle||(x=>x))(t);
 const WINDOWS=[["last5","Last 5"],["l12","12 months"],["l36","36 months"],["career","Career"]];
 const METHOD={ko:"KO/TKO",sub:"Submission",dec:"Decision",draw:"Draw",nc:"No contest",dq:"DQ"};
 const cache=new Map();      // slug -> stats file (for the window switcher)
 const selected=new Map();   // slug -> chosen window

 const num=(v,dp=2)=>Number.isFinite(v)?v.toFixed(dp):"—";
 const pct=v=>Number.isFinite(v)?Math.round(v*100)+"%":"—";
 const clock=s=>Number.isFinite(s)?Math.floor(s/60)+":"+String(Math.round(s%60)).padStart(2,"0"):"—";
 const record=w=>w&&w.fights?w.W+"–"+w.L+(w.D?"–"+w.D:"")+(w.NC?" ("+w.NC+" NC)":""):"—";
 function methodText(f){
  const base=METHOD[f.method]||"Result";
  const detail=f.method==="dec"&&f.methodDetail?" ("+String(f.methodDetail).toLowerCase()+")":"";
  const when=f.method!=="dec"&&f.method!=="draw"&&f.endRound?" · R"+f.endRound+(f.endTime?" "+f.endTime:""):"";
  return base+detail+when;
 }
 function fieldIndex(stats){
  const idx={};(stats.roundFields||[]).forEach((k,i)=>idx[k]=i);return idx;
 }
 function sumRounds(stats,fight,key){
  const i=fieldIndex(stats)[key];
  if(i===undefined||!fight.rounds?.length)return [null,null];
  let own=0,opp=0;
  for(const r of fight.rounds){
   if(!Number.isInteger(r[2][i])||!Number.isInteger(r[3][i]))return [null,null];
   own+=r[2][i];opp+=r[3][i];
  }
  return [own,opp];
 }

 // ---- Overview: three big numbers and the latest bout ----
 function glance(stats){
  const c=stats.windows?.career||{};
  const big=[
   stats.feederBouts?[record(c),"Recorded bouts","Includes "+stats.feederBouts+" Contender Series or Road to UFC"]:
    [record(c),"UFC record",c.fights?c.fights+" UFC fights":""],
   [Number.isFinite(c.finishRate)?Math.round(c.finishRate*100)+"%":"—","Finish rate",c.W?"of "+c.W+" UFC wins":"No UFC wins yet"],
   c.judging?[Math.round(c.judging.roundWinRate*100)+"%","Rounds won on the cards",c.judging.roundsScored+" scored rounds"]:
    [num(c.rates?.diffPm),"Strike difference per min","Landed minus absorbed"]
  ];
  return '<div class="bsp-big">'+big.map(([v,l,s])=>'<div><strong>'+esc(v)+'</strong><span>'+esc(l)+'</span>'+
   (s?'<small>'+esc(s)+'</small>':'')+'</div>').join("")+'</div>'+latestBout(stats);
 }
 function latestBout(stats){
  const f=(stats.fights||[])[0];
  if(!f)return "";
  const [sig,sigO]=sumRounds(stats,f,"sigLanded"),[td,tdO]=sumRounds(stats,f,"takedowns"),[ct,ctO]=sumRounds(stats,f,"controlSec");
  const klass=f.outcome==="W"?"is-win":f.outcome==="L"?"is-loss":"is-draw";
  return '<div class="bsp-latest '+klass+'"><span class="bsp-tag">Latest bout</span>'+
   '<div class="bsp-latest-main"><span class="befn-power-result '+klass+'">'+esc(f.outcome)+'</span>'+
   '<div><strong>vs '+esc(f.opponent)+'</strong><small>'+esc(methodText(f))+' · '+esc(f.date)+'</small>'+
   (f.event?'<small>'+esc(eventTitle(f.event))+'</small>':'')+'</div></div>'+
   (sig!==null?'<div class="bsp-latest-stats"><span><b>'+sig+'–'+sigO+'</b> sig. strikes</span>'+
    (td!==null?'<span><b>'+td+'–'+tdO+'</b> takedowns</span>':'')+
    (ct!==null?'<span><b>'+clock(ct)+'</b> control</span>':'')+'</div>':'')+
   '</div>';
 }

 // ---- Round-by-round detail and scorecards (inside a fight row) ----
 function findFight(stats,{boutId,date,opponent}){
  const fights=stats?.fights||[];
  if(boutId){const hit=fights.find(f=>String(f.boutId)===String(boutId));if(hit)return hit;}
  const day=Date.parse(String(date||"")+"T00:00:00Z"),who=norm(opponent);
  return fights.find(f=>norm(f.opponent)===who&&Number.isFinite(day)&&
   Math.abs(Date.parse(f.date+"T00:00:00Z")-day)<=86400000)||null;
 }
 function roundBars(stats,fight){
  const idx=fieldIndex(stats);
  const rows=fight.rounds||[];
  if(!rows.length)return '<p class="bsp-none">Round statistics were not recorded for this fight.</p>';
  const max=Math.max(1,...rows.flatMap(r=>[r[2][idx.sigLanded],r[3][idx.sigLanded]].filter(Number.isInteger)));
  const bar=(v,side)=>'<span class="bsp-bar is-'+side+'"><span style="width:'+(Number.isInteger(v)?Math.round(100*v/max):0)+'%"></span></span>';
  const pair=(a,b)=>(Number.isInteger(a)?a:"—")+"–"+(Number.isInteger(b)?b:"—");
  return '<div class="bsp-rounds" role="table" aria-label="Significant strikes landed and absorbed by round">'+
   '<div class="bsp-round-key" role="row"><span role="columnheader" aria-label="Round">Rd</span><span role="columnheader">Landed</span><span role="columnheader">Absorbed</span></div>'+
   rows.map(r=>{
    const o=r[2],x=r[3];
    return '<div class="bsp-round" role="row"><b role="cell">R'+r[0]+'</b>'+
     '<span role="cell" class="bsp-pair">'+bar(o[idx.sigLanded],"own")+'<em>'+(Number.isInteger(o[idx.sigLanded])?o[idx.sigLanded]:"—")+'</em></span>'+
     '<span role="cell" class="bsp-pair">'+bar(x[idx.sigLanded],"opp")+'<em>'+(Number.isInteger(x[idx.sigLanded])?x[idx.sigLanded]:"—")+'</em></span>'+
     '<small role="cell">TD '+pair(o[idx.takedowns],x[idx.takedowns])+' · KD '+pair(o[idx.knockdowns],x[idx.knockdowns])+
     ' · Control '+clock(o[idx.controlSec])+'–'+clock(x[idx.controlSec])+'</small></div>';
   }).join("")+'</div>';
 }
 function scorecards(fight){
  const judges=fight.scorecards?.judges||[];
  if(!judges.length)return "";
  const rounds=Math.max(...judges.map(j=>j.rounds.length));
  return '<div class="bsp-cards"><span class="bsp-tag">Judges’ scorecards</span><div class="bsp-cards-scroll"><table>'+
   '<thead><tr><th scope="col">Judge</th>'+Array.from({length:rounds},(_,i)=>'<th scope="col">R'+(i+1)+'</th>').join("")+
   '<th scope="col">Total</th></tr></thead><tbody>'+judges.map(j=>{
    const won=j.total?.[0]>j.total?.[1];
    return '<tr><th scope="row">'+esc(j.judge||"Judge")+'</th>'+Array.from({length:rounds},(_,i)=>{
     const r=j.rounds[i];if(!r)return '<td>—</td>';
     return '<td class="'+(r[1]>r[2]?'is-won':r[1]<r[2]?'is-lost':'')+'">'+r[1]+'–'+r[2]+'</td>';
    }).join("")+'<td class="'+(won?'is-won':'is-lost')+'"><b>'+esc((j.total||[]).join("–"))+'</b></td></tr>';
   }).join("")+'</tbody></table></div><small class="bsp-note">This fighter’s score first.</small></div>';
 }
 function fightDetail(stats,ref){
  const fight=findFight(stats,ref);
  if(!fight)return "";
  return '<details class="bsp-detail"><summary>Round by round</summary>'+roundBars(stats,fight)+scorecards(fight)+'</details>';
 }

 // ---- Full UFC history ----
 function history(stats,skipBoutIds){
  const skip=new Set((skipBoutIds||[]).map(String));
  const rows=(stats.fights||[]).filter(f=>!skip.has(String(f.boutId)));
  if(!rows.length)return "";
  return '<details class="bsp-history"><summary>Full UFC history <small>'+(stats.fights||[]).length+' fights</small></summary><ul>'+
   rows.map(f=>{
    const klass=f.outcome==="W"?"is-win":f.outcome==="L"?"is-loss":"is-draw";
    return '<li class="'+klass+'"><div class="bsp-history-row"><span class="befn-power-result '+klass+'">'+esc(f.outcome)+'</span>'+
     '<div><strong>'+esc(f.opponent)+'</strong><small>'+esc(methodText(f))+' · '+esc(f.date)+'</small></div></div>'+
     fightDetail(stats,{boutId:f.boutId})+'</li>';
   }).join("")+'</ul></details>';
 }

 // ---- Stats with a window switcher (keeps the nine tiles) ----
 function statsPanel(stats){
  cache.set(stats.slug,stats);
  return '<div class="bsp-stats" data-bsp-stats="'+esc(stats.slug)+'">'+statsInner(stats)+'</div>';
 }
 // Head, body and legs, like distance, clinch and ground, must add up to the
 // strikes landed. Some archived rounds do not, so their shares would be false.
 function breakdownsSound(stats){
  const i=fieldIndex(stats),parts=[["headLanded","bodyLanded","legLanded"],["distanceLanded","clinchLanded","groundLanded"]];
  return (stats.fights||[]).every(f=>(f.rounds||[]).every(r=>[r[2],r[3]].every(side=>parts.every(keys=>{
   const v=keys.map(k=>side[i[k]]);
   return !v.every(Number.isInteger)||v[0]+v[1]+v[2]===side[i.sigLanded];
  }))));
 }
 function statsInner(stats){
  const key=selected.get(stats.slug)||"last5";
  const w=stats.windows?.[key]||{};const r=w.rates||{};
  const sample=w.statFights?w.statFights+" fight"+(w.statFights===1?"":"s")+" with stats":"No fights in this window";
  const tiles=[
   [record(w),"Record",w.fights?w.fights+" fights":""],
   [w.fights?String(w.winsBy?.ko??0):"—","KO/TKO wins",""],
   [w.fights?String(w.winsBy?.sub??0):"—","Submission wins",""],
   [num(r.slpm),"Sig. strikes/min",sample],
   [pct(r.strAcc),"Strike accuracy",sample],
   [num(r.kd15),"Knockdowns/15 min",sample],
   [num(r.td15),"Takedowns/15 min",sample],
   [pct(r.tdDef),"TD defence",Number.isFinite(r.tdDef)?sample:"Too few attempts against"],
   [pct(r.ctrlShare),"Control time",Number.isFinite(r.ctrlShare)?"Share of fight time":sample]
  ];
  const bars=(title,obj,labels)=>obj?'<div class="bsp-split"><span class="bsp-tag">'+esc(title)+'</span>'+
   labels.map(([k,l])=>'<div class="bsp-split-row"><span>'+esc(l)+'</span><span class="bsp-bar is-own"><span style="width:'+
    Math.round((obj[k]||0)*100)+'%"></span></span><b>'+pct(obj[k])+'</b></div>').join("")+'</div>':"";
  const pace=Number.isFinite(r.paceRetention)?'<div class="bsp-pace"><span class="bsp-tag">Pace</span><strong>'+
   Math.round(r.paceRetention*100)+'%</strong><small>Output after round 1, compared with round 1'+
   (r.paceRetention>=1?' (keeps or raises the pace)':' (slows after round 1)')+'</small></div>':"";
  return '<div class="bsp-windows" role="group" aria-label="Time window">'+WINDOWS.map(([k,l])=>
   '<button type="button" data-bsp-window="'+k+'" aria-pressed="'+(k===key)+'">'+esc(l)+'</button>').join("")+'</div>'+
   '<div class="befn-pro-tiles">'+tiles.map(([v,l,s])=>'<div><strong>'+esc(v)+'</strong><span>'+esc(l)+'</span>'+
    (s?'<small>'+esc(s)+'</small>':'')+'</div>').join("")+'</div>'+
   '<div class="bsp-split-grid">'+
   bars("Where strikes land",stats.hideBreakdowns?null:r.target,[["head","Head"],["body","Body"],["leg","Legs"]])+
   bars("Where strikes are thrown",stats.hideBreakdowns?null:r.position,[["distance","Distance"],["clinch","Clinch"],["ground","Ground"]])+
   pace+'</div>';
 }
 if(typeof document!=="undefined")document.addEventListener("click",e=>{
  const btn=e.target.closest?.("[data-bsp-window]");
  if(!btn)return;
  const box=btn.closest("[data-bsp-stats]");
  const stats=box&&cache.get(box.dataset.bspStats);
  if(!stats)return;
  selected.set(stats.slug,btn.dataset.bspWindow);
  box.innerHTML=statsInner(stats);
  box.querySelector('[data-bsp-window="'+btn.dataset.bspWindow+'"]')?.focus({preventScroll:true});
 });

 // ---- Compare with the division average (last 36 months) ----
 const COMPARE=[["slpm","Sig. strikes landed/min","rate",false],["sapm","Sig. strikes absorbed/min","rate",true],
  ["strAcc","Strike accuracy","pct",false],["strDef","Strike defence","pct",false],
  ["td15","Takedowns/15 min","rate",false],["tdDef","Takedown defence","pct",false],
  ["ctrlShare","Control time","pct",false],["kd15","Knockdowns/15 min","rate",false]];
 function compare(stats,divisions){
  const div=divisions?.divisions?.[stats.divisionSlug];
  const w=stats.windows?.l36;
  if(!div||!w||(w.statFights||0)<(divisions.minFights||3))return "";
  const fields=divisions.rateFields||[];
  const avg=k=>div.rates[fields.indexOf(k)];
  const rows=COMPARE.filter(([k])=>Number.isFinite(w.rates?.[k])&&Number.isFinite(avg(k)));
  if(!rows.length)return "";
  return '<div class="bsp-compare"><div class="bsp-compare-key"><span class="is-own">'+esc(stats.name)+'</span>'+
   '<span class="is-avg">'+esc(div.label)+' average</span></div>'+rows.map(([k,label,unit,lowerBetter])=>{
    const me=w.rates[k],them=avg(k),max=Math.max(me,them)||1;
    const better=lowerBetter?me<them:me>them;
    const show=unit==="pct"?pct:num;
    return '<div class="bsp-compare-row"><span class="bsp-compare-label">'+esc(label)+
     (lowerBetter?' <small>lower is better</small>':'')+'</span>'+
     '<div class="bsp-compare-bars"><span class="bsp-bar is-own'+(better?' is-better':'')+'"><span style="width:'+Math.round(100*me/max)+'%"></span></span><b>'+show(me)+'</b>'+
     '<span class="bsp-bar is-avg"><span style="width:'+Math.round(100*them/max)+'%"></span></span><b>'+show(them)+'</b></div></div>';
   }).join("")+'<small class="bsp-note">Last 36 months. Average of '+div.fighters+' '+esc(div.label)+
   ' fighters with 3+ UFC fights in that time.</small></div>';
 }

 const api={breakdownsSound,glance,fightDetail,history,statsPanel,compare,findFight,methodText};
 scope.BEFNStatsProfile=api;
 if(typeof module==="object"&&module?.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
