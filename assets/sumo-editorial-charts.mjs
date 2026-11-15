/* Editorial Profile + Results Desk: presentation only. Original API cache is never mutated. */
import { careerPoints, ordinalRank, parseBanzukeRank } from './sumo-career.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const labels=['Yokozuna','Ozeki','Sekiwake','Komusubi','Maegashira','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi'];
const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const validMonth=v=>/^\d{4}(0[1-9]|1[0-2])$/.test(String(v??''));
const monthNumber=v=>validMonth(v)?Number(String(v).slice(0,4))*12+Number(String(v).slice(4,6))-1:null;
const monthLabel=v=>validMonth(v)?monthNames[Number(String(v).slice(4,6))-1]+' '+String(v).slice(0,4):'Date unavailable';
const missing=v=>v===null||v===undefined||v===''?'Not available':String(v);
const svg=(body,width,height,klass,label)=>'<svg class="'+klass+'" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="'+esc(label)+'">'+body+'</svg>';
/** A real calendar axis, not a point-index axis. Null means no recorded measurement period. */
export function weightTimePositions(points,start,end){
  const observations=points.filter(p=>monthNumber(p.basho)!==null);
  const months=observations.map(p=>monthNumber(p.basho));
  const first=monthNumber(start)??(months.length?Math.min(...months):null);
  const last=monthNumber(end)??(months.length?Math.max(...months):null);
  const lo=first===null?null:Math.min(first,...months);
  const hi=last===null?null:Math.max(last,...months);
  return observations.map(p=>({point:p,ratio:lo===null||hi===lo?0.5:(monthNumber(p.basho)-lo)/(hi-lo)}));
}
export function datedWeightObservations(entry){
  if(!Array.isArray(entry?.weight))return [];
  // Never replace a second, differently sourced observation for the same period.
  return entry.weight.filter(p=>validMonth(p?.basho)&&Number.isFinite(p?.kg)&&p.kg>0)
    .slice().sort((a,b)=>String(a.basho).localeCompare(String(b.basho)));
}
function sourceCell(value){
  return typeof value==='string'&&/^https:\/\//.test(value)
    ?'<a href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">Source record</a>'
    :esc(missing(value));
}
export function editorialWeightChart(points,{start=null,end=null,source=null,review=null}={}){
  if(!points.length)return '<p class="sumo-career-empty">No dated weight observations are available. An undated current listing is not a dated measurement.</p>';
  const W=900,H=280,L=64,R=26,T=26,B=46;
  const plotted=weightTimePositions(points,start,end);
  const values=plotted.map(x=>x.point.kg);
  const low=Math.floor((Math.min(...values)-8)/10)*10,high=Math.ceil((Math.max(...values)+8)/10)*10;
  const x=p=>L+p.ratio*(W-L-R),y=kg=>T+(high-kg)/(high-low||1)*(H-T-B);
  let body='';
  for(let i=0;i<=4;i++){
    const n=low+(high-low)*i/4,py=y(n);
    body+='<line class="sumo-chart-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+py+'" y2="'+py+'"/>'+
      '<text class="sumo-chart-axis" x="'+(L-8)+'" y="'+(py+4)+'" text-anchor="end">'+Number(n.toFixed(1))+'</text>';
  }
  body+='<text class="sumo-chart-axis" x="16" y="16">kg</text>';
  const maxMonths=monthNumber(end)??monthNumber(plotted[plotted.length-1].point.basho);
  const minMonths=monthNumber(start)??monthNumber(plotted[0].point.basho);
  if(minMonths!==null&&maxMonths!==null&&minMonths<maxMonths){
    const minYear=Math.ceil(minMonths/12),maxYear=Math.floor(maxMonths/12),step=Math.max(1,Math.ceil((maxYear-minYear)/7));
    for(let yr=minYear;yr<=maxYear;yr+=step){
      const xx=L+(yr*12-minMonths)/(maxMonths-minMonths)*(W-L-R);
      if(xx>=L&&xx<=W-R)body+='<text class="sumo-chart-axis" x="'+xx+'" y="'+(H-10)+'" text-anchor="middle">'+yr+'</text>';
    }
  }
  for(let i=1;i<plotted.length;i++){
    const a=plotted[i-1],b=plotted[i],gap=monthNumber(b.point.basho)-monthNumber(a.point.basho);
    // A conspicuous gap is intentionally left unconnected, not interpolated.
    if(gap<=18)body+='<line class="sumo-weight-connector" x1="'+x(a)+'" y1="'+y(a.point.kg)+'" x2="'+x(b)+'" y2="'+y(b.point.kg)+'"/>';
  }
  body+=plotted.map((v,i)=>{
    const p=v.point,desc=monthLabel(p.basho)+' · '+p.kg+' kg · '+missing(p.source||source)+
      ' · month precision'+(p.reviewState?' · '+p.reviewState:'');
    const xx=x(v),yy=y(p.kg);
    return '<circle class="sumo-weight-point" data-weight-month="'+esc(p.basho)+'" data-weight-x="'+xx.toFixed(2)+
      '" cx="'+xx+'" cy="'+yy+'" r="5.5" tabindex="0" role="img" aria-label="'+esc(desc)+'"><title>'+esc(desc)+'</title></circle>'+
      ((i===0||i===plotted.length-1)?'<text class="sumo-chart-number" x="'+xx+'" y="'+(yy-13)+'" text-anchor="middle">'+esc(p.kg)+' kg</text>':'');
  }).join('');
  const table='<details class="sumo-data-table"><summary>All '+plotted.length+' dated weight observations and sources</summary>'+
    '<div class="table-scroll"><table><thead><tr><th scope="col">Recorded period</th><th scope="col">Weight</th><th scope="col">Source</th><th scope="col">Date precision</th><th scope="col">Review state</th></tr></thead><tbody>'+
    plotted.map(({point:p})=>'<tr><td>'+esc(monthLabel(p.basho))+'</td><td>'+esc(p.kg)+' kg</td><td>'+sourceCell(p.source||source)+'</td><td>'+esc(p.datePrecision||'Month only')+'</td><td>'+esc(p.reviewState||review||'Not stated')+'</td></tr>').join('')+
    '</tbody></table></div></details>';
  return '<p class="sumo-chart-scroll-hint">On smaller screens, swipe the chart or focus it and use arrow keys. Every observation is also in the table below.</p>'+
    '<div class="sumo-weight-scroll" tabindex="0" role="region" aria-label="Scrollable weight history chart">'+svg(body,W,H,'sumo-weight-svg','Dated weight observations on actual elapsed calendar time, in kilograms')+'</div>'+
    '<p class="sumo-chart-note">Each dot is a dated observation. Dashed connectors only guide between observations within 18 months; long gaps remain unconnected. No intervening measurements are implied.</p>'+table;
}
export function rankRangePoints(points,range='career'){
  if(range==='career'||!points.length)return points.slice();
  const last=monthNumber(points[points.length-1].basho),years=range==='2y'?2:range==='5y'?5:null;
  return years===null||last===null?points.slice():points.filter(p=>(monthNumber(p.basho)??-Infinity)>=last-years*12);
}
function rankSvg(points,{fullLadder=false,overview=false}={}){
  const W=900,H=overview?88:290,L=overview?12:106,R=24,T=overview?10:22,B=overview?12:42;
  if(!points.length)return '';
  const ord=points.map(p=>ordinalRank(p.rank)).filter(v=>v!==null);
  if(!ord.length)return '';
  const tiers=points.map(p=>parseBanzukeRank(p.rank)?.tier).filter(v=>v!==undefined);
  const min=fullLadder?0:Math.max(0,Math.min(...tiers)-0.4);
  const max=fullLadder?10:Math.min(10,Math.max(...tiers)+1.3);
  const y=rank=>T+(ordinalRank(rank)-min)/(max-min)*(H-T-B);
  const months=points.map(p=>monthNumber(p.basho));
  const lo=Math.min(...months.filter(x=>x!==null)),hi=Math.max(...months.filter(x=>x!==null));
  const x=i=>L+(hi===lo?0.5:(months[i]-lo)/(hi-lo))*(W-L-R);
  let body='';
  if(!overview)for(let tier=Math.ceil(min);tier<max;tier++){
    const py=T+(tier-min)/(max-min)*(H-T-B);
    body+='<line class="sumo-chart-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+py+'" y2="'+py+'"/>'+
      '<text class="sumo-chart-ranklabel" text-anchor="end" x="'+(L-9)+'" y="'+(py+4)+'">'+esc(labels[tier])+'</text>';
  }
  for(let i=1;i<points.length;i++){
    // Step only across consecutive numbered bashos. Missing periods break the path.
    if(months[i]!==null&&months[i-1]!==null&&months[i]-months[i-1]===2){
      const a=points[i-1],b=points[i];
      body+='<path class="sumo-rank-connector" d="M '+x(i-1)+' '+y(a.rank)+' H '+x(i)+' V '+y(b.rank)+'"/>';
    }
  }
  body+=points.map((p,i)=>{
    const now=ordinalRank(p.rank),prev=i?ordinalRank(points[i-1].rank):null;
    const move=prev===null?'First recorded':now<prev?'Up in banzuke positions':now>prev?'Down in banzuke positions':'Same banzuke position';
    const desc=monthLabel(p.basho)+' · '+p.rank+' · '+move;
    return '<circle class="sumo-rank-point" cx="'+x(i)+'" cy="'+y(p.rank)+'" r="'+(overview?2.5:4.2)+'" '+
      (overview?'':'tabindex="0" role="img" aria-label="'+esc(desc)+'"')+'><title>'+esc(desc)+'</title></circle>'+
      (!overview&&(i===0||i===points.length-1)?'<text class="sumo-chart-axis" x="'+x(i)+'" y="'+(H-10)+'" text-anchor="'+(i===0?'start':'end')+'">'+esc(monthLabel(p.basho))+'</text>':'');
  }).join('');
  return svg(body,W,H,overview?'sumo-rank-overview':'sumo-rank-svg',overview?'Whole-career rank overview, first to latest recorded basho':'Selected-period ordinal banzuke history; higher on chart means higher rank');
}
export function editorialRankChart(points,{range='career',fullLadder=false}={}){
  if(!points.length)return '<p class="sumo-career-empty">No recorded banzuke rankings are available.</p>';
  const selected=rankRangePoints(points,range);
  const options=[['2y','Last 2 years'],['5y','Last 5 years'],['career','Career']];
  const latest=points[points.length-1];
  const count=points.length,highest=points.reduce((best,p)=>ordinalRank(p.rank)<ordinalRank(best.rank)?p:best);
  const table='<details class="sumo-data-table"><summary>All '+count+' recorded rank observations</summary>'+
    '<div class="table-scroll"><table><thead><tr><th scope="col">Basho</th><th scope="col">Recorded rank</th><th scope="col">Previous recorded rank</th><th scope="col">Position movement</th></tr></thead><tbody>'+
    points.map((p,i)=>{
      const prev=i?points[i-1]:null,a=ordinalRank(p.rank),b=prev?ordinalRank(prev.rank):null;
      const movement=b===null?'Not available':a<b?'Up':a>b?'Down':'Unchanged';
      return '<tr><td>'+esc(monthLabel(p.basho))+'</td><td>'+esc(p.rank)+'</td><td>'+esc(prev?.rank||'Not available')+'</td><td>'+movement+(prev?' · from '+esc(monthLabel(prev.basho)):'')+'</td></tr>';
    }).join('')+'</tbody></table></div></details>';
  return '<div class="sumo-career-overview"><span>Whole career · '+count+' observed ranks · latest '+esc(monthLabel(latest.basho))+'</span>'+rankSvg(points,{fullLadder,overview:true})+'</div>'+
    '<div class="sumo-chart-controls" role="group" aria-label="Rank history period">'+
    options.map(([id,label])=>'<button type="button" data-rank-range="'+id+'" aria-pressed="'+(range===id)+'">'+label+'</button>').join('')+
    '<button type="button" data-rank-ladder aria-pressed="'+fullLadder+'">'+(fullLadder?'Visited divisions':'Full rank ladder')+'</button></div>'+
    '<p class="sumo-chart-note">Ordinal banzuke positions (East and West distinguished); higher means a higher rank. '+selected.length+' observations in selected period. '+(fullLadder?'Full ladder':'Vertical axis adapted to visited divisions')+'.</p>'+
    '<p class="sumo-chart-scroll-hint">On smaller screens, swipe the chart or focus it and use arrow keys. Every observation is also in the table below.</p>'+
    '<div class="sumo-rank-scroll" tabindex="0" role="region" aria-label="Scrollable rank history chart">'+rankSvg(selected,{fullLadder})+'</div>'+
    '<p class="sumo-chart-note">Step connectors join only consecutive recorded bashos. Missing rank entries stay unconnected; position movement is not necessarily a formal title promotion or demotion. Highest sourced observation: '+esc(highest.rank)+'.</p>'+table;
}
export function careerGraphs(w,cache,bashoId,prevBasho,prevRank,options={}){
  const data=careerPoints(w,cache,bashoId,prevBasho,prevRank);
  const {ranks,entry,currentListedWeightKg,currentListedWeightSource,currentRankDiscrepancy,currentWeightApiDiscrepancy}=data;
  const weight=datedWeightObservations(entry);
  const start=w?.debutBasho||null;
  const source=entry?.weightSource||entry?.sourceUrl||null;
  const summary='<div class="sumo-career-summary"><span>'+ranks.length+' rank observations</span><span>'+weight.length+' dated weight observations</span>'+
    (currentListedWeightKg===null?'':'<span>Currently listed: '+esc(currentListedWeightKg)+' kg · undated · '+esc(currentListedWeightSource)+'</span>')+'</div>';
  const rankReview=currentRankDiscrepancy?'<p class="sumo-career-source">Rank review: cached historical rank '+esc(currentRankDiscrepancy.recordedRank)+' and current listing '+esc(currentRankDiscrepancy.rosterRank)+' differ. Review remains open.</p>':'';
  const weightReview=currentWeightApiDiscrepancy?'<p class="sumo-career-source">Current weight source/date review: JSA '+esc(currentWeightApiDiscrepancy.officialKg)+' kg and API '+esc(currentWeightApiDiscrepancy.apiKg)+' kg. Source precision and recording dates require reconciliation.</p>':'';
  return summary+'<div class="sumo-career-panels">'+
    '<section class="sumo-career-panel"><div class="sumo-career-panel-head"><small>BANZUKE · EAST / WEST</small><h3>Rank history</h3></div><div class="sumo-career-panel-main">'+editorialRankChart(ranks,{range:options.rankRange||'career',fullLadder:options.fullLadder===true})+
    '</div>'+rankReview+'<p class="sumo-career-source">Ranks are source observations, not independently certified tournament results. The source keeps rank periods separate from API-statistics basho counts. '+sourceCell(entry?.rankSource)+'</p></section>'+
    '<section class="sumo-career-panel"><div class="sumo-career-panel-head"><small>MEASURED OBSERVATIONS · KG</small><h3>Weight history</h3></div><div class="sumo-career-panel-main">'+editorialWeightChart(weight,{start,end:bashoId,source})+
    '</div>'+weightReview+'<p class="sumo-career-source">The current listed weight has no measurement date and is excluded from the dated chart. Dated observations have month-level precision; independent weighing-date corroboration is not implied. '+sourceCell(source)+'</p></section></div>';
}
