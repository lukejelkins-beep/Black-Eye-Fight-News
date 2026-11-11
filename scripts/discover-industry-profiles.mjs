/**
 * Grow BEFN's combat-sports account directory from official organisation sites.
 * First-party footer/social links and matching Organization sameAs ONLY.
 * No login walls, social timelines, search-engine guessing or paid API calls.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file='data/fight-talk-sources.json';
const report='data/fight-talk-industry-discovery.json';
const catalog='data/fight-talk-industry-sites.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n');
export const compact=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function canonicalSocial(raw){
 try{
  const u=new URL(raw.replaceAll('&amp;','&'));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const host=u.hostname.toLowerCase().replace(/^www\./,'');
  let platform='',username='';
  if(host==='x.com'||host==='twitter.com'){
   platform='X';username=u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]||'';
  }else if(host==='instagram.com'){
   platform='Instagram';username=u.pathname.match(/^\/([A-Za-z0-9_.]{2,30})\/?$/)?.[1]||'';
  }else if(host==='threads.com'||host==='threads.net'){
   platform='Threads';username=u.pathname.match(/^\/@([A-Za-z0-9_.]{2,30})\/?$/)?.[1]||'';
  }else if(host==='bsky.app'){
   platform='Bluesky';username=u.pathname.match(/^\/profile\/([a-z0-9.:-]{4,160})\/?$/i)?.[1]||'';
  }
  if(!username||!platform||['p','reel','stories','explore','accounts','search','home','share'].includes(username.toLowerCase()))return null;
  return {platform,username,url:platform==='Instagram'?'https://www.instagram.com/'+username+'/':platform==='Threads'?'https://www.threads.com/@'+username:platform==='Bluesky'?'https://bsky.app/profile/'+username:'https://x.com/'+username};
 }catch{return null}
}
const asArray=value=>Array.isArray(value)?value:value?[value]:[];
function walkLd(node,name){
 if(!node||typeof node!=='object')return [];
 if(Array.isArray(node))return node.flatMap(x=>walkLd(x,name));
 const type=asArray(node['@type']).map(x=>String(x).toLowerCase());
 const matched=type.some(x=>x==='organization'||x==='newsmediaorganization'||x==='sportsorganization')&&compact(node.name)===compact(name);
 return [...(matched?asArray(node.sameAs).filter(x=>typeof x==='string'):[]),...walkLd(node['@graph'],name)];
}
export function officialLinks(html,target){
 const text=String(html||'');
 const urls=[];
 // Official organization structured data gives strongest publisher ownership evidence.
 for(const m of text.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{urls.push(...walkLd(JSON.parse(m[1]),target.name))}catch{}
 }
 // The global footer is owned by the publisher, unlike article bodies which
 // may link to entirely unrelated fighters, sponsors or other news sources.
 for(const m of text.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi)){
  for(const anchor of m[0].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)){
   try{urls.push(new URL(anchor[1].replaceAll('&amp;','&'),target.url).href)}catch{}
  }
 }
 const expected=new Set((target.aliases||[]).map(compact));
 return [...new Map(urls.map(canonicalSocial).filter(x=>x&&expected.has(compact(x.username))).map(x=>[x.platform+':'+x.username.toLowerCase(),x])).values()];
}
export function registerAccount(cfg,target,profile,conflicts){
 const records=profile.platform==='Bluesky'?cfg.sources:profile.platform==='Threads'?cfg.threads.accounts:cfg.platforms?.[profile.platform]?.accounts;
 if(!Array.isArray(records))return false;
 const username=profile.username.toLowerCase();
 const byHandle=records.find(x=>x.handle?.toLowerCase()===username||x.username?.toLowerCase()===username);
 if(byHandle){
  if(compact(byHandle.name)!==compact(target.name))conflicts.push({platform:profile.platform,username,existing:byHandle.name,candidate:target.name,reason:'Handle already attributed to a different name'});
  return false;
 }
 const byName=records.find(x=>compact(x.name)===compact(target.name));
 if(byName){
  conflicts.push({platform:profile.platform,username,existing:byName.username||byName.handle,candidate:target.name,reason:'An existing identity uses another handle'});
  return false;
 }
 const common={name:target.name,sport:target.sport,role:target.role,
  evidenceUrl:target.url,identityBasis:'Social profile published in first-party official footer or Organization sameAs on '+target.url};
 if(profile.platform==='Bluesky'){
  if(!/^did:(?:plc|web):[a-z0-9.%:-]+$/i.test(profile.did||''))return false;
  if(records.some(x=>x.did===profile.did))return false;
  records.push({handle:profile.username,did:profile.did,...common});
 }else{
  records.push({username:profile.username,...common});
  if(profile.platform==='Threads'&&!cfg.threads.allowlistedUsernames.some(x=>x.toLowerCase()===username))
   cfg.threads.allowlistedUsernames.push(profile.username);
 }
 return true;
}
async function fetchOfficial(target){
 const u=new URL(target.url),origin=u.hostname.replace(/^www\./,'');
 const response=await fetch(u,{redirect:'follow',signal:AbortSignal.timeout(8500),headers:{
  'User-Agent':'BlackEyeFightNews/1.0 public organization directory',Accept:'text/html'
 }});
 if(!response.ok)throw Error('HTTP '+response.status);
 const result=new URL(response.url);
 if(result.protocol!=='https:'||result.hostname.replace(/^www\./,'')!==origin)throw Error('Unexpected redirect');
 if(!String(response.headers.get('content-type')||'').includes('html'))throw Error('Expected HTML');
 return (await response.text()).slice(0,1_500_000);
}
async function blueskyProfile(profile){
 const r=await fetch('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor='+encodeURIComponent(profile.username),{signal:AbortSignal.timeout(6500)});
 if(!r.ok)return null;
 const data=await r.json();
 if(data.handle?.toLowerCase()!==profile.username.toLowerCase()||!/^did:(?:plc|web):[a-z0-9.%:-]+$/i.test(data.did||''))return null;
 return {...profile,did:data.did};
}
export async function main(){
 const cfg=read(file),targets=read(catalog).sites,now=new Date().toISOString();
 cfg.threads??={accounts:[],allowlistedUsernames:[]};
 cfg.threads.accounts??=[];cfg.threads.allowlistedUsernames??=[];
 const conflicts=[],failures=[],discovered=[],visited=[];
 let offset=0;
 async function worker(){
  while(offset<targets.length){
   const target=targets[offset++];
   try{
    const html=await fetchOfficial(target);
    const originals=officialLinks(html,target);
    let added=0;
    for(const raw of originals){
     const verified=raw.platform==='Bluesky'?await blueskyProfile(raw):raw;
     if(!verified)continue;
     if(registerAccount(cfg,target,verified,conflicts)){discovered.push({name:target.name,platform:raw.platform,username:raw.username,evidenceUrl:target.url});added++}
    }
    visited.push({name:target.name,profilesSeen:originals.length,added});
   }catch(e){failures.push({name:target.name,reason:String(e.message||e).slice(0,120)})}
  }
 }
 await Promise.all(Array.from({length:4},()=>worker()));
 if(discovered.length)write(file,cfg);
 write(report,{checkedAt:now,sitesConfigured:targets.length,sitesChecked:visited.length,sitesFailed:failures.length,added:discovered.length,discovered,failures:failures.slice(0,20),conflicts:conflicts.slice(0,30),
  totals:{X:cfg.platforms?.X?.accounts?.length||0,Instagram:cfg.platforms?.Instagram?.accounts?.length||0,Threads:cfg.threads.accounts.length,Bluesky:cfg.sources.length},
  note:'Source identity references only. Original social posts need a separate public permalink or permitted API. No social timelines scraped, tokens used, or paid X API requests made.'});
 console.log('BEFN official-site account discovery:',visited.length,'of',targets.length,'sites; added',discovered.length,'accounts; failed',failures.length);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await main();
