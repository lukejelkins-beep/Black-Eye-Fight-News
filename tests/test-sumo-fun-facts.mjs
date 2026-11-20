import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFactRows,assessFactFreshness,currentFactFeed} from '../assets/sumo-facts-data.mjs';
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
