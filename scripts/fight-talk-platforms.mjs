/**
 * Official API readers for pinned fighter/promoter account watchlists.
 * Never scrape login walls, infer accounts from display names or invent posts.
 * Each account is identity-checked against the API username or numeric ID.
 * API credentials are injected from GitHub Actions secrets only.
 */
export async function collectPlatforms(config,getJSON,insert,since){
 const out=[],cfg=config.platforms||{};
 for(const [platform,env] of [['X','X_BEARER_TOKEN'],['Instagram','INSTAGRAM_ACCESS_TOKEN'],['Facebook','FACEBOOK_ACCESS_TOKEN'],['Reddit','REDDIT_ACCESS_TOKEN']]){
  const token=process.env[env],settings=cfg[platform]||{},sources=platform==='Reddit'?settings.communities||[]:settings.accounts||[];
  if(!token){out.push({platform,state:'not-connected',configured:sources.length,message:'Official API credential not supplied; selected original post embeds remain available.'});continue}
  if(!sources.length){out.push({platform,state:'needs-approval',configured:0,message:'No approved author accounts configured.'});continue}
  let checked=0,failed=0,posts=0; const problems=[];
  const headers={Authorization:'Bearer '+token};
  const version=/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||'')?process.env.META_GRAPH_VERSION:'v26.0';
  let own=String(process.env.INSTAGRAM_USER_ID||'');
  // Resolve the caller's Instagram professional asset only once per run.
  // If the token is Instagram Login-only or lacks Business Discovery permissions,
  // exit this platform cleanly rather than making dozens of failing API calls.
  if(platform==='Instagram'&&!/^\d+$/.test(own)){
   // Meta can expose linked Instagram assets via managed Pages or assigned assets.
   // The explicit INSTAGRAM_USER_ID secret takes precedence if the account has more than one.
   const discovered=[];
   for(const [route,extract] of [
    ['me/accounts?fields=id,instagram_business_account{id,username}&limit=50',
     row=>row.instagram_business_account?.id],
    ['me/assigned_instagram_accounts?fields=id,username&limit=50',
     row=>row.id]
   ]){
    try{
     const result=await getJSON('https://graph.facebook.com/'+version+'/'+route,headers);
     for(const row of result.data||[]){
      const id=String(extract(row)||'');
      if(/^\d+$/.test(id))discovered.push(id);
     }
    }catch{
     // A token can have access to one asset route but not the other.
    }
   }
   const ids=[...new Set(discovered)];
   if(ids.length===1)own=ids[0];
   else {
    out.push({platform,state:'unavailable',checked:0,failed:0,configured:sources.length,
     message:ids.length>1?
      'More than one Instagram asset found. Set INSTAGRAM_USER_ID to the intended linked professional account ID.':
      'No Facebook-linked Instagram professional asset found. Verify token login type, Page linkage and permissions, or set INSTAGRAM_USER_ID.'});
    continue;
   }
  }
  // Confirm Business Discovery itself before touching a large third-party watchlist.
  // A valid Graph token and a discovered asset do not imply this permission is approved.
  if(platform==='Instagram'){
   try{
    const fields='business_discovery.username(ufc){id,username}';
    const probe=await getJSON('https://graph.facebook.com/'+version+'/'+own+'?'+new URLSearchParams({fields}),headers);
    if(probe.business_discovery?.username?.toLowerCase()!=='ufc')throw Error('Business Discovery did not return the requested professional profile');
   }catch(e){
    out.push({platform,state:'unavailable',checked:0,failed:0,configured:sources.length,
     message:'Instagram Business Discovery not permitted ('+String(e.message||e).slice(0,60)+'). Check Meta app permissions and Page-linked professional access.'});
    continue;
   }
  }
  // Rate-limited platforms are scanned in small bounded concurrent batches.
  let cursor=0;
  async function one(src){
   let rows=[];
   const username=String(src.username||'').replace(/^@/,'');
   if(platform==='X'){
    if(!/^[\w]{1,15}$/.test(username))throw Error('Invalid X account handle');
    let id=String(src.id||''),profile={};
    if(!/^\d+$/.test(id)){
     const found=await getJSON('https://api.x.com/2/users/by/username/'+encodeURIComponent(username)+'?user.fields=profile_image_url',headers);
     profile=found.data||{};
     if(profile.username?.toLowerCase()!==username.toLowerCase()||!/^\d+$/.test(String(profile.id||'')))throw Error('X account identity not confirmed');
     id=String(profile.id);
    }
    const args=new URLSearchParams({max_results:'10',exclude:'retweets,replies','tweet.fields':'created_at,author_id',start_time:new Date(since).toISOString()});
    const reply=await getJSON('https://api.x.com/2/users/'+id+'/tweets?'+args,headers);
    rows=(reply.data||[]).filter(p=>String(p.author_id)===id&&/^\d+$/.test(String(p.id))).map(p=>({
     id:p.id,quote:p.text||'',postedAt:p.created_at,
     url:'https://x.com/'+username+'/status/'+p.id,photo:profile.profile_image_url||src.photo||''
    }));
   }else if(platform==='Instagram'){
    if(!/^[\w.]{2,30}$/.test(username))throw Error('Invalid Instagram account handle');
    if(!/^\d+$/.test(own)){
     const assigned=await getJSON('https://graph.facebook.com/'+version+'/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=50',headers);
     const instagramAssets=(assigned.data||[]).map(p=>p.instagram_business_account).filter(p=>/^\d+$/.test(String(p?.id||'')));
     if(instagramAssets.length!==1)throw Error('Set INSTAGRAM_USER_ID to your linked professional Instagram asset ID for Business Discovery');
     own=String(instagramAssets[0].id);
    }
    const fields='business_discovery.username('+username+'){id,username,name,profile_picture_url,media.limit(12){id,caption,timestamp,permalink}}';
    const result=await getJSON('https://graph.facebook.com/'+version+'/'+own+'?'+new URLSearchParams({fields}),headers);
    const person=result.business_discovery||{};
    if(person.username?.toLowerCase()!==username.toLowerCase()||!/^\d+$/.test(String(person.id||'')))throw Error('Instagram account identity not confirmed');
    if(src.id&&String(person.id)!==String(src.id))throw Error('Instagram account ID mismatch');
    rows=(person.media?.data||[]).filter(p=>typeof p.permalink==='string').map(p=>({
      id:p.id,quote:p.caption||'',postedAt:p.timestamp,url:p.permalink,
      photo:person.profile_picture_url||src.photo||''
    }));
   }else if(platform==='Facebook'){
    if(!/^\d+$/.test(String(src.id||'')))throw Error('Facebook Page ID required');
    const q=new URLSearchParams({fields:'id,message,created_time,permalink_url',limit:'10',since:String(Math.floor(since/1000))});
    const result=await getJSON('https://graph.facebook.com/'+version+'/'+src.id+'/posts?'+q,headers);
    rows=(result.data||[]).map(p=>({id:p.id,quote:p.message||'',postedAt:p.created_time,url:p.permalink_url}));
   }else{
    if(!/^\w+$/.test(src.name||''))throw Error('Invalid subreddit');
    const r=await getJSON('https://oauth.reddit.com/r/'+src.name+'/new?limit=30&raw_json=1',headers);
    rows=(r.data?.children||[]).map(x=>x.data).filter(p=>!p.over_18&&!p.stickied&&!p.removed_by_category&&p.author!=='[deleted]').map(p=>({
      id:p.name,name:'u/'+p.author,handle:'r/'+p.subreddit,role:'fan',quote:p.title,
      postedAt:new Date(p.created_utc*1000).toISOString(),url:'https://www.reddit.com'+p.permalink
    }));
   }
   checked++;
   for(const p of rows){
    if(!p.postedAt||Date.parse(p.postedAt)<since||!p.url)continue;
    const post={platform,sport:src.sport,type:'post',name:src.name,handle:username?'@'+username:'',role:src.role||'media',
      fighterTier:src.fighterTier,source:platform+' original author API',...p};
    insert(post);posts++;
   }
  }
  async function worker(){
   while(cursor<sources.length){
    const src=sources[cursor++];
    try{await one(src)}catch(e){
     failed++;
     if(problems.length<3)problems.push(String(e.message||e).slice(0,105));
    }
   }
  }
  await Promise.all(Array.from({length:Math.min(6,sources.length)},()=>worker()));
  out.push({platform,state:checked?'connected':'unavailable',checked,failed,configured:sources.length,posts,
   message:checked?checked+' of '+sources.length+' accounts checked; '+posts+' recent posts found'+(failed?'; '+failed+' inaccessible.':'.'):
    'Official API access unavailable or insufficient. '+problems.join(' | ')});
 }
 return out;
}
