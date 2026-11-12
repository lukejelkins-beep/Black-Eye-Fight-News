/* Display-time safety net for currently cached news, including preview snapshots.
   Publishing-time deduplication remains authoritative in scripts/news_dedupe.py. */
(function(){
  'use strict';
  const stop=new Set('a an the to and or of in on at for from after before with as by is are was were will be has have had new latest report reports says said reveals breaking exclusive video'.split(' '));
  const updates=new Set('confirmed announced rumored rumoured injured withdraws withdrawn cancelled postponed wins won loses lost knockout stopped weigh weighin signed signs suspended returns retired'.split(' '));
  function url(value){
    try{
      const u=new URL(value);
      u.hash='';u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');
      [...u.searchParams.keys()].forEach(k=>{if(/^utm_/i.test(k)||/^(fbclid|gclid|mc_cid|mc_eid|igshid|ref|ref_src|source)$/i.test(k))u.searchParams.delete(k)});
      u.pathname=u.pathname.replace(/\/+$/,'')||'/';
      u.searchParams.sort();
      return u.protocol+'//'+u.host+u.pathname+u.search;
    }catch{return String(value||'');}
  }
  function terms(s){return (String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>!stop.has(w));}

  // Publisher-to-publisher same-event matching. Require identical incident
  // type plus shared distinctive subjects; do not dedupe just by fighter name.
  const generic=new Set('ufc mma boxing fighter fighters announcer commentator broadcaster broadcast team long term multi year contract extension signs signed extends continue continues role years year deal major news official confirmed report announces announced fight bout match championship champion world title record breaking'.split(' '));
  const eventRules=[
   ['contract-extension',/\b(?:extension|extends?|re-signs?|renews?|renewal)\b/i],
   ['fight-booking',/\b(?:booked|scheduled|set to face|to fight|fight announced)\b/i],
   ['withdrawal',/\b(?:withdraws?|withdrawn|pulls? out)\b/i],
   ['cancellation',/\b(?:cancelled|canceled|called off)\b/i],
   ['postponement',/\b(?:postponed|delayed)\b/i],
   ['retirement',/\b(?:retired|retires|retirement)\b/i],
   ['injury',/\b(?:injured|injury|hospitalized|hospitalised)\b/i],
   ['suspension',/\b(?:suspended|suspension)\b/i]
  ];
  function eventKind(title){return eventRules.find(([,re])=>re.test(title||''))?.[0]||'';}
  function sameEvent(a,b){
   const kind=eventKind(a.title);
   if(!kind||kind!==eventKind(b.title))return false;
   const x=new Set(terms(a.title).filter(w=>!generic.has(w)));
   const y=new Set(terms(b.title).filter(w=>!generic.has(w)));
   const shared=[...x].filter(w=>y.has(w)).length;
   if(shared<2)return false;
   if(kind==='contract-extension')return shared/Math.min(x.size,y.size)>=.65;
   return shared>=3&&shared/Math.min(x.size,y.size)>=.85;
  }
  function same(a,b){
    if(url(a.url)===url(b.url))return true;
    if(a.sport!==b.sport||Math.abs(Date.parse(a.publishedAt)-Date.parse(b.publishedAt))>72*3600e3)return false;
    const x=terms(a.title),y=terms(b.title),sx=new Set(x),sy=new Set(y);
    if(x.join(' ')==y.join(' '))return true;
    if(sameEvent(a,b))return true;
    if(Math.min(sx.size,sy.size)<6)return false;
    const stages=s=>[...s].filter(w=>updates.has(w)).sort().join(',');
    if(stages(sx)!==stages(sy))return false;
    const both=[...sx].filter(w=>sy.has(w)).length;
    return both/new Set([...sx,...sy]).size>=.88&&both/Math.min(sx.size,sy.size)>=.90;
  }
  function quality(a){
    return (a.image?.url?10:0)+(Array.isArray(a.summaryPoints)?Math.min(3,a.summaryPoints.length):0)+(a.sourceMethod?0:2);
  }
  window.BEFNNewsUnique=function(items){
    if(!Array.isArray(items))return [];
    const sorted=[...items].sort((a,b)=>quality(b)-quality(a)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
    const picked=[];
    for(const item of sorted)if(item&&item.url&&item.title&&!picked.some(prev=>same(item,prev)))picked.push(item);
    return picked;
  };
})();
