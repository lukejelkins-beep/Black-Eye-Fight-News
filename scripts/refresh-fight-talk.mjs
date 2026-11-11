/**
 * Public-source Fight Talk collector with a five-minute rolling source rotation.
 * Public author APIs for pinned Bluesky accounts plus verified X/Instagram accounts.
 * Optional Meta Threads keyword search requires explicitly approved API access.
 * No model-generated posts or unattributed invented quotes.
 */
import fs from 'node:fs';
import {collectPlatforms} from './fight-talk-platforms.mjs';
import {buildSocialWatchlist,rollingSocialBatch,scopedSocialConfig} from './fight-talk-rotation.mjs';
const now=Date.now();
const checkedAt=new Date(now).toISOString();
// Keep post history for the rolling highlights; the Live view filters to seven days.
const since=now-28*24*60*60*1000;
const recentApiSince=now-7*24*60*60*1000;
const config=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8'));
const rolling=rollingSocialBatch(buildSocialWatchlist(config),now);
const scheduledConfig=scopedSocialConfig(config,rolling);
const file='data/fight-talk-live.json';
let previous={posts:[]};
try{previous=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
const posts=new Map();
let checked=0,failed=0,failures=[];
const keywords=/\b(boxing|boxer|boxingmatch|fight|fighter|fighting|fightnight|ufc|mma|punch|knockout|ko|tko|bellator|pfl|octagon|wba|wbc|wbo|ibf|ring magazine|mixed martial arts|weigh.in|combat sport|undercard|bout|featherweight|heavyweight|lightweight|middleweight|welterweight|title shot|contender|bjj|grappling|wrestling|wrestler|raf|real american freestyle|ncaa|freestyle|greco.roman|judo|kickboxing)\b/i;
const allowedUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['bsky.app','threads.com','www.threads.com','threads.net','www.threads.net','x.com','www.x.com','instagram.com','www.instagram.com','facebook.com','www.facebook.com','reddit.com','www.reddit.com'].includes(u.hostname)}catch{return false}};
function insert(p,fresh=false) {
  if(!p||!allowedUrl(p.url)||typeof p.quote!=='string'||(!p.quote.trim()&&!['Instagram','X'].includes(p.platform))||!['boxing','mma','grappling'].includes(p.sport))return;
  const when=Date.parse(p.postedAt||'');
  if(!Number.isFinite(when)||when<since||when>now+30*60*1000)return;
  const key=p.url.split('?')[0];
  if(fresh){
    const engagement=Object.fromEntries(Object.entries(p.engagement||{}).filter(([,count])=>Number.isSafeInteger(count)&&count>=0));
    if(Object.keys(engagement).length)p={...p,engagement,engagementCheckedAt:checkedAt};
    else {
      const previous=posts.get(key);
      p={...p,engagement:previous?.engagement,engagementCheckedAt:previous?.engagementCheckedAt};
    }
  }
  posts.set(key,{...p,url:key});
}
for(const p of previous.posts||[])insert(p);
async function getJSON(url,headers={}) {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{headers:{'User-Agent':'BlackEyeFightNews/1.0 editorial aggregation',...headers},signal:controller.signal});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return await response.json();
  } finally{clearTimeout(timeout)}
}
// Rotate identified Bluesky DIDs across five-minute slots. A bounded worker
// pool prevents a single unavailable source from delaying the feed.
const blueskySources=scheduledConfig.sources.filter(src=>src.did&&src.handle&&
 ['boxing','mma','grappling'].includes(src.sport));
let sourceCursor=0;
async function checkBlueskyAuthor(src){
 const url='https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor='+encodeURIComponent(src.did)+'&limit=40&filter=posts_with_replies';
 try{
  const response=await getJSON(url);checked++;
  for(const item of response.feed||[]){
   if(item.reason?.$type==='app.bsky.feed.defs#reasonRepost')continue;
   const post=item.post||{},rec=post.record||{},author=post.author||{};
   if(author.did!==src.did||typeof rec.text!=='string'||!rec.text.trim())continue;
   if(!keywords.test(rec.text))continue;
   const key=post.uri?.split('/').pop();
   if(!key||!author.handle||!author.did)continue;
   const postedAt=rec.createdAt||post.indexedAt||'';
   if(!Number.isFinite(Date.parse(postedAt)))continue;
   insert({
    id:post.uri,cid:post.cid,platform:'Bluesky',sport:src.sport,type:'post',name:author.displayName?.trim()||src.name,
    handle:'@'+author.handle,role:src.role,fighterTier:src.fighterTier,quote:rec.text.slice(0,2000),
    postedAt,date:new Date(postedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'Australia/Melbourne'}),
    url:'https://bsky.app/profile/'+encodeURIComponent(author.handle)+'/post/'+encodeURIComponent(key),
    photo:/^https:\/\//.test(author.avatar||'')?author.avatar:'',
    source:'Bluesky public author API',verifiedDid:src.did,
    engagement:{likes:post.likeCount,comments:post.replyCount,shares:post.repostCount}
   },true);
  }
 }catch(err){failed++;failures.push(src.handle+': '+String(err.message||err).slice(0,90))}
}
async function blueskyWorker(){
 while(sourceCursor<blueskySources.length){
  const src=blueskySources[sourceCursor++];
  await checkBlueskyAuthor(src);
 }
}
await Promise.all(Array.from({length:Math.min(6,blueskySources.length)},()=>blueskyWorker()));
// Public Threads post links are now collected from trusted source pages and
// rendered as official embeds. An approved Meta keyword_search API, OAuth
// token or app review is NOT required for the view-only public feed.
const threadsState='source-linked';
const threadsStatus='Original public Threads links discovered from trusted fight coverage; no account-level Meta API or OAuth required.';
const platformStatus=await collectPlatforms(scheduledConfig,getJSON,p=>insert(p,true),recentApiSince);
platformStatus.unshift({platform:'Bluesky',state:checked?'connected':blueskySources.length?'unavailable':'not-scheduled',checked,failed,configured:blueskySources.length,message:checked+' of '+blueskySources.length+' scheduled sources checked.'});
platformStatus.push({platform:'Threads',state:threadsState,message:threadsStatus});
const collected=platformStatus.some(p=>p.state==='connected');
const meaningful=/\b(title|champion|result|wins|won|defeat|knockout|finish|announce|confirmed|signs|signed|withdraw|cancel|injury|opponent|call.?out|matchup|bout|card|round|decision|scorecard|takedown|submission|fight|ufc|boxing|wrestling|grappling|raf)\b/i;
const all=[...posts.values()]
 .filter(p=>p.platform!=='Bluesky'||meaningful.test(p.quote))
 .filter(p=>!/(years ago today|in my #?boxing collection|gold auto card|duratran site poster)/i.test(p.quote))
 .map(p=>({...p,topic:p.role==='fan'?'Fan discussion':'Original source post · claims may need confirmation'}))
 .sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt));
const counts=new Map();
const selected=all.filter(p=>{const key=p.platform+':'+p.handle;const n=counts.get(key)||0;
 if(n>=10)return false;
 counts.set(key,n+1);return true;
}).slice(0,320);
const output={
  attemptedAt:checkedAt,checkedAt:collected?checkedAt:(previous.checkedAt||null),updatedAt:all[0]?.postedAt||null,windowDays:28,
  sourcesConfigured:config.sources.length,sourcesChecked:checked,sourcesFailed:failed,
  platformStatus,threadsStatus,failures:failures.slice(0,12),
  rollingScan:{directoryEntries:rolling.total,scheduledEntries:rolling.scheduled,
   batchIndex:rolling.batchIndex,batchCount:rolling.batchCount,
   batchSize:84,intervalMinutes:rolling.intervalMinutes,
   nominalCycleMinutes:rolling.cycleMinutes,scheduledByPlatform:rolling.scheduledByPlatform,
   directlyChecked:checked+platformStatus.reduce((n,p)=>n+(p.platform==='Bluesky'?0:(p.checked||0)),0),
   note:'Scheduled directory entries are not synonymous with accessible API feeds; source-linked X and Threads accounts do not receive paid timeline checks.'},
  posts:selected,
  message:'Source-linked posts retained for rolling 28-day highlights; the Live view shows the latest seven days. Post claims are not independently fact-checked. Newest-first feed; original posts need no minimum engagement. Directory rotation is scheduled every five minutes, subject to GitHub Actions delays and platform API availability.'
};
// A scan without new original posts should not cause another GitHub commit,
// Render redeploy or failure email. Preserve the hourly metadata heartbeat.
const contentSignature=list=>JSON.stringify(list.map(p=>{
 const {engagement,engagementCheckedAt,...stable}=p;
 return stable;
}));
const oldCheck=Date.parse(previous.checkedAt||'');
const heartbeatDue=!Number.isFinite(oldCheck)||now-oldCheck>=60*60*1000;
const contentChanged=contentSignature(selected)!==contentSignature(previous.posts||[]);
if(contentChanged||heartbeatDue){
 fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n');
 console.log('Published Fight Talk source-linked feed',selected.length,'posts; reason:',contentChanged?'content changed':'hourly heartbeat');
}else{
 console.log('No new original posts; retaining previous published feed to avoid an empty-scan commit');
}
console.log('Rolling Fight Talk',rolling.scheduled,'of',rolling.total,'directory entries (batch',
 rolling.batchIndex+1,'of',rolling.batchCount,'), direct checks',
 output.rollingScan.directlyChecked,'; API failures',failed,'; Threads:',threadsStatus);
// Blocked or source-linked-only batches are expected; never treat a missing
// official Instagram or Threads permission as a failing GitHub Action.
if(!collected&&!all.length&&blueskySources.length){
 console.error('Selected Bluesky author feeds failed and no saved posts are available.');
 process.exitCode=1;
}
