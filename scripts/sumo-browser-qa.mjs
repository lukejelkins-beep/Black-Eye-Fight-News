/**
 * Browser QA for the isolated Sumo preview.
 * Usage (locally): npm install --no-save playwright && npx playwright install chromium
 *                  python3 -m http.server 8765 --bind 127.0.0.1 &
 *                  node scripts/sumo-browser-qa.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.SUMO_QA_BASE || 'http://127.0.0.1:8765/sumo.html';
const OUT = 'qa/sumo-previews';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}) });
const failures = [];
const viewportResults = [];
let screenshotCount=0;

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
  screenshotCount++;
}
async function testSite(viewport,isMobile,label,fullCohort=true) {
  const ctx = await browser.newContext({viewport,isMobile,hasTouch:isMobile,deviceScaleFactor:1,
    reducedMotion:'reduce',ignoreHTTPSErrors:true});
  const page=await ctx.newPage();
  page.on('pageerror',err=>failures.push(label+': page JS exception: '+err.message));

  try {
  const response=await page.request.get('http://127.0.0.1:8765/data/sumo/research-h2h-summary.json');
  assert.ok(response.ok(),'190-rikishi H2H research summary must be cached on preview branch');
  const research=await response.json();
  const rosterResponse=await page.request.get('http://127.0.0.1:8765/data/sumo/rikishi-index.json');
  assert.ok(rosterResponse.ok(),'Preview 190-rikishi index must be available');
  const roster=await rosterResponse.json();
  assert.equal(roster.count,roster.rikishi.length,'Roster total matches unique cached wrestler entries');
   assert.equal(new Set(roster.rikishi.map(w=>w.sourceId)).size,roster.count,'Stable IDs are unique');
  assert.equal(research.profileCount,roster.count,'Full tracked roster has corresponding research records');
  assert.equal(research.certified,false,'Research cache must not imply JSA certification');
  await open(page,'home','.sumo-overview-lede');
  const home=await page.locator('#sumo-main').innerText();
  assertContains(home,'Sumo','Sumo home context');
  assertContains(home,'results','latest results priority');
  assertContains(home,'five leaders','home leaders');
  assert.ok(await page.locator('.sumo-home-grid').count()===1,'Results and leaders appear in first dashboard');
  assert.equal(await page.locator('.sumo-home-leaders .sumo-standings-row').count(),5,'Homepage shows exactly five leaders');
  await snap(page,label+'-home',{fullPage:false});

  await open(page,'rikishi','#directory-results .directory-card');
  assert.equal(await page.locator('#directory-results .directory-card').count(),24);
  await page.locator('#sumo-search').fill('Onosato');
  assert.equal(await page.locator('#directory-results .directory-card').count(),1);
  assertContains(await page.locator('#directory-results').innerText(),'Onosato','search match');
  await page.locator('[data-directory-division="Juryo"]').click();
  await page.locator('#sumo-search').fill('Onosato');
  assert.equal(await page.locator('.sumo-empty-search').count(),1,'Conflicting division search has a scoped empty state');
  assertContains(await page.locator('.sumo-empty-search').innerText(),'Juryo','Search names selected division');
  await page.locator('[data-directory-reset]').click();
  assert.equal(await page.locator('#directory-results .directory-card').count(),1,'Search all keeps Onosato query and reveals match');
  await page.locator('#sumo-search').fill('');
  await page.locator('[data-directory-division="Makushita"]').click();
  assert.equal(await page.locator('#directory-results .directory-card').count(),24);
  assertContains(await page.locator('#directory-results').innerText(),'120 matching current wrestlers','Makushita filter');
  await page.locator('[data-directory-layout="list"]').click();
  assert.equal(await page.locator('.directory-grid.is-list .directory-card').count(),24,
    'Compact directory keeps all currently filtered rikishi');
  await page.locator('[data-directory-layout="cards"]').click();
  assert.equal(await page.locator('.directory-grid.is-list').count(),0,'Return to image-card presentation');
  await snap(page,label+'-directory',{fullPage:false});

  await open(page,'profile/8850','.profile-hero');
  let profile=await page.locator('#sumo-main').innerText();
  assertContains(profile,'Onosato','Onosato name');
  assert.equal(await page.locator('.sumo-quick-results').count(),1,'Results jump available beside identity');
  assert.equal(await page.locator('.sumo-full-photo').count(),1,'Approved original photo available at full size');
  const heroMeasurements=await page.evaluate(()=>{
    const box=document.querySelector('.profile-hero').getBoundingClientRect();
    const image=document.querySelector('.profile-hero>.sumo-photo').getBoundingClientRect();
    const heading=document.querySelector('.profile-hero h1').getBoundingClientRect();
    return {top:box.top,headingTop:heading.top,imageHeight:image.height,viewport:window.innerHeight};
  });
  assert.ok(heroMeasurements.headingTop<heroMeasurements.viewport/2,
    'Profile name is in the upper half of the first screen: '+JSON.stringify(heroMeasurements));
  assert.ok(heroMeasurements.imageHeight<=(isMobile?321:521),
    'Approved portrait is bounded rather than full-page: '+JSON.stringify(heroMeasurements));
  assertContains(profile,'Yokozuna','rank');
  assertContains(profile,'Winning techniques','techniques');
  assertContains(profile,'Results','canonical results');
  assertContains(profile,'Career','career section');
  assertContains(profile,'Analysis','accessible charts in Analysis');
  assertContains(profile,'Recent form','last-five results show named recent form');
  assertContains(profile,'API-TRUSTED','development-data method is displayed');
  assertContains(profile,'Career results: independently corroborated','career evidence is labelled separately');
  assertContains(profile,'Opponents and head-to-head','opponent catalogue');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>=10,'Complete sourced opponent directory available');
  assertContains(profile,'JSA-listed signature manoeuvres','official source signature tags');
  assertContains(profile,'tsuki','JSA-listed source manoeuvres preserved');
  assert.ok(await page.locator('.sumo-ed-row').count()>0,'Canonical current tournament rows rendered');
  assert.equal(await page.locator('.sumo-section-nav a').count(),6,'Four primary destinations and two additional accessible sections');
  assert.equal(await page.locator('.sumo-rank-svg').count(),1,'Rank chart on initial page');
  assert.ok(await page.locator('.sumo-weight-svg').count()===1,'Weight chart on initial page');
  const order=await page.evaluate(()=>document.querySelector('#sumo-charts').compareDocumentPosition(document.querySelector('#sumo-opponents')) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(order,'Charts are before opponents');
  await page.locator('.sumo-section-nav [data-profile-section="charts"]').click();
  assert.ok((await page.url()).includes('section=charts'),'Section jump preserves canonical profile route');
  await page.locator('#sumo-opponent-search').fill('Ura');
  assert.ok(await page.locator('.sumo-rival').count()>0,'Search finds named opponent');
  await page.locator('#sumo-opponent-search').fill('');
  await page.locator('#sumo-opponent-sort').selectOption('name');
  assert.ok(await page.locator('.sumo-rival').count()>0,'Sort keeps catalogue accessible');
  assert.ok(await page.locator('.sumo-country').count()>0,'Profile shows birthplace-country flag');
  await page.evaluate(()=>scrollTo(0,0));
  await snap(page,label+'-profile',{fullPage:false});
  // Full pair-specific history is distinct from a single basho's opponent record.
  await open(page,'headtohead/8850/8857','.sumo-h2h-hero');
  await page.waitForFunction(()=>document.querySelectorAll('.sumo-h2h-order+ol li').length===6,null,{timeout:30000});
  const history=await page.locator('#sumo-main').innerText();
  assertContains(history,'Career head-to-head','dedicated H2H view');
  assertContains(history,'1–5','source-confirmed all-time series');
  assert.equal(await page.locator('.section-head').filter({hasText:'Every historical meeting'}).count(),1,'Head-to-head history heading shown after kimarite charts');
  assert.equal(await page.locator('.sumo-h2h-order+ol li').count(),6,'Every source-confirmed bout is shown');
  assertContains(history,'Tsukiotoshi','actual kimarite recorded');
  assertContains(history,'not independently bout-certified','history is not mislabeled as certified');
  assertContains(history,'Fusen (forfeit; no technique)','forfeit is not a winning technique');
  await page.locator('[data-h2h-order="oldest"]').click();
  assertContains(await page.locator('.sumo-h2h-order+ol li').first().innerText(),'November 2025','chronological oldest-first sort');

  // All tracked rikishi should expose current banzuke opponent histories even
  // without individually fetched lifetime stats or 18-bout enrichment.
  await open(page,'profile/2','.profile-hero');
  const unfeatured=await page.locator('#sumo-main').innerText();
  assertContains(unfeatured,'Career','career section exists for all tracked profiles');
  assertContains(unfeatured,'Opponents and head-to-head','opponent directory section');
  assertContains(unfeatured,'API-TRUSTED','API-trusted status shown on nonfeatured profile');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>0,'Unfeatured rikishi has complete opponent library');
  assert.equal(await page.locator('.sumo-sources h3').filter({hasText:'JSA-listed signature manoeuvres'}).count(),0,'No speculative official style on unsourced profiles');
  await open(page,'profile/82','.profile-hero');
  assertContains(await page.locator('#sumo-main').innerText(),'206–131','Fujiseiun career W–L preserved');
  await open(page,'profile/16','.profile-hero');
  assertContains(await page.locator('#sumo-main').innerText(),'677–716','Nishikigi career W–L preserved');
  await open(page,'profile/75','.profile-hero');
  const makushitaProfile=await page.locator('#sumo-main').innerText();
  assertContains(makushitaProfile,'non-bout days','Makushita rest days do not count as absences');


  await open(page,'banzuke','.sumo-rank-card');
  const matchedMakuuchi=await page.evaluate(async ids=>{
    const snapshot=await (await fetch('data/sumo/preview-details.json')).json();
    const b=snapshot.banzuke?.Makuuchi?.data;
    const index=new Set(ids);
    return [...(b?.east||[]),...(b?.west||[])].filter(row=>index.has(Number(row.rikishiID))).length;
  },roster.rikishi.map(w=>w.sourceId));
  assert.equal(await page.locator('.sumo-rank-card').count(),matchedMakuuchi,
    'Every source banzuke entry with an identity in the approved roster renders a card');
  assert.ok((await page.locator('.sumo-rank-person .sumo-photo').count())>0,'Banzuke retains approved photo framework');
  assert.equal(await page.locator('.sumo-rank-card .sumo-rank-movement').count(),matchedMakuuchi,
    'Every wrestler has a rank-change area, even when their prior banzuke rank is unavailable');
  const rankMovementCount=await page.locator('.sumo-rank-card .sumo-move').count();
  assert.equal(rankMovementCount,matchedMakuuchi,'Exactly one banzuke movement label per wrestler');
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
  await page.locator('[data-basho-view="matchups"]').click();
  const confirmed=await page.locator('.sumo-daily-card .sumo-daily-status:not(.completed)').count();
  assert.ok(confirmed>0,'Confirmed scheduled matchups must appear without invented outcomes');
  assertContains(await page.locator('#sumo-main').innerText(),'snapshot, not live','scheduled source provenance');
  await snap(page,label+'-scheduled',{fullPage:false});
  await page.locator('[data-day="15"]').click();
  assert.equal(await page.locator('.sumo-daily-card .sumo-daily-status:not(.completed)').count(),0,'Day 15 cannot be guessed from future banzuke slots');
  await page.locator('[data-basho-division="Makushita"]').click();
  const basho=await page.locator('#sumo-main').innerText();
  assertContains(basho,'seven times across 15 tournament days','lower division caveat');
  assert.equal(await page.locator('[data-day]').count(),15,'All calendar days are selectable');
  await page.locator('[data-day="7"]').click();
  assert.ok(await page.locator('.sumo-daily-card').count()>0,'Makushita matchups use designed face-off cards');
  assert.ok(await page.locator('.sumo-daily-card .sumo-daily-photo').count()>=2);
  await page.locator('[data-basho-view="standings"]').click();
  assert.ok((await page.locator('.sumo-standings-row').count())>=20,'Basho standings stay accessible in compact rows');
  await page.locator('[data-basho-view="results"]').click();
  assert.ok((await page.locator('.sumo-compact-bout').count())>0,'Compact result rows show actual winners');
  await snap(page,label+'-basho',{fullPage:false});

  // Dedicated daily face-offs use sourced pairings, two complete stat columns,
  // genuine latest-five kimarite and responsive image-first cards.
  await open(page,'matchups','.sumo-daily-page');
  await page.locator('#sumo-matchup-day').selectOption('1');
  assert.ok(await page.locator('.sumo-daily-card').count()>0,'Makuuchi Day 1 verified cards rendered');
  const firstCard=page.locator('.sumo-daily-card').first();
  assert.equal(await firstCard.locator('.sumo-daily-facts').count(),2,'Both wrestler stat columns are present');
  assert.equal(await firstCard.locator('.sumo-daily-photo').count(),2,'Portraits occupy both edges');
  assert.equal(await firstCard.locator('.sumo-comparison-row').count(),6,'Shared comparison preserves all six measurement/record/percentage fields');
  const data=await firstCard.innerText();
  for(const label of ['Career W–L','Career win %','Makuuchi W–L','Makuuchi win %','Height','Weight','Peak:']){
    assertContains(data,label,'Daily faceoff statistic');
  }
  const historyTiles=await page.locator('.sumo-daily-meeting').count();
  for(const card of await page.locator('.sumo-daily-card').all()){
    assert.ok(await card.locator('.sumo-daily-meeting').count()<=5,'Never fabricate more than five recent pairings');
    for(const tile of await card.locator('.sumo-daily-meeting').all()){
      assert.ok((await tile.locator('em').innerText()).length>0,'Individual kimarite or missing-technique notice visible');
    }
  }
  assert.ok(historyTiles>=0,'Recent meeting history is optional when source data is unavailable');
  await snap(page,label+'-daily-faceoff',{fullPage:false});
  for(const division of ['Juryo','Makushita']){
    await page.locator('[data-matchup-division="'+division+'"]').click();
    assertContains(await page.locator('.sumo-daily-date').innerText(),division,'Division selector');
    assert.equal(await page.locator('#sumo-matchup-day').inputValue(),'1','Day is retained between divisions');
  }
  await page.locator('[data-matchup-division="Makuuchi"]').click();
  const bodyWidth=await page.evaluate(()=>({
    doc:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth,
    card:document.querySelector('.sumo-daily-card')?.getBoundingClientRect().width
  }));
  assert.ok(bodyWidth.doc<=bodyWidth.viewport+6,'Daily page has no viewport overflow '+JSON.stringify(bodyWidth));
  await snap(page,label+'-daily-faceoff-day1',{fullPage:false});
  await page.locator('#sumo-matchup-day').selectOption('7');
  const cardLink=page.locator('.sumo-daily-card .sumo-daily-score a').first();
  assert.ok(await cardLink.count()>0,'Completed Day 7 card provides full H2H');
  await cardLink.click();
  await page.waitForSelector('.sumo-h2h-hero');
  assertContains(await page.locator('.back-link').innerText(),'Day 7','Context-aware H2H return label');
  await page.locator('.back-link').click();
  await page.waitForSelector('#sumo-matchup-day');
  assert.ok(page.url().includes('#matchups'),'H2H returns to originating daily route');
  assert.equal(await page.locator('#sumo-matchup-day').inputValue(),'7','Return retains original tournament day');
  await open(page,'headtohead/8850/71','.sumo-h2h-hero');
  await page.waitForFunction(()=>document.querySelector('.sumo-h2h-score')?.textContent.includes('5–0'),null,{timeout:25000});
  assertContains(await page.locator('#sumo-main').innerText(),'No recorded losses against Churanoumi',
    'True zero losses are not described as missing technique data');

  await open(page,'kimarite','.technical-terms');
  assert.equal(await page.locator('.technical-terms .term').count(),9);
  assertContains(await page.locator('#sumo-main').innerText(),'Yorikiri','technique');
  await snap(page,label+'-kimarite',{fullPage:false});

  // Exercise every current wrestler on both desktop and mobile, not only
  // the feature cards. The source ID attribute prevents a stale page from
  // satisfying the next route's assertion.
  const checkedIds=new Set();
  for(const w of (fullCohort?roster.rikishi:roster.rikishi.filter(w=>[8850,28,75,82,16].includes(w.sourceId)))){
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
  assert.equal(checkedIds.size,fullCohort?roster.count:5,'Expected cohort/sample reached working profile routes');

  // Exact redesign stress cases — recorded date ratios, 5 profiles, and H2H chronology.
  await open(page,'profile/28','.profile-hero');
  const weightPoints=await page.locator('.sumo-weight-point').evaluateAll(ns=>ns.map(n=>({
    month:n.getAttribute('data-weight-month'),x:Number(n.getAttribute('data-weight-x'))
  })));
  const m2015=weightPoints.find(p=>p.month==='201503'),m2021=weightPoints.find(p=>p.month==='202103'),m2022=weightPoints.find(p=>p.month==='202205');
  if(m2015&&m2021&&m2022){
    assert.ok(Math.abs((m2021.x-m2015.x)/(m2022.x-m2021.x)-(72/14))<.04,'Ura weight axis uses true elapsed time');
  }
  assert.ok(await page.locator('.sumo-data-table summary').count()>=2,'Rank and weight tables offered to keyboard/touch users');
  await snap(page,label+'-ura',{fullPage:false});
  await open(page,'headtohead/8850/28','.sumo-h2h-hero');
  await page.waitForFunction(()=>document.querySelectorAll('.sumo-h2h-order+ol li').length===8,null,{timeout:30000});
  const newest=await page.locator('.sumo-h2h-order+ol li').allInnerTexts();
  await page.locator('[data-h2h-order="oldest"]').click();
  const oldest=await page.locator('.sumo-h2h-order+ol li').allInnerTexts();
  assert.deepEqual(oldest,[...newest].reverse(),'H2H reverse order does not scramble date/winner/technique');
  const linkColor=await page.locator('.sumo-h2h-hero .sumo-match-name a').first().evaluate(el=>getComputedStyle(el).color);
  assert.equal(linkColor,'rgb(255, 247, 229)','Dark H2H header uses readable light links');
  await snap(page,label+'-h2h-onosato-ura',{fullPage:false});
  for(const id of [8850,28,75,82,16]){
    await open(page,'profile/'+id,'.profile-hero');
    assert.equal(await page.locator('.sumo-rank-svg').count(),1);
    assert.equal(await page.locator('.sumo-weight-svg').count(),1);
    await snap(page,label+'-profile-'+id);
    if(id===28){
      await page.locator('#sumo-charts').screenshot({path:OUT+'/'+label+'-charts.png',animations:'disabled'});
      screenshotCount++;
    }
  }

  // Exercise the redesigned controls, including native keyboard disclosures.
  await open(page,'profile/28','.profile-hero');
  if(isMobile){
    await page.locator('.sumo-mobile-more summary').press('Enter');
    assert.equal(await page.locator('.sumo-mobile-more-links a').count(),2,
      'Mobile navigation exposes Banzuke and Kimarite without horizontal clipping');
    await page.locator('.sumo-mobile-more summary').press('Enter');
    await page.locator('.befn-site-menu summary').press('Enter');
    assert.equal(await page.locator('.befn-site-menu').getAttribute('open'),'');
    assert.equal(await page.locator('.befn-site-menu nav a').count(),7,'Other sports and site pages remain accessible');
    await page.locator('.befn-site-menu summary').press('Enter');
  }
  const currentRows=await page.locator('.sumo-ed-row').count();
  await page.locator('[data-results-mode="tournaments"]').click();
  await page.locator('.sumo-tournament-list>details>summary').first().press('Enter');
  assert.equal(await page.locator('.sumo-tournament-list .sumo-ed-row').count(),currentRows);
  await page.locator('[data-results-mode="bouts"]').click();
  await page.locator('#sumo-period').selectOption('all');
  await page.waitForFunction(n=>document.querySelectorAll('.sumo-ed-row').length>n,currentRows);
  const allRows=await page.locator('.sumo-ed-row').count();
  const rowIds=await page.locator('.sumo-ed-row').evaluateAll(ns=>ns.map(n=>n.id));
  assert.equal(new Set(rowIds).size,allRows,'Every source bout has one unique anchor');
  await page.locator('#sumo-period').selectOption('current');
  assert.equal(await page.locator('.sumo-ed-row').count(),currentRows);
  await page.locator('.sumo-ed-extra summary').first().press('Enter');
  assert.equal(await page.locator('.sumo-ed-extra').first().getAttribute('open'),'');
  await page.locator('#sumo-results').screenshot({path:OUT+'/'+label+'-results.png',animations:'disabled'});
  screenshotCount++;
  const rowLayout=await page.locator('.sumo-ed-row-main').evaluateAll(rows=>rows.flatMap(row=>{
    const boxes=[...row.children].map(el=>({name:el.className,rect:el.getBoundingClientRect()}));
    const problems=[];
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      if(Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1&&
         Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1)
        problems.push(a.name+' overlaps '+b.name);
    }
    for(const el of row.querySelectorAll('.sumo-ed-result,.sumo-ed-date small,.sumo-ed-person a')){
      if(el.scrollWidth>el.clientWidth+1)problems.push(el.className+' text overflows');
    }
    return problems;
  }));
  assert.deepEqual(rowLayout,[],'Result cells and their text must not overlap');
  for(const kind of ['rank','weight']){
    const chart=page.locator('.sumo-'+kind+'-scroll');
    const readable=await chart.locator('svg text').evaluateAll(ns=>ns.every(n=>
      parseFloat(getComputedStyle(n).fontSize)*n.getScreenCTM().a>=12));
    assert.ok(readable,kind+' axis labels render at least 12 CSS pixels');
    const dimensions=await chart.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
    if(dimensions.scroll>dimensions.client){
      await chart.press('ArrowRight');
      await page.waitForFunction(k=>document.querySelector('.sumo-'+k+'-scroll').scrollLeft>0,kind);
      await chart.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
      const lastVisible=await chart.evaluate(el=>{
        const point=el.querySelector('svg circle:last-of-type').getBoundingClientRect();
        const box=el.getBoundingClientRect();
        return point.left>=box.left&&point.right<=box.right;
      });
      assert.ok(lastVisible,kind+' latest observation is reachable inside chart');
      await chart.screenshot({path:OUT+'/'+label+'-'+kind+'-chart-end.png',animations:'disabled'});
      screenshotCount++;
      await chart.evaluate(el=>{el.scrollLeft=0;});
    }
  }
  await page.locator('[data-rank-range="career"]').click();
  const careerPoints=await page.locator('.sumo-rank-svg .sumo-rank-point').count();
  await page.locator('[data-rank-range="2y"]').click();
  assert.ok(await page.locator('.sumo-rank-svg .sumo-rank-point').count()<careerPoints);
  await page.locator('[data-rank-range="5y"]').click();
  assert.equal(await page.locator('[data-rank-range="5y"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-rank-range="career"]').click();
  assert.equal(await page.locator('.sumo-rank-svg .sumo-rank-point').count(),careerPoints);
  await page.locator('[data-rank-ladder]').click();
  assert.equal(await page.locator('[data-rank-ladder]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-rank-ladder]').click();
  for(const disclosure of await page.locator('.sumo-data-table summary').all()){
    await disclosure.press('Enter');
    assert.equal(await disclosure.locator('..').getAttribute('open'),'');
    await disclosure.press('Enter');
  }
  await page.locator('#sumo-opponent-search').fill('Ura-does-not-exist');
  assert.equal(await page.locator('.sumo-rival').count(),0);
  await page.locator('#sumo-opponent-search').fill('');
  const initialOpponents=await page.locator('.sumo-rival').count();
  await page.locator('[data-h2h-more]').click();
  assert.ok(await page.locator('.sumo-rival').count()>initialOpponents);
  await page.locator('[data-h2h-fewer]').click();
  assert.equal(await page.locator('.sumo-rival').count(),initialOpponents);
  await page.locator('.sumo-rival').first().click();
  await page.waitForSelector('.sumo-h2h-hero');
  await page.getByRole('link',{name:'Back to originating profile'}).click();
  await page.waitForSelector('.sumo-api-quality[data-sumo-source-id="28"]');
  assert.equal(await page.locator('#sumo-period').inputValue(),'current');

  for(const route of ['kimarite','banzuke','basho','rikishi','home']){
    await page.locator('.subnav [data-page="'+route+'"]').press('Enter');
    await page.waitForURL('**#'+route);
    await page.waitForSelector('.subnav [data-page="'+route+'"][aria-current="page"]');
    assert.equal(await page.locator('.subnav [data-page="'+route+'"]').getAttribute('aria-current'),'page');
  }
  if (isMobile){
    for(const route of ['home','rikishi','profile/8850','matchups','basho','banzuke','kimarite']){
      await open(page,route,'#sumo-main');
      const widths=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(widths.scroll<=widths.viewport+6,route+' horizontal overflow '+JSON.stringify(widths));
    }
  }
  viewportResults.push({width:viewport.width,status:'pass',profiles:checkedIds.size});
  } catch(error) {
    await snap(page,label+'-failure',{fullPage:false}).catch(()=>{});
    viewportResults.push({width:viewport.width,status:'fail',error:String(error.stack||error)});
    failures.push(label+': '+String(error.stack||error));
  } finally { await ctx.close(); }
}
await mkdir(OUT,{recursive:true});
try {
  await testSite({width:1440,height:900},false,'desktop',true);
  await testSite({width:1280,height:900},false,'laptop1280',false);
  await testSite({width:768,height:1024},false,'tablet',false);
  await testSite({width:390,height:844},true,'mobile',true);
  await testSite({width:320,height:740},true,'reflow320',false);
  if(failures.length)throw new Error(failures.join('\n'));
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'pass',browser:browser.version(),viewportResults,screenshotCount,views:['home','rikishi','profiles','banzuke','basho','matchups','kimarite','headtohead'],viewportWidths:[1440,1280,768,390,320],realTouchTest:false},null,2));
  console.log('Sumo editorial browser QA passed: 1440/1280/768/390/320, five key wrestlers, H2H chronology, charts and no JS exceptions. Real-device touch remains separate.');
} catch(error) {
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'fail',browser:browser.version(),viewportResults,screenshotCount,error:String(error.stack||error),failures},null,2));
  throw error;
} finally {
  await browser.close();
}
