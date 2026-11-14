#!/usr/bin/env node
/**
 * One-time pinned Greco UFCStats-linked fight-evidence extraction for the
 * sixth V4 candidate batch, not a paid UFCalendar client and not certification.
 * Once the evidence is reviewed and persisted in data/, subsequent runs reuse
 * the saved snapshot and make ZERO network requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceCommit='c742842f29466758fedc3906dbad28d6d320a8da';
const base='https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/'+sourceCommit+'/';
const source=['ufc_event_details.csv','ufc_fight_results.csv'];
const savedPath='data/ufc-v4-wave6-greco-fight-links-20261114.json';
const outputPath='qa/ufc-v4-wave6-greco-fight-links-20261114.json';
const roster=[
 ['shamil-gaziev','Shamil Gaziev'],['tagir-ulanbekov','Tagir Ulanbekov'],
 ['themba-gorimbo','Themba Gorimbo'],['amir-albazi','Amir Albazi'],
 ['andre-lima','Andre Lima'],['ariane-carnelossi','Ariane Carnelossi'],
 ['bogdan-guskov','Bogdan Guskov'],['cameron-saaiman','Cameron Saaiman'],
 ['cesar-almeida','Cesar Almeida'],['chad-anheliger','Chad Anheliger'],
 ['chelsea-chandler','Chelsea Chandler'],['cory-mckenna','Cory McKenna'],
 ['gabriella-fernandes','Gabriella Fernandes']
];
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=x=>({w:'win',l:'loss',d:'draw',nc:'no_contest'})[String(x??'').toLowerCase()]||null;
const validUrl=x=>/^https?:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i.test(x);
const dateDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
function csv(str){
 const result=[];let line=[],val='',quoted=false;
 for(let i=0;i<str.length;i++){
  const c=str[i];if(quoted){if(c==='"'&&str[i+1]==='"'){val+='"';i++;}else if(c==='"')quoted=false;else val+=c;}
  else if(c==='"')quoted=true;else if(c===','){line.push(val);val='';}
  else if(c==='\n'){line.push(val.replace(/\r$/,''));result.push(line);line=[];val='';}
  else val+=c;
 }
 if(val||line.length){line.push(val);result.push(line);}
 if(quoted)throw Error('CSV malformed quotes');
 const [head,...rows]=result;return rows.filter(r=>r.length===head.length)
 .map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]])));
}
function parseDay(x){const d=Date.parse(x+' 12:00:00 GMT');return Number.isFinite(d)?new Date(d).toISOString().slice(0,10):null;}
async function boundedFetch(file,maxBytes){
 const u=base+file;
 const r=await fetch(u,{headers:{'user-agent':'BEFN-V4-Pinned-Source-Evidence/1.0'},
  redirect:'error',signal:AbortSignal.timeout(22000)});
 if(!r.ok)throw Error(file+' Greco HTTP '+r.status);
 const bytes=await r.arrayBuffer();
 if(bytes.byteLength>maxBytes)throw Error('Greco source too large: '+file);
 return new TextDecoder().decode(bytes);
}
function findEvidence(eventRows,resultRows,approval,research,progress){
 const dateMap=new Map(eventRows.map(e=>[e.EVENT.trim(),parseDay(e.DATE)]));
 const sourceBouts=[];
 for(const r of resultRows){
  const parts=String(r.BOUT||'').split(/\s+vs\.?\s+/i),outcomes=String(r.OUTCOME||'').split('/');
  if(parts.length!==2||outcomes.length!==2||!outcome(outcomes[0])||!outcome(outcomes[1])||
    !validUrl(r.URL)||!dateMap.get(r.EVENT.trim()))continue;
  sourceBouts.push({date:dateMap.get(r.EVENT.trim()),event:r.EVENT,
   names:parts.map(s=>s.trim()),outcomes:outcomes.map(outcome),
   fightUrl:r.URL.replace(/^http:/,'https:')});
 }
 const fighters={};
 for(const [slug,name] of roster){
  if(!approval.approvedFighters.includes(slug))throw Error('Unapproved fighter '+slug);
  const profile=research.profiles?.[slug];
  if(!profile)throw Error('Missing saved fighter '+slug);
  const candidate=sourceBouts.filter(x=>x.names.some(n=>norm(n)===norm(name)));
  const saved=(profile.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc');
  const entries=candidate.map(x=>{
    const idx=x.names.findIndex(n=>norm(n)===norm(name));
    const opponent=x.names[1-idx],result=x.outcomes[idx];
    const matches=saved.filter(s=>Math.abs(dateDiff(s.date,x.date))<=1&&norm(s.opponent)===norm(opponent)&&
      String(s.result||s.outcome||'').toLowerCase()===result);
    const native=matches.filter(m=>m.source==='native');
    const selected=native.length===1?native[0]:matches.length===1?matches[0]:null;
    const nativeId=selected?String(selected.boutId||''):null;
    const nativeRecord=nativeId?progress.bouts?.[nativeId]:null;
    return {date:x.date,opponent,result,event:x.event,fightUrl:x.fightUrl,
      nativeBoutId:nativeId,nativeSavedDate:selected?.date??null,
      savedMatches:matches.length,nativeEvent:nativeRecord?.event??null,
      nativePresent:Boolean(nativeRecord),nativeIsUfc:nativeRecord?.org==='ufc',
      possibleFeeder:/(?:contender series|road to ufc|dwcs)/i.test(x.event)};
  }).sort((a,b)=>b.date.localeCompare(a.date));
  fighters[slug]={sourceName:name,savedProfileName:profile.name,
   grecoSourceBouts:entries.length,savedUfcBouts:saved.length,
   sourceOnly:entries.filter(x=>!x.nativeBoutId).length,
   savedOnly:saved.filter(x=>!entries.some(y=>y.nativeBoutId===String(x.boutId))).length,
   ambiguousIdentity:entries.filter(x=>x.savedMatches!==1).length,
   qualifyingSourceBouts:entries.filter(x=>!x.possibleFeeder).length,rows:entries};
 }
 return {schema:1,scope:'ufc-v4-targeted-pinned-independent-source-links',
  rosterAsOf:approval.rosterAsOf,sourceRepository:'https://github.com/Greco1899/scrape_ufc_stats',
  pinnedCommit:sourceCommit,sourceLatestEvent:'2026-11-07',
  status:'secondary_evidence_candidate_review_not_certification',
  note:'One-time Greco match against approved native records; distinct names, official UFC biographies, full coverage, outcomes, stats, DWCS exclusions and source identity must still be manually verified. Never auto-attest certification.',fighters};
}
async function main(){
 const savedFile=path.join(root,savedPath),output=path.join(root,outputPath);
 let report;
 if(fs.existsSync(savedFile)){
  report=JSON.parse(fs.readFileSync(savedFile,'utf8'));
  if(report.pinnedCommit!==sourceCommit)throw Error('Stale persisted pinned-source checkpoint');
  console.log('BEFN_WAVE6_GRECO reused persisted evidence; outbound requests=0');
 }else{
  const [events,results]=await Promise.all([boundedFetch(source[0],500000),boundedFetch(source[1],3000000)]);
  const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
  report=findEvidence(csv(events),csv(results),read('data/ufc-36-month-roster-approval.json'),
   read('data/ufcalendar-fighter-research.json'),read('data/ufcalendar-rich-progress.json'));
  console.log('BEFN_WAVE6_GRECO fetched pinned GitHub source; outbound requests=2, paid requests=0');
 }
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 for(const [slug,x] of Object.entries(report.fighters)){
  console.log('BEFN_WAVE6_GRECO_FIGHTER '+JSON.stringify({slug,source:x.grecoSourceBouts,
   saved:x.savedUfcBouts,missing:x.sourceOnly,extra:x.savedOnly,ambiguous:x.ambiguousIdentity,
   rows:x.rows.map(r=>({date:r.date,opponent:r.opponent,result:r.result,url:r.fightUrl,
    native:r.nativeBoutId,savedDate:r.nativeSavedDate,savedMatches:r.savedMatches,possibleFeeder:r.possibleFeeder}))}));
 }
}
main().catch(e=>{console.error('BEFN_TARGETED_GRECO_ERROR '+e.message);process.exitCode=1;});
