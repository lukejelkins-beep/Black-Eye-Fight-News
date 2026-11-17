/**
 * Read the Japan Sumo Association's public torikumi pages the way a visitor does:
 * open the page in a headless browser, let the page build its own table, read
 * what is on screen. No private endpoints, no cookies set by us, no bypassing.
 * Politeness: today and tomorrow only, 3 divisions, one page at a time, ~2s apart,
 * an identifying User-Agent. Run at most every 10 minutes during a live basho.
 *
 * Writes data/sumo/jsa-torikumi.json. If the site is unreachable or blocks us the
 * previous file is kept untouched and the step still succeeds (matchups simply
 * stay as they were); it never falls back to another provider.
 * Needs `playwright` + chromium (installed by the workflow; not a repo dependency).
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseJsaTable,jsaHeadingDay,JSA_DIVISION_TABS,JSA_BASE} from '../assets/sumo-jsa.mjs';

const OUT='data/sumo/jsa-torikumi.json';
const DETAILS='data/sumo/preview-details.json';
const UA='BEFN-sumo-preview/1.0 (personal non-commercial fan site; reads public torikumi pages every ~10 min in basho; contact via github.com/lukejelkins-beep/Black-Eye-Fight-News)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const details=JSON.parse(await readFile(DETAILS,'utf8'));
const bashoId=String(details.bashoId||'');
const start=String(details.basho?.data?.startDate||'').slice(0,10);
const jst=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const today=Math.round((Date.parse(jst+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
const days=[today,today+1].filter(d=>d>=1&&d<=15);
if(!days.length){console.log(JSON.stringify({status:'skipped',reason:'no basho day today/tomorrow',today}));process.exit(0);}

let previous={schemaVersion:1,bashoId,pages:{}};
try{const p=JSON.parse(await readFile(OUT,'utf8'));if(p.bashoId===bashoId)previous=p;}catch{}

let chromium;
try{({chromium}=await import('playwright'));}
catch{console.warn('playwright is not installed; keeping previous JSA data');process.exit(0);}

const next=structuredClone(previous);
next.pages ||= {};
const report=[];
const browser=await chromium.launch();
try{
  const ctx=await browser.newContext({userAgent:UA,serviceWorkers:'block'});
  for(const day of days){
    for(const [division,tab] of Object.entries(JSA_DIVISION_TABS)){
      const url=`${JSA_BASE}${tab}/${day}/`;
      const page=await ctx.newPage();
      try{
        const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        if(!resp||!resp.ok())throw new Error('HTTP '+(resp&&resp.status()));
        await page.waitForFunction(()=>{
          const vis=s=>{const e=document.querySelector(s);return e&&e.offsetParent!==null;};
          return vis('#torikumi_table')||vis('#no_torikumi');
        },null,{timeout:25000});
        const heading=(await page.locator('#dayHead').first().textContent()||'').replace(/\s+/g,' ').trim();
        const html=await page.locator('#torikumi_table').first().evaluate(e=>e.offsetParent?e.outerHTML:'').catch(()=>'');
        const rows=html?parseJsaTable(html):[];
        // The page falls back to the latest posted day when a day is not out yet:
        // only accept rows whose own heading names the day we asked for.
        const shown=jsaHeadingDay(heading);
        const ok=rows.length>0&&shown===day;
        const entry=ok?{status:'available',heading,rows}:{status:'unavailable',heading,rows:[]};
        const old=next.pages[division]?.[day];
        const same=old&&old.status===entry.status&&JSON.stringify(old.rows)===JSON.stringify(entry.rows);
        (next.pages[division] ||= {})[day]=same?old:{...entry,fetchedAt:new Date().toISOString()};
        report.push({division,day,status:entry.status,bouts:rows.length,shown});
      }catch(error){
        report.push({division,day,status:'error',error:String(error.message).slice(0,120)});
      }finally{await page.close();}
      await sleep(2000);
    }
  }
}finally{await browser.close();}

const fetched=report.filter(r=>r.status!=='error').length;
if(!fetched){console.warn('JSA unreachable for every page; keeping previous data');console.log(JSON.stringify({status:'kept-previous',report}));process.exit(0);}
next.schemaVersion=1;next.bashoId=bashoId;next.source=JSA_BASE;
next.collectedAt=new Date().toISOString();
await writeFile(OUT+'.tmp',JSON.stringify(next,null,1)+'\n','utf8');
await rename(OUT+'.tmp',OUT);
console.log(JSON.stringify({status:'ok',report}));
