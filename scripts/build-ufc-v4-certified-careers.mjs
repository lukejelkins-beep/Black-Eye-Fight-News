#!/usr/bin/env node
/** Writes data/ufc-v4-certified-careers.json from the offline Stage 3 certification queue (R2, verified career view).
 *
 * Offline and read-only: no provider call, no collector write. Run the same two steps CI runs first:
 *   node scripts/ufc-36-month-stage3-progress.mjs && node scripts/ufc-v4-certification-queue.mjs
 * then this script. `--check` rebuilds in memory and fails if the committed file differs (use in review).
 *
 * The file lists ONLY fighters in the queue's `certified` lane (independently verified full UFC career), with the
 * number of official UFC bouts that certificate covers up to `certifiedThrough` (the evidence cutoff). A fight dated
 * after that day is not covered and is shown as newer. A fighter in `fastLane` or `exceptions` is never listed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(root,'data/ufc-v4-certified-careers.json');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
/* Two certified fighters are filed under a different slug in the stats build (the collector names them "Bruno Silva" and
 * "HyunSung Park"). stats slug -> certified slug. Each is verified bout for bout against the register before it is written;
 * a mismatch stops the build rather than attaching a certificate to the wrong fighter. */
export const STATS_ALIASES={'bruno-silva':'bruno-gustavo-da-silva','hyunsung-park':'park-hyun-sung'};
const fold=t=>String(t||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const RESULT={win:'W',loss:'L',no_contest:'NC',draw:'D'};
export function verifyAlias(statsFile,registerEntry,cutoff){
 const stats=(statsFile.fights||[]).filter(f=>f.date<=cutoff);
 const bouts=registerEntry?.bouts||[];
 if(!bouts.length||stats.length!==bouts.length)return false;
 return bouts.every(b=>stats.some(f=>fold(f.opponent)===fold(b.opponent)&&f.outcome===RESULT[b.result]&&
  Math.abs(Date.parse(f.date)-Date.parse(b.date))<=86400000));
}
export function buildCertifiedCareers(queue,approval,progress,aliases){
 const lanes=queue?.lanes||{};
 const through=progress?.summary?.certificationEvidenceCutoff;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(through||''))throw new Error('no certification evidence cutoff in the Stage 3 report');
 const certified=Array.isArray(lanes.certified)?lanes.certified:[];
 const total=(lanes.certified?.length||0)+(lanes.fastLane?.length||0)+(lanes.exceptions?.length||0);
 if(queue?.schema!==1||queue?.scope!=='ufc-v4-certification-attempt-and-exception-queue')throw new Error('not a certification queue');
 if(total!==783||queue.totals?.approved!==783)throw new Error('queue does not partition the 783 approved fighters');
 const seen=new Set(),careers={};
 for(const c of certified){
  if(typeof c?.slug!=='string'||seen.has(c.slug))throw new Error('duplicate or invalid certified slug');
  seen.add(c.slug);
  if(!Number.isSafeInteger(c.knownUfcBouts)||c.knownUfcBouts<1)throw new Error('no bout count for '+c.slug);
  careers[c.slug]=c.knownUfcBouts;
 }
 for(const lane of ['fastLane','exceptions'])for(const c of lanes[lane]||[])if(seen.has(c.slug))throw new Error(c.slug+' is in two lanes');
 return {
  schema:1,scope:'ufc-v4-certified-careers',
  note:'Fighters whose full UFC career is independently verified (Stage 3 certified lane), with the number of official UFC bouts certified. Feeds the R2 verified career view, which is OFF by default (data/ufc-v4-flags.json). Rebuild with scripts/build-ufc-v4-certified-careers.mjs.',
  approvalHash:approval?.approvedRosterSha256,approved:783,certifiedCount:Object.keys(careers).length,
  queueAsOf:queue.asOf,certifiedThrough:through,
  statsAliases:aliases||{},
  certified:Object.fromEntries(Object.entries(careers).sort(([a],[b])=>a<b?-1:a>b?1:0))
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const progress=read('qa/ufc-36-month-stage3-progress.json'),register=read('data/ufc-independent-full-career-verification.json').fighters;
 const aliases={};
 for(const [statsSlug,certSlug] of Object.entries(STATS_ALIASES)){
  const p=path.join(root,'data/ufc-stats/fighters/'+statsSlug+'.json');
  if(!fs.existsSync(p)||!verifyAlias(JSON.parse(fs.readFileSync(p,'utf8')),register[certSlug],progress.summary.certificationEvidenceCutoff))
   throw new Error('alias '+statsSlug+' -> '+certSlug+' does not match the register bout for bout');
  aliases[statsSlug]=certSlug;
 }
 const out=buildCertifiedCareers(read('qa/ufc-v4-certification-queue.json'),read('data/ufc-36-month-roster-approval.json'),progress,aliases);
 const text=JSON.stringify(out,null,1)+'\n';
 if(process.argv.includes('--check')){
  if(!fs.existsSync(OUT)||fs.readFileSync(OUT,'utf8')!==text){console.error('data/ufc-v4-certified-careers.json is out of date');process.exit(1);}
  console.log('certified careers up to date: '+out.certifiedCount);
 }else{
  if(!fs.existsSync(OUT)||fs.readFileSync(OUT,'utf8')!==text)fs.writeFileSync(OUT,text);
  console.log('certified careers: '+out.certifiedCount+' of 783');
 }
}
