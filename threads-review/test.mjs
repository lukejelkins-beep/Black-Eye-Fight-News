import test from 'node:test';
import assert from 'node:assert/strict';
import {makeServer, usernameValid, safeResult} from './server.mjs';

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
    const noToken=await fetch(url+'/api/discover?username=threads');
    assert.equal(noToken.status,401);
    const missingState=await fetch(url+'/oauth/callback?code=unsafe',{redirect:'manual'});
    assert.equal(missingState.headers.get('location'),'/?error=invalid_state');
    const logout=await fetch(url+'/logout',{method:'POST'});
    assert.equal(logout.status,403);
  }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
});
