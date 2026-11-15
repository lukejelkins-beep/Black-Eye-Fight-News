/**
 * Low-rate public-field verifier against JSA official Rikishi Profile pages.
 * No photos, no redistribution of JSA page content, no career certificates.
 * Uses an immutable public-field snapshot and source identity checks only.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const ROOT='data/sumo/backfill/v1/jsa-public';
// Bounded one-time rank rechecks: 16 per run with >=2s between public JSA requests.
// Stop immediately on 403/429 or any unexpected response and honour the saved cooldown.
const MAX_REQUESTS=Math.min(16,Math.max(1,Number(process.env.SUMO_JSA_REQUESTS_PER_RUN||8)));
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

const MONTH_INDEX={January:'01',March:'03',May:'05',July:'07',September:'09',November:'11'};
/** Parse official tournament-level W-L records, never individual results from icons. */
export function parseJsaBashoResults(html){
 const plain=htmlToPublicText(html);
 const sectionIndex=plain.indexOf('Tournament Records');
 if(sectionIndex<0)return [];
 const section=plain.slice(sectionIndex+'Tournament Records'.length);
 const dateRx=/\b((?:18|19|20)\d{2})\s+(January|March|May|July|September|November)\b/g;
 const dates=[...section.matchAll(dateRx)];
 const results=[];
 const unique=new Set();
 for(let i=0;i<dates.length;i++){
  const m=dates[i],id=m[1]+MONTH_INDEX[m[2]];
  if(unique.has(id))continue;
  // A tournament result immediately follows that tournament's rank and
  // shikona. Do not search unbounded content into a later tournament.
  const end=dates[i+1]?.index??section.length;
  const segment=section.slice(m.index+m[0].length,Math.min(end,m.index+m[0].length+220));
  const result=segment.match(/\b(\d{1,2})\s*-\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?(?![\d-])/);
  if(!result)continue;
  const wins=Number(result[1]),losses=Number(result[2]);
  const absences=result[3]==null?null:Number(result[3]);
  if(wins>15||losses>15||absences!=null&&absences>15)continue;
  results.push({bashoId:id,wins,losses,absences,
    source:'JSA official Rikishi Profile tournament results'});
  unique.add(id);
 }
 return results.sort((a,b)=>a.bashoId.localeCompare(b.bashoId));
}
/**
 * Read only explicit tournament-dated rank strings from the public JSA page.
 * Current banner rank is not a historical rank. Missing positions are null,
 * never generated from an approximate rank or a neighbouring tournament.
 */
export function parseJsaBashoRanks(html){
 const text=htmlToPublicText(html);
 const i=text.indexOf('Tournament Records');
 if(i<0)return [];
 const section=text.slice(i+'Tournament Records'.length);
 const dateRx=/\b((?:18|19|20)\d{2})\s+(January|March|May|July|September|November)\b/g;
 const dates=[...section.matchAll(dateRx)],byBasho=new Map();
 for(let j=0;j<dates.length;j++){
  const d=dates[j],bashoId=d[1]+MONTH_INDEX[d[2]];
  const end=dates[j+1]?.index??section.length;
  const content=section.slice(d.index+d[0].length,Math.min(end,d.index+d[0].length+220));
  const m=content.match(/\b(East|West)\s+(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)(?:\s*#\s*(\d{1,3}))?\b/i);
  if(!m)continue;
  const position=m[3]!=null?Number(m[3]):null;
  if(position!=null&&(position<1||position>120))continue;
  const row={bashoId,division:m[2],side:m[1],position,
    rank:m[2]+(position!=null?' '+position:'')+' '+m[1],
    source:'JSA tournament banzuke rank'};
  const prior=byBasho.get(bashoId);
  if(prior&&(prior.rank!==row.rank))throw Error('Contradictory official rank for '+bashoId);
  byBasho.set(bashoId,row);
 }
 return [...byBasho.values()].sort((a,b)=>a.bashoId.localeCompare(b.bashoId));
}
/** Check exact rank where possible; grade and side only for unnumbered sanyaku. */
export function reconcileJsaBashoRanks(officialRows,source){
 const ranks=new Map();
 for(const r of source?.data?.ranks||[]){
  if(/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(r.bashoId||'')))
   ranks.set(String(r.bashoId),String(r.rank||''));
 }
 const compared=[],unavailable=[];
 const rx=/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\s+(\d+)\s+(East|West)$/i;
 for(const official of officialRows||[]){
  const stored=ranks.get(official.bashoId);
  if(!stored){unavailable.push(official.bashoId);continue;}
  const got=stored.match(rx);
  if(!got){unavailable.push(official.bashoId);continue;}
  const match=official.division.toLowerCase()===got[1].toLowerCase()&&
    official.side.toLowerCase()===got[3].toLowerCase()&&
    (official.position===null||official.position===Number(got[2]));
  compared.push({bashoId:official.bashoId,officialRank:official.rank,
    sourceRank:stored,status:match?'agree':'review'});
 }
 return {officialRankRows:officialRows?.length||0,
  comparedBasho:compared.length,
  agreedBasho:compared.filter(x=>x.status==='agree').length,
  mismatches:compared.filter(x=>x.status==='review'),
  missingSourceRankBasho:unavailable,
  certification:'not-started',
  note:'Public JSA banzuke rank comparison is independent QA, not final career certification.'};
}
/** Compare the same completed tournament against the complete source bout ledger. */
export function cohortCurrentBasho(roster){
 const raw=roster?.collectedAt;
 const time=raw?new Date(raw):null;
 if(!time||!Number.isFinite(time.getTime()))return null;
 const date=new Intl.DateTimeFormat('en-US',{
   year:'numeric',month:'2-digit',timeZone:'Asia/Tokyo'
 }).formatToParts(time);
 const year=date.find(x=>x.type==='year')?.value;
 const month=date.find(x=>x.type==='month')?.value;
 const basho=year+month;
 return /^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(basho)?basho:null;
}
/** Exclude the in-progress tournament even when JSA omits a Career Record/as-of line. */
export function reconcileJsaBashoResults(officialRows,source,asOf,activeBashoId=null){
 const known=Array.isArray(officialRows)?officialRows:[];
 const officialAsOf=asOf?.monthYear?(()=>{
  const m=String(asOf.monthYear).match(/^([A-Za-z]+)\s+(\d{4})$/);
  return m&&MONTH_INDEX[m[1]]?m[2]+MONTH_INDEX[m[1]]:null;
 })():null;
 const cohortBasho=/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(activeBashoId))?
   String(activeBashoId):null;
 // Without a published as-of month or known frozen cohort month, omit the
 // latest official row conservatively; it may represent an ongoing basho.
 const latestOfficial=known.map(x=>String(x.bashoId||''))
   .filter(x=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(x)).sort().at(-1)||null;
 const completedMonth=officialAsOf||cohortBasho||latestOfficial;
 const exclusionBasis=officialAsOf?'official-as-of':
   cohortBasho?'frozen-cohort-basho':
   latestOfficial?'conservative-latest-source-basho':'none';
 const matches=source?.data?.matches||[];
 const id=Number(source?.rikishiId);
 const groups=new Map();
 for(const m of matches){
  if(m.division==='Mae-zumo'||Number(m.day)>15||Number(m.day)<1)continue;
  const bid=String(m.bashoId||'');
  if(!groups.has(bid))groups.set(bid,{wins:0,losses:0});
  const x=groups.get(bid);
  if(Number(m.winnerId)===id)x.wins++;
  else if(Number.isSafeInteger(Number(m.winnerId))&&Number(m.winnerId)>0)x.losses++;
 }
 const compared=[],unavailable=[];
 for(const o of known){
  // The current basho can be mid-tournament and JSA / API may represent
  // different completed-day cutoffs. Never mistake this for an old discrepancy.
  if(completedMonth&&o.bashoId>=completedMonth)continue;
  const got=groups.get(o.bashoId);
  if(!got){unavailable.push(o.bashoId);continue;}
  const state=got.wins===o.wins&&got.losses===o.losses?'agree':'discrepancy';
  compared.push({bashoId:o.bashoId,official:{wins:o.wins,losses:o.losses},
    apiLedger:{wins:got.wins,losses:got.losses},status:state});
 }
 const discrepancies=compared.filter(x=>x.status==='discrepancy');
 return {
  officialBashoRows:known.length,comparedBasho:compared.length,
  agreeingBasho:compared.length-discrepancies.length,
  discrepantBasho:discrepancies.length,
  unmatchedOfficialBasho:unavailable,
  discrepancies,excludedCurrentBasho:completedMonth,
  currentBashoExclusionEvidence:exclusionBasis,
  status:!known.length?'official-tournament-parse-review':
    !source?.stages?.matches?.complete?'api-history-incomplete':
    discrepancies.length?'historical-results-disagree':
    !compared.length?'insufficient-common-basho':'historical-tournaments-agree',
  certified:false,
  note:'Only completed prior tournaments compared. Agreement cannot by itself certify an entire rikishi career.'
 };
}

/**
 * JSA profile uses integer centimetres/kilograms while the API can store
 * decimal precision. Integer display rounding is compatible, but it does
 * not certify the underlying measurement or alter the source record.
 */
export function compareJsaListedMeasurement(published,raw){
 if(published==null||raw==null||!Number.isFinite(Number(published))||
    !Number.isFinite(Number(raw)))
  return {match:null,method:'unavailable',published:published??null,api:raw??null};
 const official=Number(published),api=Number(raw);
 const method=official===api?'exact':
   Number.isInteger(official)&&Math.round(api)===official?
     'integer-display-rounding-compatible':'disagreement';
 return {match:method!=='disagreement',method,published:official,api};
}
export function parseOfficialProfile(html,roster){
 const text=htmlToPublicText(html);
 // Some official pages display W-L only; an omitted absence field is
 // unknown, NOT zero. Permit thousands separators without losing precision.
 const career=text.match(/\bCareer\s+Record\s*:\s*([\d,]+)\s*-\s*([\d,]+)(?:\s*-\s*([\d,]+))?(?![\d,-])/i);
 const careerNumber=v=>v==null?null:Number(v.replace(/,/g,''));
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
 const measurementComparisonDetails={
  height:compareJsaListedMeasurement(num('Height','cm'),roster.heightCm),
  weight:compareJsaListedMeasurement(num('Weight','kg'),roster.weightKg)
 };
 const comparisons={
  name: nameMatchOk,
  stable: stableMatch?.[1]!=null?stableMatch[1].trim()===roster.heya:null,
  rankGrade:rank&&expected?rank.division.toLowerCase()===expected[1].toLowerCase()&&
    (rank.position===null||rank.position===Number(expected[2])):null,
  height:measurementComparisonDetails.height.match,
  weight:measurementComparisonDetails.weight.match
 };
 const completeness=!!career&&!!rank&&!!stableMatch&&num('Height','cm')!=null&&num('Weight','kg')!=null;
 return {
  schemaVersion:1,parserVersion:4,source:'Japan Sumo Association official public Rikishi Profile',
  sourceId:roster.sourceId,officialNskId:roster.officialNskId,
  url:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+roster.officialNskId+'/',
  profileName:announcedName,stable:short(stableMatch?.[1]),rank,heightCm:num('Height','cm'),
  weightKg:num('Weight','kg'),
  career:career?{wins:careerNumber(career[1]),losses:careerNumber(career[2]),absences:careerNumber(career[3])}:null,
  careerAbsencesPublished:career?.[3]!=null,
  officialAsOf:asOf?{monthYear:asOf[1],day:Number(asOf[2])}:null,
  fieldComparisons:comparisons,
  measurementComparisonDetails,measurementComparisonMethod:'published-integer-precision',
  historicMeasurementsChanged:false,
  status:!nameMatchOk?'identity-review':!completeness?'parse-review':
    Object.values(comparisons).some(v=>v===false)?'field-disagreement':'basic-fields-parsed',
  certification:'not-started',
  notice:'Basic current public fields only. Does NOT verify complete historical bouts, official historical weigh-ins, image rights, or career certification.'
 };
}
export function officialSpotcheckPriority(a,b){
 // Source corrections first, then highest-division active wrestlers. The
 // stable deterministic order prevents completed snapshots from re-fetching.
 const specific=[242,82,16];
 const ia=specific.indexOf(a.sourceId),ib=specific.indexOf(b.sourceId);
 const pa=ia<0?specific.length:ia,pb=ib<0?specific.length:ib;
 if(pa!==pb)return pa-pb;
 const rankParts=w=>{
  const m=String(w.currentRank||'').match(/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita)\s+(\d+)\s+(East|West)$/i);
  const levels=['Yokozuna','Ozeki','Sekiwake','Komusubi','Maegashira','Juryo','Makushita'];
  const division=m?levels.indexOf(m[1]):99;
  return [division<0?99:division,m?Number(m[2]):999,
   m?.[3]?.toLowerCase()==='east'?0:1,Number(w.sourceId)];
 };
 const x=rankParts(a),y=rankParts(b);
 return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]||x[3]-y[3];
}
/** Revisit earlier JSA snapshots once, only to add dated banzuke QA. */
export function requiresJsaRankRecheck(doc){
 return !!doc&&doc.rankReconciliation==null&&doc.rankRecheck==null&&
  Number(doc.sourceId)>0&&Number(doc.officialNskId)>0;
}
/** The scheduled worker may stop only after all one-time cached JSA rank checks
 * have either been independently compared or explicitly flagged for review.
 * Never retry a documented unparseable official page on every five-minute run. */
export function summarizeJsaRankCoverage(docs){
 const profiles=Array.isArray(docs)?docs:[];
 const comparedBasho=x=>Number(x?.rankReconciliation?.comparedBasho||0);
 return {
  historicalRankRechecksOutstanding:profiles.filter(requiresJsaRankRecheck).length,
  historicalRankProfilesCompared:profiles.filter(x=>comparedBasho(x)>0).length,
  historicalRankRowsCompared:profiles.reduce((n,x)=>n+comparedBasho(x),0),
  historicalRankManualReview:profiles.filter(x=>
   x?.rankRecheck?.status==='dated-official-ranks-not-parseable').length
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
 // Explicit result disputes are checked first. All other uncached pages
 // are prioritised Makuuchi -> Juryo -> Makushita, not arbitrary source ID.
 const cases=roster.rikishi.filter(w=>w.officialNskId).sort(officialSpotcheckPriority);
 let requested=0,succeeded=0,review=0,reason=null,nextAllowedAt=null;
 for(const w of cases){
  if(requested>=MAX_REQUESTS)break;
  const path=join(ROOT,'profiles',w.sourceId+'.json');
  const cached=await load(path);
  // Keep all valid v3 snapshots; only re-fetch known career-record parse
  // failures from v3, rather than repeating 60+ already collected pages.
  if(cached?.parserVersion>=4||cached?.parserVersion===3&&cached.career!==null)continue;
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
   const cachedHistory=await load(join('data/sumo/backfill/v1/rikishi',w.sourceId+'.json'));
   doc.officialBashoRecords=parseJsaBashoResults(html);
   doc.officialRankRecords=parseJsaBashoRanks(html);
   doc.rankReconciliation=reconcileJsaBashoRanks(doc.officialRankRecords,cachedHistory);
   doc.bashoReconciliation=reconcileJsaBashoResults(
     doc.officialBashoRecords,cachedHistory,doc.officialAsOf,cohortCurrentBasho(roster));
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
 let oldRankChecks=0;
 // Only after primary profile collection is complete, use the remaining
 // request quota to investigate older snapshots missing a rank crosscheck.
 // Preserve original public bio, career totals, source W-L and raw source hash.
 if(!reason&&requested<MAX_REQUESTS){
  let primaryOutstanding=false;
  for(const w of cases){
   const priorDoc=await load(join(ROOT,'profiles',w.sourceId+'.json'));
   if(!priorDoc||priorDoc.parserVersion<4&&
      !(priorDoc.parserVersion===3&&priorDoc.career!==null)){
    primaryOutstanding=true;break;
   }
  }
  if(!primaryOutstanding){
   for(const w of cases){
    if(requested>=MAX_REQUESTS)break;
    const path=join(ROOT,'profiles',w.sourceId+'.json');
    const cached=await load(path);
    if(!requiresJsaRankRecheck(cached))continue;
    requested++;
    const url='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/';
    try{
     const resp=await fetch(url,{headers:{Accept:'text/html',
       'User-Agent':'BlackEyeFightNews/1.0 (bounded historical rank fact checking)'},
       signal:AbortSignal.timeout(WAIT_MS)});
     if(!resp.ok){
      reason='JSA rank evidence HTTP '+resp.status;
      nextAllowedAt=new Date(Date.now()+
        (resp.status===429||resp.status===403?12*3600_000:3600_000)).toISOString();
      break;
     }
     const html=await resp.text();
     if(html.length<500||html.length>2_000_000)
      throw Error('Unexpected JSA rank source HTML length');
     const check=parseOfficialProfile(html,w);
     if(check.fieldComparisons?.name!==true||
        check.fieldComparisons?.stable===false||
        check.fieldComparisons?.rankGrade===false)
      throw Error('Source current wrestler identity or grade changed');
     const raw=await load(join('data/sumo/backfill/v1/rikishi',w.sourceId+'.json'));
     const officialRankRecords=parseJsaBashoRanks(html);
     const rankReconciliation=reconcileJsaBashoRanks(officialRankRecords,raw);
     const rankRecheck={schemaVersion:1,sourceUrl:url,capturedAt:now(),
       parserVersion:1,originalPublicFieldsPreserved:true,
       rawHtmlSha256:createHash('sha256').update(html).digest('hex'),
       status:rankReconciliation.comparedBasho>0?
         'source-ranks-compared':'dated-official-ranks-not-parseable',
       rankRowsCompared:rankReconciliation.comparedBasho,
       rankConflicts:rankReconciliation.mismatches.length,
       certification:'not-started'};
     await put(path,{...cached,officialRankRecords,rankReconciliation,rankRecheck});
     oldRankChecks++;
     await new Promise(r=>setTimeout(r,INTERVAL_MS));
    }catch(e){
     reason='JSA historical rank recheck unavailable: '+String(e.message||e).slice(0,135);
     nextAllowedAt=new Date(Date.now()+3600_000).toISOString();
     break;
    }
   }
  }
 }
 let done=0,matched=0,exceptions=0,bashoChecked=0,historicalDiscrepancies=0;
 const rankDocuments=[];
 for(const w of cases){
  const d=await load(join(ROOT,'profiles',w.sourceId+'.json'));
  if(d){
   rankDocuments.push(d);
   done++;if(d.status==='basic-fields-parsed')matched++;else exceptions++;
   if(d.bashoReconciliation){
    bashoChecked+=d.bashoReconciliation.comparedBasho||0;
    historicalDiscrepancies+=d.bashoReconciliation.discrepantBasho||0;
   }
  }
 }
 const summary={schemaVersion:1,scope:'JSA public profile field snapshots; NOT career certifications',
  cohort:190,checked:done,parsedFields:matched,fieldOrParsingReview:exceptions,
  pending:190-done,historicalBashoCompared:bashoChecked,
  historicalDiscrepancies,...summarizeJsaRankCoverage(rankDocuments),
  lastRunAt:now(),requestsThisRun:requested,goodThisRun:succeeded,
  reviewThisRun:review,historicalRankRechecksThisRun:oldRankChecks,
  stoppedReason:reason,nextAllowedAt,certified:0,
  photoUseRights:'not obtained or inferred'};
 await put(metaPath,summary);
 console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 main().catch(e=>{console.error(e);process.exitCode=1;});
}
