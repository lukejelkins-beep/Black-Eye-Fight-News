/**
 * Discover only original Instagram/Threads/X post permalinks explicitly linked by
 * combat-news publishers; verify public embeddability through Meta oEmbed.
 *
 * Meta oEmbed supplies a VIEW of an original post, not a crawler of user feeds.
 * We never treat the date of a news article as the post's publication time,
 * infer a fighter identity from a news story, copy publisher photos, or save
 * oEmbed HTML (which is presentation-only content).
 */
import fs from 'node:fs';
import {publisherOf,RSS_FEEDS,parseRSS,discoveryCandidates,linkPriority,X_API_SPENDING} from './fight-talk-public-sources.mjs';
export const nowISO=()=>new Date().toISOString();
const xWatchlist=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8')).platforms?.X?.accounts||[];
const trackedX=new Map(xWatchlist.filter(x=>x.username).map(x=>[x.username.replace(/^@/,'').toLowerCase(),x]));
const igWatchlist=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8')).platforms?.Instagram?.accounts||[];
const trackedIG=new Map(igWatchlist.filter(x=>x.username).map(x=>[x.username.replace(/^@/,'').toLowerCase(),x]));
const threadsConfig=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8')).threads||{};
const trackedThreads=new Map((threadsConfig.accounts||[]).filter(x=>x.username).map(x=>[x.username.replace(/^@/,'').toLowerCase(),x]));
function xDate(url){
 const id=String(url||'').match(/\/status\/(\d{10,25})\/?$/)?.[1];
 if(!id)return null;
 const ms=Number((BigInt(id)>>22n)+1288834974657n);
 const now=Date.now();
 return Number.isFinite(ms)&&ms>1288834974657&&ms<=now+1800000?new Date(ms).toISOString():null;
}
export function normalizePostLink(raw) {
 try {
  const u=new URL(String(raw||'').replace(/&amp;/g,'&').replace(/[)\],.;]+$/,''));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const host=u.hostname.replace(/^www\./,'').toLowerCase();
  if(host==='instagram.com'){
   const match=u.pathname.match(/^(?:\/[\w.]+)?\/(p|reel)\/([\w-]{6,})\/?$/);
   if(!match)return null;
   return {platform:'Instagram',url:'https://www.instagram.com/'+match[1]+'/'+match[2]+'/'};
  }
  if(host==='threads.com'||host==='threads.net'){
   const match=u.pathname.match(/^\/(@[\w.]+\/post|t)\/([\w-]{6,})\/?$/);
   if(!match)return null;
   return {platform:'Threads',url:'https://www.threads.com/'+match[1]+'/'+match[2]+'/',
     ...(match[1].startsWith('@')?{username:match[1].slice(1).replace(/\/post$/,'')}:{} )};
  }
  if(host==='x.com'||host==='twitter.com'){
   const match=u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{10,25})\/?$/);
   if(!match)return null;
   return {platform:'X',username:match[1],url:'https://x.com/'+match[1]+'/status/'+match[2]};
  }
  return null;
 }catch{return null}
}
export function extractPostLinks(html){
 const content=String(html||'')
  .replace(/\\u002[fF]/g,'/')
  .replace(/\\\//g,'/')
  .replace(/&#(?:x2f|47);/gi,'/')
  .replace(/&amp;/g,'&');
 const matches=content.match(/https?:\/\/(?:www\.)?(?:instagram\.com|threads\.(?:com|net)|x\.com|twitter\.com)\/[^\s"'<>\\]+/gi)||[];
 const results=new Map();
 for(const match of matches.slice(0,500)){
  const item=normalizePostLink(match);
  if(item)results.set(item.url,item);
 }
 return [...results.values()].slice(0,45);
}
export function publisherOf(url){
 try{const u=new URL(url);return u.protocol==='https:'?acceptedPublishers.get(u.hostname)||'':''}
 catch{return ''}
}
export function validMetaEmbed(data,platform){
 return !!data&&data.type==='rich'&&typeof data.html==='string'&&
 data.html.length>40&&String(data.provider_name||'').toLowerCase().includes(platform.toLowerCase());
}
async function getText(url,timeout=10000,limit=1_800_000){
 const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{
  'User-Agent':'Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)',
  Accept:'text/html'
 }});
 if(!r.ok)throw Error('HTTP '+r.status);
 if(!publisherOf(r.url))throw Error('Unexpected publisher redirect');
 const type=r.headers.get('content-type')||'';
 if(!type.includes('html'))throw Error('Not HTML');
 return (await r.text()).slice(0,limit);
}
async function metaVerify(item){
 if(item.platform==='X'){
  // X offers an official, public view of individual posts even without a
  // timeline-read API token. Verify that the embed's author matches the pinned
  // account rather than inferring identity from a news article.
  const r=await fetch('https://publish.twitter.com/oembed?'+new URLSearchParams({url:item.url,omit_script:'true',dnt:'true'}),{signal:AbortSignal.timeout(9500)});
  if(!r.ok)throw Error('X oEmbed HTTP '+r.status);
  const p=await r.json();
  let author='';
  try{author=new URL(p.author_url).pathname.replace(/^\//,'').replace(/\/$/,'').toLowerCase()}catch{}
  return p.type==='rich'&&typeof p.html==='string'&&p.html.includes('twitter-tweet')&&author===item.username.toLowerCase();
 }
 const base=item.platform==='Instagram'?'https://graph.facebook.com/v26.0/instagram_oembed':'https://graph.threads.com/oembed';
 const r=await fetch(base+'?url='+encodeURIComponent(item.url),{signal:AbortSignal.timeout(9500)});
 if(!r.ok)throw Error('oEmbed HTTP '+r.status);
 const data=await r.json();
 if(!validMetaEmbed(data,item.platform))return false;
 let originalAuthor='';
 try{originalAuthor=new URL(data.author_url).pathname.split('/').filter(Boolean)[0]?.replace(/^@/,'').toLowerCase()||''}catch{}
 // Instagram author_name can be a display name; never substitute it for a
 // confirmed account username. The author_url must be a platform profile.
 if(item.platform==='Instagram'&&originalAuthor&&trackedIG.has(originalAuthor)){
   const profile=new URL(data.author_url);
   if(profile.hostname.replace(/^www\./,'')==='instagram.com')item.authorUsername=originalAuthor;
 }
 if(item.platform==='Threads'&&originalAuthor&&trackedThreads.has(originalAuthor)){
   const profile=new URL(data.author_url);
   if(['threads.com','threads.net'].includes(profile.hostname.replace(/^www\./,'')) &&
      (!item.username||item.username.toLowerCase()===originalAuthor))item.authorUsername=originalAuthor;
 }
 return true;
}
/**
 * Publisher homepages often keep promoting the same original post for weeks.
 * Keep the FIRST discovery date and suppress a post once it ages beyond the
 * 28-day highlights window, even if the homepage still links to it.
 */
export function originalStillRelevant(url, firstSeen, checkedAt, windowDays=28){
 const seen=Date.parse(firstSeen.get(url)||'');
 const now=Date.parse(checkedAt);
 return !Number.isFinite(seen)||(seen>=now-windowDays*86400000&&seen<=now+1800000);
}
export function mergeSourceLinks(articles, links, prior, checkedAt){
 const recentDays=28*24*60*60*1000;
 const existing=new Map((prior.posts||[]).filter(p=>p.nativeEmbed&&p.evidenceUrl&&Date.parse(p.sourceLinkedAt||'')>=Date.parse(checkedAt)-recentDays).map(p=>{
  if(p.platform==='X'&&xDate(p.url))return [p.url,{...p,postedAt:xDate(p.url),originalDateUnverified:false}];
  return [p.url,p];
 }));
 for(const {article,item} of links){
  const name=publisherOf(article.url);
  if(!name)continue;
  const pinned=item.platform==='X'?trackedX.get(item.username?.toLowerCase()):
   item.platform==='Instagram'&&item.authorUsername?trackedIG.get(item.authorUsername):
   item.platform==='Threads'&&item.authorUsername?trackedThreads.get(item.authorUsername):null;
  if(item.platform==='X'&&!pinned)continue;
  const when=Date.parse(article.publishedAt||'');
  if(!Number.isFinite(when)||when>Date.parse(checkedAt)+30*60*1000||when<Date.parse(checkedAt)-recentDays)continue;
  const old=existing.get(item.url);
  // Rediscovery is not a new social-media post. Do not reset its age or author.
  if(old)continue;
  existing.set(item.url,{
   type:'post',platform:item.platform,sport:article.sport,
   // Only the native Meta embed identifies the original author.
   name:pinned?.name||'Original '+item.platform+' post',role:pinned?.role||'media',
   ...(pinned?{handle:'@'+pinned.username,fighterTier:pinned.fighterTier,sport:pinned.sport}:{}),
   nativeEmbed:true,originalDateUnverified:item.platform!=='X',
   ...(item.platform==='X'&&xDate(item.url)?{postedAt:xDate(item.url)}:{}),
   sourceLinkedAt:article.publishedAt,
   discoveredAt:old?.discoveredAt||checkedAt,
   sourcePublisher:name,evidenceUrl:article.url,
   summary:'Original social post linked in '+name+' coverage. Its author, caption and publication date appear in the official embed.',
   source:item.embedVerified?'Publisher permalink + official embed verification':'Trusted publisher permalink (embed unconfirmed)',
   verification:item.embedVerified?'official-oembed':'trusted-publisher-link',
   embedVerified:item.embedVerified===true,
   linkPriority:linkPriority({role:pinned?.role,fighterTier:pinned?.fighterTier,platform:item.platform}),
   url:item.url,
  });
 }
 return [...existing.values()].sort((a,b)=>{
  const aDay=Math.floor(Date.parse(a.sourceLinkedAt||a.discoveredAt)/86400000);
  const bDay=Math.floor(Date.parse(b.sourceLinkedAt||b.discoveredAt)/86400000);
  return bDay-aDay||(b.linkPriority||0)-(a.linkPriority||0)||
   Date.parse(b.sourceLinkedAt)-Date.parse(a.sourceLinkedAt);
 }).slice(0,120);
}
async function main(){
 const file='data/fight-talk-embedded.json',checkedAt=nowISO();
 const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{posts:[]};
 const news=JSON.parse(fs.readFileSync('data/news-live.json','utf8'));
 const curated=JSON.parse(fs.readFileSync('data/fight-talk-selected.json','utf8')).posts||[];
 const curatedCandidates=curated.filter(p=>['Instagram','Threads','X'].includes(p.platform)&&
  ['boxing','mma','grappling'].includes(p.sport)&&Date.parse(p.postedAt||'')>=Date.now()-28*24*60*60*1000)
  .map(p=>({article:{url:p.url,sport:p.sport,publishedAt:p.postedAt,sourceLabel:'Fight Talk curated original link'},
            item:normalizePostLink(p.url)}))
  .filter(x=>x.item&&x.item.platform===curated.find(p=>p.url===x.article.url)?.platform);
 // The site's editorial news index plus three publisher-controlled RSS feeds
 // and selected official organisation homepages; no scraped social timelines.
 let rssFailed=0;
 const rssArticles=(await Promise.all(RSS_FEEDS.map(async feed=>{
  try{
   const response=await fetch(feed.url,{
    signal:AbortSignal.timeout(8500),
    headers:{Accept:'application/rss+xml,application/xml,text/xml;q=0.9','User-Agent':'BlackEyeFightNews/1.0 editorial link index'}
   });
   if(!response.ok||!publisherOf(response.url))throw Error('Publisher feed unavailable');
   const text=(await response.text()).slice(0,1_000_000);
   return parseRSS(text,feed,Date.parse(checkedAt));
  }catch{rssFailed++;return []}
 }))).flat();
 const candidates=discoveryCandidates(news.articles||[],rssArticles,checkedAt,100);
 // Persistent original-URL discovery history prevents old homepage links from
 // being recycled into the "Live" feed whenever another scan succeeds.
 const firstSeen=new Map((old.seenOriginals||[])
  .filter(x=>typeof x?.url==='string'&&Number.isFinite(Date.parse(x.firstSeen||'')))
  .map(x=>[x.url,x.firstSeen]));
 for(const p of old.posts||[]){
  if(p.nativeEmbed&&p.url&&!firstSeen.has(p.url)){
   firstSeen.set(p.url,p.discoveredAt||p.sourceLinkedAt||checkedAt);
  }
 }
 const prior=new Map((old.posts||[]).map(p=>[p.url,p]));
 let articleCount=0,linkCount=0,verified=0,rejected=0,sourceVerified=0;
 const combined=[];
 let curatedVerified=0,curatedRejected=0,curatedPublisherLinked=0;
 for(const candidate of curatedCandidates){
  if(!originalStillRelevant(candidate.item.url,firstSeen,checkedAt))continue;
  if(prior.has(candidate.item.url)){combined.push(candidate);continue;}
  // The curated file explicitly contains an original public-post permalink.
  // It can be shown with a source link even if tokenless oEmbed is blocked.
  try{candidate.item.embedVerified=await metaVerify(candidate.item)}catch{candidate.item.embedVerified=false}
  combined.push(candidate);
  if(candidate.item.embedVerified)curatedVerified++;else curatedPublisherLinked++;
 }
 let index=0;
 async function worker(){
  while(index<candidates.length){
   const article=candidates[index++];
   try{
    const links=extractPostLinks(await getText(article.url)).filter(item=>item.platform!=='X'||trackedX.has(item.username?.toLowerCase()));
    articleCount++;
    linkCount+=links.length;
    for(const item of links){
     if(!originalStillRelevant(item.url,firstSeen,checkedAt))continue;
     if(prior.has(item.url)){combined.push({article,item});continue}
     // An original permalink observed in a trusted publisher's actual HTML
     // is source-verified, but not necessarily widget-verified. Meta's tokenless
     // oEmbed can fail from rate limits or blocked fetches. Preserve the real
     // original link and let the official widget render with a direct-link fallback.
     try{item.embedVerified=await metaVerify(item)}catch{item.embedVerified=false}
     combined.push({article,item});
     if(item.embedVerified)verified++;else sourceVerified++;
    }
   }catch{}
  }
 }
 await Promise.all(Array.from({length:4},()=>worker()));
 const posts=mergeSourceLinks(candidates,combined,old,checkedAt);
 for(const p of posts){
  if(!firstSeen.has(p.url))firstSeen.set(p.url,p.discoveredAt||checkedAt);
 }
 fs.writeFileSync(file,JSON.stringify({
  attemptedAt:checkedAt,
  checkedAt,
  windowDays:28,
  articlesChecked:articleCount,
  publisherFeedsChecked:RSS_FEEDS.length,
  publisherFeedsFailed:rssFailed,
  rssArticleCandidates:rssArticles.length,
  publisherSourcesConfigured:candidates.length,
  linksFound:linkCount,
  newEmbedsVerified:verified,
  newPublisherLinksDiscovered:sourceVerified,
  paidXApiCalls:0,
  xApiBudgetUsd:X_API_SPENDING.monthlyUsdCap,
  xApiEstimatedSpendUsd:0,
  linksRejected:rejected,
  curatedVerified,curatedRejected,curatedPublisherLinked,
  posts,
  seenOriginals:[...firstSeen].slice(-5000).map(([url,firstSeen])=>({url,firstSeen})),
  note:'Only public original-post links found on vetted fight-publisher pages, official sites or curated references are collected. A trusted publisher link proves a link was present, NOT that platform oEmbed confirmed the post; embedVerified tracks this separately. Post dates are NEVER inferred from news article or discovery timestamps. No paid X API calls (US$0 of US$2 cap). Native embeds render client-side with source links as fallback. Discovery is not a complete Instagram/Threads feed.'
 },null,2)+'\n');
 console.log('Meta embeds checked '+articleCount+' articles; found '+linkCount+
  ' original publisher links, officially embedded '+verified+', additional publisher-linked '+sourceVerified+', curated verified '+curatedVerified+', curated links '+curatedPublisherLinked+', rejected '+rejected+'; kept '+posts.length+' source-linked entries; paid X calls 0');
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)await main();
