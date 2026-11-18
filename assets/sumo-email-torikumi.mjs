/**
 * Next-day torikumi relayed by email. The owner's scheduled ChatGPT task reads the
 * Japan Sumo Association torikumi pages and emails them in a fixed layout; a Gmail
 * relay drops each email into data/sumo/email-inbox/. This module turns one email
 * into the same row shape the JSA scraper produces (see assets/sumo-jsa.mjs).
 *
 * Fail closed: anything that is not exactly the agreed layout, or that names a source
 * other than the JSA torikumi page for that division and day, is rejected whole.
 *
 * Agreed layout (subject: "BEFN torikumi 202611 day 12"):
 *   BASHO: 202611
 *   DAY: 12
 *   DIVISION: Makuuchi
 *   SOURCE: https://www.sumo.or.jp/EnHonbashoMain/torikumi/1/12/
 *   1. East Name (W-L) vs West Name (W-L)
 *   ...repeated for Juryo and Makushita
 */
import {JSA_BASE,JSA_DIVISION_TABS} from './sumo-jsa.mjs';

const SUBJECT=/^BEFN torikumi (20\d{4}) day (\d{1,2})$/i;
const BOUT=/^(\d{1,3})\.\s+(.+?)\s+\(([^()]*)\)\s+vs\.?\s+(.+?)\s+\(([^()]*)\)$/i;
const FIELD=/^(BASHO|DAY|DIVISION|SOURCE):\s*(.*)$/i;

export const jsaTorikumiUrl=(division,day)=>`${JSA_BASE}${JSA_DIVISION_TABS[division]}/${day}/`;

/** Names compare without case, spacing or diacritics: "Ōnosato" === "onosato". */
export const nameKey=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .toLowerCase().replace(/[^a-z]/g,'');

const record=s=>String(s||'').replace(/[‐-―−]/g,'-').replace(/\s+/g,' ').trim();

/**
 * @returns {{bashoId:string,day:number,divisions:Record<string,{source:string,bouts:{east:{name,record},west:{name,record}}[]}>}}
 * @throws Error naming the first problem found
 */
export function parseTorikumiEmail({subject,body}){
  const s=SUBJECT.exec(String(subject||'').replace(/\s+/g,' ').trim());
  if(!s)throw new Error('subject is not "BEFN torikumi <basho> day <N>"');
  const bashoId=s[1],day=Number(s[2]);
  if(day<1||day>15)throw new Error('day out of range: '+day);
  const head={},divisions={};
  let current=null;
  const seen=new Set();
  const lines=String(body||'').replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    const f=FIELD.exec(line);
    if(f){
      const key=f[1].toUpperCase(),value=f[2].trim();
      if(key==='BASHO'||key==='DAY'){
        if(current||key in head)throw new Error(key+' must appear once, before the divisions');
        head[key]=value;
      }else if(key==='DIVISION'){
        const name=Object.keys(JSA_DIVISION_TABS).find(d=>d.toLowerCase()===value.toLowerCase());
        if(!name)throw new Error('unknown division: '+value);
        if(divisions[name])throw new Error('division listed twice: '+name);
        current=divisions[name]={source:null,bouts:[]};
        current.name=name;
      }else{
        if(!current||current.source!==null||current.bouts.length)throw new Error('SOURCE must follow its DIVISION line');
        current.source=value;
      }
      continue;
    }
    const b=BOUT.exec(line);
    if(!b)throw new Error('unrecognised line: '+line.slice(0,80));
    if(!current||!current.source)throw new Error('bout listed before its DIVISION and SOURCE');
    if(Number(b[1])!==current.bouts.length+1)throw new Error(current.name+' bouts are not numbered 1, 2, 3...');
    const east={name:b[2].trim(),record:record(b[3])},west={name:b[4].trim(),record:record(b[5])};
    for(const w of [east,west]){
      const k=nameKey(w.name);
      if(!k)throw new Error('empty wrestler name');
      if(seen.has(k))throw new Error(w.name+' appears in more than one bout');
      seen.add(k);
    }
    current.bouts.push({east,west});
  }
  if(head.BASHO!==bashoId||Number(head.DAY)!==day)throw new Error('BASHO/DAY in the body do not match the subject');
  const names=Object.keys(divisions);
  if(!names.length)throw new Error('no divisions');
  for(const name of names){
    const d=divisions[name];
    const expected=jsaTorikumiUrl(name,day);
    if(d.source!==expected)throw new Error(name+' source must be '+expected+' (got '+String(d.source).slice(0,80)+')');
    if(!d.bouts.length)throw new Error(name+' has no bouts');
    delete d.name;
  }
  return {bashoId,day,divisions};
}

/** Divisions whose whole roster is tracked: every wrestler must be recognised. */
export const FULLY_TRACKED=Object.freeze(['Makuuchi','Juryo']);

/**
 * Map parsed bouts onto JSA-style rows using roster officialNskId, so the existing
 * jsaToTorikumiSource() conversion applies unchanged. Makushita bouts with a wrestler
 * outside the tracked roster keep nskId null and are dropped there, exactly as for
 * scraped JSA rows. In Makuuchi and Juryo an unknown name rejects the division.
 */
export function emailBoutsToJsaRows({division,bouts,roster}){
  const byName=new Map();
  for(const r of roster||[])if(r.officialNskId&&r.shikonaEn)byName.set(nameKey(r.shikonaEn),r);
  const unknown=[];
  const side=w=>{
    const r=byName.get(nameKey(w.name));
    if(!r)unknown.push(w.name);
    return {nskId:r?Number(r.officialNskId):null,rank:'',name:r?r.shikonaEn:w.name,record:w.record};
  };
  const rows=bouts.map(b=>({east:side(b.east),west:side(b.west),winner:null,kimarite:''}));
  if(unknown.length&&FULLY_TRACKED.includes(division))
    throw new Error(division+': not in the tracked roster: '+unknown.join(', '));
  return {rows,unknown};
}
