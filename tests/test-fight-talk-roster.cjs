const assert=require('node:assert/strict');
const fs=require('node:fs');
const cfg=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8'));
const roster=JSON.parse(fs.readFileSync('data/fight-talk-roster.json','utf8'));
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
assert(roster.fighters.length>=215,'Track the full champion, contender and prospect roster');
assert.equal(roster.counts.total,roster.fighters.length);
assert.equal(roster.counts.tracked,roster.fighters.filter(p=>p.status==='tracked').length);
for(const platform of ['X','Instagram']){
 const seen=new Set();
 for(const p of cfg.platforms[platform].accounts){
  assert(p.name&&p.sport&&['fighter','promoter','manager','trainer','team','media','meme'].includes(p.role));
  assert(typeof p.identityBasis==='string'&&p.identityBasis.length>=20,'Account needs an identity evidence record');
  assert(platform==='X'?/^[a-z0-9_]{1,15}$/i.test(p.username):/^[a-z0-9_.]{2,30}$/i.test(p.username));
  assert(!seen.has(p.username.toLowerCase()),'Duplicate '+platform+' username: '+p.username);
  seen.add(p.username.toLowerCase());
 }
 for(const r of roster.fighters){
  const p=r.profiles[platform];
  if(p){
   assert(p.identityBasis&&p.username);
   assert(cfg.platforms[platform].accounts.some(x=>norm(x.name)===norm(r.name)&&x.username.toLowerCase()===p.username.toLowerCase()),'Missing configured account '+r.name);
  }
 }
}
console.log('Fight Talk roster and social account evidence checks passed.');

const memeSources=[...cfg.platforms.Instagram.accounts,...cfg.platforms.X.accounts,...cfg.threads.accounts].filter(p=>p.role==='meme');
assert(memeSources.length>=10,'Keep a verified MMA/boxing meme-page pool');
for(const meme of memeSources){
 assert(['boxing','mma','grappling'].includes(meme.sport));
 assert(meme.identityBasis?.length>=20&&/^https:\/\//.test(meme.evidenceUrl||''),'Meme pages must have identity evidence');
 assert(meme.profileUrl?.startsWith('https://'),'Meme pages need an original public account link');
}
console.log('Meme profile identity registry passed:',memeSources.length);
