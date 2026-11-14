/**
 * Browser QA for the isolated Sumo preview.
 * Usage (locally): npm install --no-save playwright && npx playwright install chromium
 *                  python3 -m http.server 8765 --bind 127.0.0.1 &
 *                  node scripts/sumo-browser-qa.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8765/sumo.html';
const OUT = 'qa/sumo-previews';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const failures = [];

function assertContains(haystack,needle,label){
  assert.ok(String(haystack).toLocaleLowerCase().includes(String(needle).toLocaleLowerCase()), label+': '+needle+' not present');
}
async function open(page, route, ready) {
  await page.goto(BASE + '#'+route, {waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForSelector(ready,{timeout:25000});
  await page.waitForTimeout(175);
}
async function snap(page,name,{fullPage=true}={}){
  await page.screenshot({path:OUT+'/'+name+'.png',fullPage,animations:'disabled'});
}
async function testSite(viewport,isMobile,label) {
  const ctx = await browser.newContext({viewport,isMobile,hasTouch:isMobile,deviceScaleFactor:1,
    reducedMotion:'reduce',ignoreHTTPSErrors:true});
  const page=await ctx.newPage();
  page.on('pageerror',err=>failures.push(label+': page JS exception: '+err.message));

  await open(page,'home','.hero');
  const home=await page.locator('#sumo-main').innerText();
  assertContains(home,'THE SUMO','homepage');
  assertContains(home,'190','tracked total');
  assertContains(home,'42','Makuuchi count');
  assertContains(home,'28','Juryo count');
  assertContains(home,'120','Makushita count');
  await snap(page,label+'-home',{fullPage:false});

  await open(page,'rikishi','#directory-results .directory-card');
  assert.equal(await page.locator('#directory-results .directory-card').count(),24);
  await page.locator('#sumo-search').fill('Onosato');
  assert.equal(await page.locator('#directory-results .directory-card').count(),1);
  assertContains(await page.locator('#directory-results').innerText(),'Onosato','search match');
  await page.locator('#sumo-search').fill('');
  await page.locator('[data-directory-division="Makushita"]').click();
  assert.equal(await page.locator('#directory-results .directory-card').count(),24);
  assertContains(await page.locator('#directory-results').innerText(),'120 matching current wrestlers','Makushita filter');
  await snap(page,label+'-directory',{fullPage:false});

  await open(page,'profile/8850','.profile-hero');
  let profile=await page.locator('#sumo-main').innerText();
  assertContains(profile,'Onosato','Onosato name');
  assertContains(profile,'Yokozuna','rank');
  assertContains(profile,'Winning techniques','techniques');
  assertContains(profile,'Basho performance','basho data');
  assertContains(profile,'Recent performance','recent results');
  assertContains(profile,'Career honours','honours');
  assertContains(profile,'cached recent bout sample','source label');
  await snap(page,label+'-profile',{fullPage:false});
  // All 190 rikishi should expose current banzuke opponent histories even
  // without individually fetched lifetime stats or 18-bout enrichment.
  await open(page,'profile/2','.profile-hero');
  const unfeatured=await page.locator('#sumo-main').innerText();
  assertContains(unfeatured,'current November 2026 tournament only','source-scoped technique sample');
  assertContains(unfeatured,'banzuke only','source-scoped recent bouts');
  await open(page,'profile/75','.profile-hero');
  const makushitaProfile=await page.locator('#sumo-main').innerText();
  assertContains(makushitaProfile,'bout 1','Makushita bouts, not fabricated day mappings');


  await open(page,'banzuke','.standings');
  assert.equal(await page.locator('.standings tbody tr').count(),42);
  await page.locator('[data-banzuke-division="Juryo"]').click();
  assert.equal(await page.locator('.standings tbody tr').count(),28);
  await page.locator('[data-banzuke-division="Makushita"]').click();
  assert.equal(await page.locator('.standings tbody tr').count(),120);
  await snap(page,label+'-banzuke',{fullPage:false});

  await open(page,'basho','.basho-hero');
  await page.locator('[data-basho-division="Makushita"]').click();
  const basho=await page.locator('#sumo-main').innerText();
  assertContains(basho,'Makushita wrestlers compete across 15 days','lower division caveat');
  assert.ok((await page.locator('.standings tbody tr').count())>=20);
  await snap(page,label+'-basho',{fullPage:false});

  await open(page,'kimarite','.technical-terms');
  assert.equal(await page.locator('.technical-terms .term').count(),9);
  assertContains(await page.locator('#sumo-main').innerText(),'Yorikiri','technique');
  await snap(page,label+'-kimarite',{fullPage:false});

  if (isMobile){
    for(const route of ['home','rikishi','profile/8850','basho','banzuke','kimarite']){
      await open(page,route,'#sumo-main');
      const widths=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(widths.scroll<=widths.viewport+6,route+' horizontal overflow '+JSON.stringify(widths));
    }
  }
  await ctx.close();
}
await mkdir(OUT,{recursive:true});
try {
  await testSite({width:1440,height:900},false,'desktop');
  await testSite({width:390,height:844},true,'mobile');
  if(failures.length)throw new Error(failures.join('\n'));
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'pass',screenshots:12,views:['home','rikishi','profile','banzuke','basho','kimarite'],viewportWidths:[1440,390]},null,2));
  console.log('Sumo browser QA passed: 12 screenshots, 2 viewport widths, 6 sections, 3 banzuke divisions and no JS exceptions.');
} catch(error) {
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'fail',error:String(error.stack||error),failures},null,2));
  throw error;
} finally {
  await browser.close();
}
