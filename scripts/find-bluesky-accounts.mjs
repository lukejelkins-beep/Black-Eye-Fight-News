/**
 * Report-only finder for Bluesky accounts of roster fighters.
 * Writes data/bluesky-candidates.json for the owner to review. It never edits
 * data/fight-talk-sources.json, so nothing is collected until a list is approved.
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
 const out={checkedAt:new Date().toISOString(),rule:'Name matches exactly AND the profile text names a known X/Instagram account of the fighter. Report only; nothing is collected until approved.',verified:[],nameOnly:[],skipped:0,failed:0};
 for(const f of roster){
  if(!knownUsernames(f).length){out.skipped++;continue}
  try{
   const actors=await search(f.name);
   for(const a of actors){
    if(held.has(a.did))continue;
    const r=evaluateCandidate(f,a);
    const row={fighter:f.name,sport:f.sport,handle:a.handle,did:a.did,displayName:a.displayName};
    if(r.status==='verified-candidate')out.verified.push({...row,basis:r.basis});
    else if(r.status==='name-only')out.nameOnly.push({...row,note:r.reason});
   }
  }catch(err){out.failed++}
  await pause(200);
 }
 fs.writeFileSync('data/bluesky-candidates.json',JSON.stringify(out,null,2)+'\n');
 console.log('Bluesky candidates:',out.verified.length,'verified,',out.nameOnly.length,'name-only,',out.skipped,'skipped (no known account),',out.failed,'failed searches');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main();
