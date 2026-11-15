/**
 * SumoDB weight history collection — approved by the owner on 2026-11-15.
 * Research branch only. Existing source data is never rewritten.
 * Requires recorded permission plus robots/access checks on every new run.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseSumoDbDatedMeasurements,reconcileWeightHistory} from './sumo-weight-history-190.mjs';
const ROOT='data/sumo/backfill/v1';
const POLICY=join(ROOT,'sumodb-use-policy.json');
const STATUS=join(ROOT,'sumodb-collection-status.json');
const SOURCE_URL='https://sumodb.sumogames.de/Rikishi.aspx?r=';
// Increment whenever source-identity or measurement parsing changes.
const SOURCE_PARSER_VERSION=4;
const BOT='BEFNResearchBot/1.0 (authorised historical-weight research; admin@blackeyefightnews.com.au)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=async(path,value)=>{
 await mkdir(ROOT,{recursive:true});
 await mkdir(join(ROOT,'weight-source-crosschecks'),{recursive:true});
 const tmp=path+'.tmp';
 await writeFile(tmp,JSON.stringify(value,null,2)+'\n');
 await rename(tmp,path);
};
export function permissionAllowsCollection(policy){
 return policy?.approvedForAutomatedCollection===true&&
  typeof policy.approvalEvidence==='string'&&policy.approvalEvidence.length>=12&&
  Number.isFinite(Number(policy.allowedRequestsPerMinute))&&
  Number(policy.allowedRequestsPerMinute)>0&&Number(policy.allowedRequestsPerMinute)<=6;
}
export function conservativeRobotsAllow(robots,path='/Rikishi.aspx'){
 if(typeof robots!=='string'||robots.length>100000)return false;
 const lines=robots.split(/\r?\n/).map(x=>x.replace(/#.*$/,'').trim()).filter(Boolean);
 let agents=[],directives=[],groups=[];
 const flush=()=>{if(agents.length)groups.push({agents:[...agents],directives:[...directives]});agents=[];directives=[];};
 for(const line of lines){
  const sep=line.indexOf(':');if(sep<0)continue;
  const key=line.slice(0,sep).trim().toLowerCase(),value=line.slice(sep+1).trim();
  if(key==='user-agent'){
   if(directives.length)flush();
   agents.push(value.toLowerCase());
  }else if(key==='disallow'||key==='allow'){
   if(!agents.length)return false;
   directives.push({key,value});
  }
 }
 flush();
 const applicable=groups.filter(g=>g.agents.some(a=>a==='*'||a==='befnresearchbot'));
 for(const g of applicable){
  for(const d of g.directives){
   if(d.key==='disallow'&&d.value&&
    (d.value==='/'||path.startsWith(d.value.replace(/\*.*$/,''))))
     return false;
  }
 }
 return true;
}
/**
 * Source profiles may show a historical ring name (e.g. Senshoho) while
 * the current roster uses a later name (Izumifuji). Validate only against
 * API-backed current and recorded historical shikonas, never fuzzy identity.
 */
export function sourceIdentityEvidence(html,w,raw){
 const plain=String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
   .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
   .replace(/\s+/g,' ').trim();
 // Only the rikishi's header may establish identity; later match/opponent
 // listings must not create an accidental name association.
 const beforeRecord=plain.search(/\bCareer\s+Record\b/i);
 const head=beforeRecord>=0?plain.slice(0,beforeRecord):plain.slice(0,1300);
 const names=[w?.shikonaEn,raw?.data?.profile?.shikonaEn,
   ...(raw?.data?.shikonas||[]).map(x=>x.shikonaEn)]
   .filter(x=>typeof x==='string'&&x.trim().length>=3);
 // Whole romanised name tokens, not unsafe substring matches such as
 // "Ura" inside an unrelated longer wrestler name.
 const normalizeName=x=>' '+String(x).toLowerCase().replace(/[^a-z]+/g,' ').trim()+' ';
 const headerNames=normalizeName(head);
 const matching=names.find(x=>headerNames.includes(normalizeName(x)))||null;
 const rosterDob=w?.birthDate||raw?.data?.profile?.birthDate||null;
 const birth=head.match(/\bBirth\s+Date\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:18|19|20)\d{2})\b/i);
 const publishedDob=birth?.[1]?.replace(/\s+/g,' ')||null;
 const expectedDob=rosterDob?new Intl.DateTimeFormat('en-US',
   {timeZone:'Asia/Tokyo',month:'long',day:'numeric',year:'numeric'}).format(new Date(rosterDob)):null;
 const comparable=x=>String(x).replace(/,/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const birthDateStatus=!rosterDob?'roster-birth-date-unavailable':
   !publishedDob?'source-birth-date-missing':
   comparable(publishedDob)===comparable(expectedDob)?'match':'mismatch';
 const matched=!!matching&&/\brikishi\b/i.test(head);
 // A source that does not publish a birthday can still provide a
 // source-labelled historical weight, but must remain DOB-unverified.
 // An explicitly DIFFERENT birthday always blocks import.
 return {valid:matched&&birthDateStatus!=='mismatch',
  matchedShikona:matching,matchedCurrentName:matching!=null&&matching===w.shikonaEn,
  recordedAliasCount:new Set(names).size,
  birthDateStatus,publishedDob,expectedDob,
  evidenceWindow:'profile-header-before-career-record'};
}
/**
 * Cross-check a historical saved measurement against a fresh same-ID source
 * document before recording stronger identity evidence. Never replace the
 * saved source weight or silently erase a source discrepancy.
 */
export function corroborateSavedMeasurements(savedRows,latestRows){
 if(!Array.isArray(savedRows)||!savedRows.length||!Array.isArray(latestRows))
  return {ok:false,corroborated:0,issues:['missing dated historical measurements']};
 const latest=new Map(latestRows.map(row=>[String(row.bashoId),row]));
 const issues=[];let corroborated=0;
 for(const row of savedRows){
  const newer=latest.get(String(row.bashoId));
  if(!newer){
   issues.push('source date absent on recheck '+row.bashoId);continue;
  }
  const heightEqual=Number(row.heightCm)===Number(newer.heightCm);
  const weightEqual=Number(row.weightKg)===Number(newer.weightKg);
  if(!heightEqual||!weightEqual)
   issues.push('source value differs on recheck '+row.bashoId);
  else corroborated++;
 }
 return {ok:issues.length===0,corroborated,issues};
}
export function requiresIdentityRecheck(doc){
 if(!doc||doc.identityRecheck)return false;
 const status=doc.identityEvidence?.birthDateStatus||null;
 return status!== 'match'&&status!=='source-birth-date-missing'&&
   status!=='roster-birth-date-unavailable'&&status!=='mismatch';
}
/** Read the separately published SumoDB career totals, not the division totals.
 * The /N value is source-specific and is not presumed equal to raw API bouts. */
export function parseSumoDbCareerRecord(html){
 if(typeof html!=='string'||html.length>2_000_000)throw Error('Invalid SumoDB career source');
 const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/\s+/g,' ').trim();
 const m=plain.match(/\bCareer\s+Record\s+([\d,]+)\s*-\s*([\d,]+)(?:\s*-\s*([\d,]+))?\s*\/\s*([\d,]+)\b/i);
 if(!m)return null;
 const values=[m[1],m[2],m[3],m[4]].map(v=>v==null?null:Number(v.replace(/,/g,'')));
 if(values.some(v=>v!==null&&(!Number.isSafeInteger(v)||v<0||v>20000)))return null;
 return {wins:values[0],losses:values[1],absences:values[2],
  providerReportedBoutCount:values[3]};
}
/** All dated SumoDB tournament W-L-A rows, including old tournaments
 * omitted by a public JSA profile's recent-history window. The active
 * basho is never used for independent completed-tournament certification. */
export function parseSumoDbBashoRecords(html){
 if(typeof html!=='string'||html.length>2_000_000)throw Error('Invalid SumoDB basho source');
 const pageRows=html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
 const dated=new Map();
 for(const row of pageRows){
  const plain=row.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
   .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
   .replace(/\s+/g,' ').trim();
  const dates=[...plain.matchAll(/\b((?:18|19|20)\d{2})\.(01|03|05|07|09|11)\b/g)];
  if(dates.length!==1)continue;
  const records=[...plain.matchAll(/\b(\d{1,2})\s*-\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\b/g)];
  if(records.length!==1)continue;
  const x=records[0],wins=Number(x[1]),losses=Number(x[2]),
   absences=x[3]===undefined?null:Number(x[3]);
  if(wins>15||losses>15||absences!==null&&absences>15)continue;
  const bashoId=dates[0][1]+dates[0][2];
  // Only unambiguous numbered East/West grades become independently
  // comparable English ranks. Tsukedashi, Mae-zumo, and unknown shorthand
  // remain null, never a guessed banzuke dot.
  const afterDate=plain.slice(dates[0].index+dates[0][0].length).trim();
  const shorthand=afterDate.match(/^(Jk|Jd|Sd|Ms|Y|O|S|K|M|J)(\d{1,3})(e|w)(?=[^a-z]|[A-Z]|$)/);
  const divisions={Jk:'Jonokuchi',Jd:'Jonidan',Sd:'Sandanme',Ms:'Makushita',
   Y:'Yokozuna',O:'Ozeki',S:'Sekiwake',K:'Komusubi',M:'Maegashira',J:'Juryo'};
  const rankEn=shorthand&&Number(shorthand[2])>0&&Number(shorthand[2])<=120?
   divisions[shorthand[1]]+' '+Number(shorthand[2])+' '+
   (shorthand[3]==='e'?'East':'West'):null;
  const record={bashoId,wins,losses,absences,rankEn};
  const before=dated.get(bashoId);
  if(before&&JSON.stringify(before)!==JSON.stringify(record))
   throw Error('Contradictory SumoDB published basho W-L for '+bashoId);
  dated.set(bashoId,record);
 }
 return [...dated.values()].sort((a,b)=>a.bashoId.localeCompare(b.bashoId));
}

/** Require an existing preflight blocker and never repeat one-time research capture. */
export function requiresCareerRecordCrosscheck(doc,preflight,strictRow=null){
 if(!doc)return false;
 const blockers=preflight?.blockers||[];
 if(!Array.isArray(blockers))return false;
 const candidate=preflight?.classification==='candidate-for-strict-audit';
 const needsCareer=!candidate&&blockers.some(x=>
   x==='official-absence-total-unpublished-or-disagree'||
   x==='official-JSA-career-totals-unpublished-or-disagree')&&
   !doc.careerRecordCrosscheck;
 const needsOldBasho=!candidate&&
   blockers.includes('official-completed-basho-ledger-coverage-incomplete')&&
   !Array.isArray(doc.careerRecordCrosscheck?.independentBashoRows);
 // Rank-only strict blockers need one independent dated source pass even
 // when preflight also has the umbrella 'prerequisites-not-met' blocker.
 // Do not bypass any other blocker or repeat an already saved rank snapshot,
 // including source rows with a deliberately null rankEn.
 const rankOnlyPreflight=blockers.length===0||
   (blockers.length===1&&
    blockers[0]==='independent-JSA-historical-ranks-not-compared');
 const strictReasons=strictRow?.blockers||[];
 const rankOnlyStrict=strictReasons.includes('independent-official-banzuke-rank-coverage')&&
   strictReasons.every(x=>x==='preflight-prerequisites-not-met'||
    x==='independent-official-banzuke-rank-coverage');
 const missingRankEvidence=rankOnlyPreflight&&rankOnlyStrict&&
   !(doc.careerRecordCrosscheck?.independentBashoRows||[]).some(x=>
     Object.prototype.hasOwnProperty.call(x,'rankEn'));
 return needsCareer||needsOldBasho||missingRankEvidence;
}

export function recoveryCooldown(error){
 const s=String(error||'');
 if(/robots|HTTP (403|429|451)/i.test(s))return 24*3600;
 if(/HTTP 5\d\d|network|timeout|fetch failed/i.test(s))return 3600;
 return 0;
}
async function fetchHtml(url){
 const r=await fetch(url,{headers:{Accept:'text/html', 'User-Agent':BOT},
   redirect:'manual',signal:AbortSignal.timeout(18000)});
 if([301,302,303,307,308].includes(r.status))throw Error('Redirect requires review (not followed)');
 if(!r.ok)throw Error('Source HTTP '+r.status);
 const type=r.headers.get('content-type')||'';
 if(!/text\/html|application\/xhtml\+xml/i.test(type))throw Error('Unexpected source content-type '+type.slice(0,60));
 return r.text();
}
async function main(){
 const p=await optional(POLICY);
 if(!permissionAllowsCollection(p)){
  console.log(JSON.stringify({status:'permission-pending',requests:0,certified:0}));
  return;
 }
 const prior=await optional(STATUS)||{};
 if(prior.nextAllowedAt&&Date.parse(prior.nextAllowedAt)>Date.now()){
  console.log(JSON.stringify({status:'provider-cooldown',nextAllowedAt:prior.nextAllowedAt,requests:0}));
  return;
 }
 let error=null,cooldown=0,updated=0,requests=0,identityAudits=0,careerAudits=0;
 const failed=[];
 try{
  const robots=await fetch('https://sumodb.sumogames.de/robots.txt',{
   headers:{'User-Agent':BOT},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(![200,404,410].includes(robots.status))
   throw Error('robots access unavailable HTTP '+robots.status);
  if(robots.status===200&&!conservativeRobotsAllow(await robots.text()))
   throw Error('robots rules disallow or ambiguously restrict Rikishi.aspx');
 }catch(e){
  error='Robots preflight: '+String(e.message||e).slice(0,160);
  cooldown=24*3600;
 }
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)throw Error('Frozen cohort mismatch');
 const interval=Math.max(12000,Math.ceil(60000/Number(p.allowedRequestsPerMinute)));
 const limit=Math.min(10,Math.max(1,Number(process.env.SUMODB_MAX_PER_RUN||10)));
 // The collection stage has a strict 160-second deadline. Reserve the
 // remaining workflow time for QA and a saved GitHub research checkpoint.
 const workerDeadline=Date.now()+160000;
 let lastAt=0;
 if(!cooldown){
  for(const w of roster.rikishi){
   if(requests>=limit)break;
   if(!Number.isSafeInteger(Number(w.sumoDbId))||Number(w.sumoDbId)<=0)continue;
   const dest=join(ROOT,'weight-source-crosschecks',w.sourceId+'.json');
   if(await optional(dest))continue;
   // Do not repeatedly request an already-known irreconcilable identity/page.
   // A previous parser-version exception can be retried exactly once with
   // revised identity logic. Current-version review cases are not hammered.
   if((prior.reviewCases||[]).some(x=>x.sourceId===w.sourceId&&
      x.permanent&&Number(x.parserVersion||0)>=SOURCE_PARSER_VERSION))continue;
   const delay=Math.max(0,lastAt+interval-Date.now());
   if(Date.now()+delay+19000>workerDeadline)break;
   if(delay)await sleep(delay);
   lastAt=Date.now();requests++;
   try{
    const html=await fetchHtml(SOURCE_URL+w.sumoDbId);
    if(html.length<400||html.length>2_000_000)throw Error('Unexpected source HTML length');
    const raw=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
    const identity=sourceIdentityEvidence(html,w,raw);
    if(!identity.valid)
      throw Error('Source rikishi name/birth-date does not match current or historical roster identity');
    const rows=parseSumoDbDatedMeasurements(html);
    if(!rows.length)throw Error('No dated measurement rows found (parser/source review)');
    const datedEvidence=rows.map(x=>({...x,sourceUrl:SOURCE_URL+w.sumoDbId,independentlyCertified:false}));
    const check=reconcileWeightHistory(raw.data.measurements,datedEvidence,Number(w.sumoDbId));
    const doc={
     schemaVersion:1,scope:'Authorised research-only SumoDB historical weight evidence',
     sourceId:w.sourceId,officialNskId:w.officialNskId,sumoDbId:Number(w.sumoDbId),
     rikishi:w.shikonaEn,reviewedAt:now(),sourcePageUrl:SOURCE_URL+w.sumoDbId,
     identityEvidence:identity,
     sourceParserVersion:SOURCE_PARSER_VERSION,
     rawHtmlSha256:createHash('sha256').update(html).digest('hex'),
     datedEvidence,coverage:{
       datedApiPoints:check.apiDatedPoints,datedIndependentPoints:check.independentDatedPoints,
       additionalDatedPoints:check.additionalDatedPoints,
       matchingOverlaps:check.matchingOverlaps,conflicts:check.conflictingOverlaps},
     rightsRecord:{collectionApprovalReference:p.approvalEvidence,
       approvalBasis:p.approvalEvidenceType||'user-reported',
       publicDisplayApproved:p.approvedForPublicDisplay===true},
     certification:'not-started',publiclyReleased:false
    };
    await save(dest,doc);updated++;
   }catch(e){
    const msg=String(e.message||e).slice(0,180);
    const wait=recoveryCooldown(msg);
    if(wait){
     error=msg;cooldown=wait;break;
    }
    failed.push({sourceId:w.sourceId,name:w.shikonaEn,issue:msg,
      permanent:true,parserVersion:SOURCE_PARSER_VERSION});
   }
  }
  // After every accessible roster profile has its dated source snapshot,
  // spend remaining provider budget on older source-identity gaps. These
  // rechecks do not re-collect, overwrite or increase the saved weight dots.
  let hasPendingHistoricalSource=false;
  for(const w of roster.rikishi){
   const priorDoc=await optional(join(ROOT,'weight-source-crosschecks',w.sourceId+'.json'));
   const blocked=(prior.reviewCases||[]).some(x=>x.sourceId===w.sourceId&&
     x.permanent&&Number(x.parserVersion||0)>=SOURCE_PARSER_VERSION);
   if(!priorDoc&&!blocked)hasPendingHistoricalSource=true;
  }
  if(!hasPendingHistoricalSource){
   for(const w of roster.rikishi){
    if(requests>=limit||cooldown)break;
    const dest=join(ROOT,'weight-source-crosschecks',w.sourceId+'.json');
    const saved=await optional(dest);
    if(!requiresIdentityRecheck(saved))continue;
    if((prior.reviewCases||[]).some(x=>x.sourceId===w.sourceId&&
       x.permanent&&Number(x.parserVersion||0)>=SOURCE_PARSER_VERSION))continue;
    const delay=Math.max(0,lastAt+interval-Date.now());
    if(Date.now()+delay+19000>workerDeadline)break;
    if(delay)await sleep(delay);
    lastAt=Date.now();requests++;
    try{
     if(Number(saved.sumoDbId)!==Number(w.sumoDbId)||
        Number(saved.sourceId)!==Number(w.sourceId)||
        Number(saved.officialNskId)!==Number(w.officialNskId))
      throw Error('Prior SumoDB source identity does not match frozen roster');
     const html=await fetchHtml(SOURCE_URL+w.sumoDbId);
     if(html.length<400||html.length>2_000_000)throw Error('Unexpected source HTML length');
     const raw=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
     const identity=sourceIdentityEvidence(html,w,raw);
     if(!identity.valid)throw Error('Source identity mismatch on historical verification pass');
     const rows=parseSumoDbDatedMeasurements(html);
     const corroboration=corroborateSavedMeasurements(saved.datedEvidence,rows);
     if(!corroboration.ok)
      throw Error('Historical source recheck disagreed: '+corroboration.issues.join('; '));
     const proof={verifiedAt:now(),sourceParserVersion:SOURCE_PARSER_VERSION,
      sourceUrl:SOURCE_URL+w.sumoDbId,rawHtmlSha256:createHash('sha256').update(html).digest('hex'),
      identityEvidence:identity,unchangedSavedMeasurements:corroboration.corroborated,
      originalEvidencePreserved:true,certified:false};
     await save(dest,{...saved,identityRecheck:proof});
     identityAudits++;
    }catch(e){
     const msg=String(e.message||e).slice(0,180);
     const wait=recoveryCooldown(msg);
     if(wait){error=msg;cooldown=wait;break;}
     failed.push({sourceId:w.sourceId,name:w.shikonaEn,
      issue:'Identity second-pass: '+msg,permanent:true,parserVersion:SOURCE_PARSER_VERSION});
    }
   }
  }
 }
  // Target only currently blocked career records after historical weight and
  // birth-date checks. Reuse the SAME cached source document path/identity.
  // Never revise previously stored measurements, and never treat conflicting
  // dates or totals as a positive certification.
  const preflight=await optional(join(ROOT,'career-certification-preflight.json'));
  const pendingById=new Map((preflight?.rows||[]).map(x=>[Number(x.sourceId),x]));
  const lastStrict=await optional(join(ROOT,'career-certification-strict.json'));
  const strictById=new Map((lastStrict?.rows||[]).map(x=>[Number(x.sourceId),x]));
  for(const w of roster.rikishi){
   if(requests>=limit||cooldown)break;
   const dest=join(ROOT,'weight-source-crosschecks',w.sourceId+'.json');
   const saved=await optional(dest);
   if(!requiresCareerRecordCrosscheck(saved,pendingById.get(Number(w.sourceId)),strictById.get(Number(w.sourceId))))continue;
   const alreadyBlocked=(prior.reviewCases||[]).some(x=>x.sourceId===w.sourceId&&
    x.permanent&&Number(x.parserVersion||0)>=SOURCE_PARSER_VERSION);
   if(alreadyBlocked)continue;
   const identity=saved?.identityRecheck?.identityEvidence||saved?.identityEvidence;
   if(identity?.valid!==true||identity.birthDateStatus!=='match')continue;
   const delay=Math.max(0,lastAt+interval-Date.now());
   if(Date.now()+delay+19000>workerDeadline)break;
   if(delay)await sleep(delay);
   lastAt=Date.now();requests++;
   try{
    if(Number(saved.sumoDbId)!==Number(w.sumoDbId)||
       Number(saved.sourceId)!==Number(w.sourceId)||
       Number(saved.officialNskId)!==Number(w.officialNskId))
      throw Error('Historical career source identity mismatch');
    const html=await fetchHtml(SOURCE_URL+w.sumoDbId);
    const raw=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
    const sourceIdentity=sourceIdentityEvidence(html,w,raw);
    if(sourceIdentity.valid!==true||sourceIdentity.birthDateStatus!=='match')
     throw Error('Historical career source birth date not independently verified');
    const freshMeasurements=parseSumoDbDatedMeasurements(html);
    const unchanged=corroborateSavedMeasurements(saved.datedEvidence,freshMeasurements);
    if(!unchanged.ok)throw Error('Historical measurements changed during career totals check: '+
      unchanged.issues.join('; '));
    const published=parseSumoDbCareerRecord(html);
    const historical=parseSumoDbBashoRecords(html);
    const oldCheck=saved.careerRecordCrosscheck;
    const sourceSha=createHash('sha256').update(html).digest('hex');
    const careerRecordChanged=!!oldCheck&&
      JSON.stringify(oldCheck.career)!==JSON.stringify(published);
    // Never replace prior W-L-A evidence with a newer, differently cut off
    // source page. Save the independently dated historical rows separately.
    const check=oldCheck?{
      ...oldCheck,independentBashoRows:historical,
      datedBashoLedgerCapturedAt:now(),datedBashoLedgerSourceSha256:sourceSha,
      careerRecordDiffersFromPriorSnapshot:careerRecordChanged
    }:{
      sourceUrl:SOURCE_URL+w.sumoDbId,capturedAt:now(),
      rawHtmlSha256:sourceSha,
      identityVerified:true,originalMeasurementsUnchanged:true,
      corroboratedWeightDates:unchanged.corroborated,
      sourceRecordPublished:published!==null,
      career:published,sourceAsOf:'retrieval-date; active-basho cutoff not independently established',
      independentOfApi:true,careerStrictlyCertified:false,
      independentBashoRows:historical,
      datedBashoLedgerCapturedAt:now(),datedBashoLedgerSourceSha256:sourceSha,
      careerRecordDiffersFromPriorSnapshot:false
    };
    await save(dest,{...saved,careerRecordCrosscheck:check});
    careerAudits++;
   }catch(e){
    const msg=String(e.message||e).slice(0,180);
    const wait=recoveryCooldown(msg);
    if(wait){error=msg;cooldown=wait;break;}
    failed.push({sourceId:w.sourceId,name:w.shikonaEn,
      issue:'Career source check: '+msg,permanent:true,parserVersion:SOURCE_PARSER_VERSION});
   }
  }
 const reviews=[...(prior.reviewCases||[])].filter(x=>
   !Number.isFinite(Number(x.parserVersion))||
   Number(x.parserVersion)>=SOURCE_PARSER_VERSION);
 for(const f of failed){
   const index=reviews.findIndex(x=>x.sourceId===f.sourceId);
   if(index<0)reviews.push(f);else reviews[index]=f;
 }
 // A skipped one-time source check is not a successful corroboration;
 // keep a distinct outstanding count for the existing GitHub scheduler.
 const checkpoint=await optional(join(ROOT,'career-certification-preflight.json'));
 const outstanding=new Map((checkpoint?.rows||[]).map(x=>[Number(x.sourceId),x]));
 const previousStrict=await optional(join(ROOT,'career-certification-strict.json'));
 const rankedById=new Map((previousStrict?.rows||[]).map(x=>[Number(x.sourceId),x]));
 let outstandingCareerCrosschecks=0,careerRecordsCaptured=0;
 for(const w of roster.rikishi){
  const doc=await optional(join(ROOT,'weight-source-crosschecks',w.sourceId+'.json'));
  if(doc?.careerRecordCrosscheck?.sourceRecordPublished===true)careerRecordsCaptured++;
  const item=outstanding.get(Number(w.sourceId));
  const block=reviews.some(x=>x.sourceId===w.sourceId&&x.permanent&&
     Number(x.parserVersion||0)>=SOURCE_PARSER_VERSION);
  const birth=doc?.identityRecheck?.identityEvidence||doc?.identityEvidence||{};
  if(!block&&birth.valid===true&&birth.birthDateStatus==='match'&&
    requiresCareerRecordCrosscheck(doc,item,rankedById.get(Number(w.sourceId))))outstandingCareerCrosschecks++;
 }
 const result={schemaVersion:1,scope:'Research-only SumoDB collection progress',
  lastRunAt:now(),source:'https://sumodb.sumogames.de',
  permission:'user-reported-confirmation',requestsThisRun:requests,
  updatedThisRun:updated,identityAuditsThisRun:identityAudits,
  careerRecordCrosschecksThisRun:careerAudits,
  careerRecordCrosschecksOutstanding:outstandingCareerCrosschecks,
  independentlyPublishedCareerRecordsCaptured:careerRecordsCaptured,
  cooldownReason:error,nextAllowedAt:cooldown?
    new Date(Date.now()+cooldown*1000).toISOString():null,
  reviewCases:reviews,certifiedWeightHistories:0,productionPublished:0};
 await save(STATUS,result);
 console.log(JSON.stringify({status:cooldown?'cooldown':failed.length?'needs-manual-review':'ok',
  requests,updated,identityAudits,careerAudits,careerCrosschecksOutstanding:outstandingCareerCrosschecks,
  independentlyPublishedCareerRecordsCaptured:careerRecordsCaptured,
  reviewCases:reviews.length,nextAllowedAt:result.nextAllowedAt,
  error,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error('SumoDB collector: '+String(e.message||e));process.exitCode=1;});
