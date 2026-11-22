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
   bars("Where strikes land",r.target,[["head","Head"],["body","Body"],["leg","Legs"]])+
   bars("Where strikes are thrown",r.position,[["distance","Distance"],["clinch","Clinch"],["ground","Ground"]])+
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

 // ---- Over time: one measured number, fight by fight ----
 // Every point is one UFC fight with full round statistics, oldest first. Nothing is smoothed away:
 // the dots are the fights themselves, and the line is a five-fight rolling mean over the same dots.
 const TRENDS=[
  ["slpm","Sig. strikes landed/min","rate"],["sapm","Sig. strikes absorbed/min","rate"],
  ["strAcc","Strike accuracy","pct"],["td15","Takedowns/15 min","rate"],["ctrlShare","Control time","pct"]
 ];
 const TREND_MIN=4;          // fewer fights than this is a list, not a trend
 const ROLL=5;
 // A phone gets a taller, narrower drawing. The chart is one SVG scaled to the
 // column width, so the wide 600x170 box becomes about 100px tall on a 390px
 // screen; this box keeps it readable. Matches the CSS breakpoint.
 const NARROW="(max-width:420px)";
 const isNarrow=()=>typeof window!=="undefined"&&typeof window.matchMedia==="function"?
  window.matchMedia(NARROW).matches:false;
 const trendMeasure=new Map();   // slug -> chosen measure
 const divisionCache=new Map();  // slug -> divisions file, for the re-render
 function fightValue(stats,fight,key){
  const minutes=Number.isFinite(fight.seconds)?fight.seconds/60:0;
  if(!minutes||!fight.rounds?.length)return null;
  const [landed]=sumRounds(stats,fight,"sigLanded");
  if(key==="slpm")return landed===null?null:landed/minutes;
  if(key==="sapm"){const [,absorbed]=sumRounds(stats,fight,"sigLanded");return absorbed===null?null:absorbed/minutes;}
  if(key==="strAcc"){const [att]=sumRounds(stats,fight,"sigAttempted");return landed===null||!att?null:landed/att;}
  if(key==="td15"){const [td]=sumRounds(stats,fight,"takedowns");return td===null?null:td*15/minutes;}
  if(key==="ctrlShare"){const [ctrl]=sumRounds(stats,fight,"controlSec");return ctrl===null?null:ctrl/fight.seconds;}
  return null;
 }
 function trendPoints(stats,key){
  return (stats.fights||[]).slice().reverse().map(f=>{
   const value=fightValue(stats,f,key);
   return value===null||!Number.isFinite(value)?null:{value,fight:f};
  }).filter(Boolean);
 }
 // A round number at or above the highest point, so the axis reads 10 or 2.5 and never 13.98.
 function niceTop(value){
  if(!(value>0))return 1;
  const power=Math.pow(10,Math.floor(Math.log10(value)));
  return (([1,1.5,2,2.5,3,4,5,7.5,10].find(step=>value<=step*power))||10)*power;
 }
 function trendChart(points,key,unit,divisionAvg,divisionLabel,small){
  const W=small?360:600,H=small?250:170,L=small?52:38,R=small?12:10,
   T=small?16:14,B=small?30:26;
  const values=points.map(p=>p.value);
  const top=unit==="pct"?Math.min(1,niceTop(Math.max(...values,divisionAvg||0))):
   niceTop(Math.max(...values,divisionAvg||0));
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const x=i=>L+(points.length<2?(W-L-R)/2:i*(W-L-R)/(points.length-1));
  const y=v=>T+(H-T-B)*(1-Math.min(v,top)/top);
  const show=v=>unit==="pct"?pct(v):num(v);
  const roll=values.map((_,i)=>{
   if(i<ROLL-1)return null;
   const slice=values.slice(i-ROLL+1,i+1);
   return slice.reduce((a,b)=>a+b,0)/slice.length;
  });
  const rollPath=roll.map((v,i)=>v===null?null:(i===roll.findIndex(z=>z!==null)?"M":"L")+x(i).toFixed(1)+" "+y(v).toFixed(1))
   .filter(Boolean).join(" ");
  const line=(v,cls)=>!Number.isFinite(v)||v>top?"":
   '<line class="'+cls+'" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'"/>';
  const dots=points.map((p,i)=>{
   const klass=p.fight.outcome==="W"?"is-win":p.fight.outcome==="L"?"is-loss":"is-draw";
   return '<circle class="bsp-trend-dot '+klass+'" cx="'+x(i).toFixed(1)+'" cy="'+y(p.value).toFixed(1)+'" r="5">'+
    '<title>'+esc((p.fight.outcome||"")+" vs "+(p.fight.opponent||"opponent")+" · "+(p.fight.date||"")+" · "+show(p.value))+'</title></circle>';
  }).join("");
  const year=d=>String(d||"").slice(0,4);
  return '<svg class="bsp-trend-svg" viewBox="0 0 '+W+' '+H+'" role="img" preserveAspectRatio="xMidYMid meet" '+
   'aria-label="'+esc(points.length+" UFC fights, oldest first. "+show(values[0])+" in the first, "+
    show(values[values.length-1])+" in the latest, "+show(mean)+" on average.")+'">'+
   '<line class="bsp-trend-axis" x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(H-B)+'"/>'+
   '<line class="bsp-trend-axis" x1="'+L+'" x2="'+(W-R)+'" y1="'+(H-B)+'" y2="'+(H-B)+'"/>'+
   '<text class="bsp-trend-tick" x="'+(L-6)+'" y="'+(T+5)+'" text-anchor="end">'+esc(show(top))+'</text>'+
   '<text class="bsp-trend-tick" x="'+(L-6)+'" y="'+(H-B)+'" text-anchor="end">0</text>'+
   line(divisionAvg,"bsp-trend-div")+line(mean,"bsp-trend-mean")+
   (rollPath?'<path class="bsp-trend-roll" d="'+rollPath+'"/>':"")+dots+
   '<text class="bsp-trend-tick" x="'+L+'" y="'+(H-6)+'">'+esc(year(points[0].fight.date))+'</text>'+
   '<text class="bsp-trend-tick" x="'+(W-R)+'" y="'+(H-6)+'" text-anchor="end">'+esc(year(points[points.length-1].fight.date))+'</text>'+
   '</svg>';
 }
 function trendsInner(stats,divisions){
  const available=TRENDS.filter(([k])=>trendPoints(stats,k).length>=TREND_MIN);
  if(!available.length)return "";
  const wanted=trendMeasure.get(stats.slug);
  const [key,label,unit]=available.find(([k])=>k===wanted)||available[0];
  const points=trendPoints(stats,key);
  const values=points.map(p=>p.value);
  const show=v=>unit==="pct"?pct(v):num(v);
  const div=divisions?.divisions?.[stats.divisionSlug];
  const fieldAt=(divisions?.rateFields||[]).indexOf(key);
  const divisionAvg=div&&fieldAt>-1?div.rates[fieldAt]:null;
  const recent=values.slice(-ROLL),early=values.slice(0,ROLL);
  const recentMean=recent.reduce((a,b)=>a+b,0)/recent.length;
  const earlyMean=early.reduce((a,b)=>a+b,0)/early.length;
  const moved=points.length>=ROLL*2?
   '<p class="bsp-trend-read">Last '+recent.length+': <b>'+esc(show(recentMean))+'</b> · first '+early.length+
    ': <b>'+esc(show(earlyMean))+'</b></p>':"";
  const careerMean=values.reduce((a,b)=>a+b,0)/values.length;
  // The key names only what the chart draws. An outcome colour this fighter has
  // never had, or a line too short to exist, would be a label pointing at nothing.
  const OUTCOMES=[["is-win","Won","green won",p=>p.fight.outcome==="W"],
   ["is-loss","Lost","red lost",p=>p.fight.outcome==="L"],
   ["is-draw","Draw or no contest","grey a draw or no contest",
    p=>p.fight.outcome!=="W"&&p.fight.outcome!=="L"]];
  const outcomes=OUTCOMES.filter(([,,,has])=>points.some(has));
  const legend='<div class="bsp-trend-key">'+
   outcomes.map(([cls,label])=>'<span class="'+cls+'">'+label+'</span>').join("")+
   (points.length>=ROLL?'<span class="is-roll">Five-fight average</span>':'')+
   '<span class="is-mean">Career avg ' + esc(show(careerMean)) + '</span>'+
   (Number.isFinite(divisionAvg)?'<span class="is-div">'+esc(div.label+" avg "+show(divisionAvg))+'</span>':'')+
   '</div>';
  return '<div class="bsp-trend-pick" role="group" aria-label="Measure">'+available.map(([k,l])=>
   '<button type="button" data-bsp-trend-key="'+esc(k)+'" aria-pressed="'+(k===key)+'">'+esc(l)+'</button>').join("")+'</div>'+
   legend+trendChart(points,key,unit,Number.isFinite(divisionAvg)?divisionAvg:null,div?div.label:"",isNarrow())+moved+
   '<small class="bsp-note">One dot per UFC fight with full statistics, oldest first; '+
   outcomes.map(([,,phrase])=>phrase).join(", ")+'. '+
   (points.length>=ROLL?'The line is a five-fight rolling average. ':'')+
   'Measured numbers only — not a forecast.</small>';
 }
 function trends(stats,divisions){
  const body=trendsInner(stats,divisions);
  if(!body)return "";
  cache.set(stats.slug,stats);
  divisionCache.set(stats.slug,divisions);
  return '<div class="bsp-trend" data-bsp-trend="'+esc(stats.slug)+'">'+body+'</div>';
 }
 if(typeof document!=="undefined")document.addEventListener("click",e=>{
  const btn=e.target.closest?.("[data-bsp-trend-key]");
  if(!btn)return;
  const box=btn.closest("[data-bsp-trend]");
  const stats=box&&cache.get(box.dataset.bspTrend);
  if(!stats)return;
  trendMeasure.set(stats.slug,btn.dataset.bspTrendKey);
  box.innerHTML=trendsInner(stats,divisionCache.get(stats.slug));
  box.querySelector('[data-bsp-trend-key="'+btn.dataset.bspTrendKey+'"]')?.focus({preventScroll:true});
 });

 // The drawing differs between phone and desktop, so redraw an open chart when
 // the viewport crosses the breakpoint (rotation, or a resized window).
 if(typeof window!=="undefined"&&typeof window.matchMedia==="function"){
  const mq=window.matchMedia(NARROW);
  const redraw=()=>{
   document.querySelectorAll("[data-bsp-trend]").forEach(box=>{
    const stats=cache.get(box.dataset.bspTrend);
    if(stats)box.innerHTML=trendsInner(stats,divisionCache.get(stats.slug));
   });
  };
  if(mq.addEventListener)mq.addEventListener("change",redraw);
  else if(mq.addListener)mq.addListener(redraw);
 }

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

 const api={glance,fightDetail,history,statsPanel,compare,trends,findFight,methodText};
 scope.BEFNStatsProfile=api;
 if(typeof module==="object"&&module?.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
