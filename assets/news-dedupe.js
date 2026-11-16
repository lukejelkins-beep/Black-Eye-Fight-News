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
  const namedPromotions=['ufc','pfl','rizin','ksw','bellator','bkfc','cage warriors'];
  function promotions(title){return namedPromotions.filter(p=>new RegExp('\\b'+p+'\\b','i').test(title||''));}
  function hasBookingDevelopment(title){return /\b(?:booked|scheduled|set to face|fight announced|to face|to fight|will fight|added to)\b/i.test(title||'');}
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
  // Catch syndicated rewrites without collapsing every article about the same card.
  // Compare distinctive headline terms (not promotion, card number or common fight words).
  const boilerplate=new Set('ufc mma boxing pfl one rizin raf fight fights fighter fighters bout card title champion championship world heavyweight lightweight bantamweight featherweight middleweight welterweight event match vs versus at the news video live stream report reports official preview previews prediction predictions interview reaction recap highlights countdown conference press media day updates update coach conversation polymarket'.split(' '));
  function distinctive(title){return new Set(terms(title).filter(w=>!boilerplate.has(w)&&!/^\d+$/.test(w)));}
  function stage(title){
    const t=String(title||'').toLowerCase();
    if(/\b(?:turns? down|declines?|rejects?)\b/.test(t))return 'declined';
    if(/\b(?:offered?|offer)\b/.test(t))return 'offered';
    if(/\b(?:meeting|met with)\b/.test(t))return 'meeting';
    if(/\b(?:withdrawn|withdraws?|out of|pulls? out)\b/.test(t))return 'withdrawal';
    if(/\b(?:cancelled|canceled|called off)\b/.test(t))return 'cancelled';
    if(/\b(?:postponed|delayed)\b/.test(t))return 'postponed';
    if(/\b(?:knocked out|knockout|wins?|defeats?|stops?|submits?)\b/.test(t))return 'result';
    if(/\b(?:rumou?rs?|reportedly|possible|possibly|could|may)\b/.test(t))return 'unconfirmed';
    return '';
  }
  function sameRewordedHeadline(a,b){
    const ax=distinctive(a.title),bx=distinctive(b.title);
    const both=[...ax].filter(w=>bx.has(w)).length;
    if(both<5||Math.min(ax.size,bx.size)<5)return false;
    if(stage(a.title)!==stage(b.title))return false;
    return both/Math.min(ax.size,bx.size)>=.78 &&
           both/new Set([...ax,...bx]).size>=.50;
  }
  function matchingBooking(a,b){
    const booking=t=>/\b(?:booked|added to|make (?:a |his |her )?(?:boxing |mma )?debut|scheduled|set to face|fight announced)\b/i.test(t||'');
    const ax=distinctive(a.title),bx=distinctive(b.title);
    const common=[...ax].filter(w=>bx.has(w)).length;
    return booking(a.title)&&booking(b.title)&&common>=4&&
      common/Math.min(ax.size,bx.size)>=.70;
  }
  function matchingEventMedia(a,b){
    const card=t=>(String(t||'').match(/\b(?:ufc|pfl|raf|rizin)\s*[- ]?\d+\b/i)||[])[0]?.toLowerCase().replace(/[- ]+/g,'')||'';
    const kind=t=>/press[ -]?conference/i.test(t)?'press-conference':/media[ -]?day/i.test(t)?'media-day':'';
    return !!card(a.title)&&card(a.title)===card(b.title)&&!!kind(a.title)&&kind(a.title)===kind(b.title)&&
      /\b(?:video|stream|watch|live)\b/i.test(a.title)&&/\b(?:video|stream|watch|live)\b/i.test(b.title);
  }
  function same(a,b){
    if(url(a.url)===url(b.url))return true;
    if(a.sport!==b.sport||Math.abs(Date.parse(a.publishedAt)-Date.parse(b.publishedAt))>72*3600e3)return false;
    const x=terms(a.title),y=terms(b.title),sx=new Set(x),sy=new Set(y);
    if(x.join(' ')==y.join(' '))return true;
    // Every fuzzy path respects editorial stage and contract follow-ups, just
    // like the authoritative publishing-time filter.
    if(stage(a.title)!==stage(b.title))return false;
    if([a.title,b.title].some(t=>eventKind(t)==='contract-extension')){
      if(hasBookingDevelopment(a.title)||hasBookingDevelopment(b.title))return false;
      const ap=promotions(a.title),bp=promotions(b.title);
      if(ap.length&&bp.length&&ap.join(',')!==bp.join(','))return false;
    }
    if(sameEvent(a,b)||sameRewordedHeadline(a,b)||matchingBooking(a,b)||matchingEventMedia(a,b))return true;
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
