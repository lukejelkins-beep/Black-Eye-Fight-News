/**
 * Verify GitHub-stored Instagram credential without logging secrets or IDs.
 * API checks only; do not publish own-account details on the public website.
 */
const token=(process.env.INSTAGRAM_ACCESS_TOKEN||'').trim();
const version=/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||'')?process.env.META_GRAPH_VERSION:'v26.0';
if(!token){console.log('INSTAGRAM_TOKEN: NOT_CONFIGURED');process.exitCode=1}
else {
 const probe=async (tag,url)=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try {
   const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:controller.signal});
   const data=await response.json().catch(()=>({}));
   return {tag,ok:response.ok&&!data.error,data:response.ok&&!data.error?data:null,
    status:response.status,
    errorCode:Number.isInteger(data?.error?.code)?data.error.code:null,
    errorSubcode:Number.isInteger(data?.error?.error_subcode)?data.error.error_subcode:null};
  }catch{return {tag,ok:false,data:null,status:0,errorCode:null,errorSubcode:null}}
  finally{clearTimeout(timeout)}
 };
 const summary=r=>console.log('INSTAGRAM_PROBE '+r.tag+' '+(r.ok?'OK':'UNAVAILABLE')+' HTTP='+r.status+
   (r.errorCode!==null?' code='+r.errorCode:'')+
   (r.errorSubcode!==null?' subcode='+r.errorSubcode:''));
 const [fb,ig]=await Promise.all([
  probe('facebook-graph','https://graph.facebook.com/'+version+'/me?fields=id'),
  probe('instagram-graph','https://graph.instagram.com/me?fields=id,username,account_type')
 ]);
 summary(fb);summary(ig);
 if(!fb.ok&&!ig.ok){
  console.log('INSTAGRAM_RESULT: TOKEN_NOT_ACCEPTED_BY_TESTED_GRAPH_ENDPOINTS; check token type, permissions and expiry.');
  process.exitCode=1;
 }else {
  if(fb.ok){
   const [assigned,pages]=await Promise.all([
    probe('assigned-instagram-accounts','https://graph.facebook.com/'+version+'/me/assigned_instagram_accounts?fields=id,username&limit=50'),
    probe('page-linked-instagram-accounts','https://graph.facebook.com/'+version+'/me/accounts?fields=id,instagram_business_account%7Bid%2Cusername%7D&limit=50')
   ]);
   summary(assigned);summary(pages);
   const a=Array.isArray(assigned.data?.data)?assigned.data.data.length:0;
   const b=Array.isArray(pages.data?.data)?pages.data.data.filter(p=>p.instagram_business_account?.id).length:0;
   console.log('INSTAGRAM_ASSETS assigned='+a+' pageLinked='+b);
   console.log(a||b?'INSTAGRAM_RESULT: FB_GRAPH_TOKEN_ACCEPTED_AND_ASSETS_DISCOVERED; public athlete posts need Business Discovery approval.':'INSTAGRAM_RESULT: FB_GRAPH_TOKEN_ACCEPTED_BUT_NO_IG_ASSET_DISCOVERED; check asset assignment and Page permissions.');
   if(a||b){
    const candidates=[...(Array.isArray(assigned.data?.data)?assigned.data.data.map(x=>x.id):[]),
                      ...(Array.isArray(pages.data?.data)?pages.data.data.map(x=>x.instagram_business_account?.id):[])].filter(x=>/^\d+$/.test(String(x||'')));
    const ownId=candidates[0];
    if(ownId){
     const fields='business_discovery.username(ufc){id,username,media.limit(1){id,timestamp,permalink}}';
     const check=await probe('business-discovery','https://graph.facebook.com/'+version+'/'+encodeURIComponent(ownId)+'?'+new URLSearchParams({fields}));
     summary(check);
     const username=check.data?.business_discovery?.username;
     const posts=Array.isArray(check.data?.business_discovery?.media?.data)?check.data.business_discovery.media.data.length:0;
     console.log('INSTAGRAM_PUBLIC_POST_DISCOVERY '+(check.ok&&username==='ufc'?'AVAILABLE':'UNAVAILABLE')+' sampleItems='+posts);
    }
   }
  }
  if(ig.ok){
   const self=await probe('own-media','https://graph.instagram.com/me/media?fields=id,caption,timestamp,permalink,media_type&limit=1');
   summary(self);
   console.log('INSTAGRAM_OWN_MEDIA_ACCESS '+(self.ok?'AVAILABLE':'UNAVAILABLE'));
   console.log('INSTAGRAM_RESULT: INSTAGRAM_LOGIN_TOKEN_ACCEPTED; own media access does not grant other fighter posts.');
  }
 }
}
