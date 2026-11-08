import fs from 'node:fs';

/**
 * Independent public-profile discovery. Wikidata identifiers:
 * P2002 = X, P2003 = Instagram, P11892 = Threads.
 * Unlike restricted timeline APIs this requires no user's social tokens.
 */
export const PROPERTIES={X:'P2002',Instagram:'P2003',Threads:'P11892'};
export const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
const validHandle=(platform,s)=>typeof s==='string'&&(platform==='X'?/^[A-Za-z0-9_]{1,15}$/.test(s):/^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(s));
function relevant(description,person){
 const d=String(description||'').toLowerCase();
 if(person.role==='promoter')return /\b(boxing|mixed martial arts|mma|wrestling|combat sports|promoter|promotion|sports organization|sports organisation)\b/i.test(d);
 if(person.sport==='boxing')return /\b(boxer|boxing|pugilist)\b/i.test(d);
 if(person.sport==='mma')return /\b(mixed martial artist|mixed martial arts|mma fighter|ufc fighter|martial artist)\b/i.test(d);
 if(person.sport==='grappling')return /\b(wrestler|wrestling|grappler|grappling|jiu.jitsu|judoka)\b/i.test(d);
 return false;
}
export function matchPerson(person,search,entities){
 const possibilities=[];
 for(const hit of (search?.search||[]).slice(0,8)){
  if(!/^Q\d+$/.test(hit.id||''))continue;
  const e=entities?.[hit.id];
  if(!e||e.missing!==undefined)continue;
  const names=[hit.label,e.labels?.en?.value,...(e.aliases?.en||[]).map(a=>a.value)];
  if(!names.some(n=>norm(n)===norm(person.name)))continue;
  const description=e.descriptions?.en?.value||hit.description||'';
  if(!relevant(description,person))continue;
  const profiles={};
  for(const [platform,property] of Object.entries(PROPERTIES)){
   const claims=e.claims?.[property]||[];
   const claim=claims.find(c=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value'&&!c.qualifiers?.P582&&validHandle(platform,c.mainsnak?.datavalue?.value));
   if(!claim)continue;
   const username=claim.mainsnak.datavalue.value;
   profiles[platform]={username,qid:hit.id,
    url:(platform==='X'?'https://x.com/':platform==='Instagram'?'https://www.instagram.com/':'https://www.threads.com/@')+username+(platform==='Instagram'?'/':''),
    identityBasis:'Wikidata '+hit.id+' '+property+' ('+description+'); public directory match, platform-author check still required'};
  }
  if(Object.keys(profiles).length)possibilities.push({qid:hit.id,profiles});
 }
 return possibilities.length===1?possibilities[0]:null;
}
async function api(p){
 const endpoint='https://www.wikidata.org/w/api.php?'+new URLSearchParams({format:'json',formatversion:'2',...p});
 const res=await fetch(endpoint,{headers:{'User-Agent':'BlackEyeFightNews/1.0 (public combat-sports profile research; GitHub repo Black-Eye-Fight-News)','Accept':'application/json'},signal:AbortSignal.timeout(14000)});
 if(!res.ok)throw Error('Wikidata API '+res.status);
 return res.json();
}
async function discover(person){
 const search=await api({action:'wbsearchentities',language:'en',search:person.name,limit:'8'});
 const ids=(search.search||[]).map(x=>x.id).filter(s=>/^Q\d+$/.test(s)).slice(0,8);
 if(!ids.length)return {state:'no-results'};
 const records=await api({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|aliases|claims',languages:'en'});
 const match=matchPerson(person,search,records.entities||{});
 return match?{state:'matched',...match}:{state:'no-clear-identity'};
}
export function enroll(person,match,config,roster){
 const registered=[],conflicts=[];
 for(const [platform,p] of Object.entries(match.profiles||{})){
  config.platforms||={};
  const group=config.platforms[platform]||(config.platforms[platform]={accounts:[]});
  group.accounts||=[];
  const existingName=group.accounts.find(a=>norm(a.name)===norm(person.name));
  const existingHandle=group.accounts.find(a=>a.username?.toLowerCase()===p.username.toLowerCase());
  if((existingName&&existingName.username.toLowerCase()!==p.username.toLowerCase())||
     (existingHandle&&norm(existingHandle.name)!==norm(person.name))){
   conflicts.push(platform+':'+p.username);continue;
  }
  if(!existingHandle){
   group.accounts.push({name:person.name,username:p.username,sport:person.sport,role:person.role||'fighter',fighterTier:person.tier,
    identityBasis:p.identityBasis,identityConfidence:'public-directory'});
   registered.push(platform+':'+p.username);
  }
  const fighter=(roster.fighters||[]).find(x=>norm(x.name)===norm(person.name));
  if(fighter){
   fighter.profiles||={};
   if(!fighter.profiles[platform])fighter.profiles[platform]={username:p.username,url:p.url,identityBasis:p.identityBasis};
   if(Object.values(fighter.profiles).some(Boolean))fighter.status='tracked';
  }
  if(platform==='Threads'){
   config.threads||={};
   const handles=config.threads.allowlistedUsernames||(config.threads.allowlistedUsernames=[]);
   if(!handles.some(h=>h.toLowerCase()===p.username.toLowerCase()))handles.push(p.username);
  }
 }
 return {registered,conflicts};
}
export function counts(roster){
 const f=roster.fighters||[];
 return {total:f.length,tracked:f.filter(x=>x.status==='tracked').length,missingBoth:f.filter(x=>x.status!=='tracked').length,
 withX:f.filter(x=>x.profiles?.X).length,withInstagram:f.filter(x=>x.profiles?.Instagram).length,withThreads:f.filter(x=>x.profiles?.Threads).length};
}
async function main(){
 const rosterFile='data/fight-talk-roster.json',sourcesFile='data/fight-talk-sources.json',file='data/fight-talk-profile-discovery.json';
 const roster=JSON.parse(fs.readFileSync(rosterFile,'utf8'));
 const config=JSON.parse(fs.readFileSync(sourcesFile,'utf8'));
 let progress={cursor:0,profiles:{}};
 try{progress=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
 const people=new Map();
 for(const f of roster.fighters)people.set(norm(f.name),f);
 for(const p of [...(config.platforms.Instagram?.accounts||[]),...(config.platforms.X?.accounts||[])].filter(x=>x.role==='promoter')){
  if(!people.has(norm(p.name)))people.set(norm(p.name),{name:p.name,sport:p.sport,role:'promoter'});
 }
 const list=[...people.values()].sort((a,b)=>a.name.localeCompare(b.name));
 if(!list.length)throw Error('No combat-sports roster available');
 const batch=Math.min(20,list.length),cursor=(Number.isInteger(progress.cursor)?progress.cursor:0)%list.length;
 const selected=Array.from({length:batch},(_,i)=>list[(cursor+i)%list.length]);
 const records=progress.profiles||{};
 const checkedAt=new Date().toISOString();
 let index=0,checked=0,matched=0,added=0,errors=0,review=0;
 async function worker(){
  while(index<selected.length){
   const person=selected[index++],key=norm(person.name);
   try{
    const found=await discover(person);checked++;
    if(found.state==='matched'){
     matched++;
     const result=enroll(person,found,config,roster);
     added+=result.registered.length;review+=result.conflicts.length;
     records[key]={name:person.name,checkedAt,qid:found.qid,state:result.conflicts.length?'needs-review':'matched',
      profiles:found.profiles,conflicts:result.conflicts};
    }else records[key]={name:person.name,checkedAt,state:found.state};
   }catch(e){errors++;records[key]={...records[key],name:person.name,errorCheckedAt:checkedAt,error:String(e.message||e).slice(0,120)};}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,batch)},()=>worker()));
 roster.counts=counts(roster);
 roster.revisedAt=checkedAt.slice(0,10);
 progress={schema:1,lastCheckedAt:checkedAt,cursor:(cursor+(checked?batch:0))%list.length,
 rosterSize:list.length,batch,checked,matched,added,needsReview:review,errors,profiles:records,
 note:'Automated public-account discovery, not unrestricted timeline reads. No synthetic original posts.'};
 fs.writeFileSync(file,JSON.stringify(progress,null,2)+'\n');
 fs.writeFileSync(rosterFile,JSON.stringify(roster,null,2)+'\n');
 fs.writeFileSync(sourcesFile,JSON.stringify(config,null,2)+'\n');
 console.log('Profile discovery checked '+checked+' of '+batch+'; matched '+matched+'; added '+added+'; conflicts '+review+'; API failures '+errors);
 if(!checked&&errors)process.exitCode=1;
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)await main();
