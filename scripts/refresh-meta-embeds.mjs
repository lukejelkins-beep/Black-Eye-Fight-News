/**
 * Discover only original Instagram/Threads post permalinks explicitly linked by
 * combat-news publishers; verify public embeddability through Meta oEmbed.
 *
 * Meta oEmbed supplies a VIEW of an original post, not a crawler of user feeds.
 * We never treat the date of a news article as the post's publication time,
 * infer a fighter identity from a news story, copy publisher photos, or save
 * oEmbed HTML (which is presentation-only content).
 */
import fs from 'node:fs';
export const nowISO=()=>new Date().toISOString();
const acceptedPublishers=new Map([
 ['www.mmafighting.com','MMA Fighting'],['mmafighting.com','MMA Fighting'],
 ['www.worldboxingnews.com','World Boxing News'],['www.worldboxingnews.net','World Boxing News'],
 ['www.ufc.com','UFC'],['ufc.com','UFC'],
]);
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
   return {platform:'Threads',url:'https://www.threads.com/'+match[1]+'/'+match[2]+'/'};
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
 const matches=content.match(/https?:\/\/(?:www\.)?(?:instagram\.com|threads\.(?:com|net))\/[^\s"'<>\\]+/gi)||[];
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
 const type=r.headers.get('content-type')||'';
 if(!type.includes('html'))throw Error('Not HTML');
 return (await r.text()).slice(0,limit);
}
async function metaVerify(item){
 const base=item.platform==='Instagram'?'https://graph.facebook.com/v26.0/instagram_oembed':'https://graph.threads.com/oembed';
 const r=await fetch(base+'?url='+encodeURIComponent(item.url),{signal:AbortSignal.timeout(9500)});
 if(!r.ok)throw Error('oEmbed HTTP '+r.status);
 return validMetaEmbed(await r.json(),item.platform);
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
 const existing=new Map((prior.posts||[]).filter(p=>p.nativeEmbed&&p.evidenceUrl&&Date.parse(p.sourceLinkedAt||'')>=Date.parse(checkedAt)-recentDays).map(p=>[p.url,p]));
 for(const {article,item} of links){
  const name=article.sourceLabel||publisherOf(article.url);
  if(!name)continue;
  const when=Date.parse(article.publishedAt||'');
  if(!Number.isFinite(when)||when>Date.parse(checkedAt)+30*60*1000||when<Date.parse(checkedAt)-recentDays)continue;
  const old=existing.get(item.url);
  // Rediscovery is not a new social-media post. Do not reset its age or author.
  if(old)continue;
  existing.set(item.url,{
   type:'post',platform:item.platform,sport:article.sport,
   // Only the native Meta embed identifies the original author.
   name:'Original '+item.platform+' post',role:'media',
   nativeEmbed:true,originalDateUnverified:true,
   sourceLinkedAt:article.publishedAt,
   discoveredAt:old?.discoveredAt||checkedAt,
   sourcePublisher:name,evidenceUrl:article.url,
   summary:'Original social post linked in '+name+' coverage. Its author, caption and publication date appear in the official embed.',
   source:'Public publisher link + official Meta oEmbed verification',
   url:item.url,
  });
 }
 return [...existing.values()].sort((a,b)=>Date.parse(b.sourceLinkedAt)-Date.parse(a.sourceLinkedAt)).slice(0,80);
}
async function main(){
 const file='data/fight-talk-embedded.json',checkedAt=nowISO();
 const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{posts:[]};
 const news=JSON.parse(fs.readFileSync('data/news-live.json','utf8'));
 const curated=JSON.parse(fs.readFileSync('data/fight-talk-selected.json','utf8')).posts||[];
 const curatedCandidates=curated.filter(p=>['Instagram','Threads'].includes(p.platform)&&
  ['boxing','mma','grappling'].includes(p.sport)&&Date.parse(p.postedAt||'')>=Date.now()-28*24*60*60*1000)
  .map(p=>({article:{url:p.url,sport:p.sport,publishedAt:p.postedAt,sourceLabel:'Fight Talk curated original link'},
            item:normalizePostLink(p.url)}))
  .filter(x=>x.item&&x.item.platform===curated.find(p=>p.url===x.article.url)?.platform);
  // UFC's public homepage has a first-party "View on Threads" section, which
  // ordinary editorial RSS articles often omit. Homepage inclusion is a link
  // observation only, never evidence of the original social-post timestamp.
  const officialHomepages=[{url:'https://www.ufc.com/',sport:'mma',publishedAt:checkedAt,sourceLabel:'UFC official homepage'}];
  const candidates=[...officialHomepages,...(news.articles||[]).filter(a=>['boxing','mma','grappling'].includes(a.sport)&&publisherOf(a.url)&&
   Date.parse(a.publishedAt)>=Date.now()-7*24*60*60*1000).slice(0,45)];
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
 let articleCount=0,linkCount=0,verified=0,rejected=0;
 const combined=[];
 let curatedVerified=0,curatedRejected=0;
 for(const candidate of curatedCandidates){
  if(!originalStillRelevant(candidate.item.url,firstSeen,checkedAt))continue;
  if(prior.has(candidate.item.url)){combined.push(candidate);continue;}
  try{if(await metaVerify(candidate.item)){combined.push(candidate);curatedVerified++}else curatedRejected++;}
  catch{curatedRejected++}
 }
 let index=0;
 async function worker(){
  while(index<candidates.length){
   const article=candidates[index++];
   try{
    const links=extractPostLinks(await getText(article.url));
    articleCount++;
    linkCount+=links.length;
    for(const item of links){
     if(!originalStillRelevant(item.url,firstSeen,checkedAt))continue;
     if(prior.has(item.url)){combined.push({article,item});continue}
     try{
      if(await metaVerify(item)){combined.push({article,item});verified++}
      else rejected++;
     }catch{rejected++}
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
  linksFound:linkCount,
  newEmbedsVerified:verified,
  linksRejected:rejected,
  curatedVerified,curatedRejected,
  posts,
  seenOriginals:[...firstSeen].slice(-5000).map(([url,firstSeen])=>({url,firstSeen})),
  note:'Source discovery finds original social links in combat-sports publisher articles. A news article timestamp is NOT the Instagram/Threads post time. Original post text, author and date are rendered by Meta directly. A homepage mention is not the original post publication date. Links stay in Live for at most 7 days after first discovery, in Highlights for at most 28 days, and never refresh their age on rescans. Discovery is not a complete Instagram/Threads feed.'
 },null,2)+'\n');
 console.log('Meta embeds checked '+articleCount+' articles; found '+linkCount+
  ' original publisher links, verified '+verified+' new publisher embeds; curated verified '+curatedVerified+', rejected '+curatedRejected+'; kept '+posts.length+' source-linked entries');
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)await main();
