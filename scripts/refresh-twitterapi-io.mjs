/**
 * GitHub Actions entry point: reserve | collect
 *
 * Never run "collect" without a previously committed budget reservation.
 * Exactly one HTTP GET is made, with no retry or pagination. The caller
 * must store the reserved ledger in GitHub before invoking "collect".
 *
 * The API key is read ONLY from GitHub Actions secret
 * TWITTERAPI_IO_API_KEY, never printed or written to the repository.
 */
import fs from 'node:fs';
import {X_POLICY,accountGroups,buildQuery,reservePlan,
 finalizeLedger,normalizeTweets,mergeXFeed} from './twitterapi-io-core.mjs';
const budgetPath='data/fight-talk-x-budget.json';
const feedPath='data/fight-talk-x-api.json';
const config=JSON.parse(fs.readFileSync('data/fight-talk-sources.json','utf8'));
const read=(p,fallback)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return fallback}};
const write=(p,obj)=>fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n');
const key=String(process.env.TWITTERAPI_IO_API_KEY||'').trim();
const cmd=process.argv[2];
const now=Date.now(),checkedAt=new Date(now).toISOString();
const budget=read(budgetPath,{});
if(cmd==='reserve'){
 const plan=reservePlan(budget,config,now,!!key);
 if(plan.reason==='reserved')write(budgetPath,plan.state);
 console.log('BEFN X budget gate:',plan.reason,
  '; tracked groups:',accountGroups(config).length,
  '; reserved USD:',(plan.state.reservedMicroUsd||0)/1e6,
  '; monthly internal allowance USD:',X_POLICY.internalMonthlyReserveMicroUsd/1e6);
 process.exit(0);
}
if(cmd!=='collect')throw Error('Usage: node scripts/refresh-twitterapi-io.mjs reserve|collect');
if(!key||!budget.pending){
 console.log('BEFN X collection skipped: key or committed reservation unavailable.');
 process.exit(0);
}
const p=budget.pending;
const age=now-Date.parse(p.reservedAt||'');
if(!Number.isFinite(age)||age<0||age>45*60_000){
 // No paid call on stale, tampered or otherwise invalid reservations.
 write(budgetPath,finalizeLedger(budget,{result:{ok:false},at:checkedAt,reason:'Stale budget reservation; skipped API request'}));
 console.log('BEFN X collection skipped: reservation expired.');
 process.exit(0);
}
const allGroups=accountGroups(config);
const group=allGroups[p.groupIndex];
if(!group||group.length!==p.handles?.length||
   group.some((x,i)=>x.username.toLowerCase()!==p.handles[i].toLowerCase())){
 write(budgetPath,finalizeLedger(budget,{result:{ok:false},at:checkedAt,reason:'Account watchlist changed since reservation; skipped API request'}));
 console.log('BEFN X collection skipped: group mismatch after account directory change.');
 process.exit(0);
}
// Build a multi-author search. This checks up to eight PUBLIC tracked accounts
// per request, instead of paying for one timeline lookup per account.
const query=buildQuery(group,now);
const url='https://api.twitterapi.io/twitter/tweet/advanced_search?'+new URLSearchParams({
 query,queryType:'Latest'
});
let returnedCount=0,parsedPosts=[],apiError=null,pause=false;
try{
 const response=await fetch(url,{
  method:'GET',
  headers:{'X-API-Key':key,'Accept':'application/json'},
  signal:AbortSignal.timeout(20000)
 });
 if(!response.ok){
  // Do not print response body or headers. They might contain account details.
  const status=response.status;
  pause=[401,402,403].includes(status);
  throw Error('TwitterAPI.io returned HTTP '+status);
 }
 const body=await response.json();
 if(body?.status==='error'){
  pause=true;
  throw Error('TwitterAPI.io returned an account or plan error');
 }
 if(!Array.isArray(body?.tweets))throw Error('TwitterAPI.io response lacks tweets array');
 returnedCount=body.tweets.length;
 parsedPosts=normalizeTweets(body,group,now);
}catch(e){
 apiError=String(e?.message||e).slice(0,130);
 if(/more than the priced 20-post page/.test(apiError))pause=true;
}
if(apiError){
 // The pessimistic cost reservation remains spent, even if the provider
 // request failed or returned an unusable result. We do not retry.
 const next=finalizeLedger(budget,{result:{ok:false,returnedCount,pause},at:checkedAt,reason:apiError});
 write(budgetPath,next);
 const original=read(feedPath,{posts:[]});
 write(feedPath,{...original,attemptedAt:checkedAt,
  status:pause?'paused':'unavailable',
  message:pause?'X provider disabled for protection; inspect GitHub Actions and prepaid balance.':
   'X API temporarily unavailable; existing public posts retained.',
  lastErrorCode:apiError.startsWith('TwitterAPI.io returned HTTP ')?apiError:'Provider response unavailable',
  paidXApiCalls:(original.paidXApiCalls||0)+1,
  budgetMonth:next.month,estimatedReservedUsd:next.reservedMicroUsd/1e6,
  posts:mergeXFeed(original,[],now)});
 console.log('BEFN X request attempted without automatic retry. Status:',pause?'paused':'temporarily unavailable',
  '; kept existing original posts.');
 process.exit(0);
}
const prior=read(feedPath,{posts:[]});
const next=finalizeLedger(budget,{result:{ok:true,returnedCount},at:checkedAt});
const merged=mergeXFeed(prior,parsedPosts,now);
write(budgetPath,next);
write(feedPath,{
 platform:'X',status:'connected',type:'original-source-posts',
 attemptedAt:checkedAt,checkedAt,updatedAt:checkedAt,
 trackedAccounts:config.platforms?.X?.accounts?.length||0,
 groupAccounts:p.handles,groupIndex:p.groupIndex,
 groupCount:allGroups.length,groupsChecked:1,
 returnedCount,matchedOriginalPosts:parsedPosts.length,postCount:merged.length,
 paidXApiCalls:(prior.paidXApiCalls||0)+1,
 budgetMonth:next.month,estimatedReservedUsd:next.reservedMicroUsd/1e6,
 monthlyBudgetUsd:X_POLICY.monthlyUsdLimit,
 billingNote:'Pessimistic request reservations, not confirmed provider charges. Provider prepaid balance and disabled auto top-ups remain necessary.',
 posts:merged
});
console.log('BEFN X read-only search: checked',group.length,'verified account handles; returned',
 returnedCount,'X posts; accepted',parsedPosts.length,'original tracked-author posts; cached',merged.length,
 '; reserved USD this UTC month:',(next.reservedMicroUsd/1e6).toFixed(4));
