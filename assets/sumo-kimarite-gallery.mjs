/**
 * BEFN Sumo kimarite reference gallery. NHK footage is used only when
 * supplied with the permission documented by the BEFN owner. Source
 * videos and original publication remain attributed to NHK WORLD-JAPAN.
 * No third-party clips are bundled here until they have been encoded.
 */
const GROUPS = [
  {id:"basic",name:"Basic techniques",jp:"基本技",intro:"Direct pushes, thrusts and force-outs",items:[["Tsukidashi","Frontal thrust-out"],["Tsukitaoshi","Frontal thrust-down"],["Oshidashi","Frontal push-out"],["Oshitaoshi","Frontal push-down"],["Yorikiri","Frontal force-out"],["Yoritaoshi","Frontal crush-out"],["Abisetaoshi","Backward force-down"]]},
  {id:"throws",name:"Throwing techniques",jp:"投げ手",intro:"Grip, leverage and rotation",items:[["Uwatenage","Overarm throw"],["Shitatenage","Underarm throw"],["Kotenage","Arm-lock throw"],["Sukuinage","Beltless scoop throw"],["Uwatedashinage","Pulling overarm throw"],["Shitatedashinage","Pulling underarm throw"],["Koshinage","Hip throw"],["Kubinage","Headlock throw"],["Ipponzeoi","One-arm shoulder throw"],["Nichonage","Leg-hook lifting throw"],["Yaguranage","Inner-thigh lifting throw"],["Kakenage","Inner-thigh hooking throw"],["Tsukaminage","Lifting belt throw"]]},
  {id:"legs",name:"Leg techniques",jp:"掛け手",intro:"Trips, hooks, foot sweeps and leg picks",items:[["Uchigake","Inside leg trip"],["Sotogake","Outside leg trip"],["Chongake","Heel-hook trip"],["Kirikaeshi","Knee-prop twist-down"],["Kawazugake","Entangling backward trip"],["Kekaeshi","Ankle-kick counter"],["Ketaguri","Tachiai ankle kick-down"],["Mitokorozeme","Triple attack"],["Watashikomi","Thigh-grab push-down"],["Nimaigeri","Ankle-kick throw"],["Komatasukui","Inner-thigh scoop"],["Sotokomata","Outer-thigh scoop"],["Omata","Far-thigh scoop"],["Tsumatori","Toe pick"],["Kozumatori","Ankle pick"],["Ashitori","Leg pick"],["Susotori","Outside ankle pick"],["Susoharai","Rear foot sweep"]]},
  {id:"backward",name:"Backward body drops",jp:"反り手",intro:"Arching and dropping backwards",items:[["Izori","Backward knee-lift drop"],["Shumokuzori","Shoulder-carry backward drop"],["Kakezori","Hooked backward drop"],["Tasukizori","Arm-and-leg backward drop"],["Sototasukizori","Outer arm-and-thigh backward drop"],["Tsutaezori","Underarm backward drop"]]},
  {id:"twists",name:"Twist-down techniques",jp:"捻り手",intro:"Turns, asymmetric holds and balance breaks",items:[["Tsukiotoshi","Thrust-down"],["Makiotoshi","Wrapping twist-down"],["Tottari","Arm-bar twist-down"],["Sakatottari","Counter arm-bar twist-down"],["Katasukashi","Under-shoulder swing-down"],["Sotomuso","Outer knee sweep-down"],["Uchimuso","Inner thigh sweep-down"],["Zubuneri","Head-assisted twist-down"],["Uwatehineri","Overarm twist-down"],["Shitatehineri","Underarm twist-down"],["Amiuchi","Fisherman's throw"],["Sabaori","Waist-crush down"],["Harimanage","Over-head belt throw"],["Osakate","Deep overarm throw"],["Kainahineri","Arm twist-down"],["Gasshohineri","Clasped-hands neck twist-down"],["Tokkurinage","Two-handed neck twist-down"],["Kubihineri","Neck-and-arm twist-down"],["Kotehineri","Belt-assisted arm twist-down"]]},
  {id:"special",name:"Special techniques",jp:"特殊技",intro:"Pull-downs, lifts, rear attacks and other finishes",items:[["Hikiotoshi","Hand pull-down"],["Hikkake","Hooked-arm force-out/down"],["Hatakikomi","Slap-down"],["Sokubiotoshi","Neck chop-down"],["Tsuridashi","Frontal lift-out"],["Okuritsuridashi","Rear lift-out"],["Tsuriotoshi","Frontal lift-and-drop"],["Okuritsuriotoshi","Rear lift-and-drop"],["Okuridashi","Rear push-out"],["Okuritaoshi","Rear push-down"],["Okurinage","Rear throw"],["Okurigake","Rear leg-trip"],["Okurihikiotoshi","Rear pull-down"],["Waridashi","Separated-body force-out"],["Utchari","Edge pivot throw"],["Kimedashi","Arm-lock force-out"],["Kimetaoshi","Arm-lock force-down"],["Ushiromotare","Backward lean-out/down"],["Yobimodoshi","Pulling body slam"]]},
];
// Japanese terminology follows the official JSA 82-technique catalogue, in matching group order.
const JP_BY_GROUP = [["突き出し","突き倒し","押し出し","押し倒し","寄り切り","寄り倒し","浴びせ倒し"],["上手投げ","下手投げ","小手投げ","掬い投げ","上手出し投げ","下手出し投げ","腰投げ","首投げ","一本背負い","二丁投げ","櫓投げ","掛け投げ","つかみ投げ"],["内掛け","外掛け","ちょん掛け","切り返し","河津掛け","蹴返し","蹴手繰り","三所攻め","渡し込み","二枚蹴り","小股掬い","外小股","大股","褄取り","小褄取り","足取り","裾取り","裾払い"],["居反り","撞木反り","掛け反り","たすき反り","外たすき反り","伝え反り"],["突き落とし","巻き落とし","とったり","逆取ったり","肩すかし","外無双","内無双","頭捻り","上手捻り","下手捻り","網打ち","鯖折り","波離間投げ","大逆手","腕捻り","合掌捻り","徳利投げ","首捻り","小手捻り"],["引き落とし","引っ掛け","叩き込み","素首落とし","吊り出し","送り吊り出し","吊り落とし","送り吊り落とし","送り出し","送り倒し","送り投げ","送り掛け","送り引き落とし","割り出し","打っ棄り","極め出し","極め倒し","後ろもたれ","呼び戻し"]];
const NHK_YOUTUBE_IDS = {"yorikiri":"bbnsql1bZzw","oshidashi":"BZXmwVOfJNk","hatakikomi":"dVlwcqzB870","uwatenage":"jXZwxHTRRmo","shitatenage":"pTjJdejyZ_0","tsukiotoshi":"PmXZDloYSUk","sukuinage":"nmlYy36vHmk","yoritaoshi":"PucQVjkE038","oshitaoshi":"0N6K53M-S2M","abisetaoshi":"4ENRUd7l0eQ","katasukashi":"FTqtI1aPCIo"};
const NHK_GALLERY = 'https://www3.nhk.or.jp/nhkworld/en/tv/sumo/techniques/';
const JSA_CATALOGUE = 'https://www.sumo.or.jp/Kimarite/show/';
// The generated manifest is loaded from data/sumo/kimarite-media.json.
// Authorised NHK footage is transcoded by scripts/build-kimarite-webm.py.
let APPROVED_WEBM = Object.freeze({});
export function setKimariteMediaManifest(data){
 if(data?.schemaVersion!==1||!data?.clips||typeof data.clips!=='object')return false;
 const valid={};
 for(const [slug,row] of Object.entries(data.clips)){
  if(!/^[a-z]+$/.test(slug)||!row||typeof row!=='object')continue;
  if(!/^assets\/sumo-kimarite\/[a-z]+\.webm$/.test(row.webm||''))continue;
  // Only the official JSA catalogue still is used as a public video poster.
  const technique=KIMARITE.find(x=>x.slug===slug);
  if(!technique)continue;
  if(row.poster && row.poster!==technique.jsaPoster)continue;
  if(row.rights!=='NHK permission confirmed by BEFN owner'||row.credit!=='NHK WORLD-JAPAN')continue;
  valid[slug]={webm:row.webm,poster:technique.jsaPoster,rights:row.rights,credit:row.credit};
 }
 APPROVED_WEBM=Object.freeze(valid);return true;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const kimariteSlug=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
if(GROUPS.some((g,i)=>g.items.length!==JP_BY_GROUP[i].length))throw new Error('JSA technique label count mismatch');
export const KIMARITE_GROUPS = GROUPS.map((g,groupIndex)=>({...g,items:g.items.map(([name,english],i)=>({name,english,japanese:JP_BY_GROUP[groupIndex][i],slug:kimariteSlug(name),group:g.id}))}));
export const KIMARITE = KIMARITE_GROUPS.flatMap(g=>g.items).map((item,index)=>({
 ...item,
 jsaId:index+1,
 jsaPoster:'https://sumo.or.jp/img/kimarite/kimarite_'+String(index+1).padStart(2,'0')+'.jpg',
 jsaDetail:'https://sumo.or.jp/Kimarite/detail/'+(index+1)+'/'
}));
const bySlug = new Map(KIMARITE.map(x=>[x.slug,x]));
export const lookupKimarite=s=>bySlug.get(kimariteSlug(s));
const groupFor=item=>KIMARITE_GROUPS.find(x=>x.id===item.group);
let filter='all',search='';
const videoFor=item=>APPROVED_WEBM[item.slug];
function media(item,large=false){
 const clip=videoFor(item);
 // The official JSA still is the poster for every technique, including
 // techniques without an encoded loop. NHK footage is credited separately.
 if(clip?.webm&&clip?.rights&&clip?.credit){
   return '<video class="sumo-km-video" muted loop playsinline preload="none"'+
     (large?' controls':'')+
     ' poster="'+esc(item.jsaPoster)+'" aria-label="NHK technique video: '+esc(item.name)+'">'+
     '<source src="'+esc(clip.webm)+'" type="video/webm">Video unavailable.</video>'+
     '<span class="sumo-km-media-credit">Video: '+esc(clip.credit)+'</span>';
 }
 const nhk=NHK_YOUTUBE_IDS[item.slug];
 return '<div class="sumo-km-poster" aria-label="Official JSA technique photograph: '+esc(item.name)+'">'+
   '<img src="'+esc(item.jsaPoster)+'" alt="Japan Sumo Association reference photograph of '+esc(item.name)+'" loading="lazy" decoding="async">'+
   '<span class="sumo-km-poster-credit">Photo: Japan Sumo Association</span>'+
   (nhk?'<span class="sumo-km-pending" aria-label="NHK video loop pending">WebM pending</span>':'')+
   '</div>';
}
function linkSource(item){
 const yt=NHK_YOUTUBE_IDS[item.slug];
 return yt?'https://www.youtube.com/watch?v='+yt:NHK_GALLERY;
}
function tile(item){
 return '<article class="sumo-km-tile" id="kimarite-'+item.slug+'"><a class="sumo-km-tile-link" href="#kimarite?term='+item.slug+'" aria-label="View '+esc(item.name)+' example and explanation">'+
  '<div class="sumo-km-media">'+media(item)+'</div><div class="sumo-km-tile-meta">'+
  '<div class="sumo-km-jp">'+esc(item.japanese||'決まり手')+'</div>'+
  '<div><h3>'+esc(item.name)+'</h3><p>'+esc(item.english)+'</p></div><span class="sumo-km-chevron" aria-hidden="true">↗</span>'+
  '</div></a></article>';
}
function galleryContents(){
 const host=document.getElementById('sumo-km-results');if(!host)return;
 const found=KIMARITE_GROUPS.map(g=>({...g,items:g.items.filter(item=>(filter==='all'||g.id===filter)&&
   (!search||(item.name+' '+item.english+' '+item.japanese+' '+g.name).toLowerCase().includes(search)))})).filter(g=>g.items.length);
 const shown=found.reduce((n,g)=>n+g.items.length,0);
 host.innerHTML=found.length?found.map(g=>'<section class="sumo-km-group" id="sumo-km-'+g.id+'"><header class="sumo-km-group-head">'+
  '<div><span class="sumo-km-jp">'+esc(g.jp)+'</span><h2>'+esc(g.name)+'</h2><p>'+esc(g.intro)+'</p></div>'+
  '<strong>'+g.items.length+' techniques</strong></header><div class="sumo-km-grid">'+g.items.map(tile).join('')+'</div></section>').join(''):
  '<p class="sumo-km-empty">No matching kimarite. Try a different spelling or category.</p>';
 document.getElementById('sumo-km-count').textContent=shown+' of 82 techniques';
 document.querySelectorAll('[data-km-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kmFilter===filter)));
 observeKimariteVideos();
}
function gallery(){
 return '<div class="sumo-km-gallery">'+
  '<header class="sumo-km-hero"><div class="eyebrow">BEFN SUMO · THE TECHNIQUE LIBRARY</div>'+
  '<h1>Kimarite <span>決まり手</span></h1><p>Explore all 82 official sumo winning techniques. Select a technique to see what it means and an authorised demonstration where available.</p>'+
  '<div class="sumo-km-hero-stats"><strong>82 <small>techniques</small></strong><strong>6 <small>families</small></strong><strong>5 <small>other outcomes</small></strong></div></header>'+
  '<section class="sumo-km-controls" aria-label="Find a winning technique">'+
  '<label for="sumo-km-search">Find a technique</label>'+
  '<input id="sumo-km-search" type="search" value="'+esc(search)+'" placeholder="Search yorikiri, throw, trip…" autocomplete="off">'+
  '<div class="sumo-km-filters" role="group" aria-label="Technique families">'+
  '<button type="button" data-km-filter="all" aria-pressed="'+(filter==='all')+'">All 82</button>'+
  KIMARITE_GROUPS.map(g=>'<button type="button" data-km-filter="'+g.id+'" aria-pressed="'+(filter===g.id)+'">'+esc(g.name.replace(' techniques','').replace(' body drops',' drops'))+' <span>'+g.items.length+'</span></button>').join('')+
  '</div><div id="sumo-km-count" class="sumo-km-count" role="status">82 of 82 techniques</div></section>'+
  '<div id="sumo-km-results"></div>'+
  '<section class="sumo-km-outcomes"><h2>Other results — not kimarite</h2><p>Isamiashi, Koshikudake, Tsukite, Tsukihiza and Fumidashi are classified separately from the 82 winning techniques. Forfeits and absences are also not performed winning techniques.</p></section>'+
  '<p class="sumo-km-source">Photographs: Japan Sumo Association (used with owner-reported permission). Technique terminology: <a href="'+JSA_CATALOGUE+'" target="_blank" rel="noopener noreferrer">Japan Sumo Association</a>. Demonstrations: <a href="'+NHK_GALLERY+'" target="_blank" rel="noopener noreferrer">NHK WORLD-JAPAN</a>. Source videos remain with their publishers; BEFN has not republished them.</p>'+
  '</div>';
}
function detail(item){
 const category=groupFor(item);
 const mediaLink=linkSource(item);
 const yt=NHK_YOUTUBE_IDS[item.slug];
 const idx=KIMARITE.findIndex(x=>x.slug===item.slug);
 const previous=KIMARITE[(idx-1+KIMARITE.length)%KIMARITE.length];
 const next=KIMARITE[(idx+1)%KIMARITE.length];
 return '<article class="sumo-km-detail" id="kimarite-'+item.slug+'">'+
  '<a class="sumo-km-back" href="#kimarite">← All 82 kimarite</a>'+
  '<div class="sumo-km-detail-head"><div class="eyebrow">'+esc(category.name)+'</div>'+
  '<h1>'+esc(item.name)+'</h1><div class="sumo-km-detail-jp">'+esc(item.japanese||'決まり手')+'</div>'+
  '<p class="sumo-km-meaning">'+esc(item.english)+'</p></div>'+
  '<div class="sumo-km-detail-grid"><div class="sumo-km-detail-media">'+media(item,true)+'</div>'+
  '<div class="sumo-km-detail-aside"><h2>How the bout is decided</h2><p>'+esc(item.english)+'. This finish is categorised by the Japan Sumo Association under '+esc(category.name.toLowerCase())+'.</p>'+
  (videoFor(item)?.webm?'<p>Autoplaying WebM example · muted · looping</p>':yt?
    '<p>The official JSA reference still is shown here while the NHK WebM loop is being prepared.</p>':
    '<p>The official JSA reference still is shown here while the NHK WebM loop is being prepared.</p>')+
  '<a class="sumo-km-watch" target="_blank" rel="noopener noreferrer" href="'+esc(mediaLink)+'">'+(yt?'Open original NHK demonstration':'Explore NHK technique videos')+' ↗</a>'+
  '<a class="sumo-km-jsa" target="_blank" rel="noopener noreferrer" href="'+esc(item.jsaDetail)+'">View JSA photograph and reference ↗</a>'+
  '</div></div><nav class="sumo-km-prevnext" aria-label="Explore adjacent techniques">'+
  '<a href="#kimarite?term='+previous.slug+'">← '+esc(previous.name)+'</a>'+
  '<a href="#kimarite?term='+next.slug+'">'+esc(next.name)+' →</a></nav></article>';
}
export function renderKimariteGallery(){
 const value=new URLSearchParams(location.hash.split('?')[1]||'').get('term');
 const item=lookupKimarite(value);
 return item?detail(item):gallery();
}
let kimariteVideoObserver=null;
function observeKimariteVideos(){
 kimariteVideoObserver?.disconnect();
 kimariteVideoObserver=null;
 if(!('IntersectionObserver' in window))return;
 const videos=[...document.querySelectorAll('.sumo-km-video')];
 if(!videos.length)return;
 kimariteVideoObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{
  if(entry.isIntersecting&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    entry.target.play().catch(()=>{});
  }else entry.target.pause();
 });},{rootMargin:'150px'});
 videos.forEach(video=>kimariteVideoObserver.observe(video));
}
export function hydrateKimariteGallery(){
 if(document.getElementById('sumo-km-results'))galleryContents();
 else observeKimariteVideos();
}

// Delegated listeners register once; the parent Sumo router owns hash navigation.
if(typeof document!=='undefined')document.addEventListener('input',event=>{
 if(event.target?.id==='sumo-km-search'){
   search=event.target.value.trim().toLowerCase();
   galleryContents();
 }
});
if(typeof document!=='undefined')document.addEventListener('click',event=>{
 const target=event.target.closest?.('[data-km-filter]');
 if(!target)return;
 filter=target.dataset.kmFilter;
 galleryContents();
});
// Link existing bout, head-to-head and profile technique references to their examples.
// Text nodes are used (not innerHTML replacement), preserving current data and links.
export function linkKimariteMentions(root){
 const selectors=['.sumo-ed-tech','.sumo-result-extra','.sumo-h2h-technique','.sumo-daily-meeting','.sumo-compact-result','.sumo-techniques-list .chart-row .name','.sumo-kimarite-bar','.sumo-leader-last','.sumo-daily-card'];
 const valid=new Map(KIMARITE.map(x=>[x.name.toLowerCase(),x]));
 const names=[...valid.keys()].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const reg=new RegExp('\\b('+names.join('|')+')\\b','ig');
 root.querySelectorAll(selectors.join(',')).forEach(node=>{
   const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
   const texts=[];while(walker.nextNode())texts.push(walker.currentNode);
   for(const textNode of texts){
     if(!textNode.textContent||textNode.parentElement.closest('a,button,script,style'))continue;
     const s=textNode.textContent;reg.lastIndex=0;if(!reg.test(s))continue;
     reg.lastIndex=0;const fragment=document.createDocumentFragment();let last=0,match;
     while((match=reg.exec(s))){
       if(match.index>last)fragment.append(document.createTextNode(s.slice(last,match.index)));
       const item=valid.get(match[0].toLowerCase());
       const link=document.createElement('a');link.href='#kimarite?term='+item.slug;
       link.className='sumo-km-inline-link';link.title='View '+item.name+' technique example';
       link.textContent=match[0];fragment.append(link);last=match.index+match[0].length;
     }
     if(last<s.length)fragment.append(document.createTextNode(s.slice(last)));
     textNode.replaceWith(fragment);
   }
 });
}
