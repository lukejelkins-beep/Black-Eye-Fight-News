/**
 * BEFN's optional read-only TwitterAPI.io collector.
 * All paid requests MUST first reserve a pessimistic cost in a committed
 * GitHub budget ledger, and must be performed by one serialized workflow.
 * The provider's prepaid balance with auto-top-up off is the billing hard stop.
 */
export const X_POLICY=Object.freeze({
  monthlyUsdLimit:2,
  internalMonthlyReserveMicroUsd:1_800_000,
  maxReservedMicroUsdPerRequest:3_400, // 20 tweets x 15 credits = US$0.003, plus buffer
  maxTweetsPerSearchPage:20,
  minMinutesBetweenSearches:65,
  groupSize:8,
  freshnessHours:72,
  publicPostRetentionDays:28
});
const ROLE_ORDER=['fighter','promoter','fighter','media','fighter','manager','fighter','media','fighter','meme'];
const SCORE={champion:0,contender:1,prospect:2};
const VALID_ROLE=new Set(['fighter','promoter','manager','trainer','team','media','meme','commentator','fan']);
const HANDLE=/^[A-Za-z0-9_]{1,15}$/;
export function xAccounts(config){
 const existing=new Set(),result=[];
 for(const source of config?.platforms?.X?.accounts||[]){
  const username=String(source.username||'').replace(/^@/,'').trim();
  const key=username.toLowerCase();
  if(!HANDLE.test(username)||!['boxing','mma','grappling'].includes(source.sport)||existing.has(key)||
     !VALID_ROLE.has(source.role)||!source.identityBasis)continue;
  existing.add(key);
  result.push({...source,username});
 }
 return result;
}
export function accountGroups(config,size=X_POLICY.groupSize){
 if(!Number.isInteger(size)||size<1||size>12)throw Error('Invalid X account group size');
 const buckets=new Map();
 for(const account of xAccounts(config)){
  const role=VALID_ROLE.has(account.role)?account.role:'media';
  if(!buckets.has(role))buckets.set(role,[]);
  buckets.get(role).push(account);
 }
 for(const b of buckets.values())b.sort((a,b)=>
  (SCORE[a.fighterTier]??3)-(SCORE[b.fighterTier]??3)||
  a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
 const arranged=[];
 let remaining=[...buckets.values()].reduce((sum,arr)=>sum+arr.length,0);
 while(remaining){
  let advanced=0;
  for(const role of ROLE_ORDER){
   const next=buckets.get(role)?.shift();
   if(next){arranged.push(next);advanced++;remaining--;}
  }
  for(const [role,bucket] of buckets){
   if(ROLE_ORDER.includes(role))continue;
   const next=bucket.shift();
   if(next){arranged.push(next);advanced++;remaining--;}
  }
  if(!advanced)break;
 }
 const groups=[];
 for(let i=0;i<arranged.length;i+=size)groups.push(arranged.slice(i,i+size));
 return groups;
}
export function buildQuery(group,nowMs){
 if(!Array.isArray(group)||!group.length||group.length>12)throw Error('Invalid search group');
 for(const a of group)if(!HANDLE.test(a.username))throw Error('Unsafe X username');
 const from=group.map(a=>'from:'+a.username).join(' OR ');
 const since=Math.floor((nowMs-X_POLICY.freshnessHours*3600_000)/1000);
 return '('+from+') since_time:'+since+' -filter:replies -filter:nativeretweets';
}
export function monthUtc(ms){return new Date(ms).toISOString().slice(0,7)}
export function reservePlan(previous,config,nowMs,hasKey){
 const groups=accountGroups(config);
 let state={
  schemaVersion:1,
  ...(previous||{})
 };
 if(state.month!==monthUtc(nowMs)){
  state={schemaVersion:1,month:monthUtc(nowMs),reservedMicroUsd:0,verifiedEstimateMicroUsd:0,
   attempts:0,completed:0,lastReservedAt:null,lastCompletedAt:null,nextGroupIndex:state.nextGroupIndex||0,
   paused:false,pending:null,error:null};
 }
 if(!hasKey)return {state,reason:'no-key'};
 if(!groups.length)return {state,reason:'no-sources'};
 if(state.paused)return {state,reason:'provider-paused'};
 if(state.pending)return {state,reason:'pending-reservation'};
 if(state.lastReservedAt&&nowMs-Date.parse(state.lastReservedAt)<X_POLICY.minMinutesBetweenSearches*60_000)
  return {state,reason:'cooldown'};
 if(state.reservedMicroUsd+X_POLICY.maxReservedMicroUsdPerRequest>X_POLICY.internalMonthlyReserveMicroUsd)
  return {state,reason:'monthly-budget'};
 const groupIndex=(state.nextGroupIndex||0)%groups.length;
 const pending={id:monthUtc(nowMs)+'-'+String(state.attempts+1).padStart(4,'0'),
  groupIndex,handles:groups[groupIndex].map(a=>a.username),
  reservedAt:new Date(nowMs).toISOString(),
  maxReservedMicroUsd:X_POLICY.maxReservedMicroUsdPerRequest};
 state={...state,pending,reservedMicroUsd:state.reservedMicroUsd+X_POLICY.maxReservedMicroUsdPerRequest,
  attempts:state.attempts+1,nextGroupIndex:(groupIndex+1)%groups.length,lastReservedAt:pending.reservedAt,
  error:null};
 return {state,reason:'reserved',pending,group:groups[groupIndex]};
}
export function finalizeLedger(state,{result,at,reason}){
 if(!state?.pending)return state;
 const count=Math.max(0,Math.min(X_POLICY.maxTweetsPerSearchPage,Number(result?.returnedCount)||0));
 const actual= Math.max(150,count*150); // US$ per 1m = credits per tweet x 10 microUSD
 const completed=result?.ok===true;
 return {...state,pending:null,
  completed:(state.completed||0)+(completed?1:0),
  lastCompletedAt:completed?at:state.lastCompletedAt,
  verifiedEstimateMicroUsd:(state.verifiedEstimateMicroUsd||0)+(completed?actual:0),
  paused: Boolean(result?.pause||state.paused),
  error:completed?null:(reason||'Provider unavailable; no request will be automatically retried')};
}
export function normalizeTweets(body,group,nowMs){
 if(!body||!Array.isArray(body.tweets))throw Error('Unexpected X search response structure');
 if(body.tweets.length>X_POLICY.maxTweetsPerSearchPage)throw Error('Provider returned more than the priced 20-post page; pausing integration');
 const accounts=new Map(group.map(a=>[a.username.toLowerCase(),a]));
 const seen=new Set(),posts=[];
 for(const t of body.tweets){
  const username=String(t?.author?.userName||t?.author?.username||'').replace(/^@/,'');
  const account=accounts.get(username.toLowerCase());
  const id=String(t?.id||'');
  if(!account||!HANDLE.test(username)||!/^\d{10,25}$/.test(id)||seen.has(id))continue;
  if(t.isReply||t.retweeted_tweet||t.retweetedTweet)continue;
  const when=Date.parse(String(t.createdAt||''));
  if(!Number.isFinite(when)||when>nowMs+300_000||when<nowMs-X_POLICY.freshnessHours*3600_000)continue;
  const sourceStamp=Number((BigInt(id)>>22n)+1288834974657n);
  if(!Number.isFinite(sourceStamp)||Math.abs(sourceStamp-when)>5*60_000)continue;
  const quote=String(t.text||'').trim();
  if(!quote||quote.length>15_000)continue;
  seen.add(id);
  const engagement={};
  for(const [inKey,outKey] of [['likeCount','likes'],['replyCount','comments'],['retweetCount','shares']]){
   const n=t[inKey];if(Number.isSafeInteger(n)&&n>=0)engagement[outKey]=n;
  }
  posts.push({type:'post',platform:'X',sport:account.sport,
   name:account.name||username,handle:'@'+username,
   role:account.role,fighterTier:account.fighterTier||undefined,
   quote:quote.slice(0,2000),postedAt:new Date(when).toISOString(),
   url:'https://x.com/'+username+'/status/'+id,
   id,engagement,nativeEmbed:true,originalDateUnverified:false,
   source:'TwitterAPI.io read-only original post lookup; matched pinned X username',
   verifiedHandle:username,sourceProvider:'twitterapi.io'});
 }
 return posts;
}
export function mergeXFeed(previous,received,nowMs){
 const byId=new Map();
 for(const post of [...(previous?.posts||[]),...(received||[])]){
  if(post?.platform!=='X'||!/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{10,25}$/.test(post.url||''))continue;
  const when=Date.parse(post.postedAt||'');
  if(!Number.isFinite(when)||when<nowMs-X_POLICY.publicPostRetentionDays*86400_000||when>nowMs+300_000)continue;
  byId.set(post.url,post);
 }
 // Show fighters and promoter/manager voices ahead of media, with per-author diversity.
 const priority=p=>({fighter:0,promoter:1,manager:1,trainer:1,team:1,meme:2,media:3,commentator:3})[p.role]??4;
 const all=[...byId.values()].sort((a,b)=>priority(a)-priority(b)||
   Date.parse(b.postedAt)-Date.parse(a.postedAt));
 const counts=new Map();
 return all.filter(p=>{
  const name=p.handle.toLowerCase();
  const n=counts.get(name)||0;
  if(n>=5)return false;
  counts.set(name,n+1);return true;
 }).slice(0,180);
}
