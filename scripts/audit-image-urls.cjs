'use strict';
/* Network audit of remote editorial image endpoints. Does not download, rehost, or grant usage rights. */
const fs=require('node:fs');
const allowed=/^https:\/\//i;
const refs=new Map();
function include(url,context){
 if(typeof url!=='string'||!allowed.test(url)||!/\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)|\/(?:images?|photo|portraits?|headshots?|athlete|fighters?)\//i.test(url))return;
 if(!refs.has(url))refs.set(url,new Set());
 if(refs.get(url).size<5)refs.get(url).add(context.slice(0,110));
}
function scan(value,where='',key=''){
 if(typeof value==='string'){
  if(/^(photo|image|avatar|poster|thumbnail|portrait|headshot|urlimage)$/i.test(key))include(value,where);
 }else if(Array.isArray(value))value.forEach((item,i)=>scan(item,where+'['+i+']'));
 else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))scan(v,where?where+'.'+k:k,k);
}
const index=fs.readFileSync('index.html','utf8');
const regMatch=index.match(/<script[^>]*id="fighter-portrait-registry"[^>]*>([\s\S]*?)<\/script>/i);
if(!regMatch)throw Error('Fighter registry missing');
scan(JSON.parse(regMatch[1]),'fighterRegistry');
const dMatch=index.match(/<script>\s*window\.COMBAT_DATA\s*=\s*([\s\S]*?)<\/script>/i);
if(!dMatch)throw Error('Main content data missing');
scan(JSON.parse(dMatch[1].trim().replace(/;\s*$/,'')),'siteData');
const limit=Number(process.env.MAX_IMAGE_CHECKS||420);
const list=[...refs.entries()].slice(0,limit);
let next=0;
const findings=[];
async function probe(url,contexts){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
 try{
  const response=await fetch(url,{method:'GET',redirect:'follow',headers:{'Range':'bytes=0-511','User-Agent':'Mozilla/5.0 (compatible; BlackEyeFightNewsImageAudit/1.0)'},signal:controller.signal});
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const ok=response.ok&&mime.startsWith('image/');
  if(response.body)await response.body.cancel().catch(()=>{});
  return {url,context:[...contexts],status:ok?'reachable-image':response.ok?'unexpected-content-type':'http-error',httpStatus:response.status,mime};
 }catch(e){return {url,context:[...contexts],status:'request-failed',error:String(e.message||e).slice(0,100)}}
 finally{clearTimeout(timer)}
}
async function worker(){while(next<list.length){const [url,contexts]=list[next++];findings.push(await probe(url,contexts))}}
(async()=>{
 await Promise.all(Array.from({length:8},worker));
 findings.sort((a,b)=>a.status.localeCompare(b.status)||a.url.localeCompare(b.url));
 const counts={};
 for(const f of findings)counts[f.status]=(counts[f.status]||0)+1;
 const report={checkedAt:new Date().toISOString(),scope:'External editorial image URLs from the current website data and fighter catalogue. A GitHub runner image-response check, NOT browser image or copyright verification.',sourceUrlCount:refs.size,tested:findings.length,counts,results:findings};
 fs.mkdirSync('qa',{recursive:true});
 fs.writeFileSync('qa/image-url-audit.json',JSON.stringify(report,null,2)+'\n');
 console.log('Image endpoint audit',JSON.stringify({known:refs.size,tested:findings.length,counts}));
})();
