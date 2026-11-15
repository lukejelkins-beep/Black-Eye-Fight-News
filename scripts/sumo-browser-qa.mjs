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

  const response=await page.request.get('http://127.0.0.1:8765/data/sumo/research-h2h-summary.json');
  assert.ok(response.ok(),'190-rikishi H2H research summary must be cached on preview branch');
  const research=await response.json();
  const rosterResponse=await page.request.get('http://127.0.0.1:8765/data/sumo/rikishi-index.json');
  assert.ok(rosterResponse.ok(),'Preview 190-rikishi index must be available');
  const roster=await rosterResponse.json();
  assert.equal(roster.count,190,'Expected 190 tracked rikishi on the preview');
  assert.equal(research.profileCount,190,'All 190 career research records should be available');
  assert.equal(research.certified,false,'Research cache must not imply JSA certification');
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
  assertContains(profile,'Full source career record cached','full historical source availability');
  assertContains(profile,'API-TRUSTED','development-data method is displayed');
  assertContains(profile,'Career results: independently corroborated','career evidence is labelled separately');
  assertContains(profile,'All recorded opponents','full career opponent catalogue');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>=10,'Complete sourced opponent directory available');
  assertContains(profile,'JSA-listed signature manoeuvres','official source signature tags');
  assert.equal(await page.locator('.style-tags span').count(),4);
  assert.ok(await page.locator('.sumo-result-card').count()>0,'Profile has photo-ready opponent cards');
  assert.ok(await page.locator('.sumo-country').count()>0,'Profile shows birthplace-country flag');
  await snap(page,label+'-profile',{fullPage:false});
  // Full pair-specific history is distinct from a single basho's opponent record.
  await open(page,'headtohead/8850/8857','.sumo-h2h-hero');
  await page.waitForFunction(()=>document.querySelectorAll('.sumo-h2h-order+ol li').length===6,null,{timeout:30000});
  const history=await page.locator('#sumo-main').innerText();
  assertContains(history,'Career head-to-head','dedicated H2H view');
  assertContains(history,'1–5','source-confirmed all-time series');
  assert.equal(await page.locator('.sumo-h2h-hero+.section-head').count(),1,'Head-to-head history heading shown');
  assert.equal(await page.locator('.sumo-h2h-order+ol li').count(),6,'Every source-confirmed bout is shown');
  assertContains(history,'Tsukiotoshi','actual kimarite recorded');
  assertContains(history,'Individual career bout details are API-sourced','history is not mislabeled as bout-certified');
  assertContains(history,'Fusen (forfeit; no technique)','forfeit is not a winning technique');
  await page.locator('[data-h2h-order="oldest"]').click();
  assertContains(await page.locator('.sumo-h2h-order+ol li').first().innerText(),'November 2025','chronological oldest-first sort');

  // All 190 rikishi should expose current banzuke opponent histories even
  // without individually fetched lifetime stats or 18-bout enrichment.
  await open(page,'profile/2','.profile-hero');
  const unfeatured=await page.locator('#sumo-main').innerText();
  assertContains(unfeatured,'Full source career record cached','all tracked profiles use researched career data');
  assertContains(unfeatured,'All recorded opponents','opponent directory section');
  assertContains(unfeatured,'API-TRUSTED','API-trusted status shown on nonfeatured profile');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>0,'Unfeatured rikishi has complete opponent library');
  assert.equal(await page.locator('.style-tags span').count(),0,'No speculative official style on unverified profiles');
  await open(page,'profile/82','.profile-hero');
  assertContains(await page.locator('#sumo-main').innerText(),'206-131','Fujiseiun reconciled official record');
  await open(page,'profile/16','.profile-hero');
  assertContains(await page.locator('#sumo-main').innerText(),'677-716','Nishikigi reconciled official record');
  await open(page,'profile/75','.profile-hero');
  const makushitaProfile=await page.locator('#sumo-main').innerText();
  assertContains(makushitaProfile,'non-bout days','Makushita rest days do not count as absences');


  await open(page,'banzuke','.sumo-rank-card');
  assert.equal(await page.locator('.sumo-rank-card').count(),42);
  assert.equal(await page.locator('.sumo-rank-card .sumo-country').count(),42);
  assert.equal(await page.locator('.sumo-rank-card .sumo-move').count(),42);
  await page.locator('[data-banzuke-division="Juryo"]').click();
  assert.equal(await page.locator('.sumo-rank-card').count(),28);
  await page.locator('[data-banzuke-division="Makushita"]').click();
  assert.equal(await page.locator('.sumo-rank-card').count(),120);
  await snap(page,label+'-banzuke',{fullPage:false});

  await open(page,'basho','.basho-hero');
  const announcedDay=await page.evaluate(async()=>{
    const response=await fetch('data/sumo/preview-details.json');
    return (await response.json()).announcedDay;
  });
  assert.ok(Number.isInteger(announcedDay)&&announcedDay>=1&&announcedDay<=15,'Published preview has a source-scheduled day');
  await page.locator('[data-day="'+announcedDay+'"]').click();
  const confirmed=await page.locator('.sumo-match-card .sumo-match-status.scheduled').count();
  assert.ok(confirmed>0,'Verified torikumi pending matchups must appear');
  assertContains(await page.locator('#sumo-main').innerText(),'torikumi announcement','scheduled source provenance');
  await snap(page,label+'-scheduled',{fullPage:false});
  await page.locator('[data-day="15"]').click();
  assert.equal(await page.locator('.sumo-match-card .sumo-match-status.scheduled').count(),0,'Day 15 cannot be guessed from future banzuke slots');
  await page.locator('[data-basho-division="Makushita"]').click();
  const basho=await page.locator('#sumo-main').innerText();
  assertContains(basho,'seven times across 15 tournament days','lower division caveat');
  assert.equal(await page.locator('[data-day]').count(),15,'All calendar days are selectable');
  await page.locator('[data-day="7"]').click();
  assert.ok(await page.locator('.sumo-match-card').count()>0,'Makushita matchups use designed cards');
  assert.ok(await page.locator('.sumo-match-card .sumo-match-person').count()>=2);
  assert.ok((await page.locator('.standings tbody tr').count())>=20);
  await snap(page,label+'-basho',{fullPage:false});

  await open(page,'kimarite','.technical-terms');
  assert.equal(await page.locator('.technical-terms .term').count(),9);
  assertContains(await page.locator('#sumo-main').innerText(),'Yorikiri','technique');
  await snap(page,label+'-kimarite',{fullPage:false});

  // Exercise every current wrestler on both desktop and mobile, not only
  // the feature cards. The source ID attribute prevents a stale page from
  // satisfying the next route's assertion.
  const checkedIds=new Set();
  for(const w of roster.rikishi){
    assert.ok(!checkedIds.has(w.sourceId),'Duplicate Sumo browser QA source ID '+w.sourceId);
    checkedIds.add(w.sourceId);
    await page.evaluate(id=>{ location.hash='#profile/'+id; },w.sourceId);
    await page.waitForSelector('.sumo-api-quality[data-sumo-source-id="'+w.sourceId+'"]',{timeout:15000});
    const headingText=await page.locator('.profile-hero h1').innerText();
    assertContains(headingText,w.shikonaEn,'Loaded wrestler '+w.sourceId);
    const qualityText=await page.locator('.sumo-api-quality').innerText();
    assertContains(qualityText,'API-TRUSTED','source designation for '+w.sourceId);
    assertContains(qualityText,'Career results:','independent career evidence for '+w.sourceId);
    assert.equal(await page.locator('.sumo-rank-svg').count(),1,'Dated career-rank graph '+w.sourceId);
    assert.equal(await page.locator('.sumo-weight-svg').count(),1,'Dated weight graph '+w.sourceId);
    if(isMobile){
      const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
      assert.ok(width.document<=width.viewport+6,'Mobile overflow on rikishi '+w.sourceId+': '+JSON.stringify(width));
    }
  }
  assert.equal(checkedIds.size,190,'Every source ID reached a working profile route');
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
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'pass',screenshots:14,views:['home','rikishi','profile','banzuke','basho','kimarite'],viewportWidths:[1440,390]},null,2));
  console.log('Sumo browser QA passed: 14 screenshots, 2 viewport widths, 6 sections, 3 banzuke divisions and no JS exceptions.');
} catch(error) {
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'fail',error:String(error.stack||error),failures},null,2));
  throw error;
} finally {
  await browser.close();
}
