const B='https://www.sumo-api.com/api';
async function get(p){const r=await fetch(B+p,{headers:{Accept:'application/json','User-Agent':'BlackEyeFightNews/1.0 (source-research; low-volume)'}});const t=await r.text();try{return {status:r.status,json:JSON.parse(t)}}catch{return {status:r.status,text:t.slice(0,300)}}}
const show=(label,x)=>console.log('### '+label+' '+JSON.stringify(x).slice(0,1100));
const rk=await get('/ranks?rikishiId=8850&limit=3&skip=0&sortOrder=asc');
show('ranks',rk.json?(Array.isArray(rk.json)?rk.json.slice(0,2):Object.fromEntries(Object.entries(rk.json).map(([k,v])=>[k,Array.isArray(v)?v.slice(0,2):v]))):rk);
const ms=await get('/measurements?rikishiId=8850&limit=3&skip=0&sortOrder=asc');
show('measurements',ms.json?(Array.isArray(ms.json)?ms.json.slice(0,2):Object.fromEntries(Object.entries(ms.json).map(([k,v])=>[k,Array.isArray(v)?v.slice(0,2):v]))):ms);
const m=await get('/rikishi/8850/matches?limit=1000&skip=0');
console.log('### matches total',m.json?.total,'len',m.json?.records?.length,'limitField',m.json?.limit,'keys',Object.keys(m.json||{}));
const kinds=new Set((m.json?.records||[]).map(r=>r.division));console.log('### divisions',[...kinds]);
const odd=(m.json?.records||[]).filter(r=>!r.winnerId||!r.kimarite).slice(0,3);console.log('### odd',JSON.stringify(odd).slice(0,600));
const st=await get('/rikishi/8850/stats');console.log('### stats keys',Object.keys(st.json||{}));
