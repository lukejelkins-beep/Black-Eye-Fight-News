import assert from 'node:assert/strict';
import {publisherOf,RSS_FEEDS,parseRSS,discoveryCandidates,linkPriority,X_API_SPENDING} from '../scripts/fight-talk-public-sources.mjs';
import {collectPlatforms} from '../scripts/fight-talk-platforms.mjs';
const NOW='2026-11-11T12:00:00.000Z';
assert.equal(publisherOf('https://www.sherdog.com/news/news/test'),'Sherdog');
assert.equal(publisherOf('https://www.boxingnewsonline.net/boxing/test'),'Boxing News');
assert.equal(publisherOf('https://jp.rizinff.com/_ct/17700000'),'RIZIN');
assert.equal(publisherOf('https://mmajunkie.usatoday.com/story/sports/ufc/2026/11/11/test'),'MMA Junkie');
for(const url of ['https://evil.test/news','http://www.mmafighting.com/','https://mmafighting.com.evil.test/story',
 'https://mmafighting.com:444/post','https://user:pass@www.mmafighting.com/news'])
 assert.equal(publisherOf(url),'',url);
const xml='<?xml version="1.0"?><rss><channel>'+
 '<item><title><![CDATA[Fighter shares a new Instagram post]]></title><link>https://www.mmafighting.com/ufc/new-test</link><pubDate>Wed, 11 Nov 2026 09:30:00 GMT</pubDate></item>'+
 '<item><title>Old article</title><link>https://www.mmafighting.com/ufc/old</link><pubDate>Tue, 20 Oct 2026 09:30:00 GMT</pubDate></item>'+
 '<item><title>Unknown source</title><link>https://untrusted.test/post</link><pubDate>Wed, 11 Nov 2026 09:30:00 GMT</pubDate></item>'+
 '</channel></rss>';
const feed=RSS_FEEDS[0];
const parsed=parseRSS(xml,feed,Date.parse(NOW));
assert.equal(parsed.length,1);
assert.equal(parsed[0].sport,'mma');
assert.equal(parsed[0].source,'MMA Fighting');
assert.equal(parsed[0].title,'Fighter shares a new Instagram post');
const candidates=discoveryCandidates([
 {url:'https://www.mmafighting.com/ufc/reaction',sport:'mma',publishedAt:NOW,title:'Fighter shares Instagram reaction'},
 {url:'https://www.worldboxingnews.com/boxing/next',sport:'boxing',publishedAt:NOW,title:'Boxer response to opponent'},
 {url:'https://www.sherdog.com/ufc/anything',sport:'mma',publishedAt:NOW,title:'Post'},
 {url:'https://untrusted.test/fake',sport:'boxing',publishedAt:NOW,title:'post'},
 {url:'https://www.mmafighting.com/ufc/reaction?utm_medium=feed',sport:'mma',publishedAt:NOW,title:'Duplicate URL'},
],parsed,NOW,15);
assert(candidates.some(x=>x.sourceLabel==='MMA Fighting'));
assert(candidates.some(x=>x.sport==='boxing'));
assert(candidates.some(x=>x.origin==='official-homepage'));
assert(!candidates.some(x=>x.url.includes('untrusted.test')));
assert.equal(candidates.filter(x=>x.url.includes('/ufc/reaction')).length,1);
assert(linkPriority({role:'fighter',fighterTier:'champion',platform:'X'})>linkPriority({role:'media'}));
assert(linkPriority({role:'promoter'})>linkPriority({role:'commentator'}));
assert(linkPriority({role:'meme'})>linkPriority({role:'media'}),'Verified meme content can surface in original-post discovery');
assert.equal(X_API_SPENDING.monthlyUsdCap,2);
assert.equal(X_API_SPENDING.automaticPaidRequestsAllowed,0);
assert.equal(X_API_SPENDING.estimatedMonthlySpendUsd,0);
// Even if a paid X API credential exists, the collector must issue 0 paid X
// requests. Reject unsafe future refactors which accidentally re-enable it.
const existing=process.env.X_BEARER_TOKEN;
process.env.X_BEARER_TOKEN='budget-guard-test-not-a-real-token';
let calls=0;
try{
 const result=await collectPlatforms({
  platforms:{X:{accounts:[{username:'ufc',name:'UFC',sport:'mma',role:'promoter'}]}}
 },async()=>{calls++;throw Error('paid X API request attempted')},()=>{},Date.parse(NOW));
 assert.equal(calls,0,'Paid X API calls must always be zero');
 assert.equal(result.find(x=>x.platform==='X').paidApiCalls,0);
 assert.equal(result.find(x=>x.platform==='X').monthlyUsdCap,2);
} finally {
 if(existing===undefined)delete process.env.X_BEARER_TOKEN;
 else process.env.X_BEARER_TOKEN=existing;
}
console.log('Free Fight Talk sources, RSS verification, prioritisation and strict US$2 X budget guard passed.');
