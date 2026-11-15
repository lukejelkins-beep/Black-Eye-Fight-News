/**
 * Add selected Wikimedia Commons photographs to the isolated Sumo test branch
 * only, after strict public-licence, source-identity and JPEG validation.
 * Runs from the test-branch worktree; never touches production.
 */
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
const CANDIDATES=process.env.SUMO_CC_CANDIDATES;
const PHOTO_MANIFEST='data/sumo/approved-photos.json';
const CREDITS='sumo-photo-credits.html';
const SYNC_STATUS='data/sumo/photo-import-status.json';
const UA='BEFN-Sumo-Preview/0.1 (Wikimedia Commons licence verification; admin@blackeyefightnews.com.au)';
const LICENSE='https://creativecommons.org/licenses/by-sa/4.0/';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const checkedUrl=v=>{
 const u=new URL(String(v||''));
 if(u.protocol!=='https:'||u.host!=='commons.wikimedia.org'||
   !u.pathname.startsWith('/wiki/File:'))throw Error('Untrusted Commons file URI');
 return u.toString();
};
export function validatePhotoCandidates(data,roster){
 if(data?.schemaVersion!==1||data.mayStageForTestPreviewAfterVerification!==true||
    data.approvedForPublication!==false||data.productionPublished!==false||
    data.candidates?.length<1||data.candidates.length>8||roster?.count!==190)
  throw Error('Invalid research-only CC photo candidate policy');
 const seen=new Set();
 for(const c of data.candidates){
  if(seen.has(c.sourceId))throw Error('Repeated image identity');
  seen.add(c.sourceId);
  const w=roster.rikishi?.find(x=>Number(x.sourceId)===Number(c.sourceId));
  if(!w||w.shikonaEn!==c.shikonaEn||
    Number(w.officialNskId)!==Number(c.officialNskId))
   throw Error('Wrestler identity mismatch '+c.sourceId);
  if(c.license!=='CC BY-SA 4.0'||!c.credit||!c.author||
    !/^[a-zA-Z0-9 _.-]+\.jpe?g$/i.test(c.fileTitle)||
    !/^assets\/sumo-photos\/[a-z0-9_-]+\.jpg$/.test(c.desiredLocalPath)||
    !c.desiredLocalPath.includes('-'+c.sourceId+'.jpg'))
   throw Error('Untrusted source image metadata');
  checkedUrl(c.commonsPage);
 }
 return true;
}
export function validateCommonsImageMetadata(c,api){
 const pages=Object.values(api?.query?.pages||{});
 if(pages.length!==1)throw Error('Wikimedia did not return a unique source file');
 const page=pages[0],ii=page.imageinfo?.[0];
 if(!ii||page.missing!==undefined||
   String(page.title||'').replace(/^File:/,'').replace(/ /g,'_')!==
     String(c.fileTitle).replace(/ /g,'_'))
  throw Error('Wikimedia file identity changed');
 const license=String(ii.extmetadata?.LicenseShortName?.value||'').replace(/<[^>]*>/g,'').trim();
 if(!/^CC BY-SA 4\.0$/i.test(license))throw Error('License does not match approved candidate');
 const size=Number(ii.size);
 if(!Number.isFinite(size)||size<30_000||size>8_000_000)throw Error('Image size outside safe bounds');
 const url=new URL(ii.url);
 if(url.protocol!=='https:'||url.host!=='upload.wikimedia.org'||
    !url.pathname.startsWith('/wikipedia/commons/')||
    !/\.jpe?g$/i.test(url.pathname))
  throw Error('Unexpected original Wikimedia file URL');
 return {url:url.toString(),license,size};
}
const fetchJson=async url=>{
 const response=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json'},
   signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Wikimedia API HTTP '+response.status);
 return response.json();
};
const getPhoto=async c=>{
 const q=new URL('https://commons.wikimedia.org/w/api.php');
 for(const [k,v] of Object.entries({action:'query',format:'json',prop:'imageinfo',
   iiprop:'url|size|extmetadata',titles:'File:'+c.fileTitle}))q.searchParams.set(k,v);
 const source=validateCommonsImageMetadata(c,await fetchJson(q));
 const response=await fetch(source.url,{
  headers:{'User-Agent':UA,Accept:'image/jpeg'},
  signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Wikimedia image HTTP '+response.status);
 if(!/image\/jpeg/i.test(response.headers.get('content-type')||''))
  throw Error('Unexpected MIME for candidate JPEG');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length!==source.size||bytes.length<30000||
   bytes[0]!==0xff||bytes[1]!==0xd8||
   bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)
  throw Error('Incomplete JPEG or incompatible metadata size');
 return {bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
};
export function creditsDocument(manifest){
 const images=Object.values(manifest?.bySourceId||{})
   .filter(x=>x.approved===true).sort((a,b)=>a.name.localeCompare(b.name));
 const items=images.map(x=>'<li><strong>'+html(x.name)+'</strong> — Photograph by '+
  html(x.author)+'. <a href="'+html(checkedUrl(x.sourceUrl))+'">Source photograph</a> · '+
  '<a href="'+LICENSE+'">CC BY-SA 4.0</a> · Changes: '+
  html(x.changes||'None; original JPEG retained')+'.</li>').join('\n');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sumo Photo Credits | BEFN</title><style>body{max-width:850px;margin:3rem auto;padding:0 1rem;font:16px/1.6 system-ui;background:#f8f2e4;color:#1b1b1b}a{color:#59513b}li{margin:1rem 0}</style></head><body><a href="sumo.html">Return to Sumo</a><h1>Sumo photograph credits</h1><p>Photos are from individual Wikimedia Commons creators. The original files are hosted locally for this test website; their licences, original source pages and photographers are acknowledged below.</p><ul>'+items+'</ul><p>Images in wrestler cards may be visually cropped by the webpage; the locally stored JPEG files have not been edited. Other wrestler tiles use an illustrated placeholder, not an unlicensed photograph.</p></body></html>\n';
}
async function writeIfChanged(path,contents){
 await mkdir(dirname(path),{recursive:true});
 const old=await readFile(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const bytes=Buffer.isBuffer(contents)?contents:Buffer.from(contents);
 if(old&&old.equals(bytes))return false;
 const tmp=path+'.tmp';await writeFile(tmp,bytes);
 await rename(tmp,path);return true;
}
async function main(){
 if(process.env.SUMO_ISOLATED_TEST_WORKTREE!=='true'||
    !CANDIDATES||!process.cwd().includes('befn-sumo-cc-preview-'))
  throw Error('This image stage can run only inside an isolated Sumo preview worktree');
 const data=await read(CANDIDATES);
 const roster=await read('data/sumo/rikishi-index.json');
 validatePhotoCandidates(data,roster);
 const manifest=await optional(PHOTO_MANIFEST)||{
  schemaVersion:1,description:'Approved, locally hosted Sumo photographs with proper attribution',
  bySourceId:{}};
 const pending=[];
 for(const c of data.candidates){
  const entry=manifest.bySourceId?.[String(c.sourceId)];
  if(entry?.approved!==true||entry.path!==c.desiredLocalPath){
   pending.push(c);continue;
  }
  try{
   const file=await stat(c.desiredLocalPath);
   if(file.size<30000||file.size>8000000)pending.push(c);
  }catch(e){
   if(e.code!=='ENOENT')throw e;
   pending.push(c);
  }
 }
 if(!pending.length){
  await writeIfChanged(SYNC_STATUS,JSON.stringify({
    schemaVersion:1,status:'source-validated',
    approvedLocalPhotos:data.candidates.length,unresolved:[],errors:[],
    nextAttemptAfter:null,productionPublished:false,
    note:'All candidate original JPEGs are locally staged and manifest-approved; additional QA independently verifies image hashes and attribution.'
  },null,2)+'\n');
  console.log(JSON.stringify({status:'all-vetted-portraits-already-staged',
    previewOnly:true,photoCount:data.candidates.length,production:false}));
  return;
 }
 const prior=await optional(SYNC_STATUS);
 if(prior?.nextAttemptAfter&&Date.now()<Date.parse(prior.nextAttemptAfter)){
  console.log(JSON.stringify({status:'photo-source-cooldown',until:prior.nextAttemptAfter,
    pending:pending.length,previewOnly:true}));
  return;
 }
 let newlyApproved=0,errors=[];
 for(const c of data.candidates){
  const id=String(c.sourceId);
  const current=manifest.bySourceId?.[id];
  if(current?.approved===true){
   if(current.path!==c.desiredLocalPath||current.license!=='CC BY-SA 4.0')
    throw Error('Existing approved photo differs from vetted source '+id);
   try{const x=await stat(current.path);if(x.size>=30000)continue;}
   catch(e){if(e.code!=='ENOENT')throw e;}
  }
  // Never silently overwrite an image not already approved in the manifest.
  try{await stat(c.desiredLocalPath);errors.push(id+':unreviewed-local-file-exists');continue;}
  catch(e){if(e.code!=='ENOENT')throw e;}
  try{
   const photo=await getPhoto(c);
   await writeIfChanged(c.desiredLocalPath,photo.bytes);
   manifest.bySourceId[id]={
    approved:true,path:c.desiredLocalPath,name:c.shikonaEn,
    sourceId:c.sourceId,officialNskId:c.officialNskId,
    license:'CC BY-SA 4.0',licenseUrl:LICENSE,
    credit:c.credit,author:c.author,sourceUrl:c.commonsPage,
    changes:'None; original JPEG retained (CSS may crop on screen)',
    sha256:photo.sha256,verification:'Wikimedia Commons imageinfo CC BY-SA 4.0 and original JPEG validated',
    approvedScope:'Sumo test preview only; no production deployment'};
   newlyApproved++;
  }catch(e){errors.push(id+':'+String(e.message||e).slice(0,100));}
 }
 const approved=Object.values(manifest.bySourceId).filter(x=>x.approved).length;
 await writeIfChanged(PHOTO_MANIFEST,JSON.stringify(manifest,null,2)+'\n');
 await writeIfChanged(CREDITS,creditsDocument(manifest));
 const now=new Date();
 await writeIfChanged(SYNC_STATUS,JSON.stringify({
  schemaVersion:1,at:now.toISOString(),
  status:errors.length?'partial-source-verification-or-download-failure':'source-validated',
  approvedLocalPhotos:approved,
  unresolved:data.candidates.filter(c=>!manifest.bySourceId?.[String(c.sourceId)]?.approved)
    .map(c=>c.sourceId),
  errors,productionPublished:false,
  nextAttemptAfter:errors.length?new Date(now.getTime()+6*60*60*1000).toISOString():null,
  note:'A source/rights error never counts as approval, and existing local assets remain untouched.'
 },null,2)+'\n');
 console.log(JSON.stringify({previewOnly:true,verifiedNewPhotos:newlyApproved,
   totalLocalApprovedPhotos:approved,skippedOrBlocked:errors,production:false}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
