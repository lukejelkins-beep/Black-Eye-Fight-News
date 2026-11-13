/**
 * BEFN Threads Profile Discovery — secure, minimal review demonstrator.
 * Tokens are server-side memory only. No third-party content is exposed publicly
 * unless the viewer explicitly signs into Threads. No persistent token storage.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {handleTwitterWebhook} from './twitterapi-webhook.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(path.join(root, 'site.html'));
const RECORDER_PAGE = readFileSync(path.join(root, 'recorder.html'));
const APP_ID = (process.env.THREADS_APP_ID || '').trim();
const APP_SECRET = (process.env.THREADS_APP_SECRET || '').trim();
const BASE = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 10000);
const SCOPES = 'threads_basic,threads_profile_discovery';
const SESSIONS = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;
const LIMIT = 30;
const COOKIE = 'befn_threads_review_sid';

export function usernameValid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.]{1,30}$/.test(value);
}
export function safeResult(profile, rawPosts, username) {
  const obj = profile?.data && !Array.isArray(profile.data) ? profile.data : profile;
  const permitted = usernameValid(obj?.username) ? obj.username : username;
  const posts = Array.isArray(rawPosts?.data) ? rawPosts.data : [];
  return {
    profile: {
      username: permitted,
      name: String(obj?.name || '').slice(0, 100),
      biography: String(obj?.biography || '').slice(0, 350),
      isVerified: obj?.is_verified === true,
    },
    posts: posts.slice(0, 5).filter(p => {
      if (typeof p.permalink !== 'string') return false;
      try {
        const u = new URL(p.permalink);
        return u.protocol === 'https:' && ['www.threads.com','threads.com','www.threads.net','threads.net'].includes(u.hostname);
      } catch { return false; }
    }).map(p => ({
      text: String(p.text || '').slice(0, 900),
      timestamp: String(p.timestamp || '').slice(0, 50),
      permalink: p.permalink,
      username: usernameValid(p.username) ? p.username : permitted,
      mediaType: String(p.media_type || '').slice(0, 40)
    })),
  };
}
function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(payload));
}
function redirect(res, destination, cookie) {
  res.writeHead(302, {Location: destination, 'Cache-Control': 'no-store',
    ...(cookie ? { 'Set-Cookie': cookie } : {}) });
  res.end();
}
function cookieFor(id) {
  return COOKIE + '=' + id + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200';
}
function session(req, create = true) {
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(s => {
    const i = s.indexOf('=');
    return i > 0 ? [s.slice(0,i).trim(),s.slice(i+1).trim()] : ['', ''];
  }));
  const id = cookies[COOKIE] || '';
  if (SESSIONS.has(id)) {
    const s = SESSIONS.get(id);
    if (Date.now() - s.last < SESSION_TTL) {
      s.last = Date.now();
      return {id, s, fresh:false};
    }
    SESSIONS.delete(id);
  }
  if (!create) return null;
  const sid = randomBytes(32).toString('hex');
  const s = { last:Date.now(), token:null, oauthState:null, username:null, attempts:0, lastResult:null };
  SESSIONS.set(sid,s);
  return {id:sid, s, fresh:true};
}
function equal(a, b) {
  const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && timingSafeEqual(aa,bb);
}
async function getMeta(route, token) {
  const res = await fetch('https://graph.threads.net/v1.0/' + route, {
    headers:{Authorization:'Bearer ' + token, Accept:'application/json'},
    signal:AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const err = new Error('Meta did not allow this request.');
    err.httpStatus = res.status;
    err.metaCode = Number.isInteger(data?.error?.code) ? data.error.code : null;
    throw err;
  }
  return data;
}
async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id:APP_ID, client_secret:APP_SECRET, code,
    grant_type:'authorization_code', redirect_uri:BASE + '/oauth/callback'
  });
  const res = await fetch('https://graph.threads.net/oauth/access_token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:body.toString(),signal:AbortSignal.timeout(15000)
  });
  const payload=await res.json().catch(()=>({}));
  if (!res.ok || typeof payload.access_token !== 'string') {
    const err = new Error('Threads token exchange rejected.');
    err.httpStatus=res.status;
    err.metaCode=Number.isInteger(payload?.error?.code)?payload.error.code:null;
    throw err;
  }
  // Do not log or persist the token. Memory is intentionally temporary.
  return payload.access_token;
}
function errorObject(e) {
  return {message:String(e?.message || 'Request failed.').slice(0,160),
    httpStatus:Number.isInteger(e?.httpStatus)?e.httpStatus:null,
    metaCode:Number.isInteger(e?.metaCode)?e.metaCode:null};
}
function configured() {
  return /^\d+$/.test(APP_ID) && APP_SECRET.length > 5 &&
    BASE.startsWith('https://') && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(BASE);
}
function sendPage(res, sid) {
  res.writeHead(200, {
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Set-Cookie':cookieFor(sid)
  });
  res.end(PAGE);
}
export function makeServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname=url.pathname;
    const isRead=req.method==='GET';
    // Isolated, disabled-by-default pilot receiver. Existing Threads OAuth
    // routes are unchanged and the webhook is not exposed without secrets.
    if (pathname==='/webhooks/twitterapi'||pathname==='/webhooks/twitterapi/status')
      return handleTwitterWebhook(req,res);
    if (pathname==='/health' && isRead) {
      return json(res,200,{service:'BEFN Threads discovery',status:'ok',oauthConfigured:configured()});
    }
    if (pathname==='/' && isRead) {
      const s=session(req);
      return sendPage(res,s.id);
    }
    if (pathname==='/recorder' && isRead) {
      res.writeHead(200, {
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
        'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      });
      return res.end(RECORDER_PAGE);
    }
    if (pathname==='/api/status' && isRead) {
      const existing=session(req,false);
      return json(res,200,{
        oauthConfigured:configured(),
        connected:!!existing?.s?.token,
        username:existing?.s?.username || null,
        lastResult:existing?.s?.lastResult || null,
        remainingRequests:existing ? Math.max(0,LIMIT-existing.s.attempts):LIMIT,
        testAccount:'threads'
      });
    }
    if (pathname==='/auth/start' && isRead) {
      if (!configured()) return redirect(res,'/?error=configuration');
      const {id,s}=session(req);
      const state=randomBytes(32).toString('hex');
      s.oauthState=state;
      s.stateIssued=Date.now();
      const params=new URLSearchParams({
        client_id:APP_ID, redirect_uri:BASE+'/oauth/callback',
        response_type:'code',scope:SCOPES,state
      });
      return redirect(res,'https://threads.net/oauth/authorize?'+params,cookieFor(id));
    }
    if (pathname==='/oauth/callback' && isRead) {
      const existing=session(req,false);
      if (!existing || !existing.s.oauthState || Date.now()-existing.s.stateIssued>600000 ||
        !equal(existing.s.oauthState,url.searchParams.get('state'))) {
        return redirect(res,'/?error=invalid_state');
      }
      existing.s.oauthState=null;
      const code=url.searchParams.get('code');
      if (!code || url.searchParams.has('error')) return redirect(res,'/?error=denied');
      if (!configured()) return redirect(res,'/?error=configuration');
      try {
        existing.s.token=await exchangeCode(code);
        existing.s.attempts=0;
        existing.s.lastResult=null;
        const me=await getMeta('me?fields=id,username',existing.s.token);
        existing.s.username=usernameValid(me?.username) ? me.username : null;
        return redirect(res,'/?connected=1');
      } catch(e) {
        existing.s.token=null;
        existing.s.lastResult={outcome:'oauth_failed', ...errorObject(e)};
        return redirect(res,'/?error=oauth_failed');
      }
    }
    if (pathname==='/api/discover' && isRead) {
      const existing=session(req,false);
      if (!existing?.s?.token) return json(res,401,{error:'Connect your Threads account first.'});
      const username=(url.searchParams.get('username')||'').replace(/^@/,'').trim();
      if (!usernameValid(username)) return json(res,400,{error:'Enter an exact public Threads username (letters, numbers, dots or underscores).'});
      if (existing.s.attempts>=LIMIT) return json(res,429,{error:'This preview session has reached its API request limit.'});
      existing.s.attempts++;
      try {
        const p=await getMeta('profile_lookup?'+new URLSearchParams({username}),existing.s.token);
        let posts={data:[]},postError=null;
        try {
          posts=await getMeta('profile_posts?'+new URLSearchParams({
            username,fields:'id,username,text,timestamp,permalink,media_type',limit:'5'
          }),existing.s.token);
        } catch(e) { postError=errorObject(e); }
        const content=safeResult(p,posts,username);
        existing.s.lastResult={outcome:'profile_lookup_succeeded', username, checkedAt:new Date().toISOString(),
          postReadSucceeded:postError===null};
        return json(res,200,{...content,postError,permissionsNotice:
          'An official Meta profile may work with Standard Access. Other fighters usually require Advanced Access approval.'});
      } catch(e) {
        const detail=errorObject(e);
        existing.s.lastResult={outcome:'profile_lookup_failed',username,checkedAt:new Date().toISOString(),...detail};
        return json(res,502,{error:'Meta denied public profile discovery.',details:detail});
      }
    }
    if (pathname==='/logout' && req.method==='POST') {
      if (req.headers.origin!==BASE) return json(res,403,{error:'Invalid origin.'});
      const existing=session(req,false);
      if(existing)SESSIONS.delete(existing.id);
      return redirect(res,'/',COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    }
    return json(res,404,{error:'Not found'});
  });
}
const cleanup=setInterval(()=>{
  const now=Date.now();
  for(const [id,s] of SESSIONS) if(now-s.last>SESSION_TTL) SESSIONS.delete(id);
},600000);
cleanup.unref();
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeServer().listen(PORT,'0.0.0.0',()=>console.log('BEFN Threads review service listening on port '+PORT+
    ' (configuration '+(configured()?'ready':'incomplete')+')'));
}
