/**
 * BEFN Fight Talk — free, publisher-sourced original post discovery.
 * No paid social API calls, private pages, search-engine circumvention or
 * scraped profile timelines. Only URL links found on trusted public pages.
 * Article time is NEVER treated as the social post's publication time.
 */
export const PUBLISHERS=Object.freeze({
  'www.mmafighting.com':'MMA Fighting',
  'mmafighting.com':'MMA Fighting',
  'mmajunkie.usatoday.com':'MMA Junkie',
  'www.worldboxingnews.com':'World Boxing News',
  'www.worldboxingnews.net':'World Boxing News',
  'www.sherdog.com':'Sherdog',
  'sherdog.com':'Sherdog',
  'www.ufc.com':'UFC',
  'ufc.com':'UFC',
  'jp.rizinff.com':'RIZIN',
  'www.flograppling.com':'FloGrappling',
  'flograppling.com':'FloGrappling',
  'www.onefc.com':'ONE Championship',
  'onefc.com':'ONE Championship',
  'cagewarriors.com':'Cage Warriors',
  'www.cagewarriors.com':'Cage Warriors',
  'www.boxingnewsonline.net':'Boxing News',
  'boxingnewsonline.net':'Boxing News',
  'pflmma.com':'PFL',
  'www.pflmma.com':'PFL',
  'www.ibjjf.com':'IBJJF',
  'ibjjf.com':'IBJJF',
  'www.adcc-official.com':'ADCC',
  'adcc-official.com':'ADCC'
});
export function publisherOf(url){
  try{
    const u=new URL(url);
    if(u.protocol!=='https:' || u.username || u.password || u.port)return '';
    return PUBLISHERS[u.hostname.toLowerCase()]||'';
  }catch{return ''}
}
export const RSS_FEEDS=Object.freeze([
  {url:'https://www.mmafighting.com/rss/current.xml',sport:'mma',publisher:'MMA Fighting'},
  {url:'https://www.boxingnewsonline.net/feed/',sport:'boxing',publisher:'Boxing News'},
  {url:'https://www.worldboxingnews.com/feed/',sport:'boxing',publisher:'World Boxing News'}
]);
export const OFFICIAL_HOME_PAGES=Object.freeze([
  {url:'https://www.ufc.com/',sport:'mma',sourceLabel:'UFC'},
  {url:'https://www.onefc.com/',sport:'mma',sourceLabel:'ONE Championship'},
  {url:'https://jp.rizinff.com/',sport:'mma',sourceLabel:'RIZIN'},
  {url:'https://cagewarriors.com/',sport:'mma',sourceLabel:'Cage Warriors'},
  {url:'https://www.flograppling.com/',sport:'grappling',sourceLabel:'FloGrappling'}
]);
const socialReactions=/(?:insta(?:gram)?|threads|social|tweet|posted|post|react|says|said|call.?out|announc|respond|statement|video|reveal|confirms?|media|shares?|slams?|warns?|fights?|boxer|mma|wrestling)/i;
const unescapeXML=s=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
 .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
 .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)));
const clean=s=>unescapeXML(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
/** RSS item parser: no unknown hosts or pubDate guesses. */
export function parseRSS(xml,feed,now=Date.now()){
 const result=[],text=String(xml||'').slice(0,1_000_000);
 const blocks=text.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
 for(const item of blocks.slice(0,65)){
  const link=clean(item.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1]||'');
  const title=clean(item.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]||'');
  const rawDate=clean(item.match(/<(?:pubDate|dc:date|published)>([\s\S]*?)<\/(?:pubDate|dc:date|published)>/i)?.[1]||'');
  const ts=Date.parse(rawDate);
  if(!publisherOf(link)||!Number.isFinite(ts)||ts<now-7*86400000||ts>now+1800000)continue;
  result.push({url:link,source:publisherOf(link),sport:feed.sport,publishedAt:new Date(ts).toISOString(),title,origin:'publisher-rss'});
 }
 return result;
}
/** Balanced 110 page/hour maximum, with emphasis on first-person original posts. */
export function discoveryCandidates(newsArticles,rssArticles,checkedAt,limit=110){
 const now=Date.parse(checkedAt),seen=new Set();
 const candidates=[...OFFICIAL_HOME_PAGES.map(x=>({
  ...x,publishedAt:checkedAt,origin:'official-homepage'
 })),...rssArticles,...newsArticles];
 const result=[];
 for(const a of candidates){
  if(!a||!['boxing','mma','grappling'].includes(a.sport)||!publisherOf(a.url))continue;
  const timestamp=Date.parse(a.publishedAt||'');
  if(!Number.isFinite(timestamp)||timestamp<now-7*86400000||timestamp>now+1800000)continue;
  let url;
  try{const u=new URL(a.url);u.hash='';u.search='';url=u.href}catch{continue}
  if(seen.has(url))continue;
  seen.add(url);
  result.push({...a,url,sourceLabel:publisherOf(url),
    priority:socialReactions.test(a.title||'')?2:0});
 }
 // Reserve a slot for each official homepage, then balance boxing/MMA/grappling,
 // without pretending older article links are current social posts.
 const official=result.filter(a=>a.origin==='official-homepage');
 const articles=result.filter(a=>a.origin!=='official-homepage')
  .sort((a,b)=>b.priority-a.priority||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const buckets={boxing:[],mma:[],grappling:[]};
 for(const a of articles)buckets[a.sport].push(a);
 const picked=[...official],max=Math.max(official.length,limit);
 while(picked.length<max&&Object.values(buckets).some(x=>x.length)){
  for(const sport of ['boxing','mma','grappling','mma','boxing']){
   const a=buckets[sport].shift();
   if(a)picked.push(a);
   if(picked.length>=max)break;
  }
 }
 return picked;
}
export function linkPriority({role,fighterTier,platform}={}){
 const base=({fighter:60,promoter:55,trainer:48,team:45,fan:35,commentator:20,media:10})[role]||10;
 return base+({champion:12,contender:9,prospect:8})[fighterTier]+(platform==='Threads'?2:0)||base;
}
/**
 * Hard spending policy: X API reads are DISABLED in automated collectors.
 * A provider-side hard spending cap is not available to the GitHub runner, so
 * request budgeting alone cannot guarantee ≤US$2. X posts arrive through
 * free publisher links + official tokenless X oEmbed, not paid timelines.
 */
export const X_API_SPENDING=Object.freeze({monthlyUsdCap:2,automaticPaidRequestsAllowed:0,estimatedMonthlySpendUsd:0});
