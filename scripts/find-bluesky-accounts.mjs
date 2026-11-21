/**
 * Finder for Bluesky accounts of roster fighters (owner chose automatic adding, 21 Nov 2026).
 * Verified accounts are added to data/fight-talk-sources.json automatically; name-only
 * matches are only listed in data/bluesky-candidates.json and are never collected.
 * At most MAX_NEW_PER_RUN accounts are added per run as a safety limit.
 *
 * An account counts as a verified candidate ONLY when the public Bluesky profile
 * (1) shows the fighter's exact name and (2) names an account we already hold for
 * that fighter on X or Instagram (a link or @handle in the profile text).
 * A name match alone is listed as "name-only" and is never marked as acceptable.
 * Fighters with no known X or Instagram account cannot be verified and are skipped.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const compact=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

export function knownUsernames(fighter){
 return Object.entries(fighter.profiles||{})
  .filter(([platform,p])=>['X','Instagram'].includes(platform)&&p?.username)
  .map(([platform,p])=>({platform,username:String(p.username).replace(/^@/,'')}))
  .filter(x=>x.username.length>=4);
}

const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function evaluateCandidate(fighter,actor){
 const nameMatch=compact(actor.displayName)===compact(fighter.name);
 if(!nameMatch)return {status:'rejected',reason:'display name differs'};
 const text=String(actor.description||'').toLowerCase();
 const hit=knownUsernames(fighter).find(({platform,username})=>{
  const u=esc(username.toLowerCase());
  const host=platform==='X'?'(?:x\\.com|twitter\\.com)':'instagram\\.com';
  return new RegExp(host+'/@?'+u+'(?![a-z0-9_.])').test(text)||new RegExp('(?:^|[^a-z0-9_])@'+u+'(?![a-z0-9_.])').test(text);
 });
 if(hit)return {status:'verified-candidate',basis:'Bluesky profile text names the fighter\'s '+hit.platform+' account @'+hit.username};
 return {status:'name-only',reason:'name matches but the profile does not name a known account; needs manual review'};
}

export const MAX_NEW_PER_RUN=25;

export function sourceEntry(row,fighter){
 return {handle:row.handle,did:row.did,sport:fighter.sport,role:'fighter',fighterTier:fighter.tier||undefined,name:fighter.name,identityBasis:row.basis};
}

const headers={'accept':'application/json','user-agent':'BEFN-account-finder (personal non-commercial site)'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));

async function search(name){
 const url='https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?limit=5&q='+encodeURIComponent(name);
 const res=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error('HTTP '+res.status);
 return (await res.json()).actors||[];
}

async function main(){
 const roster=JSON.parse(fs.readFileSync('data/fight-talk-roster.json','utf8')).fighters;
 const sources=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8')).sources||[];
 const held=new Set(sources.map(s=>s.did));
 const configPath='data/fight-talk-sources.json';
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 let added=0;
 const out={checkedAt:new Date().toISOString(),rule:'Name matches exactly AND the profile text names a known X/Instagram account of the fighter. Verified accounts are added to the collection automatically (max '+MAX_NEW_PER_RUN+' per run); name-only matches are never collected.',verified:[],nameOnly:[],skipped:0,failed:0};
 for(const f of roster){
  if(!knownUsernames(f).length){out.skipped++;continue}
  try{
   const actors=await search(f.name);
   for(const a of actors){
    if(held.has(a.did))continue;
    const r=evaluateCandidate(f,a);
    const row={fighter:f.name,sport:f.sport,handle:a.handle,did:a.did,displayName:a.displayName};
    if(r.status==='verified-candidate'){
     out.verified.push({...row,basis:r.basis});
     if(added<MAX_NEW_PER_RUN&&!held.has(a.did)){config.sources.push(sourceEntry({...row,basis:r.basis},f));held.add(a.did);added++}
    }
    else if(r.status==='name-only')out.nameOnly.push({...row,note:r.reason});
   }
  }catch(err){out.failed++}
  await pause(200);
 }
 out.added=added;
 if(added)fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
 fs.writeFileSync('data/bluesky-candidates.json',JSON.stringify(out,null,2)+'\n');
 console.log('Bluesky candidates:',out.verified.length,'verified,',out.nameOnly.length,'name-only,',added,'added to the collection,',out.skipped,'skipped (no known account),',out.failed,'failed searches');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main();
