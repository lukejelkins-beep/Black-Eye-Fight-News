/* BEFN Sumo fact engine (Phase 1).
 *
 * One store of small, scored facts that any page can ask for: "the best fact
 * about this pair" for a matchup line, or several for the head-to-head panel.
 *
 * Decision rules (owner-approved proposal, 21 Nov 2026):
 *  - Truth: every fact here is level B (computed from BEFN's cached Sumo API
 *    bout ledger and listed roster data). Its wording always carries its scope
 *    ("BEFN's records", "since 2021", "wrestlers BEFN tracks"); no unscoped
 *    "most ever" / "first ever". Missing data is never read as a result.
 *  - Wow: each fact carries a 0-100 score from rarity, stakes, recency and
 *    specificity. Each surface has its own bar; below it, nothing is shown.
 *
 * buildFactIndex() runs in Node during the scheduled refresh (no network).
 * The selectors and wording run in the browser from the stored index.
 */
export const FACT_INDEX_VERSION=1;
export const TECHNIQUE_SINCE='202101';
export const SURFACE_MIN={matchup:58,rivalry:40,person:55};
const NOT_A_TECHNIQUE=new Set(['','fusen']);
const sid=v=>String(v??'');
const validBasho=v=>/^(19|20)\d{2}(01|03|05|07|09|11)$/.test(sid(v));
const pairKey=(a,b)=>{const x=Number(a),y=Number(b);return x<y?x+':'+y:y+':'+x;};
const divisionLevel=rank=>/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira)\b/.test(String(rank||''))?2:/^Juryo\b/.test(String(rank||''))?1:0;
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const bashoIndex=id=>Number(sid(id).slice(0,4))*6+(Number(sid(id).slice(4,6))-1)/2;

/** Build the stored index from the roster and the cached bout ledger. */
export function buildFactIndex({roster,details,history}={}){
 if(!Array.isArray(roster?.rikishi)||!roster.rikishi.length||!history?.pairs)throw Error('Fact index needs the roster and bout ledger');
 if(!validBasho(details?.bashoId))throw Error('Fact index needs the current basho');
 const ids=new Set(roster.rikishi.map(w=>sid(w.sourceId)));
 const now=bashoIndex(details.bashoId);
 const pairs={},people={};
 const add=(map,key,fact)=>{(map[key]||=[]).push(fact);};
 // Technique tallies since 2021 across every cached bout (any winner), so a
 // "rare move" is rare in the whole ledger, not only among tracked winners.
 const allMoves=new Map(),moveFirst=new Map(),moves=new Map(),met=new Set();
 let longest=0;
 const series=[];
 for(const pair of Object.values(history.pairs)){
  const a=sid(pair?.a),b=sid(pair?.b);
  if(!a||!b||a===b||!Array.isArray(pair?.regular))continue;
  if(pair.regular.length||(Array.isArray(pair.special)&&pair.special.length))met.add(pairKey(a,b));
  const bouts=pair.regular.filter(x=>Array.isArray(x)&&validBasho(x[0])&&Number.isInteger(x[1])&&[a,b].includes(sid(x[2])))
   .map(x=>({basho:sid(x[0]),day:x[1],winner:sid(x[2]),move:String(x[3]||'').toLowerCase()}))
   .sort((x,y)=>x.basho.localeCompare(y.basho)||x.day-y.day);
  for(const bout of bouts){
   if(bout.basho<TECHNIQUE_SINCE||NOT_A_TECHNIQUE.has(bout.move))continue;
   allMoves.set(bout.move,(allMoves.get(bout.move)||0)+1);
   if(ids.has(bout.winner)){
    const m=moves.get(bout.winner)||new Map();m.set(bout.move,(m.get(bout.move)||0)+1);moves.set(bout.winner,m);
    const list=moveFirst.get(bout.move)||[];list.push({id:bout.winner,basho:bout.basho,day:bout.day});moveFirst.set(bout.move,list);
   }
  }
  if(!ids.has(a)||!ids.has(b)||!bouts.length)continue;
  series.push({a,b,bouts});
  longest=Math.max(longest,bouts.length);
 }
 for(const {a,b,bouts} of series){
  const key=pairKey(a,b),n=bouts.length;
  const wins={[a]:bouts.filter(x=>x.winner===a).length,[b]:bouts.filter(x=>x.winner===b).length};
  const first=bouts[0].basho,last=bouts.at(-1).basho;
  const age=Math.max(0,now-bashoIndex(last));               // basho since last meeting
  const recency=age<=6?0:age<=18?-6:-14;
  const lead=wins[a]>=wins[b]?a:b,trail=lead===a?b:a;
  // Long or level series.
  if(n>=15){
   const diff=Math.abs(wins[a]-wins[b]);
   const level=diff===0,close=diff<=2;
   const score=(level?52:close?44:34)+Math.min(30,n*0.7)+(n===longest?10:0)+recency;
   if(level||close||n>=25)add(pairs,key,{k:'series',a:lead,b:trail,wa:wins[lead],wb:wins[trail],n,first,last,top:n===longest?1:0,s:clamp(score)});
  }
  // Clean sweep: one side has never won.
  if(n>=5&&wins[trail]===0){
   add(pairs,key,{k:'sweep',w:lead,l:trail,n,first,last,s:clamp(44+n*4+recency)});
  }else{
   // Current streak in the series.
   let streak=0;const w=bouts.at(-1).winner;
   for(let i=n-1;i>=0&&bouts[i].winner===w;i--)streak++;
   if(streak>=5){
    const l=w===a?b:a,lastLoss=bouts[n-1-streak]?.basho||null;
    add(pairs,key,{k:'streak',w,l,n:streak,wa:wins[w],wb:wins[l],lastLoss,s:clamp(36+streak*4+recency)});
   }
  }
  // One finishing move dominates the wins over this opponent.
  for(const w of [a,b]){
   const l=w===a?b:a;
   const won=bouts.filter(x=>x.winner===w&&!NOT_A_TECHNIQUE.has(x.move));
   if(won.length<4)continue;
   const tally=new Map();won.forEach(x=>tally.set(x.move,(tally.get(x.move)||0)+1));
   const [move,count]=[...tally].sort((x,y)=>y[1]-x[1])[0];
   if(count===won.length||(count>=5&&count/won.length>=0.8))
    add(pairs,key,{k:'finish',w,l,km:move,c:count,t:won.length,s:clamp(34+Math.min(count,8)*3+(count===won.length?6:0)+recency)});
  }
 }
 // Repertoire: most distinct winning techniques since 2021 (top three).
 const repertoire=[...moves].map(([id,m])=>({id,n:m.size,wins:[...m.values()].reduce((x,y)=>x+y,0)}))
  .filter(x=>x.wins>=30).sort((x,y)=>y.n-x.n||y.wins-x.wins);
 repertoire.slice(0,3).forEach((x,i)=>{
  if(i>0&&x.n===repertoire[i-1].n)return;                      // only clear rankings
  add(people,x.id,{k:'rep',id:x.id,n:x.n,rank:i+1,s:[74,64,58][i]});
 });
 // Signature move: one technique for a large share of wins since 2021.
 for(const [id,m] of moves){
  const t=[...m.values()].reduce((x,y)=>x+y,0);
  if(t<40)continue;
  const [move,c]=[...m].sort((x,y)=>y[1]-x[1])[0];
  const pct=Math.round(100*c/t);
  if(pct>=58)add(people,id,{k:'sig',id,km:move,c,t,pct,s:clamp(30+pct/2)});
 }
 // Rare move: a technique with at most two wins in the whole cached ledger since 2021.
 for(const [move,total] of allMoves){
  if(total>2)continue;
  const seen=new Set();
  for(const hit of moveFirst.get(move)||[])if(!seen.has(hit.id)&&seen.add(hit.id))add(people,hit.id,{k:'rare',id:hit.id,km:move,total,basho:hit.basho,day:hit.day,s:total===1?64:56});
 }
 // First meeting: an announced pairing of two tracked wrestlers with no earlier
 // regular or special bout anywhere in the ledger.
 for(const source of [details.torikumi,details.todayTorikumi]){
  for(const division of Object.values(source||{})){
   for(const bout of division?.data?.torikumi||[]){
    const a=sid(bout?.eastId),b=sid(bout?.westId),key=pairKey(a,b);
    if(!ids.has(a)||!ids.has(b)||a===b||met.has(key)||pairs[key]?.some(f=>f.k==='first'))continue;
    // Top-division first meetings matter most; lower divisions rarely clear the bar.
    const level=[a,b].map(id=>divisionLevel(roster.rikishi.find(w=>sid(w.sourceId)===id)?.currentRank));
    add(pairs,key,{k:'first',a,b,s:Math.min(...level)>=2?60:Math.min(...level)>=1?55:48});
   }
  }
 }
 for(const list of [...Object.values(pairs),...Object.values(people)])list.sort((x,y)=>y.s-x.s);
 return {schemaVersion:FACT_INDEX_VERSION,bashoId:sid(details.bashoId),techniqueSince:TECHNIQUE_SINCE,
  source:'BEFN cached Sumo API regular-bout ledger (not independently JSA-certified) and listed roster data',
  scope:'Bouts in BEFN records involve at least one wrestler BEFN tracks; ledger playoffs excluded',
  counts:{pairs:Object.keys(pairs).length,people:Object.keys(people).length},pairs,people};
}

/* ------------------------------------------------------------------ browser */
const MONTHS=['January','March','May','July','September','November'];
export const bashoMonth=id=>validBasho(id)?MONTHS[(Number(sid(id).slice(4,6))-1)/2]+' '+sid(id).slice(0,4):'';
const ordinal=['','the most','the second-most','the third-most'];

/** Live facts from roster data for a specific pairing (size, age). */
export function liveMatchupFacts(roster,a,b,{now=new Date()}={}){
 const find=id=>(roster?.rikishi||[]).find(w=>sid(w.sourceId)===sid(id));
 const x=find(a),y=find(b),out=[];
 if(!x||!y)return out;
 const wx=Number(x.weightKg),wy=Number(y.weightKg);
 if(Number.isFinite(wx)&&Number.isFinite(wy)&&wx>0&&wy>0){
  const gap=Math.round(Math.abs(wx-wy));
  if(gap>=45)out.push({k:'size',heavy:wx>wy?sid(a):sid(b),light:wx>wy?sid(b):sid(a),hw:Math.round(Math.max(wx,wy)),lw:Math.round(Math.min(wx,wy)),gap,s:clamp(40+(gap-45)*0.8)});
 }
 const bx=Date.parse(x.birthDate),by=Date.parse(y.birthDate);
 if(Number.isFinite(bx)&&Number.isFinite(by)){
  const years=Math.floor(Math.abs(bx-by)/(365.2425*86400000));
  if(years>=13)out.push({k:'age',older:bx<by?sid(a):sid(b),younger:bx<by?sid(b):sid(a),years,s:clamp(36+(years-13)*3)});
 }
 return out;
}
function indexFor(details){
 const idx=details?.factIndex;
 return idx?.schemaVersion===FACT_INDEX_VERSION&&sid(idx.bashoId)===sid(details?.bashoId)?idx:null;
}
/** Facts about this pair: stored rivalry facts plus live size/age facts. */
export function pairFacts(details,roster,a,b){
 const idx=indexFor(details);
 const stored=idx?.pairs?.[pairKey(a,b)]||[];
 return [...stored,...liveMatchupFacts(roster,a,b)].sort((x,y)=>y.s-x.s);
}
export function personFacts(details,id){
 return (indexFor(details)?.people?.[sid(id)]||[]).slice().sort((x,y)=>y.s-x.s);
}
/** The single best fact for a matchup line, or null when nothing clears the bar.
 * Facts about the pair get a stakes bonus for yokozuna/ozeki/sanyaku bouts;
 * facts about one wrestler compete at a discount because they say less about the bout. */
const STAKES={Yokozuna:6,Ozeki:6,Sekiwake:3,Komusubi:3};
export function matchupStakes(roster,a,b){
 return Math.max(0,...[a,b].map(id=>{
  const w=(roster?.rikishi||[]).find(x=>sid(x.sourceId)===sid(id));
  return STAKES[String(w?.currentRank||'').split(' ')[0]]||0;
 }));
}
export function bestMatchupFact(details,roster,a,b,{min=SURFACE_MIN.matchup}={}){
 const stakes=matchupStakes(roster,a,b);
 const pool=[...pairFacts(details,roster,a,b).map(f=>({...f,s:f.s+stakes})),
  ...[a,b].flatMap(id=>personFacts(details,id).map(f=>({...f,s:f.s-15})))];
 const best=pool.sort((x,y)=>y.s-x.s)[0];
 return best&&best.s>=min?best:null;
}
/** Up to `limit` facts for the head-to-head panel: pair facts first, then each wrestler's best. */
export function rivalryFacts(details,roster,a,b,{limit=4}={}){
 const pair=pairFacts(details,roster,a,b).filter(f=>f.s>=SURFACE_MIN.rivalry);
 const people=[a,b].map(id=>personFacts(details,id).find(f=>f.s>=SURFACE_MIN.person)).filter(Boolean);
 return [...pair,...people].slice(0,limit);
}

/** Plain-text wording: {tag, lead, rest, scope}. `name(id)` returns a shikona. */
export function factText(f,name){
 const n=id=>name(id)||'This wrestler';
 switch(f?.k){
  case 'series':{
   const level=f.wa===f.wb;
   return {tag:'Rivalry',
    lead:f.n+' meetings since '+bashoMonth(f.first)+(level?', and it’s level at '+f.wa+'–'+f.wb+'.':': '+n(f.a)+' leads '+f.wa+'–'+f.wb+'.'),
    rest:f.top?'The longest series between two wrestlers BEFN tracks.':'',scope:'BEFN bout records'};
  }
  case 'first':return {tag:'First meeting',lead:'First time facing each other.',
   rest:'',scope:'BEFN bout records'};
  case 'sweep':return {tag:'Clean sweep',lead:n(f.w)+' has won all '+f.n+' of their meetings.',
   rest:'The first was in '+bashoMonth(f.first)+'.',scope:'BEFN bout records'};
  case 'streak':return {tag:'Streak',lead:n(f.w)+' has won their last '+f.n+' meetings.',
   rest:f.wa+'–'+f.wb+' overall.'+(f.lastLoss?' '+n(f.l)+' last won in '+bashoMonth(f.lastLoss)+'.':''),scope:'BEFN bout records'};
  case 'finish':return {tag:'Finishing move',
   lead:(f.c===f.t?'All '+f.t:f.c+' of '+f.t)+' of '+n(f.w)+'’s wins over '+n(f.l)+' have come by '+f.km+'.',rest:'',scope:'BEFN bout records'};
  case 'rep':return {tag:'Technique',lead:n(f.id)+' has won with '+f.n+' different techniques since 2021.',
   rest:'That’s '+ordinal[f.rank]+' among wrestlers BEFN tracks.',scope:'BEFN bout records · since January 2021'};
  case 'sig':return {tag:'Signature move',lead:n(f.id)+' wins by '+f.km+' '+f.pct+'% of the time.',
   rest:f.c+' of '+f.t+' wins since 2021.',scope:'BEFN bout records · since January 2021'};
  case 'rare':return {tag:'Rare move',
   lead:f.total===1?n(f.id)+' has the only '+f.km+' win in BEFN’s records since 2021.':n(f.id)+' has one of only '+f.total+' '+f.km+' wins in BEFN’s records since 2021.',
   rest:'It came on day '+f.day+' of the '+bashoMonth(f.basho)+' basho.',scope:'BEFN bout records · since January 2021'};
  case 'size':return {tag:'Size gap',lead:'A '+f.gap+' kg weight difference.',
   rest:n(f.heavy)+' is listed at '+f.hw+' kg, '+n(f.light)+' at '+f.lw+' kg.',scope:'Listed weights'};
  case 'age':return {tag:'Age gap',lead:n(f.older)+' is '+f.years+' years older than '+n(f.younger)+'.',rest:'',scope:'Listed birth dates'};
  default:return null;
 }
}
