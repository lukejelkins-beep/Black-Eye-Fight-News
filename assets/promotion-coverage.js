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
   ['KSW','https://www.kswmma.com/en/news'],
   ['UFC fight videos','https://www.ufc.com/watch/library'],
   ['PFL videos','https://www.youtube.com/channel/UCPrONRG9hO1f-OrxW-WH-xg'],
   ['ONE Championship videos','https://www.onefc.com/videos/'],
   ['RIZIN official videos','https://www.youtube.com/channel/UCZZ0UGjWsRdM8_5bsqtxYaQ'],
   ['Cage Warriors fight highlights','https://cagewarriors.com/videos/'],
   ['KSW fight videos','https://www.kswmma.com/en/youtube']
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
   ['ONE submission grappling','https://www.onefc.com/category/submission-grappling/'],
   ['UFC Fight Pass BJJ video library','https://www.ufc.com/fightpass'],
   ['FloGrappling competition videos','https://www.flograppling.com/watch']
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
 const eventKey=a=>{
  const title=String(a.title||'').toLowerCase().replace(/[–—]/g,'-').replace(/\\s+/g,' ');
  const matchup=title.match(/([a-z][a-z' -]{2,35})\\s+(?:vs\\.?|v\\.)\\s+([a-z][a-z' -]{2,35})/i);
  if(matchup){
   const clean=x=>x.replace(/^(?:results?|scorecards?|prelim|main card|fight night|ufc vegas|ufc fight night|\\d+|:|\\||-)\\s*/gi,'').replace(/\\s*(?:results?|scorecards?|highlights?|recap).*$/gi,'').trim().split(/\\s+/).slice(-2).join(' ');
   const pair=[clean(matchup[1]),clean(matchup[2])].sort().join('-');
   if(pair.length>5)return 'match:'+pair;
  }
  const event=title.match(/(?:ufc (?:vegas|fight night)\\s*[:#-]?\\s*\\d+|ufc\\s*\\d+|pfl\\s*\\d+|one\\s*\\d+|rizin\\s*\\d+|ksw\\s*\\d+|cage warriors\\s*\\d+)/);
  if(event)return 'event:'+event[0];
  return 'title:'+title.replace(/\\b(?:official|full|results?|scorecards?|prelims?|main card|recap|highlights?)\\b/g,'').replace(/[^a-z0-9]/g,'').slice(0,90);
 };
 const reports=(articles=[],sport='all')=>{
  const recent=(Array.isArray(articles)?articles:[]).filter(a=>a&&match(a,sport)&&/^https:\\/\\//.test(a.url||''))
    .sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0));
  if(!recent.length)return '';
  const groups=new Map();
  for(const a of recent){
   const key=eventKey(a);
   const date=Date.parse(a.publishedAt||0);
   const existing=groups.get(key);
   if(existing&&Math.abs(date-Date.parse(existing[0].publishedAt||0))<8*86400000){existing.push(a)}
   else groups.set(existing?key+':'+(a.publishedAt||'unknown'):key,[a]);
  }
  const ranked=[...groups.values()].map(items=>{
   items.sort((a,b)=>{
    const score=x=>(/^(ufc|pfl|one championship|rizin|cage warriors|ksw)$/i.test(x.source||'')?10:0)+(/\\b(main card results|full results|official results|event results)\\b/i.test(x.title||'')?4:0)-(/\\b(prelim|scorecard)\\b/i.test(x.title||'')?2:0);
    return score(b)-score(a)||Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0);
   });
   return items;
  }).sort((a,b)=>Date.parse(b[0].publishedAt||0)-Date.parse(a[0].publishedAt||0)).slice(0,24);
  return '<section class="befn-verified-results" aria-label="Officially published results reports"><h2>Official result reports</h2><div class="befn-result-report-list">'
   +ranked.map(items=>{
      const a=items[0],image=a.image&&/^https:\\/\\//.test(a.image.url||'')?'<span class="befn-report-image"><img loading="lazy" decoding="async" src="'+link(a.image.url)+'" alt="'+esc(a.image.alt||a.title)+'"></span>':'';
      const when=a.publishedAt?new Date(a.publishedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'';
      const primary='<a class="befn-result-report" href="'+link(a.url)+'" target="_blank" rel="noopener noreferrer">'+image+'<span class="befn-report-text"><small>'+esc(a.source||'Official publisher')+' · '+esc(when)+'</small><strong>'+esc(a.title)+'</strong></span><span aria-hidden="true">↗</span></a>';
      const more=items.length>1?'<details class="befn-report-more" style="padding:6px 16px 12px"><summary>More coverage ('+(items.length-1)+')</summary><ul>'+items.slice(1).map(x=>'<li><a href="'+link(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.source||'Publisher')+': '+esc(x.title)+'</a></li>').join('')+'</ul></details>':'';
      return '<div class="befn-report-event">'+primary+more+'</div>';
   }).join('')+'</div></section>';
 };
 return Object.freeze({panel,reports});
})();