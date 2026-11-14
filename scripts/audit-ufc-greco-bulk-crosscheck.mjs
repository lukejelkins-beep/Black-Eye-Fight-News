#!/usr/bin/env node
/**
 * BEFN bulk historical UFC crosscheck against Greco1899's GitHub CSV exports.
 * Github-only, at most one scan per UTC day, using pinned public source commit.
 * Never requests UFCStats, copies CSVs to BEFN, or changes career certification.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo='Greco1899/scrape_ufc_stats';
const MAX_BYTES=3_000_000;
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=s=>({w:'win',l:'loss',d:'draw',nc:'no_contest',win:'win',
 loss:'loss',draw:'draw',no_contest:'no_contest'})[String(s??'').trim().toLowerCase()]||null;
const urlOk=s=>/^https?:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i.test(String(s||''));
const near=(a,b)=>Boolean(a&&b&&Math.abs(Date.parse(a+'T00:00:00Z')-
 Date.parse(b+'T00:00:00Z'))<=86400000);
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
export function csvRows(raw){
 const out=[];let row=[],field='',quoted=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(quoted){
   if(c==='"'&&raw[i+1]==='"'){field+='"';i++;}
   else if(c==='"')quoted=false;
   else field+=c;
  }else if(c==='"')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'){row.push(field.replace(/\r$/,''));out.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('Malformed CSV quoting');
 if(field||row.length){row.push(field);out.push(row);}
 return out;
}
function objects(text,columns){
 const [header,...rows]=csvRows(text);
 if(!columns.every(c=>header.includes(c)))throw Error('Unexpected Greco CSV schema');
 return rows.filter(r=>r.length===header.length).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]])));
}
const day=s=>{
 if(!s)return null;
 const d=new Date(s+' 12:00:00 GMT');
 return !Number.isNaN(d.valueOf())?d.toISOString().slice(0,10):null;
};
function sourceBouts(eventCsv,resultCsv,asOf){
 const ev=objects(eventCsv,['EVENT','DATE']);
 const results=objects(resultCsv,['EVENT','BOUT','OUTCOME','URL']);
 const eventDates=new Map();
 for(const e of ev){
  const key=e.EVENT.trim(),date=day(e.DATE);
  if(date&&!eventDates.has(key))eventDates.set(key,date);
 }
 const indexed=[],byName=new Map(),seenUrl=new Set();
 for(const r of results){
  const date=eventDates.get(r.EVENT.trim());
  if(!date||date>asOf||!urlOk(r.URL)||seenUrl.has(r.URL))continue;
  const pair=r.BOUT.split(/\s+vs\.?\s+/i),res=r.OUTCOME.split('/');
  if(pair.length!==2||res.length!==2||!outcome(res[0])||!outcome(res[1]))continue;
  const sides=pair.map((name,i)=>({name:name.trim(),result:outcome(res[i])}));
  if(!norm(sides[0].name)||!norm(sides[1].name)||
      norm(sides[0].name)===norm(sides[1].name))continue;
  const record={date,event:r.EVENT.trim(),bout:r.BOUT.trim(),url:r.URL.replace(/^http:/,'https:'),
   sides};
  indexed.push(record);seenUrl.add(r.URL);
  sides.forEach((s,i)=>{
   const n=norm(s.name),entries=byName.get(n)||[];
   entries.push({date,opponent:sides[1-i].name,result:s.result,
    fightUrl:record.url,event:record.event});
   byName.set(n,entries);
  });
 }
 return {indexed,byName,eventCount:eventDates.size,sourceFightCount:indexed.length,
   latestEventDate:ev.map(x=>day(x.DATE)).filter(Boolean).sort().at(-1)||null};
}
function matching(source,other){
 return near(source.date,other.date)&&norm(source.opponent)===norm(other.opponent)&&
  outcome(source.result)===outcome(other.result);
}
export function crosscheckGreco({events,results,approval,research,inventory,commit}){
 const roster=approval?.approvedFighters||[],asOf=approval?.rosterAsOf;
 if(approval?.status!=='approved'||roster.length!==783||
  new Set(roster).size!==783||!/^\d{4}-\d\d-\d\d$/.test(String(asOf))||
  !/^[0-9a-f]{40}$/i.test(String(commit)))throw Error('Invalid approved cohort or source commit');
 const source=sourceBouts(events,results,asOf);
 const bySource=source.byName,profiles=research?.profiles||{},inv=inventory?.fighters||{};
 const rosterNames=new Map();
 for(const slug of roster){
  const name=profiles[slug]?.name||'';
  if(!name)continue;
  const k=norm(name),owners=rosterNames.get(k)||[];
  owners.push(slug);rosterNames.set(k,owners);
 }
 const cases=roster.map(slug=>{
  const profile=profiles[slug]||{},name=profile.name||null,identity=norm(name),
   saved=(Array.isArray(profile.recentHistory)?profile.recentHistory:[])
   .filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc')
   .map(x=>({date:String(x.date||'').slice(0,10),opponent:x.opponent,result:x.result}));
  const candidate=identity?bySource.get(identity)||[]:[];
  const ambiguity=Boolean(identity&&rosterNames.get(identity)?.length>1);
  const matchedSaved=candidate.filter(x=>saved.some(y=>matching(x,y)));
  const unmatchedCandidates=candidate.filter(x=>!saved.some(y=>matching(x,y)));
  return {slug,name,sourceCandidateBouts:candidate.length,matchedKnownSourceBouts:matchedSaved.length,
   sourceCandidateNotSaved:unmatchedCandidates.length,
   identityReviewRequired:ambiguity||!identity,
   note:'Name-matched rows are candidates, never independent full-career proof; ambiguity requires athlete identity reconciliation.'};
 });
 const priority=[];
 for(const [slug,entry] of Object.entries(inv)){
  if(!roster.includes(slug)||!Array.isArray(entry?.bouts))continue;
  const expected=entry.bouts.map(b=>({date:b.date,opponent:b.opponent,result:outcome(b.result)}));
  const name=profiles[slug]?.name||entry.fighterName;
  // The UFC.com original inventory anchors identity for homonyms: each
  // source match requires the EXACT dated opponent and result, not a name alone.
  const aliases=new Set([norm(name),norm(entry.fighterName)]);
  if(slug==='bruno-gustavo-da-silva')aliases.add(norm('Bruno Silva'));
  const pool=[...bySource.entries()].filter(([n])=>aliases.has(n)).flatMap(([,rows])=>rows);
  const found=expected.map(b=>({date:b.date,opponent:b.opponent,result:b.result,
   matches:pool.filter(x=>matching(x,b)).map(x=>({date:x.date,fightUrl:x.fightUrl,event:x.event}))}));
  const missing=found.filter(x=>x.matches.length===0);
  const ambiguous=found.filter(x=>x.matches.length>1);
  priority.push({slug,sourceInventoryCount:expected.length,grecoMatched:found.length-missing.length-ambiguous.length,
   missingCount:missing.length,ambiguousCount:ambiguous.length,missing,ambiguous,
   matched:found.filter(x=>x.matches.length===1).map(x=>({...x,matches:x.matches[0]})),
   independentCareerCertified:false,
   note:'Official UFC athlete inventory matched to independent historical CSV, NOT yet proof that canonical UFCalendar history contains the bouts.'});
 }
 const summary={approvedFighters:roster.length,sourceFights:source.sourceFightCount,
   sourceEvents:source.eventCount,latestSourceEvent:source.latestEventDate,
   knownFighterNameCandidates:cases.filter(x=>x.sourceCandidateBouts>0).length,
   unambiguousNameCandidates:cases.filter(x=>x.sourceCandidateBouts>0&&!x.identityReviewRequired).length,
   sourceInventoryBouts:priority.reduce((n,p)=>n+p.sourceInventoryCount,0),
   sourceInventoryExactMatches:priority.reduce((n,p)=>n+p.grecoMatched,0),
   sourceInventoryUnmatched:priority.reduce((n,p)=>n+p.missingCount,0),
   certifiedFightersByThisCrosscheck:0};
 return {schema:1,scope:'ufc-greco-bulk-crosscheck',snapshotAsOf:asOf,
  sourceRepository:'https://github.com/'+repo,sourceCommit:commit,
  sourceLatestEvent:source.latestEventDate,sourceCurrentThroughSnapshot:
   Boolean(source.latestEventDate&&source.latestEventDate>=asOf),
  status:'historical_secondary_crosscheck_not_certification',
  summary,priorityCases:priority,cohortCandidates:cases,
  note:'Dataset may be stale; UFCStats scraper licence and extracted data reuse need independent review. No source data copied to BEFN or UFC full-career certifications issued.'};
}
async function requestText(url,max=MAX_BYTES){
 const response=await fetch(url,{signal:AbortSignal.timeout(18000),
  headers:{'user-agent':'BEFN-UFC-history-crosscheck/1.0','accept':'*/*'}});
 if(!response.ok)throw Error('Public Github source request failed: '+response.status);
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength>max)throw Error('Public source exceeds size cap');
 return new TextDecoder().decode(bytes);
}
async function main(){
 const checkpointPath=path.join(root,'data/ufc-greco-crosscheck-checkpoint.json');
 const utcDay=new Date().toISOString().slice(0,10);
 let last={};try{last=JSON.parse(fs.readFileSync(checkpointPath,'utf8'));}catch{}
 if(last.checkedOn===utcDay&&process.env.BEFN_GRECO_FORCE!=='1'){
  console.log('BEFN_GRECO daily checkpoint already checked; external requests=0');return;
 }
 const api='https://api.github.com/repos/'+repo+'/commits?path=ufc_fight_results.csv&per_page=1';
 const commits=JSON.parse(await requestText(api,30000));
 const commit=commits?.[0]?.sha;
 if(!/^[0-9a-f]{40}$/i.test(String(commit)))throw Error('No pinned Greco source SHA');
 const base='https://raw.githubusercontent.com/'+repo+'/'+commit+'/';
 const [events,results]=await Promise.all(['ufc_event_details.csv','ufc_fight_results.csv']
   .map(x=>requestText(base+x)));
 const report=crosscheckGreco({events,results,
   approval:read('data/ufc-36-month-roster-approval.json'),
   research:read('data/ufcalendar-fighter-research.json'),
   inventory:read('data/ufc-official-career-bout-inventory.json'),commit});
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-greco-bulk-crosscheck.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(checkpointPath,JSON.stringify({schema:1,scope:'ufc-greco-bulk-crosscheck-checkpoint',
   rosterAsOf:report.snapshotAsOf,checkedOn:utcDay,
   sourceCommit:commit,latestEvent:report.sourceLatestEvent,
   summary:report.summary,
   candidateAlerts:report.cohortCandidates.filter(x=>
     x.sourceCandidateNotSaved>0||x.identityReviewRequired).map(x=>({
       slug:x.slug,sourceCandidateNotSaved:x.sourceCandidateNotSaved,
       identityReviewRequired:x.identityReviewRequired}))
 },null,2)+'\n');
 console.log('BEFN_GRECO '+JSON.stringify(report.summary));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '\n### Greco UFCStats historical CSV crosscheck (not certification)\n'+
   JSON.stringify(report.summary)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error('BEFN_GRECO_FAIL '+e.message);process.exitCode=1;});
