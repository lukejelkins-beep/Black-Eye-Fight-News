/* BEFN Sumo — accessible, source-sparse career graphs. No synthetic weights. */
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const names=['Yokozuna','Ozeki','Sekiwake','Komusubi','Maegashira','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi'];
const cap=[2,3,3,3,18,15,65,110,120,40];
const months={'01':'Jan','03':'Mar','05':'May','07':'Jul','09':'Sep','11':'Nov'};
const bashoOK=x=>/^\d{4}(01|03|05|07|09|11)$/.test(String(x||''));
const dateLabel=x=>months[String(x).slice(-2)]+' '+String(x).slice(0,4);
export function parseBanzukeRank(raw) {
  const m=/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\s+(\d+)\s+(East|West)$/.exec(String(raw||''));
  if(!m)return null;
  const tier=names.indexOf(m[1]),n=Number(m[2]);
  return tier<0||!Number.isSafeInteger(n)||n<1||n>cap[tier]?null:{tier,place:n,side:m[3]};
}
export function ordinalRank(raw) {
  const v=parseBanzukeRank(raw);
  return v?v.tier+((v.place-1)+(v.side==='West'?0.5:0))/cap[v.tier]*0.9:null;
}
const dedupe=arr=>[...new Map(arr.filter(p=>bashoOK(p.basho)).map(p=>[p.basho,p])).values()].sort((a,b)=>a.basho.localeCompare(b.basho));
export function careerPoints(w,cache,bashoId,prevBasho,prevRank){
  const source=cache?.bySourceId?.[String(w?.sourceId)];
  const verifiedIdentity=source&&Number(source.officialNskId)===Number(w?.officialNskId)&&Number(source.sumoApiId)===Number(w?.sourceId);
  const entry=verifiedIdentity?source:null;
  const weight=entry?entry.weight.filter(x=>Number.isFinite(x.kg)&&x.kg>0):[];
  const ranks=entry?entry.rank.filter(x=>ordinalRank(x.rank)!==null):[];
  // Current profile weight is an undated listing, not a confirmed weigh-in
  // at the current basho. Never create a graph dot from it.
  if(bashoOK(prevBasho)&&ordinalRank(prevRank)!==null&&!entry)ranks.push({basho:prevBasho,rank:prevRank});
  const existingCurrentRank=bashoOK(bashoId)?ranks.find(p=>p.basho===bashoId)?.rank:null;
  const currentRankDiscrepancy=existingCurrentRank&&
    ordinalRank(w?.currentRank)!==null&&existingCurrentRank!==w.currentRank?
      {basho:bashoId,recordedRank:existingCurrentRank,rosterRank:w.currentRank}:null;
  // Never overwrite a dated rank already provided by the historical API.
  if(bashoOK(bashoId)&&ordinalRank(w?.currentRank)!==null&&!existingCurrentRank)
    ranks.push({basho:bashoId,rank:w.currentRank});
  const rosterWeight=Number(w?.weightKg);
  const officialWeight=entry?.currentListedWeight;
  const hasOfficialWeight=officialWeight?.datedMeasurement===false&&
    Number.isFinite(Number(officialWeight?.kg))&&Number(officialWeight.kg)>0&&
    /^https:\/\/www\.sumo\.or\.jp\//.test(String(officialWeight.source||''));
  const currentListedWeightKg=hasOfficialWeight?Number(officialWeight.kg):
    Number.isFinite(rosterWeight)&&rosterWeight>0?rosterWeight:null;
  const currentWeightApiDiscrepancy=hasOfficialWeight&&Number.isFinite(rosterWeight)&&
    rosterWeight>0&&Math.round(rosterWeight)!==Number(officialWeight.kg)?
    {officialKg:Number(officialWeight.kg),apiKg:rosterWeight,
      note:'Current measurement discrepancy pending source reconciliation'}:null;
  return {weight:dedupe(weight),ranks:dedupe(ranks),entry,currentRankDiscrepancy,
    currentListedWeightKg,
    currentListedWeightSource:hasOfficialWeight?'JSA current published profile':'Sumo API current listing',
    currentWeightApiDiscrepancy};
}
const frame=(width,height,children,klass,label)=>'<svg class="'+klass+'" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="'+esc(label)+'">'+children+'</svg>';
export function weightChart(points){
  if(!points.length)return '<p class="sumo-career-empty">Historical weight measurements have not been sourced.</p>';
  const W=760,H=255,L=58,R=28,T=30,B=42;
  const values=points.map(p=>p.kg),lo=Math.floor((Math.min(...values)-8)/10)*10,hi=Math.ceil((Math.max(...values)+8)/10)*10;
  const x=i=>points.length===1?(L+W-R)/2:L+i*(W-L-R)/(points.length-1);
  const y=v=>T+(hi-v)/(hi-lo||1)*(H-T-B);
  let s='';
  for(let i=0;i<=4;i++){const n=lo+(hi-lo)*i/4,py=y(n);s+='<line class="sumo-chart-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+py+'" y2="'+py+'"/><text class="sumo-chart-axis" x="'+(L-8)+'" y="'+(py+4)+'" text-anchor="end">'+n.toFixed(n%1?1:0)+'</text>';}
  if(points.length>1)s+='<polyline class="sumo-weight-connector" points="'+points.map((p,i)=>x(i).toFixed(1)+','+y(p.kg).toFixed(1)).join(' ')+'"/>';
  s+=points.map((p,i)=>{const xx=x(i),yy=y(p.kg),tag=dateLabel(p.basho)+' — '+p.kg+' kg';
    return '<circle class="sumo-weight-point" cx="'+xx+'" cy="'+yy+'" r="6" tabindex="0" role="img" aria-label="'+esc(tag)+'"><title>'+esc(tag)+'</title></circle>'+
    '<text class="sumo-chart-number" x="'+xx+'" y="'+(yy-15)+'" text-anchor="middle">'+esc(p.kg)+' kg</text>'+
    '<text class="sumo-chart-axis" x="'+xx+'" y="'+(H-11)+'" text-anchor="middle">'+esc(dateLabel(p.basho))+'</text>';}).join('');
  return '<div class="sumo-weight-scroll">'+frame(W,H,s,'sumo-weight-svg','Documented weight measurements, with gaps between recorded dates')+'</div>';
}
export function banzukeChart(points){
  if(!points.length)return '<p class="sumo-career-empty">No historical rankings are sourced for this rikishi.</p>';
  const W=Math.max(900,155+points.length*29),H=465,L=110,R=35,T=18,B=39,unit=(H-T-B)/10;
  const x=i=>points.length===1?L+(W-L-R)/2:L+i*(W-L-R)/(points.length-1);
  const y=rank=>T+(ordinalRank(rank)+.12)*unit;
  let s=names.map((n,i)=>'<line class="sumo-chart-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+(T+i*unit)+'" y2="'+(T+i*unit)+'"/><text class="sumo-chart-ranklabel" x="'+(L-10)+'" y="'+(T+i*unit+14)+'" text-anchor="end">'+n+'</text>').join('');
  if(points.length>1)s+='<polyline class="sumo-rank-connector" points="'+points.map((p,i)=>x(i).toFixed(1)+','+y(p.rank).toFixed(1)).join(' ')+'"/>';
  s+=points.map((p,i)=>{
    const current=ordinalRank(p.rank),previous=i?ordinalRank(points[i-1].rank):null,change=previous===null?'neutral':current<previous?'up':current>previous?'down':'neutral';
    const desc=dateLabel(p.basho)+' — '+p.rank+(change==='up'?' · promoted':change==='down'?' · demoted':'');
    const marker='<circle class="sumo-rank-point '+change+'" cx="'+x(i)+'" cy="'+y(p.rank)+'" r="'+(i===points.length-1?6:4.1)+'" tabindex="0" role="img" aria-label="'+esc(desc)+'"><title>'+esc(desc)+'</title></circle>';
    const caption=(i===0||i===points.length-1||p.basho.endsWith('01'))?'<text class="sumo-chart-axis" x="'+x(i)+'" y="'+(H-11)+'" text-anchor="middle">'+esc(i===0||i===points.length-1?dateLabel(p.basho):p.basho.slice(0,4))+'</text>':'';
    return marker+caption;
  }).join('');
  return '<div class="sumo-rank-scroll" tabindex="0" aria-label="Scrollable rank timeline. Focus or hover on the dots to read the exact basho and banzuke rank.">'+
    frame(W,H,s,'sumo-rank-svg','Ranking trajectory for '+points.length+' bashos, with exact ranks on focus or hover').replace('class="sumo-rank-svg"','class="sumo-rank-svg" style="width:'+W+'px"')+'</div>';
}
export function careerGraphs(w,cache,bashoId,prevBasho,prevRank){
  const {weight,ranks,entry,currentListedWeightKg,currentListedWeightSource,
    currentWeightApiDiscrepancy,currentRankDiscrepancy}=careerPoints(w,cache,bashoId,prevBasho,prevRank);
  const highest=ranked=>ranked.length?
    ranked.reduce((best,next)=>ordinalRank(next.rank)<ordinalRank(best.rank)?next:best).rank:null;
  const weightSourceUrl=entry?.weightSource||entry?.sourceUrl||null;
  const sourceLink=typeof weightSourceUrl==='string'&&/^https:\/\//.test(weightSourceUrl)?
    ' <a href="'+esc(weightSourceUrl)+'" target="_blank" rel="noopener noreferrer">Historical source</a>':'';
  const footWeight=entry
    ?'Only explicitly dated measurements are dotted; connectors do not imply weigh-ins in missing tournaments. Historical observations remain subject to independent verification.'+sourceLink
    :'No dated historical weigh-ins are available yet; current listed weight is shown separately.';
  const footRank=entry
    ?'Dated banzuke positions are sourced from the <a href="'+esc(entry.rankSource)+'" target="_blank" rel="noopener noreferrer">Sumo API historical ranks</a>. See the <a href="'+esc(entry.rankCrosscheck)+'" target="_blank" rel="noopener noreferrer">JSA official profile</a> for independent reference; per-basho certification remains underway.'
    :'Only current and previously cached tournament ranks are available; older bashos await collection.';
  const rankReview=currentRankDiscrepancy?
    '<p class="sumo-career-source">Rank review required: cached historical rank '+esc(currentRankDiscrepancy.recordedRank)+
      ' differs from the current profile listing '+esc(currentRankDiscrepancy.rosterRank)+'.</p>':'';
  const milestone=entry?.milestones?.length?'<div class="sumo-career-milestones">'+entry.milestones.map(m=>'<div><small>'+esc(dateLabel(m.basho))+'</small><strong>'+esc(m.title)+'</strong><span>'+esc(m.rank)+'</span></div>').join('')+'</div>':'';
  return '<div class="sumo-career-summary"><span>'+weight.length+' dated weight snapshot'+(weight.length===1?'':'s')+'</span><span>'+ranks.length+' ranked basho'+(ranks.length===1?'':'s')+'</span><span>Highest rank: '+esc(highest(ranks)||'Not yet documented')+'</span>'+ (currentListedWeightKg!==null?'<span>'+esc(currentListedWeightSource==='JSA current published profile'?'JSA currently listed: ':'Currently listed: ')+esc(currentListedWeightKg)+' kg (undated)</span>':'')+
    (currentWeightApiDiscrepancy?'<span class="sumo-career-source">Weight review: JSA '+esc(currentWeightApiDiscrepancy.officialKg)+
      ' kg, Sumo API '+esc(currentWeightApiDiscrepancy.apiKg)+' kg — disagreement pending verification</span>':'')+'</div>'+
    '<div class="sumo-career-panels">'+
    '<section class="sumo-career-panel"><div class="sumo-career-panel-head"><small>BODY MEASUREMENTS · KG</small><h3>Weight history</h3></div><div class="sumo-career-panel-main">'+weightChart(weight)+'</div><p class="sumo-career-source">'+footWeight+'</p></section>'+
    '<section class="sumo-career-panel"><div class="sumo-career-panel-head"><small>BANZUKE · EAST & WEST</small><h3>Career rank movement</h3></div><div class="sumo-career-panel-main">'+banzukeChart(ranks)+
    '<div class="sumo-rank-legend"><span>🟢 Promotion</span><span>🔴 Demotion</span><span>🟡 Unchanged</span><span>Scroll sideways to see all bashos</span></div>'+milestone+'</div>'+rankReview+'<p class="sumo-career-source">'+footRank+'</p></section></div>';
}
