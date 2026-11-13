import test from 'node:test';
import assert from 'node:assert/strict';
import {makeServer, usernameValid, safeResult} from './server.mjs';
import {pilotRules,verifyHeader,webhookEnabled,parseWebhook,persistGithub} from './twitterapi-webhook.mjs';

test('Only exact public Threads handles are accepted',()=>{
  for(const s of ['threads','hello.world','fighter_27','A'])assert.equal(usernameValid(s),true);
  for(const s of ['', '@threads','name with spaces','bad/name','x'.repeat(31),'a?access_token=secret'])assert.equal(usernameValid(s),false);
});
test('Only genuine Threads permalinks are ever linked',()=>{
  const payload=safeResult({username:'threads',name:'Threads'},
    {data:[
      {text:'Original post',username:'threads',permalink:'https://www.threads.com/@threads/post/ABCDEF01',timestamp:'2026-11-11'},
      {text:'fake',permalink:'https://example.com/steal'},
      {text:'fake2',permalink:'javascript:alert(1)'}
    ]},'threads');
  assert.equal(payload.posts.length,1);
  assert.equal(payload.profile.username,'threads');
});
test('OAuth routes enforce server configuration and do not expose tokens',async()=>{
  const server=makeServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  try{
    const h=await fetch(url+'/health');assert.equal(h.status,200);
    const status=await (await fetch(url+'/api/status')).json();
    assert.equal(status.connected,false);assert(!('token' in status));
    const page=await fetch(url+'/');
    assert.equal(page.status,200);
    // Recording studio route serves real screen capture UI without server uploads.
    const recordPage=await fetch(url+'/recorder');
    assert.equal(recordPage.status,200);
    const recordHtml=await recordPage.text();
    assert.match(recordHtml,/getDisplayMedia/);
    assert.match(recordHtml,/MediaRecorder/);
    assert.match(recordHtml,/Stop &amp; save video/);
    assert.equal(recordPage.headers.get('x-frame-options'),'DENY');
    assert.equal(page.headers.get('x-frame-options'),'DENY');
    assert.match(page.headers.get('set-cookie')||'',/HttpOnly; Secure; SameSite=Lax/);
    const starter=await fetch(url+'/auth/start',{redirect:'manual'});
    assert.equal(starter.status,302);
    // Render runs these build-time tests with its real environment variables.
    // A configured server must redirect securely to Threads OAuth; an unconfigured
    // local test must explain missing setup without ever exposing secrets.
    if (status.oauthConfigured) {
      const oauthUrl = new URL(starter.headers.get('location'));
      assert.equal(oauthUrl.origin, 'https://threads.net');
      assert.equal(oauthUrl.pathname, '/oauth/authorize');
      assert.equal(oauthUrl.searchParams.get('response_type'), 'code');
      assert.equal(oauthUrl.searchParams.get('scope'), 'threads_basic,threads_profile_discovery');
      assert.match(oauthUrl.searchParams.get('client_id') || '', /^[0-9]+$/);
      assert.match(oauthUrl.searchParams.get('state') || '', /^[0-9a-f]{64}$/);
      const callback = new URL(oauthUrl.searchParams.get('redirect_uri'));
      assert.equal(callback.protocol, 'https:');
      assert.equal(callback.pathname, '/oauth/callback');
    } else {
      assert.equal(starter.headers.get('location'), '/?error=configuration');
    }
    const xStatus=await (await fetch(url+'/webhooks/twitterapi/status')).json();
    assert.equal(xStatus.ruleCount,2);
    assert(!('key' in xStatus));
    if(!xStatus.ready){
      const xInactive=await fetch(url+'/webhooks/twitterapi',{method:'POST',
        headers:{'Content-Type':'application/json'},body:'{}'});
      assert.equal(xInactive.status,503,'Webhook must fail closed until explicitly configured');
    }
    const noToken=await fetch(url+'/api/discover?username=threads');
    assert.equal(noToken.status,401);
    const missingState=await fetch(url+'/oauth/callback?code=unsafe',{redirect:'manual'});
    assert.equal(missingState.headers.get('location'),'/?error=invalid_state');
    const logout=await fetch(url+'/logout',{method:'POST'});
    assert.equal(logout.status,403);
  }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
});

test('X webhook pilot covers 20 sourced handles in two inactive hourly rules',()=>{
 const rules=pilotRules();
 assert.equal(rules.length,2);
 assert(rules.every(r=>r.active===false&&r.intervalSeconds===3600&&r.value.length<=255));
 assert.equal(new Set(rules.flatMap(r=>r.accounts.map(a=>a.toLowerCase()))).size,20);
 assert.equal(verifyHeader('private-key','private-key'),true);
 for(const wrong of ['PRIVATE-KEY','private-key-extra','','private-ke'])
  assert.equal(verifyHeader(wrong,'private-key'),false);
 assert.equal(webhookEnabled({}),false);
});
test('X webhook validates provider envelope, pinned author identity and original post timestamps',()=>{
 const rule=pilotRules()[0],at=Date.parse('2026-11-13T00:00:00Z'),tweetAt=at-15*60_000;
 const tweetId=((BigInt(tweetAt)-1288834974657n)<<22n|123n).toString();
 const base={id:tweetId,createdAt:new Date(tweetAt).toISOString(),
  author:{userName:rule.accounts[0]},text:'Original fighter post about an upcoming bout',
  likeCount:7,replyCount:2,retweetCount:1};
 const envelope={event_type:'tweet',rule_tag:rule.tag,rule_value:rule.value,tweets:[
  base,{...base,author:{userName:'NotAllowlisted'}},
  {...base,isReply:true},{...base,retweeted_tweet:{id:'123'}}
 ]};
 const result=parseWebhook(envelope,at);
 assert.equal(result.posts.length,1);
 assert.equal(result.posts[0].verifiedHandle.toLowerCase(),rule.accounts[0].toLowerCase());
 assert.equal(result.posts[0].delivery,'webhook');
 assert(result.posts[0].url.includes('/status/'));
 assert.equal(parseWebhook({event_type:'test_webhook_url'}).test,true);
 assert.throws(()=>parseWebhook({...envelope,rule_tag:'Unknown'},at),/Unrecognized/);
 assert.throws(()=>parseWebhook({...envelope,rule_value:'from:someoneelse'},at),/Unexpected/);
 assert.throws(()=>parseWebhook({...envelope,tweets:'not an array'},at),/Invalid/);
});
test('X webhook saves only validated original public posts to GitHub without a network call in tests',async()=>{
 const rule=pilotRules()[0],at=Date.parse('2026-11-13T00:00:00Z'),tweetAt=at-15*60_000;
 const id=((BigInt(tweetAt)-1288834974657n)<<22n|1n).toString();
 const posts=parseWebhook({event_type:'tweet',rule_tag:rule.tag,rule_value:rule.value,
  tweets:[{id,createdAt:new Date(tweetAt).toISOString(),text:'UFC fight camp announced',
   author:{userName:rule.accounts[0]}}]},at).posts;
 let called=0,stored;
 const fakeFetch=async(url,options)=>{
  called++;
  assert.equal(url,'https://api.github.com/repos/lukejelkins-beep/Black-Eye-Fight-News/contents/data/fight-talk-x-api.json');
  assert.equal(options.headers.Authorization,'Bearer fixture-token');
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);
   stored=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
   assert.equal(body.sha,'known-sha');
   return {ok:true,status:200};
  }
  return {ok:true,status:200,json:async()=>({sha:'known-sha',
   content:Buffer.from(JSON.stringify({posts:[],paidXApiCalls:0})).toString('base64')})};
 };
 await persistGithub(posts,rule.tag,'fixture-token',fakeFetch);
 assert.equal(called,2);
 assert.equal(stored.posts.length,1);
 assert.equal(stored.posts[0].platform,'X');
 assert.equal(stored.posts[0].delivery,'webhook');
 assert.equal(stored.paidXApiCalls,0,'Do not conflate webhook provider billing with polling ledger');
});
