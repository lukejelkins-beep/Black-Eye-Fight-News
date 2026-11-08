/**
 * Discover fighter social profiles from Wikidata identity statements and
 * person-specific JSON-LD on official promotion athlete pages.
 *
 * Never guess a handle from a fighter name, scrape login walls, or mistake
 * a website footer's promoter account for the fighter's account.
 *
 * Wikidata statements: P2002 (X), P2003 (Instagram), P11892 (Threads).
 * Source citations, conflicts and uncovered fighters remain auditable.
 */
import fs from 'node:fs';

const api='https://www.wikidata.org/w/api.php';
const readJson=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const writeJson=(path,value)=>fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
export const normName=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const validX=s=>/^[A-Za-z0-9_]{1,15}$/.test(s||'');
const validMeta=s=>/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(s||'')&&!String(s).includes('..');
const sportPattern={
 boxing:/\b(boxer|boxing)\b/i,
 mma:/\b(mixed martial artist|mixed martial arts|mma fighter|ultimate fighting|ufc fighter|martial artist|kickboxer)\b/i,
 grappling:/\b(wrestler|wrestling|jiu.jitsu|grappl)\b/i
};
const props={X:'P2002',Instagram:'P2003',Threads:'P11892'};
const serviceUrl=(platform,handle)=>platform==='X'?'https://x.com/'+handle:platform==='Instagram'?'https://www.instagram.com/'+handle+'/':'https://www.threads.com/@'+handle;
const validHandle=(platform,handle)=>platform==='X'?validX(handle):validMeta(handle);
const plain=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

export function wikidataIdentity(entity,name,sport){
 if(!entity||entity.missing!==undefined||!/^Q\d+$/.test(entity.id||''))return [];
 const names=[entity.labels?.en?.value,entity.sitelinks?.enwiki?.title,...(entity.aliases?.en||[]).map(a=>a.value)];
 if(!names.some(s=>normName(s)===normName(name)))return [];
 const description=String(entity.descriptions?.en?.value||'');
 if(!sportPattern[sport]?.test(description))return [];
 const found=[];
 for(const [platform,prop] of Object.entries(props)){
  const values=new Set();
  for(const statement of entity.claims?.[prop]||[]){
   if(statement.rank==='deprecated'||statement.qualifiers?.P582)continue;
   const h=statement.mainsnak?.datavalue?.value;
   if(typeof h==='string'&&validHandle(platform,h))values.add(h);
  }
  if(values.size!==1)continue; // Do not guess between multiple social identities.
  const username=[...values][0];
  found.push({platform,username,name,sport,entityId:entity.id,
    url:serviceUrl(platform,username),
    evidenceUrl:'https://www.wikidata.org/wiki/'+entity.id,
    identityBasis:'Wikidata '+prop+' for '+name+' ('+description+')'});
 }
 return found;
}

export function socialProfileURL(raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  let platform='',username='';
  if(host==='x.com'||host==='twitter.com'){
   platform='X';username=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]||'';
  }else if(host==='instagram.com'){
   platform='Instagram';username=url.pathname.match(/^\/([A-Za-z0-9_.]{1,30})\/?$/)?.[1]||'';
  }else if(host==='threads.com'||host==='threads.net'){
   platform='Threads';username=url.pathname.match(/^\/@([A-Za-z0-9_.]{1,30})\/?$/)?.[1]||'';
  }
  if(!platform||!validHandle(platform,username))return null;
  if(['instagram','explore','accounts','p','reel','share','stories','privacy','about','home'].includes(username.toLowerCase()))return null;
  return {platform,username,url:serviceUrl(platform,username)};
 }catch{return null}
}

function jsonLdNodes(value){
 if(Array.isArray(value))return value.flatMap(jsonLdNodes);
 if(!value||typeof value!=='object')return [];
 return [value,...jsonLdNodes(value['@graph']||[])];
}
export function officialProfileIdentities(html,name,sport,sourceURL){
 let url;
 try{url=new URL(sourceURL)}catch{return []}
 if(url.protocol!=='https:'||!['ufc.com','www.ufc.com','matchroomboxing.com','www.matchroomboxing.com','toprank.com','www.toprank.com'].includes(url.hostname))return [];
 const heading=String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
 if(!heading||normName(plain(heading[1]))!==normName(name))return [];
 const found=new Map();
 const scripts=String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
 for(const match of scripts){
  let data;
  try{data=JSON.parse(match[1])}catch{continue}
  for(const node of jsonLdNodes(data)){
   const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];
   if(!types.some(t=>/^(Person|Athlete)$/i.test(String(t||'')))||normName(node.name)!==normName(name))continue;
   for(const link of Array.isArray(node.sameAs)?node.sameAs:[node.sameAs]){
    const profile=socialProfileURL(link);
    if(profile)found.set(profile.platform,{...profile,name,sport,
      evidenceUrl:sourceURL,identityBasis:'Official athlete Person JSON-LD on '+sourceURL});
   }
  }
 }
 return [...found.values()];
}

export function registerCandidate(config,roster,candidate,conflicts){
 const platform=candidate.platform,username=candidate.username;
 if(!['X','Instagram','Threads'].includes(platform)||!validHandle(platform,username))return false;
 const fighter=roster.fighters.find(p=>normName(p.name)===normName(candidate.name)&&p.sport===candidate.sport);
 if(!fighter)return false;
 const sources=platform==='Threads'?config.threads.accounts:config.platforms?.[platform]?.accounts;
 if(!Array.isArray(sources))return false;
 const existingByName=sources.find(p=>normName(p.name)===normName(candidate.name)&&p.sport===candidate.sport);
 const existingByHandle=sources.find(p=>p.username?.toLowerCase()===username.toLowerCase());
 if((existingByName&&existingByName.username.toLowerCase()!==username.toLowerCase())||
    (existingByHandle&&normName(existingByHandle.name)!==normName(candidate.name))){
  conflicts.push({name:candidate.name,platform,username,evidenceUrl:candidate.evidenceUrl,
    reason:'Conflicts with an already linked identity; never overwrite automatically'});
  return false;
 }
 fighter.profiles??={};
 if(fighter.profiles[platform]&&!existingByName&&fighter.profiles[platform].username?.toLowerCase()!==username.toLowerCase()){
  conflicts.push({name:candidate.name,platform,username,evidenceUrl:candidate.evidenceUrl,
    reason:'Roster profile conflicts with candidate'});
  return false;
 }
 if(!existingByName){
  sources.push({username,name:candidate.name,sport:candidate.sport,role:'fighter',
    fighterTier:fighter.tier,identityBasis:candidate.identityBasis,evidenceUrl:candidate.evidenceUrl});
 }
 if(!fighter.profiles[platform]){
  fighter.profiles[platform]={username,url:serviceUrl(platform,username),identityBasis:candidate.identityBasis};
 }
 fighter.status='tracked';
 if(platform==='Threads'&&!config.threads.allowlistedUsernames.some(h=>h.toLowerCase()===username.toLowerCase())){
  config.threads.allowlistedUsernames.push(username);
 }
 return !existingByName;
}
export function rosterCounts(roster){
 const tracked=roster.fighters.filter(p=>Object.values(p.profiles||{}).some(Boolean));
 return {total:roster.fighters.length,tracked:tracked.length,missingBoth:roster.fighters.length-tracked.length,
   withX:roster.fighters.filter(p=>p.profiles?.X).length,
   withInstagram:roster.fighters.filter(p=>p.profiles?.Instagram).length,
   withThreads:roster.fighters.filter(p=>p.profiles?.Threads).length};
}
async function get(url,timeout=11000){
 const response=await fetch(url,{headers:{'User-Agent':'BlackEyeFightNews/1.0 (public fighter profile metadata aggregator; contact via GitHub repo)','Accept':'application/json, text/html;q=0.9'},signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error('HTTP '+response.status+' '+new URL(url).hostname);
 return response;
}
async function wikiBatchByTitle(names){
 const params=new URLSearchParams({action:'wbgetentities',sites:'enwiki',titles:names.join('|'),
   props:'labels|descriptions|aliases|claims|sitelinks',languages:'en',format:'json',formatversion:'2'});
 const r=await get(api+'?'+params,20000);
 return (await r.json()).entities||{};
}
async function wikiSearch(name){
 const args=new URLSearchParams({action:'wbsearchentities',search:name,language:'en',limit:'5',format:'json'});
 const data=await (await get(api+'?'+args)).json();
 return (data.search||[]).filter(x=>normName(x.label)===normName(name)).map(x=>x.id).filter(id=>/^Q\d+$/.test(id)).slice(0,3);
}
async function wikiById(ids){
 if(!ids.length)return {};
 const p=new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|aliases|claims|sitelinks',languages:'en',format:'json',formatversion:'2'});
 return (await (await get(api+'?'+p,20000)).json()).entities||{};
}
function officialSlug(name){
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
async function discoverOfficial(fighter){
 const slug=officialSlug(fighter.name);
 const urls=fighter.sport==='mma'?['https://www.ufc.com/athlete/'+slug]:
   ['https://www.matchroomboxing.com/boxers/'+slug+'/','https://www.toprank.com/all-fighters/'+slug+'/'];
 for(const url of urls){
  try{
   const response=await get(url,9500);
   const type=response.headers.get('content-type')||'';
   if(!type.includes('text/html'))continue;
   const html=(await response.text()).slice(0,950000);
   const matches=officialProfileIdentities(html,fighter.name,fighter.sport,url);
   if(matches.length)return matches;
  }catch{}
 }
 return [];
}
export async function main(){
 const sourceFile='data/fight-talk-sources.json',rosterFile='data/fight-talk-roster.json';
 const reportFile='data/fight-talk-profile-discovery.json';
 const config=readJson(sourceFile),roster=readJson(rosterFile);
 config.threads??={};
 config.threads.accounts??=[];
 config.threads.allowlistedUsernames??=[];
 for(const f of roster.fighters)f.profiles??={};
 const previous=fs.existsSync(reportFile)?readJson(reportFile):{};
 const problems=[],conflicts=[],candidates=[];
 const records=[...roster.fighters];
 let wikiBatches=0,officialChecked=0,searchChecked=0;
 // Bulk lookup of exact Wikipedia titles gives wide coverage with fewer calls.
 for(let i=0;i<records.length;i+=25){
  try{
   const data=await wikiBatchByTitle(records.slice(i,i+25).map(f=>f.name));
   wikiBatches++;
   for(const entity of Object.values(data)){
    for(const f of records){
     if((f.profiles?.X&&f.profiles?.Instagram&&f.profiles?.Threads))continue;
     const matching=wikidataIdentity(entity,f.name,f.sport);
     candidates.push(...matching);
    }
   }
  }catch(err){problems.push('Wikidata batch '+i+': '+String(err.message||err).slice(0,100))}
 }
 // Search Wikidata names with nonstandard Wikipedia titles, rotating every run.
 const missing=records.filter(f=>Object.values(f.profiles||{}).every(x=>!x));
 const searchStart=previous.nextSearchOffset||0;
 const searchSubset=Array.from({length:Math.min(45,missing.length)},(_,i)=>missing[(searchStart+i)%missing.length]);
 const ids=new Map();
 let cursor=0;
 async function searchWorker(){
  while(cursor<searchSubset.length){
   const f=searchSubset[cursor++];
   try{for(const id of await wikiSearch(f.name))ids.set(id,true);searchChecked++}
   catch(e){if(problems.length<12)problems.push('Search '+f.name+': '+String(e.message||e).slice(0,85))}
  }
 }
 await Promise.all(Array.from({length:3},searchWorker));
 const idList=[...ids.keys()];
 for(let i=0;i<idList.length;i+=25){
  try{
   const found=await wikiById(idList.slice(i,i+25));
   for(const f of searchSubset)for(const entity of Object.values(found)){
    candidates.push(...wikidataIdentity(entity,f.name,f.sport));
   }
  }catch(e){problems.push('Wikidata ID lookup: '+String(e.message||e).slice(0,100))}
 }
 // Official sites are checked for structured Person.sameAs only, never
 // guessed usernames or indiscriminate footer links. Rotate the uncovered
 // roster so the daily schedule eventually investigates every athlete.
 const officialMissing=records.filter(f=>Object.values(f.profiles||{}).every(x=>!x));
 const officialStart=previous.nextOfficialOffset||0;
 const officialSubset=Array.from({length:Math.min(50,officialMissing.length)},(_,i)=>officialMissing[(officialStart+i)%officialMissing.length]);
 let pos=0;
 async function officialWorker(){
  while(pos<officialSubset.length){
   const f=officialSubset[pos++];
   try{candidates.push(...await discoverOfficial(f));officialChecked++}
   catch(e){if(problems.length<12)problems.push('Official '+f.name+': '+String(e.message||e).slice(0,100))}
  }
 }
 await Promise.all(Array.from({length:4},officialWorker));
 let added=0;
 const seen=new Set();
 for(const c of candidates){
  const key=c.platform+':'+normName(c.name)+':'+c.username.toLowerCase();
  if(seen.has(key))continue;
  seen.add(key);
  if(registerCandidate(config,roster,c,conflicts))added++;
 }
 roster.revisedAt=new Date().toISOString().slice(0,10);
 roster.counts=rosterCounts(roster);
 writeJson(sourceFile,config);
 writeJson(rosterFile,roster);
 writeJson(reportFile,{checkedAt:new Date().toISOString(),source:'Wikidata P2002/P2003/P11892 + official athlete structured links',
  discoveredThisRun:added,candidatesChecked:seen.size,wikiBatches,searchChecked,officialChecked,
  counts:roster.counts,conflicts:conflicts.slice(0,70),errors:problems.slice(0,20),
  nextSearchOffset:missing.length?(searchStart+searchSubset.length)%missing.length:0,
  nextOfficialOffset:officialMissing.length?(officialStart+officialSubset.length)%officialMissing.length:0,
  note:'Profile metadata discovery is not a social timeline feed. Original post collection still depends on public publisher-linked posts or permitted platform APIs. Missing names are not guessed.'});
 console.log(JSON.stringify({added,counts:roster.counts,wikiBatches,searchChecked,officialChecked,errors:problems.slice(0,4)},null,2));
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)await main();
