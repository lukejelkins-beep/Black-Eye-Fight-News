const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('news-publisher-link'),'MMA News retains a compact direct source link');
assert(html.includes('https://mmajunkie.usatoday.com/'),'MMA Junkie canonical reporting is directly linked');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(m[1].includes('application/json'))JSON.parse(m[2]);else new Function(m[2]);}
const fn=html.slice(html.indexOf('const talkPlatforms'),html.indexOf('/* Strip illustration initials'));

const fightTalkCSS=fs.readFileSync('assets/fight-talk.css','utf8');
assert(html.includes('fight-talk.css?v=20261111-instagram-embed-height'),'The updated Fight Talk stylesheet must bypass stale mobile caches');
assert(!html.includes('id="original-talk-posts"'),'Remove legacy mobile embed styles with zoom and fixed iframe heights');
for(const m of fightTalkCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 const selector=m[1],body=m[2];
 if(selector.includes('.talk-original')&&selector.includes('iframe')){
  assert(!/(?:^|;)\s*(?:min-|max-)?height\s*:/i.test(body),
   'Official post iframe height must be controlled by its platform embed script, not BEFN CSS: '+selector.trim());
 }
}
assert(fightTalkCSS.includes('overflow:visible'),'Native social embed cards must not crop their contents');


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
const champion={type:'post',name:'Champion Test',role:'fighter',sport:'boxing',platform:'Instagram',postedAt:'2026-11-06',quote:'Champion training update',summary:'Champion training update',engagement:{likes:7000,comments:230},url:'https://www.instagram.com/champion/p/abc/'};
const media={type:'post',name:'Media Test',role:'media',sport:'boxing',platform:'X',postedAt:'2026-11-08T01:00:00Z',quote:'Media news',engagement:{likes:200},url:'https://x.com/media/status/200'};
const prospect={...champion,platform:'X',name:'Prospect Test',fighterTier:'prospect',quote:'Prospect prepares for next bout',summary:'Prospect prepares for next bout',engagement:{likes:600},url:'https://x.com/prospect/status/300'};
assert.equal(ctx.diverseTalk([media,prospect,champion]).map(p=>p.name).join(','),'Prospect Test,Champion Test,Media Test');
assert.equal(ctx.diverseTalk([media,champion],'latest')[0].name,'Media Test');
assert.equal(ctx.diverseTalk([media,champion],'engagement')[0].name,'Champion Test');
ctx.fixture={champion,media,prospect};
vm.runInContext("liveTalk.selected=[fixture.champion,fixture.prospect,{...fixture.champion,postedAt:'2026-10-28',quote:'Earlier training announcement',summary:'Earlier training announcement',url:'https://instagram.com/p/stale/'},{...fixture.champion,url:'https://example.com/p/unsafe/'}]; liveTalk.posts=[fixture.media,{...fixture.prospect,quote:'Original post',summary:undefined,url:'https://x.com/i/status/300'}]",ctx);
assert.equal(ctx.recentTalkPosts().length,3);
assert(ctx.recentTalkPosts().some(p=>p.quote==='Original post'));
assert(ctx.renderSocial().includes('Latest fighter &amp; promoter posts')||ctx.renderSocial().includes('Latest fighter & promoter posts'));
vm.runInContext("liveTalk.directory=[{name:'Champion Test',sport:'boxing',tier:'champion',profiles:{X:{url:'https://x.com/ChampTest'},Instagram:{url:'https://www.instagram.com/champtest/'},Threads:null}}]",ctx);
assert(ctx.renderSocial().includes('Fighter social profiles'),'Expose sourced fighter accounts alongside the feed');
assert(ctx.renderSocial().includes('https://www.instagram.com/champtest/'),'Link the original fighter account');
assert(ctx.renderSocial().includes('Last 4 weeks'));
assert(html.includes("talkRole:'all',talkSort:'balanced'"),'Balanced Fight Talk feed is the default instead of Bluesky-heavy chronological sorting');
assert(!ctx.renderSocial().includes('twitter-timeline'),'Blocked external X timelines must not leave empty panels');
assert(!ctx.postCard(champion).includes('<iframe'),'Source-linked Instagram posts render readable cards with no blank iframe');
assert(ctx.postCard(champion).includes('class="instagram-media"'),'Instagram posts must use the original Meta widget even when their quote is already known');
assert(ctx.postCard(media).includes('class="twitter-tweet"'),'X posts must use the official X post widget');
for(const p of [champion,media,{platform:'Threads',type:'post',sport:'mma',name:'Thread author',role:'fighter',url:'https://www.threads.com/@fighter/post/ABcdEfG/',nativeEmbed:true},{platform:'Bluesky',type:'post',sport:'mma',name:'Bluesky author',role:'fighter',url:'https://bsky.app/profile/test.bsky.social/post/3abcd1234',id:'at://did:plc:testid/app.bsky.feed.post/3abcd1234',cid:'bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',quote:'Original post'}]){
 const markup=ctx.postCard(p);
 assert(markup.includes('talk-native-card'),'Original post must not be nested in the dark BEFN editorial wrapper');
 assert(!markup.includes('class="social-head"'),'Original platform embeds already display their own author header');
 assert(!markup.includes('class="social-foot"'),'Original platform embeds already display their own source footer');
 assert(!markup.includes('talk-source-note'),'Do not duplicate publisher provenance under the native post');
 assert(markup.includes('Open post on'),'Every native post must retain a direct accessible fallback link');
}

assert(ctx.postCard({platform:'Threads',type:'post',sport:'mma',name:'Fighter',role:'fighter',url:'https://www.threads.com/@fighter/post/ABcdEfG/',nativeEmbed:true}).includes('class="text-post-media"'),'Threads original posts must use the official Meta post widget');
assert(ctx.postCard({platform:'Bluesky',type:'post',sport:'mma',name:'Fighter',role:'fighter',url:'https://bsky.app/profile/test.bsky.social/post/3abcd1234',id:'at://did:plc:testid/app.bsky.feed.post/3abcd1234',cid:'bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',quote:'Direct original post'}).includes('class="bluesky-embed"'),'Bluesky official widget must receive its AT URI and CID');
assert(!ctx.postCard({...champion,quote:undefined,summary:'Reporter explanation'}).includes('Reporter explanation'),'Never display a third-party summary in place of an original post');
assert(!ctx.postCard(media).includes('<iframe'),'Source-linked X posts render readable cards with no blank iframe');
assert(ctx.postCard(media).includes('Open post'),'X cards link directly to original source');
assert(ctx.renderSocial().includes('href="https://x.com/media/status/200"'),'Display original-source links for X posts');
assert(!ctx.renderSocial().includes('Selected post'));
assert(!ctx.renderSocial().includes('talk-card-meta'));
assert(ctx.postCard(champion).includes('instagram.com/'));
assert(ctx.postCard(champion).includes('Champion training update'),'Display the original social post text when available');
assert(!ctx.postCard(champion).includes('talk-post-summary'),'Never replace original posts with editorial summaries');
assert(ctx.postCard(champion).includes('href="https://www.instagram.com/champion/p/abc/"'),'Keep the original Instagram post URL');
assert(ctx.postCard(champion).includes('Open post'),'Original post must have a direct fallback link');
assert(html.includes('https://www.instagram.com/embed.js'),'Instagram official embed script should be loaded');
assert(!ctx.postCard(champion).includes('/embed/captioned/'),'Do not use unofficial iframe embed paths');
const highlights=ctx.highlightedTalkPosts();
assert(highlights.some(p=>p.postedAt==='2026-10-28'),'Rolling 28-day highlights retain older original posts');
assert(highlights.every(p=>p.type==='post'),'Highlights only include verified original-post links, not archived editorial threads');
ctx.state.socialMode='highlights';
assert(ctx.renderSocial().includes('Highlights from the previous four weeks'));
assert(ctx.renderSocial().includes('https://www.instagram.com/champion/p/abc/'),'Highlights retain source-linked originals');
ctx.state.socialPlatform='Threads';
assert(!ctx.renderSocial().includes('https://www.instagram.com/champion/p/abc/'),'Platform filters hide Instagram posts when Threads selected');
assert(!ctx.renderSocial().includes('class="twitter-tweet"'),'Hide X posts when browsing Threads');
ctx.state.socialMode='latest';ctx.state.socialPlatform='X';
assert(ctx.renderSocial().includes('https://x.com/media/status/200'),'Live X feed links the original post');
assert(!ctx.renderSocial().includes('Archive quote'));
(async()=>{const {collectPlatforms}=await import('../scripts/fight-talk-platforms.mjs');const old=process.env.X_BEARER_TOKEN;process.env.X_BEARER_TOKEN='fixture';const got=[];const status=await collectPlatforms({platforms:{X:{accounts:[{id:'123',username:'testfighter',name:'Test fighter',sport:'mma',role:'fighter'}]}}},async()=>({data:[{id:'1',author_id:'123',text:'UFC fight announced',created_at:'2026-11-07T12:00:00Z'},{id:'2',author_id:'456',text:'wrong author'}]}),p=>got.push(p),0);assert.equal(got.length,0,'Unattended paid X timeline reads must be disabled');assert.equal(status.find(p=>p.platform==='X').state,'source-linked');assert.equal(status.find(p=>p.platform==='X').paidApiCalls,0);assert.equal(status.find(p=>p.platform==='X').monthlyUsdCap,2);assert.equal(status.find(p=>p.platform==='Facebook').state,'not-connected');const priorInstagramToken=process.env.INSTAGRAM_ACCESS_TOKEN;process.env.INSTAGRAM_ACCESS_TOKEN='test-only';const emptySources=await collectPlatforms({platforms:{Instagram:{accounts:[]}}},async()=>{throw Error('Should not call Meta before approved source list')},()=>{},0);assert.equal(emptySources.find(p=>p.platform==='Instagram').state,'needs-approval');if(priorInstagramToken===undefined)delete process.env.INSTAGRAM_ACCESS_TOKEN;else process.env.INSTAGRAM_ACCESS_TOKEN=priorInstagramToken;if(old===undefined)delete process.env.X_BEARER_TOKEN;else process.env.X_BEARER_TOKEN=old;console.log('Fight Talk layout, highlight window, thread provenance, author diversity, identity and disconnected platforms passed');})().catch(e=>{console.error(e);process.exitCode=1});
