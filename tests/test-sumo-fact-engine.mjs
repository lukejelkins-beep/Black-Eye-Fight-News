import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFactIndex,bestMatchupFact,rivalryFacts,factText,liveMatchupFacts,pairFacts,SURFACE_MIN,profileFacts,techniqueFacts,stableFacts,factPeople} from '../assets/sumo-fact-engine.mjs';

const W=(id,name,rank,extra={})=>({sourceId:id,shikonaEn:name,currentRank:rank,...extra});
const roster={rikishi:[
 W(1,'Level','Maegashira 1 East'),W(2,'Even','Maegashira 2 East'),
 W(3,'Sweeper','Maegashira 3 East'),W(4,'Swept','Maegashira 4 East'),
 W(5,'Streaker','Juryo 1 East'),W(6,'Victim','Juryo 2 East'),
 W(7,'Newcomer','Maegashira 10 East'),W(8,'Stranger','Maegashira 11 East'),
 W(9,'Champion','Yokozuna 1 East',{weightKg:180,birthDate:'1990-01-01T00:00:00Z'}),
 W(10,'Tiny','Maegashira 12 East',{weightKg:110,birthDate:'2006-01-01T00:00:00Z'}),
 W(11,'Playoff','Makushita 1 East'),W(12,'Mate','Makushita 2 East')]};
const bashos=['202201','202203','202205','202207','202209','202211','202301','202303','202305','202307','202309','202311',
 '202401','202403','202405','202407','202409','202411','202501','202503','202505'];
const bout=(basho,day,winner,move='yorikiri')=>[basho,day,winner,move,'Makuuchi',1,'regular'];
const level=[];bashos.forEach((b,i)=>{level.push(bout(b,1,i%2?1:2,'oshidashi'));level.push(bout(b,2,i%2?2:1,'oshidashi'));});
const history={pairs:{
 '1:2':{a:1,b:2,regular:level,special:[]},                                   // 42 meetings, 21-21
 '3:4':{a:3,b:4,regular:bashos.slice(0,6).map((b,i)=>bout(b,3,3,'yorikiri')),special:[]},   // 6-0 sweep, all yorikiri
 '5:6':{a:5,b:6,regular:[bout('202301',1,6),bout('202303',1,6),...bashos.slice(8,14).map(b=>bout(b,5,5,'fusen'))],special:[]},
 '11:12':{a:11,b:12,regular:[],special:[['202407',16,11,'yorikiri','Makushita',1,'playoff']]},
 '9:10':{a:9,b:10,regular:[bout('202501',4,9,'gasshohineri')],special:[]}
}};
const details={bashoId:'202511',torikumi:{Makuuchi:{data:{torikumi:[{eastId:7,westId:8},{eastId:1,westId:2}]}},
 Makushita:{data:{torikumi:[{eastId:11,westId:12}]}}}};
const idx=()=>buildFactIndex({roster,details,history});
const name=id=>roster.rikishi.find(w=>String(w.sourceId)===String(id))?.shikonaEn;
const facts=(a,b)=>pairFacts({...details,factIndex:idx()},roster,a,b);

test('level 42-meeting series is the top rivalry, worded with its scope',()=>{
 const f=facts(1,2).find(x=>x.k==='series');
 assert.equal(f.n,42);assert.equal(f.wa,21);assert.equal(f.top,1);
 const t=factText(f,name);
 assert.equal(t.lead,'Level and Even have met 42 times since January 2022, and it’s level at 21–21.');
 assert.match(t.rest,/longest series between two wrestlers BEFN tracks/);
 assert.equal(t.scope,'BEFN bout records');
});
test('clean sweep and a finishing move, but fusen is never a technique',()=>{
 const sweep=facts(3,4).find(x=>x.k==='sweep');
 assert.equal(factText(sweep,name).lead,'Sweeper has won all 6 meetings with Swept.');
 assert.equal(factText(facts(3,4).find(x=>x.k==='finish'),name).lead,'All 6 of Sweeper’s wins over Swept have come by yorikiri.');
 const streak=facts(5,6).find(x=>x.k==='streak');
 assert.equal(streak.n,6);assert.equal(streak.lastLoss,'202303');
 assert.match(factText(streak,name).rest,/Victim last won in March 2023/);
 assert.ok(!facts(5,6).some(x=>x.k==='finish'),'default wins (fusen) must not make a finishing-move fact');
});
test('first meeting only for an announced pair with no regular or special bout',()=>{
 const first=facts(7,8).find(x=>x.k==='first');
 assert.ok(first);assert.equal(first.s,60);
 assert.equal(factText(first,name).lead,'First time facing each other.');
 assert.equal(factText(first,name).scope,'BEFN bout records');
 assert.ok(!facts(11,12).some(x=>x.k==='first'),'a playoff meeting means it is not their first');
 assert.ok(!facts(1,2).some(x=>x.k==='first'));
});
test('rare move and live size/age facts',()=>{
 const index=idx();
 const rare=index.people['9'].find(x=>x.k==='rare');
 assert.equal(factText(rare,name).lead,'Champion has the only gasshohineri win in BEFN’s records since 2021.');
 const live=liveMatchupFacts(roster,9,10);
 assert.equal(live.find(x=>x.k==='size').gap,70);
 assert.equal(factText(live.find(x=>x.k==='age'),name).lead,'Champion is 16 years older than Tiny.');
});
test('matchup line: best fact clears the bar, otherwise nothing; stale index ignored',()=>{
 const d={...details,factIndex:idx()};
 assert.equal(bestMatchupFact(d,roster,1,2).k,'series');
 assert.equal(bestMatchupFact(d,roster,11,12),null,'nothing scores high enough for this pair');
 const champ=bestMatchupFact(d,roster,9,10);
 assert.ok(champ.s>=SURFACE_MIN.matchup);
 assert.equal(bestMatchupFact({...d,factIndex:{...d.factIndex,bashoId:'202509'}},roster,1,2),null);
 assert.ok(rivalryFacts(d,roster,1,2).length>=1);
});
test('built from the real cache: tracked subjects, scoped wording, no gaps in text',()=>{
 const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const r=json('data/sumo/rikishi-index.json'),dt=json('data/sumo/preview-details.json');
 const index=buildFactIndex({roster:r,details:dt,history:json('data/sumo/research-h2h-history.json')});
 const ids=new Set(r.rikishi.map(w=>String(w.sourceId)));
 const nm=id=>r.rikishi.find(w=>String(w.sourceId)===String(id))?.shikonaEn||null;
 const all=[...Object.values(index.pairs).flat(),...Object.values(index.people).flat()];
 assert.ok(all.length>50,'expected a useful number of facts');
 for(const f of all){
  for(const id of [f.a,f.b,f.w,f.l,f.id].filter(Boolean))assert.ok(ids.has(String(id)),'untracked subject '+id);
  const t=factText(f,nm);
  assert.ok(t&&t.scope,'every fact states its scope');
  assert.doesNotMatch(t.lead+' '+t.rest,/undefined|NaN|This wrestler/);
  assert.ok(f.s>=0&&f.s<=100);
 }
 assert.ok(JSON.stringify(index).length<120000,'index must stay small enough to ship in preview-details');
 console.log('FACT ENGINE REAL CACHE: '+JSON.stringify(index.counts));
});
test('sumo.js shows facts on headline bouts, matchup rows and the head-to-head page',()=>{
 const app=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
 assert.match(app,/photo\(b,right,'right',winR,winL\)\+'<\/div>'\+matchupFactMarkup\(match\)/);
 assert.match(app,/boutRowMarkup\(match\)\+matchupFactMarkup\(match\)/);
 assert.match(app,/rivalryPanelMarkup\(a,b\)/);
});

// ---- Phase 2: final-day nerve, comebacks, profiles, kimarite guide, stables ----
function phase2(){
 const people=[...roster.rikishi,W(13,'Clutch','Maegashira 5 East',{heya:'Alpha'}),W(14,'Phoenix','Maegashira 6 East',{heya:'Alpha'})];
 const pairs={...history.pairs};
 let opp=500;
 const fifteen=(id,basho,seq,move='yorikiri')=>seq.forEach((won,i)=>{
  const o=opp++;pairs[id+':'+o]={a:id,b:o,regular:[[basho,i+1,won?id:o,won?move:'oshidashi','Makuuchi',1,'regular']],special:[]};
 });
 const sevenSeven=[1,0,1,0,1,0,1,0,1,0,1,0,1,0].map(Boolean);
 ['202301','202303','202305','202307','202309'].forEach(b=>fifteen(13,b,[...sevenSeven,true]));
 fifteen(14,'202501',[0,0,0,0,1,1,1,1,1,1,1,1,1,1,1].map(Boolean),'isamiashi');
 const r={rikishi:people};
 return {r,d:{...details,factIndex:buildFactIndex({roster:r,details,history:{pairs}})},nm:id=>people.find(w=>String(w.sourceId)===String(id))?.shikonaEn};
}
test('final-day nerve and comebacks come from complete 15-day basho only',()=>{
 const {d,nm}=phase2();
 const clutch=d.factIndex.people['13'].find(f=>f.k==='clutch');
 assert.equal(clutch.won,5);assert.equal(clutch.lost,0);
 assert.equal(factText(clutch,nm).lead,'Clutch is 5–0 on the final day when sitting at 7–7.');
 const back=d.factIndex.people['14'].find(f=>f.k==='comeback');
 assert.equal(factText(back,nm).lead,'Phoenix once lost his first four bouts and still finished with a winning record.');
 assert.match(factText(back,nm).rest,/January 2025, finishing 11–4/);
});
test('non-technique results never count as techniques',()=>{
 const {d}=phase2();
 assert.equal(techniqueFacts(d,'isamiashi'),null);
 assert.equal(techniqueFacts(d,'yorikiri').top[0][0],'13');
 assert.ok(!Object.values(d.factIndex.people).flat().some(f=>['isamiashi','fusen','hansoku'].includes(f.km)));
});
test('profiles name the opponent, lead with distinct kinds, and skip facts he is on the wrong end of',()=>{
 const {d,nm}=phase2();
 const sweeper=profileFacts(d,3,{min:0});
 assert.ok(sweeper.some(f=>f.k==='sweep'));
 assert.equal(new Set(sweeper.slice(0,2).map(f=>f.k)).size,2,'first facts are different kinds');
 assert.match(factText(sweeper.find(f=>f.k==='sweep'),nm).lead,/with Swept\.$/);
 assert.equal(profileFacts(d,4,{min:0}).some(f=>f.k==='sweep'),false,'the swept wrestler’s profile does not show it');
 const stable=stableFacts(d,[13,14]);
 assert.deepEqual(stable.map(f=>f.id).sort(),['13','14']);
});
test('profile, kimarite and stable pages are wired to the engine',()=>{
 const app=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
 assert.match(app,/recentTenStrip\(w\)\+didYouKnowMarkup\(w\)/);
 assert.match(app,/renderKimariteGallery\(\)\+techniqueFactsMarkup\(\)/);
 const stables=readFileSync(new URL('../assets/sumo-stables.mjs',import.meta.url),'utf8');
 assert.match(stables,/stableFactsMarkup\(stable\)\+disclaimer\(\)/);
});

test('faces: who each fact is about, and faces only where the page lacks that wrestler',()=>{
 assert.deepEqual(factPeople({k:'sweep',w:3,l:4}),{main:'3',other:'4'});
 assert.deepEqual(factPeople({k:'clutch',id:13}),{main:'13',other:null});
 const app=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
 // Profile: the opponent's face on pair facts; the wrestler himself is already in the hero.
 assert.match(app,/factLineMarkup\(f,p\.other\?\(p\.main===me\?p\.other:p\.main\):null\)/);
 // Matchups and head-to-heads already show both wrestlers: no face argument.
 assert.match(app,/return f\?factLineMarkup\(f\):'';/);
 assert.match(app,/facts\.map\(f=>'<li>'\+factLineMarkup\(f\)\+'<\/li>'\)/);
 // Kimarite leaders get faces; only approved photos are used, never a placeholder.
 assert.match(app,/'<li>'\+factFace\(id\)\+/);
 assert.match(app,/function factFace\(id\)[\s\S]*?photo\?\.approved===true[\s\S]*?return '';/);
 const stables=readFileSync(new URL('../assets/sumo-stables.mjs',import.meta.url),'utf8');
 assert.match(stables,/factFace\(factPeople\(f\)\.main\)/);
});
