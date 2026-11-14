/**
 * Low-rate public-field verifier against JSA official Rikishi Profile pages.
 * No photos, no redistribution of JSA page content, no career certificates.
 * Uses an immutable public-field snapshot and source identity checks only.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const ROOT='data/sumo/backfill/v1/jsa-public';
const MAX_REQUESTS=Math.min(8,Math.max(1,Number(process.env.SUMO_JSA_REQUESTS_PER_RUN||6)));
const INTERVAL_MS=Math.max(1200,Number(process.env.SUMO_JSA_INTERVAL_MS||2000));
const WAIT_MS=10000;
const now=()=>new Date().toISOString();
const load=async (p,def=null)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return def;throw e;}};
const put=async (p,v)=>{await mkdir(ROOT,{recursive:true});await mkdir(join(ROOT,'profiles'),{recursive:true});const tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(v,null,2)+'\n');await rename(tmp,p);};
const decode=s=>s.replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
export function htmlToPublicText(html){
 if(typeof html!=='string')throw Error('Expected HTML source');
 return decode(html.replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/\s+/g,' ').trim());
}
const short=v=>typeof v==='string'?v.trim().slice(0,160):null;
export function parseOfficialProfile(html,roster){
 const text=htmlToPublicText(html);
 const career=text.match(/\bCareer\s+Record\s*:\s*(\d{1,5})\s*-\s*(\d{1,5})\s*-\s*(\d{1,5})/i);
 const beforeCareer=text.indexOf('Career Record:');
 const basic=text.slice(Math.max(0,text.indexOf('Rikishi Profile')),beforeCareer>=0?beforeCareer:2000);
 const num=(label,unit)=>{const m=basic.match(new RegExp('\\b'+label+'\\s+([0-9]+(?:\\.[0-9]+)?)\\s*'+unit,'i'));return m?Number(m[1]):null;};
 const nameMatch=basic.match(/\bRikishi Profile\s+Basic Information\s+(.+?)\s+Stable\s+/i);
 const stableMatch=basic.match(/\bStable\s+([A-Za-z][A-Za-z' -]{1,40}?)\s+(?:Name|Ring Name|Current Rank)\s+/i);
 const rankMatch=basic.match(/\bCurrent Rank\s+(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)(?:\s+#?\s*(\d{1,3}))?/i);
 const asOf=text.match(/\bas\s+of\s+([A-Za-z]+\s+\d{4})\s*:\s*Day\s*(\d{1,2})/i);
 const announcedName=short(nameMatch?.[1]);
 const expectedName=String(roster.shikonaEn||'');
 const nameMatchOk=announcedName!=null&&announcedName.toLowerCase().startsWith(expectedName.toLowerCase());
 const rank=rankMatch?{division:rankMatch[1],position:rankMatch[2]==null?null:Number(rankMatch[2])}:null;
 const expected=String(roster.currentRank||'').match(/^([A-Za-z-]+)\s+(\d+)\s+(East|West)$/i);
 const comparisons={
  name: nameMatchOk,
  stable: stableMatch?.[1]!=null?stableMatch[1].trim()===roster.heya:null,
  rankGrade:rank&&expected?rank.division.toLowerCase()===expected[1].toLowerCase()&&
    (rank.position===null||rank.position===Number(expected[2])):null,
  height: num('Height','cm')!=null?num('Height','cm')===Number(roster.heightCm):null,
  weight: num('Weight','kg')!=null?num('Weight','kg')===Number(roster.weightKg):null
 };
 const completeness=!!career&&!!rank&&!!stableMatch&&num('Height','cm')!=null&&num('Weight','kg')!=null;
 return {
  schemaVersion:1,parserVersion:2,source:'Japan Sumo Association official public Rikishi Profile',
  sourceId:roster.sourceId,officialNskId:roster.officialNskId,
  url:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+roster.officialNskId+'/',
  profileName:announcedName,stable:short(stableMatch?.[1]),rank,heightCm:num('Height','cm'),
  weightKg:num('Weight','kg'),
  career:career?{wins:Number(career[1]),losses:Number(career[2]),absences:Number(career[3])}:null,
  officialAsOf:asOf?{monthYear:asOf[1],day:Number(asOf[2])}:null,
  fieldComparisons:comparisons,
  status:!nameMatchOk?'identity-review':!completeness?'parse-review':
    Object.values(comparisons).some(v=>v===false)?'field-disagreement':'basic-fields-parsed',
  certification:'not-started',
  notice:'Basic current public fields only. Does NOT verify complete historical bouts, official historical weigh-ins, image rights, or career certification.'
 };
}
async function main(){
 const roster=await load('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)throw Error('Frozen 190-rikishi cohort mismatch');
 const metaPath=join(ROOT,'summary.json'),prior=await load(metaPath,{});
 if(prior.nextAllowedAt&&Date.parse(prior.nextAllowedAt)>Date.now()){
  console.log(JSON.stringify({status:'official-source-cooldown',nextAllowedAt:prior.nextAllowedAt}));
  return;
 }
 const cases=roster.rikishi.filter(w=>w.officialNskId).sort((a,b)=>a.sourceId-b.sourceId);
 let requested=0,succeeded=0,review=0,reason=null,nextAllowedAt=null;
 for(const w of cases){
  if(requested>=MAX_REQUESTS)break;
  const path=join(ROOT,'profiles',w.sourceId+'.json');
  const cached=await load(path);
  if(cached&&(cached.status==='basic-fields-parsed'||cached.parserVersion>=2))continue;
  requested++;
  const url='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/';
  try{
   const resp=await fetch(url,{headers:{Accept:'text/html','User-Agent':'BlackEyeFightNews/1.0 (public profile fact checking)'},signal:AbortSignal.timeout(WAIT_MS)});
   if(!resp.ok){
    reason='JSA HTTP '+resp.status;
    nextAllowedAt=new Date(Date.now()+(resp.status===429||resp.status===403?12*3600_000:3600_000)).toISOString();
    break;
   }
   const html=await resp.text();
   if(html.length<500||html.length>2_000_000)throw Error('Unexpected official HTML response length');
   const doc=parseOfficialProfile(html,w);
   doc.capturedAt=now();
   doc.rawHtmlSha256=createHash('sha256').update(html).digest('hex');
   await put(path,doc);
   if(doc.status==='basic-fields-parsed')succeeded++;else review++;
   await new Promise(r=>setTimeout(r,INTERVAL_MS));
  }catch(e){
   reason='JSA source fetch/parse unavailable: '+String(e.message||e).slice(0,140);
   nextAllowedAt=new Date(Date.now()+3600_000).toISOString();
   break;
  }
 }
 let done=0,matched=0,exceptions=0;
 for(const w of cases){
  const d=await load(join(ROOT,'profiles',w.sourceId+'.json'));
  if(d){done++;if(d.status==='basic-fields-parsed')matched++;else exceptions++;}
 }
 const summary={schemaVersion:1,scope:'JSA public profile field snapshots; NOT career certifications',
  cohort:190,checked:done,parsedFields:matched,fieldOrParsingReview:exceptions,
  pending:190-done,lastRunAt:now(),requestsThisRun:requested,goodThisRun:succeeded,
  reviewThisRun:review,stoppedReason:reason,nextAllowedAt,certified:0,
  photoUseRights:'not obtained or inferred'};
 await put(metaPath,summary);
 console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 main().catch(e=>{console.error(e);process.exitCode=1;});
}
