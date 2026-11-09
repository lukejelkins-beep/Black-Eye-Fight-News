/* Publisher-verified external source directory plus article-linked results.
   Do not claim a promotion's full card has been ingested when only its official
   results landing page is available. No fabricated scores or unofficial videos. */
window.BEFNCoverage=(()=>{
 'use strict';
 const sources={
  mma:[
   ['UFC','https://www.ufc.com/results'],
   ['PFL','https://pflmma.com/'],
   ['ONE MMA','https://www.onefc.com/category/mixed-martial-arts/'],
   ['RIZIN','https://jp.rizinff.com/'],
   ['Cage Warriors','https://cagewarriors.com/news/'],
   ['KSW','https://www.kswmma.com/en/news']
  ],
  grappling:[
   ['UFC BJJ','https://www.ufc.com/ufcbjj'],
   ['IBJJF','https://ibjjf.com/'],
   ['ADCC','https://adcombat.com/adcc-news/'],
   ['FloGrappling','https://www.flograppling.com/articles'],
   ['RAF','https://www.realamericanfreestyle.com/events-gallery'],
   ['NCAA Division I','https://www.ncaa.com/sports/wrestling/d1'],
   ['NCAA Division II','https://www.ncaa.com/sports/wrestling/d2'],
   ['International freestyle & Greco-Roman','https://uww.org/'],
   ['ONE submission grappling','https://www.onefc.com/category/submission-grappling/']
  ],
  boxing:[
   ['World Boxing News','https://www.worldboxingnews.net/'],
   ['WBA','https://www.wbaboxing.com/'],
   ['WBC','https://wbcboxing.com/'],
   ['IBF','https://www.ibf-usba-boxing.com/'],
   ['WBO','https://www.wboboxing.com/']
  ]
 };
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const link=url=>{try{const p=new URL(url);return p.protocol==='https:'?esc(p.href):'#'}catch{return '#'}};
 const match=(item,sport)=>sport==='all'||item.sport===sport||(Array.isArray(item.sports)&&item.sports.includes(sport));
 const panel=(sport='all')=>{
  const groups=sport==='all'?['boxing','mma','grappling']:[sport];
  return '<details class="befn-coverage-directory"><summary>Official promotion & governing-body sources</summary>'
   +'<p>Original publisher schedules, results and videos. These are direct external sources; listings only appear in the feed when independently verified.</p>'
   +groups.map(key=>'<div class="befn-coverage-group"><h3>'+esc(key==='mma'?'MMA':key==='grappling'?'Grappling & wrestling':'Boxing')+'</h3><div class="befn-coverage-links">'
    +(sources[key]||[]).map(([name,url])=>'<a href="'+link(url)+'" rel="noopener noreferrer" target="_blank">'+esc(name)+' <span aria-hidden="true">↗</span></a>').join('')
    +'</div></div>').join('')
   +'</details>';
 };
 const reports=(articles=[],sport='all')=>{
  const recent=(Array.isArray(articles)?articles:[]).filter(a=>a&&match(a,sport)&&/^https:\/\//.test(a.url||''))
    .sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,24);
  if(!recent.length)return '';
  return '<section class="befn-verified-results" aria-label="Officially published results reports"><h2>Official result reports</h2><p>Results and match recaps linked to their original publishers. These links supplement the independently verified fight-card results above.</p><div class="befn-result-report-list">'
   +recent.map(a=>{
      const image=a.image&&/^https:\/\//.test(a.image.url||'')?'<span class="befn-report-image"><img loading="lazy" decoding="async" src="'+link(a.image.url)+'" alt="'+esc(a.image.alt||a.title)+'"></span>':'';
      const when=a.publishedAt?new Date(a.publishedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'';
      return '<a class="befn-result-report" href="'+link(a.url)+'" target="_blank" rel="noopener noreferrer">'+image+'<span class="befn-report-text"><small>'+esc(a.source||'Official publisher')+' · '+esc(when)+(sport==='all'?' · '+esc(a.sport||''):'')+'</small><strong>'+esc(a.title)+'</strong></span><span aria-hidden="true">↗</span></a>';
    }).join('')
   +'</div></section>';
 };
 return Object.freeze({panel,reports});
})();