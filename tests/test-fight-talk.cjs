const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('news-publisher-link'),'MMA News retains a compact direct source link');
assert(html.includes('https://mmajunkie.usatoday.com/'),'MMA Junkie canonical reporting is directly linked');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(m[1].includes('application/json'))JSON.parse(m[2]);else new Function(m[2]);}
const fn=html.slice(html.indexOf('const talkPlatforms'),html.indexOf('/* Strip illustration initials'));

const selectedFeed=JSON.parse(fs.readFileSync('data/fight-talk-selected.json','utf8')).posts;
const fighterPosts=selectedFeed.filter(p=>p.role==='fighter');
const originalX=selectedFeed.filter(p=>p.platform==='X');
const originalInstagram=selectedFeed.filter(p=>p.platform==='Instagram');
assert(originalX.length>=10,'Provide a meaningful selection of original X posts');
assert(originalInstagram.length>=10,'Preserve Instagram fighter coverage');
assert(new Set(fighterPosts.map(p=>p.name)).size>=12,'Cover a variety of distinct fighters');
for(const p of originalX){
 const match=p.url.match(/^https:\/\/x\.com\/([A-Za-z0-9_]+)\/status\/(\d+)$/);
 assert(match,'Require a direct X post permalink');
 assert.equal('@'+match[1].toLowerCase(),p.handle.toLowerCase(),'Author handle must match the link');
 const postedAt=Number((BigInt(match[2])>>22n)+1288834974657n);
 assert(Math.abs(Date.parse(p.postedAt)-postedAt)<1000,'X timestamp must match the platform post ID');
}

class FixedDate extends Date {static now(){return Date.parse('2026-11-08T02:00:00Z');}}
const ctx={
 Date:FixedDate,URL,
 D:{fighters:[{name:'Champion Test',sport:'Boxing',category:'Prospect'}],champions:{boxing:[{name:'Champion Test'}]},social:{boxing:[{type:'thread',name:'Two fighters',title:'Boxing exchange',date:'16 Oct 2026 · X exchange',url:'https://example.com/coverage',steps:[{name:'One',quote:'First verified remark'},{name:'Two',quote:'Reply from opponent'}]},{name:'Archive author',platform:'X',date:'28 Oct 2026',quote:'Archive quote',url:'https://example.com/report'}]}},
 state:{social:'all',socialMode:'latest',socialPlatform:'all',socialPage:1,talkRole:'all',talkSort:'balanced'},
 esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),
 safeURL:s=>s,
 thumb:()=>'',
 renderFrame:s=>s,
 viewTitle:(...parts)=>parts.join(' ')
};
ctx.window={};ctx.navigator={language:'en-AU'};ctx.Intl=Intl;
vm.createContext(ctx);
// The Fight Talk view uses the same visitor-local clock as the website.
// Exercise the actual helper in the browser-like VM rather than mocking it.
vm.runInContext(fs.readFileSync('assets/local-time.js','utf8'),ctx,{filename:'assets/local-time.js'});
vm.runInContext(fn,ctx);
const posts=Array.from({length:12},(_,i)=>({name:i<8?'Busy author':'Other '+i,quote:'Distinct post '+i,postedAt:new Date(Date.UTC(2026,10,7,12,i)).toISOString()}));
const nativeEmbeds=Array.from({length:7},(_,i)=>({name:'Original Threads post',platform:'Threads',sport:'mma',role:'media',nativeEmbed:true,sourceLinkedAt:'2026-11-08T08:28:40Z',summary:'Original social post linked on official UFC homepage.',url:'https://www.threads.com/t/uniqueOriginal'+i+'/'}));
assert.equal(ctx.diverseTalk(nativeEmbeds).length,7,'Do not collapse independent real Threads posts with the same source-explanation text');
const out=ctx.diverseTalk(posts);assert.equal(out.filter(p=>p.name==='Busy author').length,3);assert.equal(new Set(out.slice(0,5).map(p=>p.name)).size,5);assert.equal(ctx.diverseTalk([posts[0],{...posts[0],name:'Crosspost'}]).length,1);
const champion={type:'post',name:'Champion Test',role:'fighter',sport:'boxing',platform:'Instagram',postedAt:'2026-11-06',summary:'Champion training update',engagement:{likes:7000,comments:230},url:'https://www.instagram.com/champion/p/abc/'};
const media={type:'post',name:'Media Test',role:'media',sport:'boxing',platform:'X',postedAt:'2026-11-08T01:00:00Z',quote:'Media news',engagement:{likes:200},url:'https://x.com/media/status/200'};
const prospect={...champion,platform:'X',name:'Prospect Test',fighterTier:'prospect',summary:'Prospect prepares for next bout',engagement:{likes:600},url:'https://x.com/prospect/status/300'};
assert.equal(ctx.diverseTalk([media,prospect,champion]).map(p=>p.name).join(','),'Prospect Test,Champion Test,Media Test');
assert.equal(ctx.diverseTalk([media,champion],'latest')[0].name,'Media Test');
assert.equal(ctx.diverseTalk([media,champion],'engagement')[0].name,'Champion Test');
ctx.fixture={champion,media,prospect};
vm.runInContext("liveTalk.selected=[fixture.champion,fixture.prospect,{...fixture.champion,postedAt:'2026-10-28',summary:'Earlier training announcement',url:'https://instagram.com/p/stale/'},{...fixture.champion,url:'https://example.com/p/unsafe/'}]; liveTalk.posts=[fixture.media,{...fixture.prospect,quote:'Original post',summary:undefined,url:'https://x.com/i/status/300'}]",ctx);
assert.equal(ctx.recentTalkPosts().length,3);
assert(ctx.recentTalkPosts().some(p=>p.quote==='Original post'));
assert(ctx.renderSocial().includes('Latest fighter &amp; promoter posts')||ctx.renderSocial().includes('Latest fighter & promoter posts'));
vm.runInContext("liveTalk.directory=[{name:'Champion Test',sport:'boxing',tier:'champion',profiles:{X:{url:'https://x.com/ChampTest'},Instagram:{url:'https://www.instagram.com/champtest/'},Threads:null}}]",ctx);
assert(ctx.renderSocial().includes('Fighter social profiles'),'Expose sourced fighter accounts alongside the feed');
assert(ctx.renderSocial().includes('https://www.instagram.com/champtest/'),'Link the original fighter account');
assert(ctx.renderSocial().includes('Last 4 weeks'));
assert(ctx.renderSocial().includes('class="twitter-tweet"'),'Display authentic source-linked X posts');
assert(!ctx.renderSocial().includes('Selected post'));
assert(!ctx.renderSocial().includes('talk-card-meta'));
assert(ctx.postCard(champion).includes('instagram.com/'));
assert(ctx.postCard(champion).includes('class="instagram-media"'),'Instagram original post must use official embed element');
assert(ctx.postCard(champion).includes('data-instgrm-permalink="https://www.instagram.com/p/abc/"'),'Instagram author-path permalink should be canonicalised');
assert(ctx.postCard(champion).includes('Open post'),'Original post must have a direct fallback link');
assert(html.includes('https://www.instagram.com/embed.js'),'Instagram official embed script should be loaded');
assert(!ctx.postCard(champion).includes('/embed/captioned/'),'Do not use unofficial iframe embed paths');
const highlights=ctx.highlightedTalkPosts();
assert(highlights.some(p=>p.postedAt==='2026-10-28'),'Rolling 28-day highlights retain older original posts');
assert(highlights.every(p=>p.type==='post'),'Highlights only include verified original-post links, not archived editorial threads');
ctx.state.socialMode='highlights';
assert(ctx.renderSocial().includes('Highlights from the previous four weeks'));
assert(ctx.renderSocial().includes('data-instgrm-permalink="https://www.instagram.com/p/abc/"'),'Highlights retain the original Instagram embed, not a synthetic quote');
ctx.state.socialPlatform='Threads';
assert(!ctx.renderSocial().includes('data-instgrm-permalink="https://www.instagram.com/p/abc/"'),'Platform filters hide Instagram embeds when Threads selected');
assert(!ctx.renderSocial().includes('class="twitter-tweet"'),'Hide X posts when browsing Threads');
ctx.state.socialMode='latest';ctx.state.socialPlatform='X';
assert(ctx.renderSocial().includes('https://twitter.com/i/status/200'),'Live X feed embeds the actual original post');
assert(!ctx.renderSocial().includes('Archive quote'));
(async()=>{const {collectPlatforms}=await import('../scripts/fight-talk-platforms.mjs');const old=process.env.X_BEARER_TOKEN;process.env.X_BEARER_TOKEN='fixture';const got=[];const status=await collectPlatforms({platforms:{X:{accounts:[{id:'123',username:'testfighter',name:'Test fighter',sport:'mma',role:'fighter'}]}}},async()=>({data:[{id:'1',author_id:'123',text:'UFC fight announced',created_at:'2026-11-07T12:00:00Z'},{id:'2',author_id:'456',text:'wrong author'}]}),p=>got.push(p),0);assert.equal(got.length,1);assert.equal(got[0].role,'fighter');assert.equal(status.find(p=>p.platform==='X').state,'connected');assert.equal(status.find(p=>p.platform==='Facebook').state,'not-connected');const priorInstagramToken=process.env.INSTAGRAM_ACCESS_TOKEN;process.env.INSTAGRAM_ACCESS_TOKEN='test-only';const emptySources=await collectPlatforms({platforms:{Instagram:{accounts:[]}}},async()=>{throw Error('Should not call Meta before approved source list')},()=>{},0);assert.equal(emptySources.find(p=>p.platform==='Instagram').state,'needs-approval');if(priorInstagramToken===undefined)delete process.env.INSTAGRAM_ACCESS_TOKEN;else process.env.INSTAGRAM_ACCESS_TOKEN=priorInstagramToken;if(old===undefined)delete process.env.X_BEARER_TOKEN;else process.env.X_BEARER_TOKEN=old;console.log('Fight Talk layout, highlight window, thread provenance, author diversity, identity and disconnected platforms passed');})().catch(e=>{console.error(e);process.exitCode=1});
