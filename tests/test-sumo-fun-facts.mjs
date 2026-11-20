import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFactRows,assessFactFreshness,currentFactFeed,highWinPercentageRows,HIGH_WIN_PCT_THRESHOLD,rollingWinPercentageRows,ROLLING_BASHO_MAX} from '../assets/sumo-facts-data.mjs';
import {historicalBashos,divisionFromRank,buildHistoricalFacts} from '../scripts/sumo-facts-rollup.mjs';
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
