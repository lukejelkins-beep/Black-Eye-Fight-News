/* Browser-visible fight alerts and optional OneSignal Web Push.
 * Local alerts only work while this page is open. Background push requires a
 * configured OneSignal app and a publisher-side sender/automation.
 */
(() => {
  'use strict';
  const KEY='befn-alerts-v1', NOW=()=>Date.now();
  const TOPICS={news:'Breaking fight news',results:'Confirmed fight results',upcoming:'New upcoming cards'};
  const DEFAULT={news:false,results:false,upcoming:false};
  let settings={...DEFAULT};
  try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');for(const key of Object.keys(DEFAULT))settings[key]=value[key]===true;}catch{}
  const history=[];
  const baseline={news:null,results:null,upcoming:null};
  const lastAlert={news:0,results:0,upcoming:0};
  let panel=null, opener=null, sdk=null, sdkReady=null;
  const appId=String(window.BEFN_PUSH_CONFIG?.oneSignalAppId||'').trim();
  const mobileApple=/iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function sync(){
    try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}
    if(sdk)sdk.User.addTags({befn_news:settings.news?'1':'0',befn_results:settings.results?'1':'0',befn_upcoming:settings.upcoming?'1':'0'});
  }
  function saveNews(kind,message,href){
    if(!settings[kind]||NOW()-lastAlert[kind]<180000)return;
    lastAlert[kind]=NOW();
    history.unshift({kind,message,href,date:new Date().toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'})});
    history.length=Math.min(history.length,15);
    if(document.visibilityState!=='visible')return;
    document.querySelector('.befn-alerts-toast')?.remove();
    const a=document.createElement('a');a.className='befn-alerts-toast';a.href=href;
    a.textContent=message;
    const label=document.createElement('small');label.textContent='Black Eye Fight News · Tap to view';a.append(label);
    a.addEventListener('click',()=>a.remove());
    document.body.append(a);
    setTimeout(()=>a.remove(),10500);
    drawHistory();
  }
  function resultSignature(item){
    return [item.status,item.winner,item.method,item.round].join(':');
  }
  async function pollTopic(topic,url,map){
    if(!settings[topic]||document.visibilityState==='hidden')return;
    let payload;
    try{
      const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});
      if(!response.ok) return;
      payload=await response.json();
    }catch{return;}
    if(topic==='news'){
      const articles=Array.isArray(payload.articles)?payload.articles:[];
      const previous=baseline.news;
      const present=new Set(articles.map(article=>String(article.id||article.url||'')));
      baseline.news=present;
      if(!previous)return;
      const fresh=articles.filter(a=>!previous.has(String(a.id||a.url||''))&&Number(a.score)>=5&&NOW()-Date.parse(a.publishedAt)<12*3600000&&NOW()-Date.parse(a.publishedAt)>-3600000);
      if(fresh.length)saveNews('news',fresh.length===1?fresh[0].title:fresh.length+' significant new fight stories','#news');
    }else if(topic==='results'){
      const list=Array.isArray(payload.results)?payload.results:[];
      const previous=baseline.results;
      const present=new Map(list.map(a=>[String(a.id),resultSignature(a)]));
      baseline.results=present;
      if(!previous)return;
      const fresh=list.filter(a=>
        a.status==='completed'&&previous.get(String(a.id))!==resultSignature(a)&&
        Date.parse(String(a.date)+'T12:00:00Z')>NOW()-48*3600000);
      if(fresh.length){
        const title=fresh.length===1
          ?(fresh[0].fighters||[]).map(f=>f.name).join(' vs ')+' · Result confirmed'
          :fresh.length+' new fight results confirmed';
        saveNews('results',title,'#results');
      }
    }else if(topic==='upcoming'){
      const events=Array.isArray(payload.events)?payload.events:[];
      const previous=baseline.upcoming;
      const present=new Set(events.map(a=>String(a.id)));
      baseline.upcoming=present;
      if(!previous)return;
      const fresh=events.filter(a=>!previous.has(String(a.id))&&
        Date.parse(String(a.date)+'T12:00:00Z')>NOW()-12*3600000&&
        Date.parse(String(a.date)+'T12:00:00Z')<NOW()+32*86400000);
      if(fresh.length)saveNews('upcoming',fresh.length===1?fresh[0].title+' · Added to fight calendar':fresh.length+' new upcoming fight cards','#calendar');
    }
  }
  async function poll(){
    await Promise.all([
      pollTopic('news','/data/news-live.json'),
      pollTopic('results','/data/results.json'),
      pollTopic('upcoming','/data/upcoming-cards.json')
    ]);
  }
  const timer=setInterval(poll,120000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});
  window.addEventListener('online',poll);
  function drawHistory(){
    const list=panel?.querySelector('.befn-alerts-history');
    if(!list)return;
    list.replaceChildren();
    if(history.length===0){const li=document.createElement('li');li.textContent='No new alerts detected in this session yet.';list.append(li);return;}
    history.forEach(n=>{
      const li=document.createElement('li');const a=document.createElement('a');a.href=n.href;
      a.textContent=n.message;a.addEventListener('click',close);
      const stamp=document.createElement('span');stamp.textContent=' · '+n.date;
      li.append(a,stamp);list.append(li);
    });
  }
  function close(){if(!panel)return;panel.remove();panel=null;window.removeEventListener('keydown',escape);opener?.focus();opener=null;}
  function escape(e){if(e.key==='Escape')close();}
  function add(tag,text,parent,cls){
    const node=document.createElement(tag);if(cls)node.className=cls;node.textContent=text;parent.append(node);return node;
  }
  function open(){
    if(panel)return;
    opener=document.activeElement;
    panel=document.createElement('div');panel.className='befn-alerts-cover';
    const box=document.createElement('section');box.className='befn-alerts-panel';
    box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Fight alert preferences');
    const closeButton=add('button','Close',box,'befn-alerts-close');closeButton.type='button';closeButton.addEventListener('click',close);
    add('h2','Fight alerts',box);
    add('p','Choose the updates you want. In-app alerts appear when this website is open; background push needs a connected delivery service.',box);
    const status=add('p',appId?'Preparing device notifications…':'In-app alerts are available. Background push is not yet connected.',box,'befn-alerts-status');
    for(const [key,title] of Object.entries(TOPICS)){
      const label=document.createElement('label');label.className='befn-alerts-row';
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=settings[key];
      cb.addEventListener('change',()=>{settings[key]=cb.checked;sync();poll();});
      const text=document.createElement('span');text.textContent=title;
      label.append(cb,text);box.append(label);
    }
    if(appId){
      const action=add('button','Enable push on this device',box);action.type='button';
      action.addEventListener('click',async()=>{
        action.disabled=true;
        const wasEnabled=action.dataset.enabled==='yes';
        status.textContent=wasEnabled?'Disabling push notifications…':'Requesting notification permission…';
        try{
          const service=await sdkReady;if(!service)throw new Error('Push service unavailable.');
          if(wasEnabled){
            await service.User.PushSubscription.optOut();
            action.dataset.enabled='no';
            action.textContent='Enable push on this device';
            status.textContent='Push disabled for this device.';
          }else{
            if(mobileApple&&!standalone())throw new Error('On iPhone, add the website to your Home Screen and open it there first.');
            const allowed=await service.Notifications.requestPermission();
            if(!allowed)throw new Error('Notification permission was not granted.');
            await service.User.PushSubscription.optIn();
            sync();
            action.dataset.enabled='yes';
            action.textContent='Disable push on this device';
            status.textContent='Push enabled on this device. Alerts will arrive once the publisher activates delivery.';
          }
        }catch(error){status.textContent=error.message||'Unable to change notification permission.';}
        finally{action.disabled=false;}
      });
    }else if(mobileApple&&!standalone()){
      add('p','For future iPhone push notifications, install the website using Safari → Share → Add to Home Screen.',box);
    }
    add('h3','This session',box);
    const list=document.createElement('ul');list.className='befn-alerts-history';box.append(list);
    panel.append(box);panel.addEventListener('click',e=>{if(e.target===panel)close();});
    document.body.append(panel);drawHistory();window.addEventListener('keydown',escape);closeButton.focus();
    if(appId)sdkReady?.then(o=>{if(panel)status.textContent=o?'Push provider connected. You can enable notifications on this device.':'Push provider unavailable. In-app alerts remain available.';});
  }
  window.BEFNAlerts={open,preferences:()=>({...settings})};
  if(appId){
    window.OneSignalDeferred=window.OneSignalDeferred||[];
    sdkReady=new Promise(resolve=>{
      const script=document.createElement('script');
      script.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer=true;
      script.onerror=()=>resolve(null);
      window.OneSignalDeferred.push(async OneSignal=>{
        try{
          await OneSignal.init({
            appId,
            serviceWorkerPath:'/push/OneSignalSDKWorker.js',
            serviceWorkerParam:{scope:'/push/'},
            notifyButton:{enable:false}
          });
          sdk=OneSignal;sync();resolve(sdk);
        }catch{resolve(null);}
      });
      document.head.append(script);
    });
  }
  if(Object.values(settings).some(Boolean))poll();
})();
