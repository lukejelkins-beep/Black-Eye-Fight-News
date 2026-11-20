import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFactRows,assessFactFreshness,currentFactFeed,highWinPercentageRows,HIGH_WIN_PCT_THRESHOLD,rollingWinPercentageRows,ROLLING_BASHO_MAX,risingStarCards} from '../assets/sumo-facts-data.mjs';
import {historicalBashos,divisionFromRank,buildHistoricalFacts,buildRisers} from '../scripts/sumo-facts-rollup.mjs';
const roster={rikishi:[
 {sourceId:1,shikonaEn:'Wrestler A',currentRank:'Maegashira 1 East',heya:'Test'},
 {sourceId:2,shikonaEn:'Wrestler B',currentRank:'Makushita 1 East',heya:'Test'},
 {sourceId:3,shikonaEn:'Wrestler C',currentRank:'Juryo 1 East',heya:'Test'}]};
const record=results=>results.map(result=>({result}));
const details={
 bashoId:'202611',dailyCollectedAt:'2026-11-20T07:00:00Z',
 banzuke:{
  Makuuchi:{status:'available',data:{east:[{rikishiID:1,rank:'Maegashira 1 East',rankValue:10,record:record(['win','win','loss','win','win','win','win','win','win','win'])}],west:[]}},
  Juryo:{status:'available',data:{east:[{rikishiID:3,rank:'Juryo 1 East',rankValue:1,record:record(['win','win','win','win','win'])}],west:[]}},
  Makushita:{status:'available',data:{east:[{rikishiID:2,rank:'Makushita 1 East',rankValue:1,record:record(['win','win','win','win','win','win'])}],west:[]}}
 }};
const now=new Date('2026-11-20T09:00:00Z');
test('counts only decided bouts and keeps Makushita seven-bout context',()=>{
 const rows=currentFactRows(roster,details);
 assert.equal(rows.length,3);
 assert.equal(rows.find(x=>x.id==='1').streak,7);
 assert.equal(rows.find(x=>x.id==='1').wins,9);
 assert.equal(rows.find(x=>x.id==='2').remaining,1);
 assert.equal(rows.find(x=>x.id==='2').perfect,true);
});
test('never publishes live form when cache is older than 48 hours',()=>{
 assert.equal(assessFactFreshness(details,now).fresh,true);
 const stale=new Date('2026-11-24T09:00:00Z');
 const feed=currentFactFeed(roster,details,{items:[]},{now:stale});
 assert.equal(feed.fresh,false);
 assert.equal(feed.dynamicCount,0);
});
test('generates contenders and milestone watch only from known matches',()=>{
 const f=currentFactFeed(roster,details,{items:[]},{now});
 assert.ok(f.cards.find(x=>x.key==='makuuchi-title-race'));
 assert.ok(f.cards.find(x=>x.key==='seven-2'));
 assert.ok(f.cards.find(x=>x.key==='near10-1'));
 assert.ok(f.cards.find(x=>x.key==='perfect-3'));
});
test('curated facts require current identity, a source, and a recent record review',()=>{
 const curated={items:[
  {id:'brothers',kind:'family',title:'Brothers',short:'Relationship',memberIds:[1,2],sourceUrl:'https://example.org',verifiedAt:'2026-11-19'},
  {id:'not-current',kind:'family',memberIds:[99],sourceUrl:'https://example.org',verifiedAt:'2026-11-19'},
  {id:'old-record',kind:'record',memberIds:[1],sourceUrl:'https://example.org',verifiedAt:'2026-01-01'}]};
 const f=currentFactFeed(roster,details,curated,{now});
 assert.equal(f.editorialCount,1);
 assert.ok(f.cards.some(x=>x.key==='brothers'));
});
test('current official preview cohort is compatible with reviewed editorial fighter IDs',()=>{
 const json=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const realRoster=json('data/sumo/rikishi-index.json');
 const ed=json('data/sumo/fun-facts-editorial.json');
 const ids=new Set(realRoster.rikishi.map(w=>w.sourceId));
 assert.ok(ed.items.length>=4);
 for(const item of ed.items){
  for(const id of item.memberIds)assert.ok(ids.has(id),item.id+' has inactive/untracked ID '+id);
  assert.ok(item.sourceUrl.startsWith('https://'));
 }
});

test('win-percentage cards include 80%+ current-basho form in all tracked divisions',()=>{
 const rows=currentFactRows(roster,details);
 const leaders=highWinPercentageRows(rows);
 assert.equal(HIGH_WIN_PCT_THRESHOLD,80);
 assert.deepEqual(leaders.map(r=>[r.id,r.winPct]),[['1',90],['3',100],['2',100]]);
 const feed=currentFactFeed(roster,details,{items:[]},{now});
 for(const id of ['1','2','3']){
  const card=feed.cards.find(c=>c.key==='winpct-'+id);
  assert.ok(card,'missing 80%+ card for '+id);
  assert.equal(card.category,'percent');
  assert.match(card.description,/completed bouts/);
  assert.match(card.description,/minimum of (3|5) completed bouts/);
 }
 assert.equal(feed.cards.find(c=>c.key==='winpct-1').metric,'90.0%');
});

test('high percentage never promotes tiny samples or rates under 80%',()=>{
 const mk=(id,division,wins,losses)=>({
  id:String(id),division,wins,losses,bouts:wins+losses,rankValue:id
 });
 const rows=[
  mk(1,'Makuuchi',2,0),mk(2,'Juryo',4,0),mk(3,'Makushita',2,0),
  mk(4,'Makuuchi',4,1),mk(5,'Juryo',7,3),mk(6,'Makushita',4,1),
  mk(7,'Makuuchi',11,2),mk(8,'Juryo',0,0)
 ];
 const high=highWinPercentageRows(rows,{perDivision:10});
 assert.deepEqual(high.map(x=>x.id),['7','4','6']);
 assert.equal(high.find(x=>x.id==='7').winPct,84.6);
 assert.equal(high.find(x=>x.id==='4').winPct,80);
});

test('win-percentage cards obey the 48-hour source staleness gate',()=>{
 const stale=currentFactFeed(roster,details,{items:[]},{now:new Date('2026-11-25T07:00:00Z')});
 assert.equal(stale.fresh,false);
 assert.equal(stale.cards.some(c=>c.category==='percent'),false);
 const app=readFileSync(new URL('../assets/sumo-facts.mjs',import.meta.url),'utf8');
 assert.match(app,/Win % Leaders/);
 assert.match(app,/80%\+ basho win rate/);
});

test('historical basho calendar moves in six-basho annual sequence',()=>{
 assert.deepEqual(historicalBashos('202611',4),['202609','202607','202605','202603']);
 assert.deepEqual(historicalBashos('202601',2),['202511','202509']);
 assert.deepEqual(historicalBashos('202613',1),[]);
 assert.equal(divisionFromRank('Makuuchi 3 West').expected,15);
 assert.equal(divisionFromRank('Makushita 8 East').expected,7);
 // Real Sumo API top-division ranks use titles, not "Makuuchi".
 for(const rank of ['Yokozuna 1 East','Ozeki 2 West','Sekiwake 1 East','Komusubi 1 West','Maegashira 17 West']){
  assert.deepEqual(divisionFromRank(rank),{division:'Makuuchi',expected:15},rank);
 }
 assert.deepEqual(divisionFromRank('Juryo 14 East'),{division:'Juryo',expected:15});
 assert.equal(divisionFromRank('Banzuke-gai'),null);
 assert.equal(ROLLING_BASHO_MAX,30);
});
test('rolling rates include only fully recorded past basho and current completed decisions',()=>{
 const ranks={bySourceId:{
  1:{rank:[{basho:'202609',rank:'Makuuchi 7 East'},{basho:'202607',rank:'Makuuchi 6 East'}]},
  2:{rank:[{basho:'202609',rank:'Makushita 22 West'}]},
  3:{rank:[{basho:'202609',rank:'Juryo 4 East'}]}
 }};
 const make=(a,b,count,basho,wins)=>({
  a,b,regular:Array.from({length:count},(_,i)=>[basho,i+1,i<wins?a:b,'yorikiri','Makuuchi',i+1,'regular'])});
 const history={pairs:{
  '1:100':{...make(1,100,15,'202609',12),regular:[
    ...make(1,100,15,'202609',12).regular,...make(1,100,15,'202607',10).regular]},
  '2:101':make(2,101,7,'202609',5),
  '3:102':make(3,102,14,'202609',11)
 }};
 const built=buildHistoricalFacts({roster,details,career:ranks,history,max:3});
 assert.deepEqual(built.historicalBashos,['202609','202607','202605']);
 assert.deepEqual(built.bySourceId['1']['202609'],[12,3,15]);
 assert.deepEqual(built.bySourceId['1']['202607'],[10,5,15]);
 assert.deepEqual(built.bySourceId['2']['202609'],[5,2,7]);
 assert.equal(built.bySourceId['3'],undefined,'14 recorded bouts must not be treated as 15');
 const latest={...details,funFactsHistory:built};
 const two=rollingWinPercentageRows(roster,latest,2);
 assert.deepEqual(two.map(x=>[x.id,x.wins,x.losses,x.winPct]),[
  ['1',21,4,84],['2',11,2,84.6]
 ]);
 const three=rollingWinPercentageRows(roster,latest,3);
 assert.deepEqual(three.map(x=>[x.id,x.wins,x.losses]),[['1',31,9]]);
 assert.deepEqual(rollingWinPercentageRows(roster,latest,4),[]);
});
test('basho rolling data fails closed for stale, invalid, or incomplete windows',()=>{
 const invalid={...details,funFactsHistory:{schemaVersion:1,bashoId:'202609',historicalBashos:['202607'],bySourceId:{
  '1':{'202607':[15,1,15]}}}};
 assert.deepEqual(rollingWinPercentageRows(roster,invalid,2),[]);
 const missing={...details,funFactsHistory:{...invalid.funFactsHistory,bashoId:'202611'}};
 assert.deepEqual(rollingWinPercentageRows(roster,missing,2),[]);
 assert.deepEqual(rollingWinPercentageRows(roster,details,0),[]);
 assert.deepEqual(rollingWinPercentageRows(roster,details,31),[]);
});
test('stablemate playoff fact needs two currently stablemates and winner evidence',()=>{
 const stableRoster={rikishi:[
  {sourceId:1,shikonaEn:'A',heya:'Isegahama'},
  {sourceId:2,shikonaEn:'B',heya:'Isegahama'}]};
 const ok={id:'stablemates',kind:'stablemates',title:'Championship playoff',short:'A defeated B',
  memberIds:[1,2],winnerId:1,loserId:2,stable:'Isegahama',bashoId:'202607',
  eventType:'championship-playoff',sourceLabel:'published evidence',sourceUrl:'https://example.org/verified',
  verifiedAt:'2026-11-20'};
 const good=currentFactFeed(stableRoster,details,{items:[ok]},{now});
 assert.equal(good.editorialCount,1);
 assert.equal(good.cards.find(x=>x.key==='stablemates').category,'stablemates');
 const altered=currentFactFeed({...stableRoster,rikishi:[
  stableRoster.rikishi[0],{...stableRoster.rikishi[1],heya:'Arashio'}
 ]},details,{items:[ok]},{now});
 assert.equal(altered.editorialCount,0);
 const noWinner=currentFactFeed(stableRoster,details,{items:[{...ok,winnerId:99}]},{now});
 assert.equal(noWinner.editorialCount,0);
 const curated=JSON.parse(readFileSync(new URL('../data/sumo/fun-facts-editorial.json',import.meta.url),'utf8'));
 assert.ok(curated.items.find(x=>x.id==='isegahama-202607-playoff'));
});

test('actual cached bout ledger can produce historical rolling summaries without provider calls',()=>{
 const json=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const liveRoster=json('data/sumo/rikishi-index.json');
 const liveDetails=json('data/sumo/preview-details.json');
 const rankHistory=json('data/sumo/career-history.json');
 const fightHistory=json('data/sumo/research-h2h-history.json');
 const built=buildHistoricalFacts({roster:liveRoster,details:liveDetails,career:rankHistory,history:fightHistory,max:6});
 assert.equal(built.bashoId,String(liveDetails.bashoId));
 assert.ok(built.coverage.hasAtLeastOneCompleteHistoricalBasho>0,'Historical cache lacks even one complete previous basho');
 const current=rollingWinPercentageRows(liveRoster,{...liveDetails,funFactsHistory:built},2);
 assert.ok(current.length>0,'No current rikishi have a verified complete previous-basho record');
 console.log('FACTS ROLLING REAL CACHE: '+JSON.stringify({
   eligibleWithOnePastBasho:built.coverage.hasAtLeastOneCompleteHistoricalBasho,
   twoBashoRanked:current.length,
   threeBashoRanked:rollingWinPercentageRows(liveRoster,{...liveDetails,funFactsHistory:built},3).length
 }));
});

// ---- Rising stars -------------------------------------------------------
const riseRoster={rikishi:[
 {sourceId:11,shikonaEn:'Fast',currentRank:'Makushita 40 East'},
 {sourceId:12,shikonaEn:'Collegiate',currentRank:'Makushita 30 East'},
 {sourceId:13,shikonaEn:'Climber',currentRank:'Makushita 20 West'},
 {sourceId:14,shikonaEn:'Nearly',currentRank:'Makushita 25 West'},
 {sourceId:15,shikonaEn:'Gap',currentRank:'Makushita 50 East'}]};
const riseDetails={bashoId:'202611'};
const ranks=list=>({rank:list.map(([basho,rank])=>({basho,rank}))});
const riseCareer={bySourceId:{
 11:ranks([['202605','Jonokuchi 10 East'],['202607','Jonidan 10 East'],['202609','Sandanme 10 East'],['202611','Makushita 40 East']]),
 12:ranks([['202607','Makushita 15 East'],['202609','Makushita 10 East'],['202611','Makushita 30 East']]),
 13:ranks([['202301','Jonokuchi 5 East'],['202503','Makushita 50 East'],['202605','Jonidan 90 West'],['202607','Jonidan 20 West'],['202609','Sandanme 40 West'],['202611','Makushita 20 West']]),
 14:ranks([['202301','Jonokuchi 5 West'],['202503','Makushita 55 East'],['202605','Jonidan 80 West'],['202607','Jonidan 30 West'],['202609','Sandanme 50 West'],['202611','Makushita 25 West']]),
 15:ranks([['202301','Jonokuchi 6 East'],['202503','Makushita 52 East'],['202605','Jonidan 70 West'],['202607','Jonidan 15 West'],['202609','Sandanme 30 West'],['202611','Makushita 50 East']])}};
const days=(w,l)=>new Map([...Array(w).fill('win'),...Array(l).fill('loss')].map((r,i)=>[i+1,r]));
const found=new Map([
 ['11',new Map([['202605',days(7,0)],['202607',days(7,0)],['202609',days(5,2)]])],
 ['13',new Map([['202605',days(6,1)],['202607',days(6,1)],['202609',days(7,0)]])],
 ['14',new Map([['202605',days(5,2)],['202607',days(5,2)],['202609',days(5,2)]])],
 ['15',new Map([['202605',days(6,1)],['202607',days(6,1)],['202609',days(4,1)]])]]);
const riseHistory=()=>({schemaVersion:1,bashoId:'202611',risersVersion:1,
 risers:buildRisers({roster:riseRoster,details:riseDetails,career:riseCareer,found})});
test('rising stars: Jonokuchi fast track counted in ranked basho; collegiate entrants excluded',()=>{
 const cards=risingStarCards(riseRoster,{...riseDetails,funFactsHistory:riseHistory()},{items:[]});
 const fast=cards.find(c=>c.key==='rising-fast-11');
 assert.ok(fast,'fast track card missing');
 assert.equal(fast.headline,'Fast reached Makushita in his 4th ranked basho');
 assert.match(fast.description,/Jonokuchi 10 East 7–0 · Jonidan 10 East 7–0 · Sandanme 10 East 5–2/);
 assert.match(fast.description,/two perfect 7–0 basho/);
 assert.ok(!cards.some(c=>c.memberIds.includes('12')),'Makushita tsukedashi start is not a Jonokuchi fast track');
});
test('rising stars: climbers need 16+ wins over three complete basho; incomplete is never 0-0',()=>{
 const cards=risingStarCards(riseRoster,{...riseDetails,funFactsHistory:riseHistory()},{items:[]});
 const climb=cards.find(c=>c.key==='rising-climb-13');
 assert.equal(climb.headline,'Climber: Jonidan 90 West to Makushita 20 West in three basho');
 assert.equal(climb.metric,'19–2');
 assert.ok(!cards.some(c=>c.key==='rising-climb-14'),'15 wins is below the climber threshold');
 assert.ok(!cards.some(c=>c.key==='rising-climb-15'),'an incomplete 4-1 basho must exclude the climber');
 const gap=riseHistory().risers.find(x=>x.id==='15');
 assert.deepEqual(gap.path.find(p=>p[0]==='202609'),['202609','Sandanme 30 West',null,null]);
 assert.ok(cards.every(c=>!/0–0/.test(c.description)));
});
test('rising stars: shown editorial story replaces the automatic card; stale rollup shows nothing',()=>{
 const details={...riseDetails,funFactsHistory:riseHistory()};
 const story={items:[{id:'x',kind:'rising',memberIds:[11]}]};
 assert.ok(!risingStarCards(riseRoster,details,story).some(c=>c.memberIds.includes('11')));
 assert.ok(risingStarCards(riseRoster,details,story,{covered:new Set()}).some(c=>c.memberIds.includes('11')),
  'an expired (unshown) editorial story must not hide the automatic card');
 const veteran={rikishi:[{sourceId:11,shikonaEn:'Fast',currentRank:'Makushita 40 East'}]};
 const old={bySourceId:{11:ranks([['202305','Jonokuchi 10 East'],['202307','Jonidan 10 East'],['202309','Sandanme 10 East'],['202311','Makushita 40 East'],['202611','Makushita 40 East']])}};
 assert.deepEqual(risingStarCards(veteran,{...riseDetails,funFactsHistory:{bashoId:'202611',risersVersion:1,
  risers:buildRisers({roster:veteran,details:riseDetails,career:old,found:new Map()})}},{items:[]}),[],'a 2023 starter is not a newcomer');
 assert.deepEqual(risingStarCards(riseRoster,{...details,funFactsHistory:{...details.funFactsHistory,bashoId:'202609'}},{items:[]}),[]);
});
test('rising stars: current record appears only from a fresh snapshot',()=>{
 const details={...riseDetails,funFactsHistory:riseHistory()};
 const rows=[{id:'13',wins:5,losses:1,bouts:6,remaining:1},{id:'11',wins:4,losses:3,bouts:7,remaining:0}];
 const fresh=risingStarCards(riseRoster,details,{items:[]},{rows,fresh:true});
 assert.match(fresh.find(c=>c.key==='rising-climb-13').description,/Makushita 20 West, 5–1 so far\.$/);
 assert.match(fresh.find(c=>c.key==='rising-fast-11').description,/Makushita 40 East 4–3\./);
 const stale=risingStarCards(riseRoster,details,{items:[]},{rows,fresh:false});
 assert.match(stale.find(c=>c.key==='rising-climb-13').description,/current basho\.$/);
});
test('rising stars from the real cache name tracked rikishi and source every card',()=>{
 const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const liveRoster=json('data/sumo/rikishi-index.json'),liveDetails=json('data/sumo/preview-details.json');
 const built=buildHistoricalFacts({roster:liveRoster,details:liveDetails,career:json('data/sumo/career-history.json'),history:json('data/sumo/research-h2h-history.json')});
 const ids=new Set(liveRoster.rikishi.map(w=>String(w.sourceId)));
 const cards=risingStarCards(liveRoster,{...liveDetails,funFactsHistory:built},json('data/sumo/fun-facts-editorial.json'));
 for(const c of cards){assert.ok(c.memberIds.every(id=>ids.has(id)));assert.match(c.sourceUrl,/^https:/);}
 console.log('RISING STARS REAL CACHE: '+JSON.stringify({candidates:built.risers.length,cards:cards.map(c=>c.key)}));
});
