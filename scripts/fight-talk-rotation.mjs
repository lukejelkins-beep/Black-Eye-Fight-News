/**
 * Five-minute rolling social-source scheduler for BEFN.
 *
 * Profile identification and post retrieval are deliberately separate:
 * inclusion in this watchlist never grants permission to read a timeline.
 * The collector scans up to 84 distinct entries per five-minute slot; at
 * 1,000 entries this covers the full watchlist in 12 slots (60 minutes).
 * No persistent cursor or commit is needed simply to advance a slot.
 */
import {createHash} from 'node:crypto';

export const ROLLING_BATCH_SIZE = 84;
export const ROLLING_INTERVAL_MINUTES = 5;
const INTERVAL_MS = ROLLING_INTERVAL_MINUTES * 60_000;
const SUPPORTED = new Set(['Bluesky','Instagram','Threads','X','Facebook','Reddit']);
const SPORTS = new Set(['boxing','mma','grappling']);

export function buildSocialWatchlist(config){
 const found=new Map();
 function add(platform,source){
  if(!SUPPORTED.has(platform)||!source||!SPORTS.has(source.sport))return;
  const raw=platform==='Bluesky'?source.handle:
   platform==='Reddit'?source.name:source.username;
  const username=String(raw||'').trim().replace(/^@/,'');
  if(!username||(platform==='Bluesky'&&!source.did))return;
  const key=platform.toLowerCase()+':'+username.toLowerCase();
  if(!found.has(key))found.set(key,{key,platform,username,source});
 }
 for(const src of config.sources||[])add('Bluesky',src);
 for(const [platform,settings] of Object.entries(config.platforms||{})){
  if(platform==='Reddit')for(const src of settings.communities||[])add('Reddit',src);
  else for(const src of settings.accounts||[])add(platform,src);
 }
 for(const src of config.threads?.accounts||[])add('Threads',src);
 // Stable distributed order avoids grouping all Bluesky or all blocked API
 // accounts into one five-minute batch. Never randomise on each invocation.
 const hash=key=>createHash('sha256').update(key).digest().readUInt32BE(0);
 return [...found.values()].sort((a,b)=>hash(a.key)-hash(b.key)||a.key.localeCompare(b.key));
}

export function rollingSocialBatch(watchlist,at=Date.now(),size=ROLLING_BATCH_SIZE){
 if(!Number.isInteger(size)||size<1)throw Error('Rolling batch size must be positive');
 const total=watchlist.length;
 const batches=Math.max(1,Math.ceil(total/size));
 const slot=Math.floor(at/INTERVAL_MS);
 const batchIndex=((slot%batches)+batches)%batches;
 const entries=watchlist.slice(batchIndex*size,(batchIndex+1)*size);
 const scheduledByPlatform={};
 for(const {platform} of entries)scheduledByPlatform[platform]=(scheduledByPlatform[platform]||0)+1;
 return {total,entries,scheduled:entries.length,batchIndex,batchCount:batches,
  intervalMinutes:ROLLING_INTERVAL_MINUTES,cycleMinutes:batches*ROLLING_INTERVAL_MINUTES,
  scheduledByPlatform,slot};
}

export function scopedSocialConfig(config,batch){
 const byPlatform=platform=>batch.entries.filter(x=>x.platform===platform).map(x=>x.source);
 const platforms=Object.fromEntries(Object.entries(config.platforms||{}).map(([platform,settings])=>[
  platform,platform==='Reddit'
   ? {...settings,communities:byPlatform('Reddit')}
   : {...settings,accounts:byPlatform(platform)}
 ]));
 return {
  ...config,
  sources:byPlatform('Bluesky'),
  threads:{...(config.threads||{}),accounts:byPlatform('Threads')},
  platforms
 };
}
