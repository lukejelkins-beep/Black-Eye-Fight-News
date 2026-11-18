/**
 * Apply relayed torikumi emails (data/sumo/email-inbox/*.txt) to data/sumo/jsa-torikumi.json,
 * the file scripts/sumo-refresh-daily.mjs already reads for next-day matchups.
 *
 * Each inbox file is written by tools/gmail-torikumi-relay.gs:
 *   Subject: BEFN torikumi 202611 day 12
 *   <blank line>
 *   <email plain-text body>
 *
 * Fail closed: a file that does not parse, is for another basho, or names a wrestler the
 * roster does not know (Makuuchi/Juryo) changes nothing. A page the JSA scraper itself
 * collected is never overwritten by an email.
 */
import {readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseTorikumiEmail,emailBoutsToJsaRows} from '../assets/sumo-email-torikumi.mjs';

const INBOX='data/sumo/email-inbox';
const OUT='data/sumo/jsa-torikumi.json';
const DETAILS='data/sumo/preview-details.json';
const ROSTER='data/sumo/rikishi-index.json';

export function splitInboxFile(text){
  const m=/^Subject:[ \t]*(.*)\r?\n\r?\n([\s\S]*)$/.exec(String(text||''));
  if(!m)throw new Error('inbox file must start with "Subject:" and a blank line');
  return {subject:m[1],body:m[2]};
}

/** Pure: returns the next jsa-torikumi.json value and a report. Later files win for the same day. */
export function applyEmails({files,previous,bashoId,roster,now=new Date().toISOString()}){
  const next=structuredClone(previous&&previous.bashoId===bashoId?previous:{schemaVersion:1,bashoId,pages:{}});
  next.pages ||= {};
  const report=[];
  for(const {name,text} of [...files].sort((a,b)=>a.name.localeCompare(b.name))){
    try{
      const email=parseTorikumiEmail(splitInboxFile(text));
      if(email.bashoId!==bashoId){report.push({file:name,status:'skipped',reason:'basho '+email.bashoId+' is not the current '+bashoId});continue;}
      const staged={};
      for(const [division,{source,bouts}] of Object.entries(email.divisions)){
        const {rows,unknown}=emailBoutsToJsaRows({division,bouts,roster});
        staged[division]={rows,unknown,source};
      }
      for(const [division,{rows,unknown,source}] of Object.entries(staged)){
        const old=next.pages[division]?.[email.day];
        if(old&&old.status==='available'&&old.via!=='email'){
          report.push({file:name,division,day:email.day,status:'kept',reason:'JSA scraper page already collected'});continue;
        }
        const same=old&&old.via==='email'&&JSON.stringify(old.rows)===JSON.stringify(rows);
        (next.pages[division] ||= {})[email.day]=same?old:
          {status:'available',heading:'Day '+email.day,rows,via:'email',source,fetchedAt:now};
        report.push({file:name,division,day:email.day,status:same?'unchanged':'applied',bouts:rows.length,untracked:unknown.length});
      }
    }catch(error){
      report.push({file:name,status:'rejected',reason:String(error.message).slice(0,200)});
    }
  }
  return {next,report};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const details=JSON.parse(await readFile(DETAILS,'utf8'));
  const roster=JSON.parse(await readFile(ROSTER,'utf8')).rikishi;
  const bashoId=String(details.bashoId||'');
  const previous=await readFile(OUT,'utf8').then(JSON.parse).catch(()=>null);
  const names=(await readdir(INBOX).catch(()=>[])).filter(n=>n.endsWith('.txt'));
  const files=await Promise.all(names.map(async name=>({name,text:await readFile(`${INBOX}/${name}`,'utf8')})));
  const {next,report}=applyEmails({files,previous,bashoId,roster});
  for(const r of report)if(r.status==='rejected')console.warn('Rejected '+r.file+': '+r.reason);
  if(JSON.stringify(next)!==JSON.stringify(previous)){
    await writeFile(OUT+'.tmp',JSON.stringify(next,null,1)+'\n');
    await rename(OUT+'.tmp',OUT);
  }
  console.log(JSON.stringify({status:'ok',report}));
}
