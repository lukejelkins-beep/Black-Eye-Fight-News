/**
 * BEFN dormant TwitterAPI.io webhook receiver, hosted by existing
 * Render Node service. Disabled until required secrets, persistent storage,
 * endpoint latency and provider prepaid cap are verified.
 *
 * TwitterAPI.io webhooks require HTTPS, answer within one second, and do not
 * retry. We ACK authenticated payloads immediately and then persist through
 * a serialized GitHub Contents API update. The provider may still lose events
 * if Render is asleep; do not activate rules until pilot readiness is proven.
 *
 * Do not log payloads, account API key, GitHub write token or auth headers.
 */
import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeTweets,mergeXFeed} from '../scripts/twitterapi-io-core.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const cfg=JSON.parse(readFileSync(path.join(root,'../data/fight-talk-x-webhook-pilot.json'),'utf8'));
const sources=JSON.parse(readFileSync(path.join(root,'../data/fight-talk-sources.json'),'utf8'));
const directory=new Map((sources.platforms?.X?.accounts||[]).map(a=>[a.username.toLowerCase(),a]));
const rules=new Map((cfg.rules||[]).map(rule=>[rule.tag,rule]));
const maxBytes=180_000;
let pending=Promise.resolve();

export function webhookEnabled(env=process.env){
 return env.BEFN_X_WEBHOOK_ENABLED==='true' &&
  String(env.TWITTERAPI_IO_API_KEY||'').length>12 &&
  String(env.BEFN_GITHUB_WRITE_TOKEN||'').length>12;
}
export function verifyHeader(got,expected){
 const a=Buffer.from(String(got||''),'utf8'),b=Buffer.from(String(expected||''),'utf8');
 return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);
}
export function pilotRules(){return [...rules.values()].map(r=>({...r,accounts:[...r.accounts]}))}
export function parseWebhook(payload,nowMs=Date.now()){
 if(!payload||typeof payload!=='object')throw Error('Invalid webhook envelope');
 if(payload.event_type==='test_webhook_url')return {test:true,posts:[],tag:null};
 if(payload.event_type!=='tweet')throw Error('Not a tweet webhook event');
 const rule=rules.get(payload.rule_tag);
 if(!rule)throw Error('Unrecognized pilot rule');
 // Allow the documented webhook rule_value field to be omitted, but never
 // accept an unexpected search expression for one of our two tags.
 if(payload.rule_value!==undefined && payload.rule_value!==rule.value)
  throw Error('Unexpected webhook search rule');
 if(!Array.isArray(payload.tweets)||payload.tweets.length>100)
  throw Error('Invalid webhook tweet batch');
 const accounts=rule.accounts.map(h=>directory.get(String(h).toLowerCase()));
 if(accounts.some(a=>!a))throw Error('Rule contains unverified handle');
 const posts=[];
 for(let i=0;i<payload.tweets.length;i+=20){
  posts.push(...normalizeTweets({tweets:payload.tweets.slice(i,i+20)},accounts,nowMs));
 }
 const unique=new Map(posts.map(p=>[p.url,{...p,
  source:'TwitterAPI.io authenticated webhook; source author matched verified X watchlist',
  sourceProvider:'twitterapi.io',delivery:'webhook'}]));
 return {test:false,tag:rule.tag,posts:[...unique.values()]};
}
function respond(res,status,obj){
 res.writeHead(status,{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(obj));
}
const GITHUB_CONTENT_URL='https://api.github.com/repos/lukejelkins-beep/Black-Eye-Fight-News/contents/data/fight-talk-x-api.json';
export async function persistGithub(posts,tag,token,fetchImpl=fetch){
 if(!posts.length)return;
 for(let attempt=0;attempt<3;attempt++){
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28','User-Agent':'BEFN-X-webhook-pilot'};
  const response=await fetchImpl(GITHUB_CONTENT_URL,{headers,signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('GitHub read failed ('+response.status+')');
  const remote=await response.json();
  if(typeof remote.sha!=='string'||typeof remote.content!=='string')throw Error('Invalid GitHub content reply');
  const current=JSON.parse(Buffer.from(remote.content.replace(/\s/g,''),'base64').toString('utf8'));
  const merged=mergeXFeed(current,posts,Date.now());
  const next={...current,
   status:'connected',
   webhookPilot:{lastReceivedAt:new Date().toISOString(),
    latestRuleTag:tag,storedOriginalPosts:posts.length,
    notice:'Pilot-only source-linked posts; paid checks are charged by TwitterAPI.io separately.'},
   posts:merged};
  const update=await fetchImpl(GITHUB_CONTENT_URL,{
   method:'PUT',headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({message:'Save original X posts from authenticated BEFN webhook pilot',
    sha:remote.sha,content:Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64')}),
   signal:AbortSignal.timeout(9000)
  });
  if(update.ok)return;
  if(![409,422].includes(update.status))throw Error('GitHub write failed ('+update.status+')');
 }
 throw Error('GitHub optimistic concurrency exhausted');
}
export function enqueueWebhook(posts,tag,env=process.env,save=persistGithub){
 pending=pending.catch(()=>{}).then(()=>save(posts,tag,env.BEFN_GITHUB_WRITE_TOKEN));
 pending.catch(e=>{
  // No post bodies, keys, URLs, or other private information in service logs.
  console.error('BEFN X webhook persistence failed:',String(e?.message||'Unexpected error').slice(0,100));
 });
}
export async function handleTwitterWebhook(req,res,env=process.env){
 const pathname=(req.url||'').split('?')[0];
 if(pathname==='/webhooks/twitterapi/status'&&req.method==='GET'){
  return respond(res,200,{service:'BEFN X original-post webhook pilot',
   ready:webhookEnabled(env),active:false,ruleCount:rules.size,
   storage:'GitHub Contents API (requires fine-grained repository write token)',
   warning:'Free Render sleeping may exceed the provider one-second callback timeout.'});
 }
 if(pathname!=='/webhooks/twitterapi'||req.method!=='POST')
  return respond(res,405,{error:'Unsupported method'});
 if(!webhookEnabled(env))return respond(res,503,{error:'Pilot receiver not enabled'});
 if(!verifyHeader(req.headers['x-api-key'],env.TWITTERAPI_IO_API_KEY))
  return respond(res,401,{error:'Unauthorized'});
 const length=Number(req.headers['content-length']);
 if(Number.isFinite(length)&&length>maxBytes)
  return respond(res,413,{error:'Payload too large'});
 let buffer='',byteCount=0;
 try{
  for await(const chunk of req){
   byteCount+=chunk.length;
   if(byteCount>maxBytes)return respond(res,413,{error:'Payload too large'});
   buffer+=chunk.toString('utf8');
  }
  const parsed=parseWebhook(JSON.parse(buffer));
  respond(res,200,{received:true,verifiedPosts:parsed.posts.length,test:parsed.test});
  if(parsed.posts.length)enqueueWebhook(parsed.posts,parsed.tag,env);
 }catch{
  if(!res.headersSent)respond(res,400,{error:'Invalid webhook event'});
 }
}
