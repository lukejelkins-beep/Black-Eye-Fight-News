// Optional authenticated readers. Credentials are supplied only by Actions secrets.
export async function collectPlatforms(config, getJSON, insert, since) {
 const status=[];
 const platformConfig=config.platforms||{};
 const specs=[
  ['X','X_BEARER_TOKEN'],['Instagram','INSTAGRAM_ACCESS_TOKEN'],['Facebook','FACEBOOK_ACCESS_TOKEN'],['Reddit','REDDIT_ACCESS_TOKEN']
 ];
 for(const [platform,env] of specs){
  const token=process.env[env],cfg=platformConfig[platform]||{},sources=platform==='Reddit'?cfg.communities||[]:cfg.accounts||[];
  if(!token){status.push({platform,state:'not-connected',message:'Not connected — approved API access required.'});continue;}
  if(!sources.length){status.push({platform,state:'needs-approval',message:platform==='Instagram'?'Meta token verified; public fighter posts require Business Discovery permissions and a verified account list.':'API credential supplied; verified source accounts still required.'});continue;}
  let checked=0,failed=0;
  for(const src of sources){
   try{
    const headers={Authorization:'Bearer '+token};let rows=[];
    if(platform==='X'){
     if(!/^\d+$/.test(src.id||''))throw Error('Verified numeric account ID required');
     const q=new URLSearchParams({max_results:'20',exclude:'retweets,replies','tweet.fields':'created_at,author_id,public_metrics',start_time:new Date(since).toISOString()});
     const r=await getJSON('https://api.x.com/2/users/'+src.id+'/tweets?'+q,headers);
     rows=(r.data||[]).filter(p=>p.author_id===src.id).map(p=>({
      id:p.id,quote:p.text,postedAt:p.created_at,url:'https://x.com/i/status/'+p.id,
      engagement:{likes:p.public_metrics?.like_count,comments:p.public_metrics?.reply_count,shares:p.public_metrics?.repost_count??p.public_metrics?.retweet_count}
     }));
    }else if(platform==='Instagram'){
     const version=/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||'')?process.env.META_GRAPH_VERSION:'v26.0';
     let own=process.env.INSTAGRAM_USER_ID||'';
     if(!own){
      const assigned=await getJSON('https://graph.facebook.com/'+version+'/me/assigned_instagram_accounts?fields=id,username&limit=10',headers);
      const accounts=assigned?.data||[];
      if(accounts.length!==1||!/^\d+$/.test(String(accounts[0]?.id||'')))throw Error('Select one Instagram asset for Business Discovery');
      own=String(accounts[0].id);
     }
     if(!/^\d+$/.test(own)||!/^\w[\w.]*$/.test(src.username||''))throw Error('Instagram account or verified username missing');
     const fields='business_discovery.username('+src.username+'){id,username,media.limit(20){id,caption,timestamp,permalink,like_count,comments_count}}';
     const r=await getJSON('https://graph.facebook.com/'+version+'/'+own+'?'+new URLSearchParams({fields}),headers);
     if(r.business_discovery?.id!==src.id)throw Error('Account identity mismatch');
     rows=(r.business_discovery?.media?.data||[]).map(p=>({
      id:p.id,quote:p.caption,postedAt:p.timestamp,url:p.permalink,
      engagement:{likes:p.like_count,comments:p.comments_count}
     }));
    }else if(platform==='Facebook'){
     const version=process.env.META_GRAPH_VERSION;
     if(!/^\d+$/.test(src.id||'')||!/^v\d+\.\d+$/.test(version||''))throw Error('Page ID and Graph version required');
     const q=new URLSearchParams({fields:'id,message,created_time,permalink_url',limit:'20',since:String(Math.floor(since/1000))});
     const r=await getJSON('https://graph.facebook.com/'+version+'/'+src.id+'/posts?'+q,headers);
     rows=(r.data||[]).map(p=>({id:p.id,quote:p.message,postedAt:p.created_time,url:p.permalink_url}));
    }else{
     if(!/^\w+$/.test(src.name))throw Error('Invalid community');
     const r=await getJSON('https://oauth.reddit.com/r/'+src.name+'/hot?limit=40&raw_json=1',headers);
     rows=(r.data?.children||[]).map(x=>x.data).filter(p=>!p.over_18&&!p.stickied&&!p.removed_by_category&&p.author!=='[deleted]'&&p.score>=10&&p.num_comments>=5).map(p=>({id:p.name,name:'u/'+p.author,handle:'r/'+p.subreddit,role:'fan',quote:p.title,postedAt:new Date(p.created_utc*1000).toISOString(),url:'https://www.reddit.com'+p.permalink,engagement:{comments:p.num_comments}}));
    }
    checked++;
    for(const p of rows)insert({platform,sport:src.sport,type:'post',name:src.name,handle:src.username?'@'+src.username:'',role:src.role||'media',fighterTier:src.fighterTier,photo:src.photo||'',source:platform+' API',...p});
   }catch{failed++;}
  }
  status.push({platform,state:checked?'connected':'unavailable',checked,failed,message:checked?checked+' sources checked'+(failed?'; '+failed+' unavailable.':'.'):'Connection failed; retained posts keep their original dates.'});
 }
 return status;
}
