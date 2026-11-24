/**
 * Browser QA for the isolated Sumo preview.
 * Usage (locally): npm install --no-save playwright && npx playwright install chromium
 *                  python3 -m http.server 8765 --bind 127.0.0.1 &
 *                  node scripts/sumo-browser-qa.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { recordSummary } from '../assets/sumo-data.mjs';

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
  // #home is the Sumo Overview (owner, 24 Nov 2026): the latest basho, champions and prizes, gold stars, the sanyaku
  // scorecard, rising stars, movers, the next-banzuke watch list, a fact and links to every Sumo page.
  await open(page,'home','.sumo-home');
  const overview=await page.locator('#sumo-main').innerText();
  assert.ok(await page.locator('.shome-hero h1').count()===1,'Overview has one headline');
  assertContains(overview,'Sanyaku scorecard','Sanyaku scorecard shown');
  assert.ok(await page.locator('.shome-srow').count()>=4,'Sanyaku rows listed');
  assert.equal(await page.locator('.shome-ex').count(),10,'Explore links to every Sumo page');
  assert.ok(await page.locator('.shome-hero-photo img, .shome-face[src]').count()>0,'Overview shows wrestler photographs');
  {
    const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(widths.page<=widths.viewport+6,'No horizontal overflow on the Overview: '+JSON.stringify(widths));
  }
  await snap(page,label+'-overview',{fullPage:false});
  // Basho review (#review): the latest saved tournament, with every saved tournament selectable.
  await open(page,'review','.sumo-review');
  assert.equal(await page.locator('.sumo-review h1').count(),1,'Review has one headline');
  assert.ok(await page.locator('[data-review-select] option').count()>=13,'Two years of tournaments selectable');
  assertContains(await page.locator('#sumo-main').innerText(),'Technique of the basho','Technique of the basho shown');
  {
    const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(widths.page<=widths.viewport+6,'No horizontal overflow on the Basho review: '+JSON.stringify(widths));
  }
  await snap(page,label+'-review',{fullPage:false});
  // Banzuke changes (#changes): the newest released banzuke read against the basho before.
  await open(page,'changes','.sumo-banzuke');
  assert.equal(await page.locator('.sumo-banzuke h1').count(),1,'Banzuke changes has one headline');
  assert.ok(await page.locator('[data-changes-select] option').count()>=5,'Five most recent banzuke selectable');
  assert.ok(await page.locator('.sbz-table tbody tr').count()>=40,'Full Makuuchi list shown');
  {
    const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(widths.page<=widths.viewport+6,'No horizontal overflow on Banzuke changes: '+JSON.stringify(widths));
  }
  // The results desk is #basho, under Fights.
  await open(page,'basho','.sumo-page-head');
  const home=await page.locator('#sumo-main').innerText();
  assertContains(home,'Results','Results page');
  assertContains(home,'Day','tournament day shown');
  assert.equal(await page.locator('.sumo-basho-views [data-basho-view]').count(),3,'Results, Matchups and Standings views');
  assert.equal(await page.locator('[data-basho-view="results"]').getAttribute('aria-pressed'),'true','Results is the selected view');
  for(const division of ['Makuuchi','Juryo','Makushita']){
    await page.locator('[data-basho-division="'+division+'"]').click();
    assert.ok(/\bactive\b/.test(await page.locator('[data-basho-division="'+division+'"]').getAttribute('class')),
      'Selected '+division+' tab is marked active');
    assert.ok(await page.locator('.sumo-compact-results .bout-row').count()>0,'Bouts listed for '+division);
    const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(widths.page<=widths.viewport+6,'No horizontal overflow after '+division+' toggle: '+JSON.stringify(widths));
  }
  await page.locator('[data-basho-division="Makuuchi"]').click();
  await page.locator('[data-basho-view="standings"]').click();
  await page.waitForSelector('.sumo-standings-row');
  assert.equal(await page.locator('[data-basho-view="standings"]').getAttribute('aria-pressed'),'true','Standings view selected');
  assert.ok(await page.locator('.sumo-standings-row').count()>=5,'Standings list the top wrestlers');
  assert.ok(await page.locator('.sumo-standings-row .sumo-standings-record').count()>=5,'Each standings row shows a record');
  await page.locator('.sumo-standings-workspace').first().screenshot({path:OUT+'/'+label+'-standings.png',animations:'disabled'});
  screenshotCount++;
  await page.locator('[data-basho-view="results"]').click();
  if(isMobile){
    // Shared site navigation (sport first, then section; 24 Nov 2026): on a phone the sports sit in the row
    // under the masthead and the four Sumo sections in the bottom tab bar.
    const nav=await page.evaluate(()=>{
      const read=sel=>[...document.querySelectorAll(sel)].filter(el=>getComputedStyle(el).display!=='none')
        .map(el=>({label:el.innerText.trim().replace(/\s+/g,' '),client:el.clientWidth,scroll:el.scrollWidth,
          top:Math.round(el.getBoundingClientRect().top),left:el.getBoundingClientRect().left,
          right:el.getBoundingClientRect().right,height:el.getBoundingClientRect().height,
          viewport:document.documentElement.clientWidth}));
      return {sports:read('.sh-areas-phone a'),tabs:read('.befn-mobile-tabs a')};
    });
    assert.deepEqual(nav.sports.map(n=>n.label),['Boxing','MMA','Sumo'],'Phone sports row: '+JSON.stringify(nav.sports));
    assert.deepEqual(nav.tabs.map(n=>n.label),['Overview','Fights','Fighters','Analysis'],'Phone section tabs: '+JSON.stringify(nav.tabs));
    for(const row of [nav.sports,nav.tabs]){
      assert.ok(row.every((item,i)=>item.scroll<=item.client+2&&item.left>=-1&&item.right<=item.viewport+1&&item.height>=44&&
        (i===0||item.left>=row[i-1].right-2)),
        'No overlapping, clipped, off-screen or undersized mobile navigation: '+JSON.stringify(row));
    }
  }
  await snap(page,label+'-results',{fullPage:false});

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

  // The profile hero is the poster design (.sumo-poster); the old .profile-hero layout is gone.
  await open(page,'profile/8850','.sumo-poster');
  let profile=await page.locator('#sumo-main').innerText();
  assertContains(profile,'Onosato','Onosato name');
  assert.equal(await page.locator('.sumo-quick-results').count(),0,'Redundant Jump to results hero button removed');
  assert.equal(await page.locator('.sumo-full-photo').count(),0,'Redundant View full photo hero button removed');
  const poster=await page.locator('.sumo-poster').evaluate(P=>{
    const rect=e=>{const b=e?.getBoundingClientRect();return b&&{top:b.top,left:b.left,right:b.right,width:b.width,height:b.height}};
    const photo=P.querySelector('.sumo-photo,img');
    const facts=[...P.querySelectorAll('.sumo-poster-facts>*')].map(el=>el.textContent.replace(/\s+/g,' ').trim());
    return {h1:rect(P.querySelector('h1')),name:P.querySelector('h1')?.textContent.trim(),
      poster:rect(P),photo:rect(photo),
      chips:[...P.querySelectorAll('.sumo-poster-chip')].map(el=>el.textContent.replace(/\s+/g,' ').trim()),
      country:P.querySelector('.sumo-poster-chip.country')?.textContent.trim(),
      emojiInChips:!!P.querySelector('.sumo-poster-chip .sumo-country-emoji'),
      facts,stats:P.querySelector('.sumo-poster-stats')?.innerText.replace(/\s+/g,' ').trim(),
      viewport:{w:document.documentElement.clientWidth,h:window.innerHeight}};
  });
  assert.equal(poster.name,'Onosato','Poster heading is the wrestler name');
  assert.ok(poster.h1.top<poster.viewport.h,'Profile name appears within the first screen: '+JSON.stringify({h1:poster.h1,viewport:poster.viewport}));
  assert.ok(poster.photo&&poster.photo.width>40&&poster.photo.height>40,'Poster shows a wrestler photograph: '+JSON.stringify(poster.photo));
  assert.ok(poster.photo.left>=poster.poster.left-2&&poster.photo.right<=poster.poster.right+2,'Photograph stays inside the poster: '+JSON.stringify({photo:poster.photo,poster:poster.poster}));
  assert.ok(poster.poster.right<=poster.viewport.w+2,'Poster fits the viewport width: '+JSON.stringify({poster:poster.poster,viewport:poster.viewport}));
  assert.ok(poster.chips.some(c=>/Yokozuna/.test(c)),'Rank chip shows Yokozuna: '+JSON.stringify(poster.chips));
  assert.equal(poster.country,'Japan','Country is readable plain text');
  assert.equal(poster.emojiInChips,false,'No flag emoji in the poster chips');
  assert.ok(poster.facts.some(f=>/Height\s*190 cm/.test(f)),'Poster shows source centimetres: '+JSON.stringify(poster.facts));
  assert.ok(/\d+–\d+/.test(poster.stats)&&/CAREER WINS/i.test(poster.stats),'Poster shows a basho record and career wins: '+poster.stats);
  assertContains(profile,'Yokozuna','rank');
  assertContains(profile,'Winning techniques','techniques');
  assertContains(profile,'Results','canonical results');
  assertContains(profile,'Career','career section');
  const careerTiles=page.locator('#sumo-career .sumo-career-strip>div');
  assert.equal(await careerTiles.count(),2,'Career summary has exactly Basho and Makuuchi Championships');
  assert.deepEqual(await careerTiles.locator('span').allInnerTexts(),['Basho','Makuuchi Championships'],
    'Two clear, nonduplicative labels');
  // Career totals only grow, so check a floor (22 basho and 6 Makuuchi titles when this was written)
  // and that titles cannot exceed basho, rather than a fixed value that goes stale each tournament.
  const careerTotals=(await careerTiles.locator('strong').allInnerTexts()).map(Number);
  assert.ok(careerTotals.length===2&&careerTotals.every(Number.isInteger)&&careerTotals[0]>=22&&careerTotals[1]>=6&&careerTotals[1]<=careerTotals[0],
    'Onosato source-listed basho (at least 22) and Makuuchi titles (at least 6): '+JSON.stringify(careerTotals));
  assert.equal(await page.locator('#sumo-career .sumo-career-facts').count(),0,
    'The original closed career disclosures have been replaced');
  assert.equal(await page.locator('#sumo-career .sumo-career-detail-section').count(),4,
    'Biography, Division records, Prizes and Last six banzuke positions are always visible');
  assert.ok((await page.locator('#sumo-career .sumo-career-data-tile').count())>=4,
    'Career data is displayed in compact tiles');
  assert.equal(await page.locator('#sumo-career .sumo-basho-history-item').count(),6,
    'Six recorded banzuke positions display as visible tiles');
  assert.equal(await page.locator('.sumo-career-summary').count(),0,
    'The three technical boxes above the Analysis graphs are removed');
  assert.equal(await page.locator('#sumo-sources').count(),0,
    'No sourcing or preview-certification block remains in the profile');
  assertContains(profile,'Analysis','accessible charts in Analysis');
  assertContains(profile,'Recent form','last-ten results show named recent form');
  assert.equal(await page.locator('.sumo-recent-bout').count(),10,
    'Recent form shows ten source-backed completed bouts when available');
  const firstRecent=page.locator('.sumo-recent-bout').first();
  assert.ok((await firstRecent.getAttribute('data-result-link'))?.length>0,
    'Recent results still link to canonical result entries');
  const formData=await firstRecent.innerText();
  assert.ok(formData.includes('Day ')&&formData.length>15,'Recent form keeps date and technique');
  assert.equal(await page.locator('.sumo-mobile-rank-preview').count(),0,
    'No duplicate rank chart is inserted below recent form or above Results');
  const structure=await page.evaluate(()=>{
    const nav=document.querySelector('.sumo-section-nav');
    const recent=document.querySelector('.sumo-recent-strip');
    const results=document.querySelector('#sumo-results');
    return Boolean(nav&&recent&&results&&
      (nav.compareDocumentPosition(recent)&Node.DOCUMENT_POSITION_FOLLOWING)&&
      (recent.compareDocumentPosition(results)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  assert.ok(structure,'Preserve existing profile section order: header, form, Results, Career, Analysis');
  if(isMobile){
    assert.ok(await page.locator('.sumo-recent-list').isVisible(),'Recent form uses compact readable mobile rows');
    const formLayout=await page.locator('.sumo-recent-strip').evaluate(panel=>{
      const list=panel.querySelector('.sumo-recent-list');
      const items=[...list.querySelectorAll('.sumo-recent-bout')];
      const bounds=el=>el?.getBoundingClientRect();
      const boundaries=items.map(el=>{
        const box=bounds(el),photo=el.querySelector('.sumo-recent-portrait');
        const photoInner=photo?.querySelector('.profile-icon.sumo-photo');
        const info=el.querySelector('.sumo-recent-info');
        const flag=info?.querySelector(':scope>.sumo-flag-backdrop');
        const name=info?.querySelector('.sumo-recent-person');
        const record=info?.querySelector('.sumo-recent-result-line');
        const technique=info?.querySelector('.sumo-recent-technique');
        const p=bounds(photo),inner=bounds(photoInner),i=bounds(info),n=bounds(name),rc=bounds(record),t=bounds(technique);
        const flagRect=bounds(flag);
        return {
          left:box.left,right:box.right,top:box.top,bottom:box.bottom,
          width:box.width,height:box.height,photoWidth:p?.width,
          photoLeft:p?.left-box.left,photoTop:p?.top-box.top,photoBottom:box.bottom-p?.bottom,
          imageFill:!!(inner&&p&&Math.abs(inner.width-p.width)<3&&Math.abs(inner.height-p.height)<3),
          infoRight:box.right-i?.right,
          separated:!!(p&&i&&i.left>=p.right-2),
          nameInside:!!(n&&i&&n.left>=i.left-2&&n.right<=i.right+2&&n.bottom<=i.bottom+2),
          recordInside:!!(rc&&i&&rc.left>=i.left-2&&rc.right<=i.right+2&&rc.bottom<=i.bottom+2),
          techniqueInside:!!(t&&i&&t.left>=i.left-2&&t.right<=i.right+2&&t.bottom<=i.bottom+2),
          nameText:name?.textContent,technique:technique?.textContent,
          resultText:record?.textContent,hasFlag:!!flag,
          flagOnlyInInfo:!flag||!!(!el.querySelector(':scope>.sumo-flag-backdrop')&&flag.parentElement===info&&
            flagRect.left>=i.left-2&&flagRect.right<=i.right+2&&flagRect.top>=i.top-2&&flagRect.bottom<=i.bottom+2&&
            Number(getComputedStyle(flag).opacity)<=.2),
          photoApproved:!!photoInner?.classList.contains('has-photo'),
          photoHasImage:!!photoInner?.querySelector('img')
        };
      });
      return {
        columnCount:getComputedStyle(list).gridTemplateColumns.split(' ').length,
        listScroll:list.scrollWidth,listWidth:list.clientWidth,
        panelWidth:panel.getBoundingClientRect().width,
        items:boundaries,documentWidth:document.documentElement.scrollWidth,
        viewportWidth:document.documentElement.clientWidth
      };
    });
    assert.equal(formLayout.items.length,10,'Ten completed source-backed bouts are listed');
    assert.equal(formLayout.columnCount,2,'Exactly two Recent Form tiles per row on phones');
    assert.ok(formLayout.listScroll<=formLayout.listWidth+3 &&
      formLayout.documentWidth<=formLayout.viewportWidth+6,
      'Recent Form does not cause sideways scrolling: '+JSON.stringify(formLayout));
    assert.ok(formLayout.items.every((item,index,items)=>
      item.width>=110&&item.photoWidth>=42&&item.height<=220&&
      item.photoLeft<=2&&item.photoTop<=2&&item.photoBottom<=2&&
      item.imageFill&&item.infoRight<=2&&item.separated&&
      item.nameInside&&item.recordInside&&item.techniqueInside&&
      item.nameText?.length>0&&item.technique?.length>0&&
      /[WL]/.test(item.resultText)&&item.flagOnlyInInfo&&
      item.photoApproved===item.photoHasImage&&
      (index<2||item.top>=items[index-2].bottom-2)),
      'Each split tile retains edge-to-edge photo, right-only flag and legible W-L/day/kimarite: '+
      JSON.stringify(formLayout));
    for(let i=0;i<10;i+=2){
      assert.ok(Math.abs(formLayout.items[i].top-formLayout.items[i+1].top)<=2 &&
        formLayout.items[i+1].left>=formLayout.items[i].right-1,
        'Recent Form tiles '+i+' and '+(i+1)+' appear alongside each other');
    }
    assert.ok(formLayout.items.filter(item=>item.hasFlag).length>=1,
      'Source-backed country flags appear only behind opponent information, not photographs');
    await page.locator('.sumo-recent-strip').screenshot({path:OUT+'/'+label+'-compact-form.png',animations:'disabled'});
    screenshotCount++;
    const charts=page.locator('#sumo-charts .sumo-career-panel');
    assert.equal(await charts.count(),2,'Original rank and weight analysis panels remain');
    for(const kind of ['rank','weight']){
      const frame=page.locator('.sumo-'+kind+'-scroll');
      const graph=frame.locator('.sumo-'+kind+'-svg');
      assert.equal(await graph.count(),1,'Existing '+kind+' graph is not duplicated');
      const sizes=await frame.evaluate(el=>{
        const svg=el.querySelector('svg');
        return {frame:el.clientWidth,content:el.scrollWidth,
          svg:svg.getBoundingClientRect().width,viewport:document.documentElement.clientWidth};
      });
      assert.ok(sizes.svg>=250&&sizes.svg<850,
        'Mobile '+kind+' chart uses an adaptive SVG rather than the 900px desktop view: '+JSON.stringify(sizes));
      const ticks=await graph.evaluate(svg=>{
        const h=svg.viewBox.baseVal.height;
        const labels=[...svg.querySelectorAll('.sumo-chart-axis')].filter(el=>
          Number(el.getAttribute('y'))>=h-30);
        const groups=new Map();
        for(const el of labels){
          const key=el.getAttribute('y');
          if(!groups.has(key))groups.set(key,[]);
          const rect=el.getBoundingClientRect();
          groups.get(key).push({left:rect.left,right:rect.right,text:el.textContent});
        }
        return [...groups.values()].map(row=>row.sort((a,b)=>a.left-b.left));
      });
      for(const row of ticks){
        for(let i=1;i<row.length;i++){
          assert.ok(row[i-1].right<=row[i].left+1,
            kind+' chart bottom-axis labels do not overlap: '+JSON.stringify(row));
        }
      }
      if(kind==='rank'){
        assert.equal(ticks.reduce((n,row)=>n+row.length,0),4,
          'Mobile rank chart shows two dates on two lines rather than overlapping five dates');
      }else{
        assert.ok(ticks.reduce((n,row)=>n+row.length,0)<=3,
          'Mobile weight chart has no more than three calendar labels');
      }
      const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
      assert.ok(pageWidth<=sizes.viewport+6,'Chart '+kind+' cannot overflow the document');
    }
    await page.locator('#sumo-charts').screenshot({path:OUT+'/'+label+'-mobile-graphs.png',animations:'disabled'});
    screenshotCount++;
  }
  assert.ok(!profile.includes('API-TRUSTED'),'Technical API badge is not displayed');
  // (The profile no longer carries a sourcing/verification block, so the old
  // "Career results: independently corroborated" label is not asserted here; #sumo-sources absent is checked above.)
  assertContains(profile,'Opponents and head-to-head','opponent catalogue');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>=10,'Complete sourced opponent directory available');
  const h2hTiles=await page.locator('.sumo-rival').evaluateAll(cards=>cards.slice(0,12).map(card=>{
    const photo=card.querySelector('.sumo-rival-portrait');
    const photoBody=photo?.querySelector('.profile-icon.sumo-photo');
    const info=card.querySelector('.sumo-rival-info');
    const flag=info?.querySelector(':scope>.sumo-flag-backdrop');
    const record=info?.querySelector('.sumo-rival-record');
    const name=info?.querySelector('.sumo-rival-name');
    const sourceFlag=info?.querySelector('.sumo-country');
    const rect=el=>el?el.getBoundingClientRect():null;
    const a=rect(card),p=rect(photo),pb=rect(photoBody),ri=rect(info),rr=rect(record),n=rect(name);
    return {
      tag:card.tagName,href:card.getAttribute('href'),cardWidth:a?.width,
      photoLeft:p?.left-a?.left,photoTop:p?.top-a?.top,photoBottom:a?.bottom-p?.bottom,
      photoWidth:p?.width,photoInnerWidth:pb?.width,photoInnerHeight:pb?.height,
      infoRight:a?.right-ri?.right,infoLeft:ri?.left,photoRight:p?.right,
      nameInside:!!(n&&ri&&n.left>=ri.left-2&&n.right<=ri.right+2),
      recordInside:!!(rr&&ri&&rr.left>=ri.left-2&&rr.right<=ri.right+2&&rr.bottom<=ri.bottom+2),
      flagPresent:!!flag,
      flagInInfo:!flag||!!(!card.querySelector(':scope>.sumo-flag-backdrop')&&
        flag.parentElement===info),
      flagContained:!flag||(()=>{const f=rect(flag);return f.left>=ri.left-2&&f.right<=ri.right+2&&f.top>=ri.top-2&&f.bottom<=ri.bottom+2})(),
      flagOpacity:flag?getComputedStyle(flag).opacity:null,
      noMeetingsText:!/recorded meetings|open full chronology/i.test(card.textContent),
      noSmallFlag:!sourceFlag,
      score:record?.textContent?.trim(),
      wrapping:card.scrollWidth>card.clientWidth+2
    };
  }));
  assert.ok(h2hTiles.length>=10,'A representative set of H2H tiles is rendered');
  const tileColumns=await page.locator('#sumo-opponents .sumo-rival-grid').evaluate(grid=>{
    const cards=[...grid.querySelectorAll('.sumo-rival')].slice(0,4);
    const bounds=cards.map(card=>card.getBoundingClientRect());
    const gridStyle=getComputedStyle(grid);
    return {
      columns:gridStyle.gridTemplateColumns.split(' ').length,
      firstRow:bounds[0]&&bounds[1]&&
        Math.abs(bounds[0].top-bounds[1].top)<=2&&bounds[1].left>=bounds[0].right,
      secondRow:bounds[2]&&bounds[3]&&
        Math.abs(bounds[2].top-bounds[3].top)<=2&&bounds[2].top>=bounds[0].bottom,
      viewport:document.documentElement.clientWidth,
      pageWidth:document.documentElement.scrollWidth,
      cardWidths:bounds.map(x=>x.width)
    };
  });
  assert.ok(tileColumns.columns===2&&tileColumns.firstRow&&tileColumns.secondRow,
    'Opponent tiles remain exactly two per row, including 320px/390px phones: '+JSON.stringify(tileColumns));
  assert.ok(tileColumns.cardWidths.every(w=>w>=120),
    'Both opponent cards stay usefully readable: '+JSON.stringify(tileColumns));
  assert.ok(tileColumns.pageWidth<=tileColumns.viewport+6,
    'Two-column opponent grid never causes document horizontal scroll: '+JSON.stringify(tileColumns));

  for(const [index,tile] of h2hTiles.entries()){
    assert.equal(tile.tag,'A','H2H whole-tile link remains a semantic anchor');
    assert.ok(tile.href?.startsWith('#headtohead/'),'H2H link still opens full chronology');
    assert.ok(tile.photoLeft<=2&&tile.photoTop<=2&&tile.photoBottom<=2,
      'H2H tile '+index+' photo touches left/top/bottom edges: '+JSON.stringify(tile));
    assert.ok(Math.abs(tile.photoInnerWidth-tile.photoWidth)<3,
      'H2H tile '+index+' photo fills the entire left panel');
    assert.ok(tile.photoInnerHeight>110&&tile.photoWidth>44,
      'H2H tile '+index+' photo is large and full-height');
    assert.ok(tile.infoLeft>=tile.photoRight-2&&tile.infoRight<=2,
      'H2H tile '+index+' details occupy only the right panel');
    assert.ok(tile.flagInInfo&&tile.flagContained&&(!tile.flagOpacity||Number(tile.flagOpacity)<=.2),
      'H2H tile '+index+' flag is a faint image inside right information only');
    assert.ok(tile.nameInside&&tile.recordInside,
      'H2H tile '+index+' name and gold W-L badge fit in right panel');
    assert.ok(tile.noMeetingsText&&tile.noSmallFlag&&!tile.wrapping,
      'H2H tile '+index+' has gold W-L with no small flag emoji, meeting text or overflow');
  }
  assert.ok(h2hTiles.filter(tile=>tile.flagPresent).length>=5,
    'Representative source-backed opponent tiles show a faded birthplace-country flag');

  const opponentScores=await page.locator('.sumo-rival').evaluateAll(cards=>cards.slice(0,12).map(card=>{
    const score=card.querySelector('.sumo-rival-record');
    const rect=score.getBoundingClientRect(),outer=card.getBoundingClientRect(),style=getComputedStyle(score);
    return {score:score.textContent,colour:style.color,bg:style.backgroundColor,
      inside:rect.left>=outer.left-1&&rect.right<=outer.right+1&&rect.bottom<=outer.bottom+1,
      width:rect.width};
  }));
  assert.ok(opponentScores.length>=10&&opponentScores.every(x=>x.inside&&x.width>40),
    'Opponent scores must fit inside dark card at '+viewport.width+'px: '+JSON.stringify(opponentScores));
  assert.ok(opponentScores.every(x=>x.colour==='rgb(255, 240, 195)'&&x.bg==='rgb(64, 51, 47)'),
    'Opponent scores must use opaque cream/gold contrast: '+JSON.stringify(opponentScores));
  await page.locator('#sumo-career').scrollIntoViewIfNeeded();
  await snap(page,label+'-profile-career',{fullPage:false});
  await page.locator('#sumo-opponents').scrollIntoViewIfNeeded();
  await snap(page,label+'-profile-opponents',{fullPage:false});
  assertContains(profile,'Signature manoeuvres','Rikishi signature manoeuvres remain visible');
  assertContains(profile,'tsuki','JSA-listed source manoeuvres preserved');
  assert.ok(await page.locator('.sumo-ed-row').count()>0,'Canonical current tournament rows rendered');
  assert.equal(await page.locator('.sumo-section-nav a').count(),5,'Four destinations and a techniques link; no provenance navigation');
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
  assert.ok(await page.locator('.sumo-poster-chip.country').count()>0,'Profile shows the birthplace country (poster chip)');
  await page.evaluate(()=>scrollTo(0,0));
  await snap(page,label+'-profile',{fullPage:false});
  // Full pair-specific history is distinct from a single basho's opponent record.
  await open(page,'headtohead/8850/8857','.sumo-h2h-comparison');
  await page.waitForFunction(()=>document.querySelectorAll('.sumo-h2h-order+ol li').length===6,null,{timeout:30000});
  const history=await page.locator('#sumo-main').innerText();
  assertContains(history,'Head-to-head','dedicated H2H view');
  assertContains(history,'Career series','career series shown on the H2H view');
  assertContains(history,'1–5','source-confirmed all-time series');
  assert.equal(await page.locator('.section-head').filter({hasText:'Every historical meeting'}).count(),1,'Head-to-head history heading shown after kimarite charts');
  assert.equal(await page.locator('.sumo-h2h-order+ol li').count(),6,'Every source-confirmed bout is shown');
  assertContains(history,'Tsukiotoshi','actual kimarite recorded');
  assertContains(history,'not independently bout-certified','history is not mislabeled as certified');
  assertContains(history,'Fusen (forfeit; no technique)','forfeit is not a winning technique');
  await page.locator('[data-h2h-order="oldest"]').click();
  assertContains(await page.locator('.sumo-h2h-order+ol li').first().innerText(),'November 2025','chronological oldest-first sort');

  // Career H2H is a comparison of each wrestler's highest sourced division,
  // not the default Makushita record in the earlier preview.
  await open(page,'headtohead/19/7','.sumo-h2h-comparison');
  const careerLabels=await page.locator('.sumo-h2h-comparison .sumo-comparison-row>span').allInnerTexts();
  assert.ok(careerLabels.includes('Makuuchi W–L')&&careerLabels.includes('Makuuchi win %'),
    'Hoshoryu versus Kirishima shows top-division Makuuchi records in both rows: '+JSON.stringify(careerLabels));
  assert.ok(!careerLabels.some(label=>label.includes('Makushita')),
    'Career H2H does not default to older Makushita results');
  const divisionCells=await page.locator('.sumo-h2h-comparison .sumo-comparison-row')
    .filter({has:page.locator('span:text-is("Makuuchi W–L")')})
    .first().locator('strong').allInnerTexts();
  assert.equal(divisionCells.length,2,'Career H2H shows two Makuuchi W–L entries');
  assert.ok(divisionCells.every(value=>/^\d+–\d+$/.test(value)),
    'Both Makuuchi records are nonempty sourced numeric W–L entries: '+JSON.stringify(divisionCells));

  // All tracked rikishi should expose current banzuke opponent histories even
  // without individually fetched lifetime stats or 18-bout enrichment.
  await open(page,'profile/2','.sumo-poster');
  const unfeatured=await page.locator('#sumo-main').innerText();
  assertContains(unfeatured,'Career','career section exists for all tracked profiles');
  assertContains(unfeatured,'Opponents and head-to-head','opponent directory section');
  assert.ok(!unfeatured.includes('API-TRUSTED'),'Technical badge removed on nonfeatured profiles');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>0,'Unfeatured rikishi has complete opponent library');
  assert.equal(await page.locator('.sumo-signature h3').count(),0,'No speculative signature manoeuvres on unsourced profiles');
  // The profile poster shows career wins and a win percentage (not a W–L pair). Career wins only grow, so
  // check the totals recorded when these checks were written (206 and 677) as floors, not fixed values.
  const posterCareerWins=async()=>{
    const stats=await page.locator('.sumo-poster-stats').innerText();
    const m=stats.replace(/\s+/g,' ').match(/(\d+) CAREER WINS · (\d+(?:\.\d+)?)%/i);
    assert.ok(m,'Poster shows career wins and a win percentage: '+stats);
    return Number(m[1]);
  };
  await open(page,'profile/82','.sumo-poster');
  assert.ok(await posterCareerWins()>=206,'Fujiseiun career wins preserved (at least 206)');
  await open(page,'profile/16','.sumo-poster');
  assert.ok(await posterCareerWins()>=677,'Nishikigi career wins preserved (at least 677)');
  await open(page,'profile/75','.sumo-poster');
  const makushitaProfile=await page.locator('#sumo-main').innerText();
  // The profile no longer carries a "non-bout days" note or any absence counter (the Makushita caveat lives on the
  // Results page and is checked with the basho steps), so a rest day cannot be shown as an absence here.
  assert.ok(!/absen/i.test(makushitaProfile),'Makushita profile does not report absences: rest days are not absences');


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

  await open(page,'basho','.sumo-page-head');
  const dailySnapshot=await page.evaluate(async()=>{
    const response=await fetch('data/sumo/preview-details.json');
    const details=await response.json();
    return {announcedDay:details.announcedDay,dailyStatus:details.dailyStatus};
  });
  const announcedDay=dailySnapshot.announcedDay;
  if(Number.isInteger(announcedDay)){
    // During a tournament the source publishes the next day's torikumi.
    assert.ok(announcedDay>=1&&announcedDay<=15,'Published preview has a source-scheduled day');
    await page.locator('[data-day="'+announcedDay+'"]').click();
    await page.locator('[data-basho-view="matchups"]').click();
    const confirmed=await page.locator('.sumo-daily-card .sumo-daily-status:not(.completed)').count();
    assert.ok(confirmed>0,'Confirmed scheduled matchups must appear without invented outcomes');
    assertContains(await page.locator('#sumo-main').innerText(),'snapshot, not live','scheduled source provenance');
    await snap(page,label+'-scheduled',{fullPage:false});
  }else{
    // Between tournaments (or before the next day's torikumi is published) there is no scheduled day:
    // the page must not invent matchups.
    assert.equal(announcedDay,null,'No scheduled day is announced: '+JSON.stringify(dailySnapshot));
    await page.locator('[data-basho-view="matchups"]').click();
    assert.equal(await page.locator('.sumo-daily-card .sumo-daily-status:not(.completed)').count(),0,
      'No scheduled matchups are invented when no day is announced');
  }
  await page.locator('[data-day="15"]').click();
  assert.equal(await page.locator('.sumo-daily-card .sumo-daily-status:not(.completed)').count(),0,'Day 15 cannot be guessed from future banzuke slots');
  await page.locator('[data-basho-division="Makushita"]').click();
  const basho=await page.locator('#sumo-main').innerText();
  assertContains(basho,'seven times across 15 tournament days','lower division caveat');
  assert.equal(await page.locator('[data-day]').count(),15,'All calendar days are selectable');
  await page.locator('[data-day="7"]').click();
  // Bouts are .bout-row items (two portraits, names, a verdict and technique, a head-to-head link); the old
  // .sumo-daily-card and .sumo-faceoff-* tiles no longer exist.
  assert.ok(await page.locator('.sumo-daily-grid .bout-row').count()>0,'Makushita matchups are listed as bout rows');
  assert.ok(await page.locator('.sumo-daily-grid .bout-row .bout-photo').count()>=2,'Matchups show wrestler portraits');
  await page.locator('[data-basho-view="standings"]').click();
  assert.ok((await page.locator('.sumo-standings-row').count())>=20,'Basho standings stay accessible in compact rows');
  await page.locator('[data-basho-view="results"]').click();
  assert.ok((await page.locator('.sumo-compact-results .bout-row.is-finished').count())>0,'Result rows show actual winners');

  const resultRows=await page.locator('.sumo-compact-results .bout-row.is-finished').evaluateAll(rows=>
    rows.slice(0,12).map(row=>{
      const link=row.querySelector('a.bout-h2h')||row.querySelector('.bout-h2h a')||row.querySelector('.bout-h2h');
      return {
        width:row.getBoundingClientRect().width,
        sides:row.querySelectorAll('.bout-side').length,
        photos:row.querySelectorAll('.bout-photo').length,
        photoImages:row.querySelectorAll('.bout-photo .sumo-photo,.bout-photo img').length,
        names:[...row.querySelectorAll('.bout-name')].map(el=>el.textContent.trim()),
        verdict:row.querySelector('.bout-verdict')?.innerText.replace(/\s+/g,' ').trim(),
        techniqueLink:!!row.querySelector('a[data-kimarite-term]'),
        h2hUrl:link?.getAttribute('href'),
        overflow:row.scrollWidth>row.clientWidth+3
      };
    }));
  assert.ok(resultRows.length>0,'Completed results are shown as bout rows');
  for(const [i,row] of resultRows.entries()){
    assert.equal(row.sides,2,'Result '+i+' has two wrestler sides: '+JSON.stringify(row));
    assert.ok(row.photos===2&&row.photoImages===2,'Result '+i+' shows both wrestler portraits: '+JSON.stringify(row));
    assert.ok(row.names.length===2&&row.names.every(n=>n.length>1),'Result '+i+' names both wrestlers: '+JSON.stringify(row.names));
    assert.ok(/ won\b/i.test(row.verdict||'')&&row.techniqueLink,'Result '+i+' states the actual winner and links the kimarite: '+JSON.stringify(row));
    assert.ok(row.h2hUrl?.startsWith('#headtohead/')&&!row.overflow,'H2H link works and the row does not overflow: '+JSON.stringify(row));
  }
  if(isMobile){
    const widths=await page.evaluate(()=>({
      page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth
    }));
    assert.ok(widths.page<=widths.viewport+6,
      'Photo-led results do not introduce sideways scrolling on phones: '+JSON.stringify(widths));
  }

  await snap(page,label+'-basho',{fullPage:false});

  // Dedicated daily face-offs use sourced pairings, two complete stat columns,
  // genuine latest-five kimarite and responsive image-first cards.
  const rankSource=await (await page.request.get('http://127.0.0.1:8765/data/sumo/preview-details.json')).json();
  // Matchups are .bout-row items: both wrestlers (rank, country), this basho's record, career record, build
  // (height and weight), the verdict and a head-to-head link. (The old face-off cards with seven comparison rows,
  // flag backdrops and recent-meeting tiles no longer exist.)
  const assertRankedHeadToHeads=async division=>{
    const rows=[...(rankSource.banzuke?.[division]?.data?.east||[]),
      ...(rankSource.banzuke?.[division]?.data?.west||[])].sort((a,b)=>
      (Number(a.rankValue)||99999)-(Number(b.rankValue)||99999)||
      (a.side==='East'?-1:1));
    const positions=new Map(rows.map((row,i)=>[Number(row.rikishiID),i]));
    const ranks=await page.locator('.sumo-daily-grid .bout-row').evaluateAll(cards=>cards.map(card=>
      [...new Set([...card.querySelectorAll('a[href^="#profile/"]')]
        .map(a=>Number(a.getAttribute('href').split('/')[1])))]));
    assert.ok(ranks.length>0,'Head-to-head rows exist for '+division);
    assert.ok(ranks.every(pair=>pair.length===2),'Each row links exactly two wrestlers for '+division+': '+JSON.stringify(ranks.slice(0,3)));
    const highs=ranks.map(pair=>Math.min(...pair.map(id=>positions.get(id)??99999)));
    assert.deepEqual(highs,[...highs].sort((a,b)=>a-b),'Matchups descend from top of '+division+' banzuke');
  };
  await open(page,'matchups','.sumo-daily-page');
  await page.locator('#sumo-matchup-day').selectOption('1');
  assert.ok(await page.locator('.sumo-daily-grid .bout-row').count()>0,'Makuuchi Day 1 matchup rows rendered');
  await assertRankedHeadToHeads('Makuuchi');
  const firstRow=page.locator('.sumo-daily-grid .bout-row').first();
  assert.equal(await firstRow.locator('.bout-photo').count(),2,'Portraits for both wrestlers');
  assert.equal(await firstRow.locator('.bout-name').count(),2,'Both wrestlers are named');
  assert.match(await firstRow.innerText(),/\d+′\d+″/,'Sourced height is displayed in feet and inches');
  const rowText=await firstRow.innerText();
  for(const label of ['This basho','Career','Build','H2H']){
    assertContains(rowText,label,'Matchup row section');
  }
  assert.match(rowText,/\d+–\d+[\s\S]*\d+–\d+/,'Matchup row shows win–loss records for both wrestlers');
  await snap(page,label+'-daily-faceoff',{fullPage:false});
  for(const division of ['Juryo','Makushita']){
    await page.locator('[data-matchup-division="'+division+'"]').click();
    assertContains(await page.locator('.sumo-daily-date').innerText(),division,'Division selector');
    await assertRankedHeadToHeads(division);
    assert.equal(await page.locator('#sumo-matchup-day').inputValue(),'1','Day is retained between divisions');
  }
  await page.locator('[data-matchup-division="Makuuchi"]').click();
  const bodyWidth=await page.evaluate(()=>({
    doc:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth,
    row:document.querySelector('.sumo-daily-grid .bout-row')?.getBoundingClientRect().width
  }));
  assert.ok(bodyWidth.doc<=bodyWidth.viewport+6,'Daily page has no viewport overflow '+JSON.stringify(bodyWidth));
  await snap(page,label+'-daily-faceoff-day1',{fullPage:false});
  await page.locator('#sumo-matchup-day').selectOption('7');
  const cardLink=page.locator('.sumo-daily-grid .bout-row a.bout-h2h').first();
  assert.ok(await cardLink.count()>0,'Completed Day 7 row provides full H2H');
  await cardLink.click();
  await page.waitForSelector('.sumo-h2h-comparison');
  assertContains(await page.locator('.back-link').innerText(),'Day 7','Context-aware H2H return label');
  await page.locator('.back-link').click();
  await page.waitForSelector('#sumo-matchup-day');
  assert.ok(page.url().includes('#matchups'),'H2H returns to originating daily route');
  assert.equal(await page.locator('#sumo-matchup-day').inputValue(),'7','Return retains original tournament day');
  await open(page,'headtohead/8850/71','.sumo-h2h-comparison');
  await page.waitForFunction(()=>document.querySelector('.fo-score')?.textContent.includes('5–0'),null,{timeout:25000});
  assertContains(await page.locator('#sumo-main').innerText(),'No recorded losses against Churanoumi',
    'True zero losses are not described as missing technique data');

  // The Techniques page is a gallery of all 82 official kimarite (the old nine-term glossary is gone).
  await open(page,'kimarite','.sumo-km-gallery');
  assert.equal(await page.locator('.sumo-km-gallery .sumo-km-tile-link').count(),82,'All 82 official kimarite are listed');
  assertContains(await page.locator('.sumo-km-count').innerText(),'82 of 82','Technique count shown');
  assertContains(await page.locator('#sumo-main').innerText(),'Yorikiri','technique');
  await snap(page,label+'-kimarite',{fullPage:false});

  // Click-to-open viewer should be tightly bounded by the translation, never
  // reserve space for an invisible clip panel or source link footer.
  await page.locator('.sumo-km-tile-link[href="#kimarite?term=yorikiri"]').click();
  await page.waitForSelector('#sumo-km-popup-root .sumo-km-dialog');
  await page.locator('#sumo-km-popup-root .sumo-km-modal-visual img').evaluate(img=>img.decode().catch(()=>{}));
  const kmPopup=await page.locator('#sumo-km-popup-root .sumo-km-dialog').evaluate(dialog=>{
    const caption=dialog.querySelector('.sumo-km-modal-meaning');
    const body=dialog.querySelector('.sumo-km-modal-text');
    const visual=dialog.querySelector('.sumo-km-modal-visual');
    const img=visual?.querySelector('img');
    const bounds=el=>el?.getBoundingClientRect();
    const d=bounds(dialog),c=bounds(caption),m=bounds(body),v=bounds(visual);
    return {
      title:dialog.querySelector('#sumo-km-modal-title')?.textContent,
      translation:caption?.textContent?.trim(),
      surplus:d.bottom-c.bottom,
      bottomPadding:parseFloat(getComputedStyle(body).paddingBottom)||0,
      imageHeight:v?.height,
      imageVisible:!!img,
      outOfFrame:d.bottom>window.innerHeight+1,
      extras:dialog.querySelectorAll('.sumo-km-modal-links,.sumo-km-clip-panel,.sumo-km-modal-pending').length,
      close:!!dialog.querySelector('[data-km-close]')
    };
  });
  assert.ok(kmPopup.title?.includes('Yorikiri')&&kmPopup.translation==='Frontal force-out',
    'Popup preserves correct category/name/English translation');
  assert.ok(kmPopup.close&&kmPopup.imageVisible&&kmPopup.imageHeight>0,
    'Popup keeps demonstration image and close button');
  assert.equal(kmPopup.extras,0,'Popup no longer includes hidden original clip, references or pending text');
  assert.ok(kmPopup.surplus>=0&&kmPopup.surplus<=kmPopup.bottomPadding+4,
    'Popup ends after English translation with no extra blank space: '+JSON.stringify(kmPopup));
  assert.ok(!kmPopup.outOfFrame,'Popup stays inside mobile/desktop viewport');
  await page.locator('#sumo-km-popup-root [data-km-close]').click();
  assert.equal(await page.locator('#sumo-km-popup-root').count(),0,'Close button dismisses modal');


  // Exercise every current wrestler on both desktop and mobile, not only
  // the feature cards. The source ID attribute prevents a stale page from
  // satisfying the next route's assertion.
  const checkedIds=new Set();
  for(const w of (fullCohort?roster.rikishi:roster.rikishi.filter(w=>[8850,28,75,82,16].includes(w.sourceId)))){
    assert.ok(!checkedIds.has(w.sourceId),'Duplicate Sumo browser QA source ID '+w.sourceId);
    checkedIds.add(w.sourceId);
    await page.evaluate(id=>{ location.hash='#profile/'+id; },w.sourceId);
    await page.waitForFunction(name=>document.querySelector('.sumo-poster h1')?.textContent?.trim()===name,
      w.shikonaEn,{timeout:15000});
    const headingText=await page.locator('.sumo-poster h1').innerText();
    assertContains(headingText,w.shikonaEn,'Loaded wrestler '+w.sourceId);
    assert.equal(await page.locator('#sumo-career .sumo-career-detail-section').count(),4,
      'Visible career tile groups on wrestler '+w.sourceId);
    assert.equal(await page.locator('#sumo-sources,.sumo-api-quality,.sumo-career-summary').count(),0,
      'No provenance or analysis summary boxes on wrestler '+w.sourceId);
    assert.equal(await page.locator('.sumo-rank-svg').count(),1,'Dated career-rank graph '+w.sourceId);
    assert.equal(await page.locator('.sumo-weight-svg').count(),1,'Dated weight graph '+w.sourceId);
    if(isMobile){
      const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
      assert.ok(width.document<=width.viewport+6,'Mobile overflow on rikishi '+w.sourceId+': '+JSON.stringify(width));
    }
  }
  assert.equal(checkedIds.size,fullCohort?roster.count:5,'Expected cohort/sample reached working profile routes');

  // Exact redesign stress cases — recorded date ratios, 5 profiles, and H2H chronology.
  await open(page,'profile/28','.sumo-poster');
  const weightPoints=await page.locator('.sumo-weight-point').evaluateAll(ns=>ns.map(n=>({
    month:n.getAttribute('data-weight-month'),x:Number(n.getAttribute('data-weight-x'))
  })));
  const m2015=weightPoints.find(p=>p.month==='201503'),m2021=weightPoints.find(p=>p.month==='202103'),m2022=weightPoints.find(p=>p.month==='202205');
  if(m2015&&m2021&&m2022){
    assert.ok(Math.abs((m2021.x-m2015.x)/(m2022.x-m2021.x)-(72/14))<.04,'Ura weight axis uses true elapsed time');
  }
  assert.ok(await page.locator('.sumo-data-table summary').count()>=2,'Rank and weight tables offered to keyboard/touch users');
  await snap(page,label+'-ura',{fullPage:false});
  await open(page,'headtohead/8850/28','.sumo-h2h-comparison');
  await page.waitForFunction(()=>document.querySelectorAll('.sumo-h2h-order+ol li').length===8,null,{timeout:30000});
  const newest=await page.locator('.sumo-h2h-order+ol li').allInnerTexts();
  await page.locator('[data-h2h-order="oldest"]').click();
  const oldest=await page.locator('.sumo-h2h-order+ol li').allInnerTexts();
  assert.deepEqual(oldest,[...newest].reverse(),'H2H reverse order does not scramble date/winner/technique');
  // The wrestler names in the H2H header are profile links; they must stay readable against their background
  // (WCAG AA, 4.5:1) whatever colours the design uses.
  const headerLinks=await page.locator('#sumo-main a[href^="#profile/"]').evaluateAll(links=>{
    const parse=c=>c.match(/[\d.]+/g).map(Number);
    const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
    const background=el=>{for(let e=el;e;e=e.parentElement){const p=parse(getComputedStyle(e).backgroundColor);if(p.length>=3&&(p.length<4||p[3]>.5))return p.slice(0,3)}return [255,255,255]};
    return links.slice(0,2).map(a=>{
      const L1=lum(parse(getComputedStyle(a).color).slice(0,3)),L2=lum(background(a));
      return {text:a.textContent.trim(),ratio:(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)};
    });
  });
  assert.equal(headerLinks.length,2,'H2H header links both wrestlers');
  assert.ok(headerLinks.every(l=>l.ratio>=4.5),'H2H header wrestler links are readable (contrast at least 4.5:1): '+JSON.stringify(headerLinks));
  await snap(page,label+'-h2h-onosato-ura',{fullPage:false});
  for(const id of [8850,28,75,82,16]){
    await open(page,'profile/'+id,'.sumo-poster');
    assert.equal(await page.locator('.sumo-rank-svg').count(),1);
    assert.equal(await page.locator('.sumo-weight-svg').count(),1);
    await snap(page,label+'-profile-'+id);
    if(id===28){
      await page.locator('#sumo-charts').screenshot({path:OUT+'/'+label+'-charts.png',animations:'disabled'});
      screenshotCount++;
    }
  }

  // Exercise the redesigned controls, including native keyboard disclosures.
  await open(page,'profile/28','.sumo-poster');
  if(isMobile){
    // Other sports and the all-sports front page stay one tap away: the sports row and the masthead link.
    assert.equal(await page.locator('.sh-areas-phone a[href="index.html#home"]:visible').count(),2,'Boxing and MMA are reachable');
    assert.equal(await page.locator('.befn-mobile-title[href="index.html#home"]:visible').count(),1,'The masthead opens the front page');
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
  await page.waitForSelector('.sumo-h2h-comparison');
  await page.getByRole('link',{name:'Back to originating profile'}).click();
  await page.waitForSelector('.sumo-poster h1');
  assert.equal(await page.locator('#sumo-period').inputValue(),'current');

  // Keyboard navigation through the shared header: section links (top row on desktop, tab bar on phones) and the
  // pills of the current section's Sumo pages. Starts on a profile, which sits under Fighters.
  for(const [selector,route] of [
    ['.sh-sub [data-sumo-page="banzuke"]','banzuke'],['.sh-sub [data-sumo-page="rikishi"]','rikishi'],
    ['[data-sumo-section="fights"]','basho'],['.sh-sub [data-sumo-page="h2h"]','h2h'],
    ['[data-sumo-section="overview"]','home']]){
    await page.locator(selector+':visible').first().press('Enter');
    await page.waitForURL('**#'+route);
    const active=page.locator(selector+'[aria-current="page"]:visible').first();
    await active.waitFor();
    assert.equal(await active.getAttribute('aria-current'),'page','Destination is announced as current');
  }
  // Data-integrity fixture: the first Day 10 matchup in the current data. (This used to be one fixed November 2026
  // pair, which would fail as soon as the next tournament replaced the data.) Everything the row shows is compared
  // with the source snapshots it is built from.
  await open(page,'matchups','#sumo-main');
  await page.locator('#sumo-matchup-day').selectOption('10');
  await page.waitForTimeout(100);
  const fixtureRow=page.locator('.sumo-daily-grid .bout-row').first();
  assert.ok(await fixtureRow.count()>0,'A Day 10 matchup row is present');
  const pairIds=await fixtureRow.evaluate(row=>[...new Set([...row.querySelectorAll('a[href^="#profile/"]')]
    .map(a=>Number(a.getAttribute('href').split('/')[1])))]);
  assert.equal(pairIds.length,2,'The fixture row links two wrestlers: '+JSON.stringify(pairIds));
  const sourceDetails=await (await page.request.get('http://127.0.0.1:8765/data/sumo/preview-details.json')).json();
  const banzuke=[...sourceDetails.banzuke.Makuuchi.data.east,...sourceDetails.banzuke.Makuuchi.data.west];
  const currentFor=id=>{
    const row=banzuke.find(x=>Number(x.rikishiID)===id);
    assert.ok(Array.isArray(row?.record),'Current-basho source record for '+id);
    const summary=recordSummary(row.record,'Makuuchi');
    return summary.win+'–'+summary.loss;
  };
  const careerFor=id=>{
    const profile=research.profiles?.[String(id)];
    assert.ok(Number.isSafeInteger(profile?.careerWins)&&Number.isSafeInteger(profile?.careerLosses),'Sourced career W–L for '+id);
    return profile.careerWins+'–'+profile.careerLosses;
  };
  const shown=await fixtureRow.locator('.bout-stats>div').evaluateAll(divs=>
    Object.fromEntries(divs.map(div=>[div.querySelector('dt')?.textContent?.trim(),
      [div.querySelector('dd.l')?.textContent?.trim(),div.querySelector('dd.r')?.textContent?.trim()]])));
  assert.deepEqual(shown['This basho'],pairIds.map(currentFor),
    'This-basho records match the source banzuke records, without invented non-bout losses');
  assert.deepEqual(shown['Career'],pairIds.map(careerFor),'Career W–L matches the sourced career totals');
  assert.ok(shown['Build']?.length===2&&shown['Build'].every(text=>/^\d+′\d+″ · \d+ kg$/.test(text)),
    'Build shows feet and inches and weight for both wrestlers: '+JSON.stringify(shown['Build']));
  const nameFit=await fixtureRow.locator('.bout-name').evaluateAll(nodes=>nodes.map(el=>({scroll:el.scrollWidth,width:el.clientWidth})));
  assert.ok(nameFit.every(x=>x.scroll<=x.width+4),'No clipped wrestler names: '+JSON.stringify(nameFit));
  const pageWidth=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(pageWidth.scroll<=pageWidth.viewport+6,'Matchups page has no horizontal overflow');
  await snap(page,label+'-day10-fixture',{fullPage:false});
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
  // SUMO_QA_ONLY=laptop1280 (or a comma list of labels) runs just those viewports, for quick local runs.
  const only=(process.env.SUMO_QA_ONLY||'').split(',').filter(Boolean);
  const want=label=>!only.length||only.includes(label);
  if(want('desktop'))await testSite({width:1440,height:900},false,'desktop',true);
  if(want('laptop1280'))await testSite({width:1280,height:900},false,'laptop1280',false);
  if(want('tablet'))await testSite({width:768,height:1024},false,'tablet',false);
  if(want('mobile'))await testSite({width:390,height:844},true,'mobile',true);
  if(want('reflow320'))await testSite({width:320,height:740},true,'reflow320',false);
  if(failures.length)throw new Error(failures.join('\n'));
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'pass',browser:browser.version(),viewportResults,screenshotCount,views:['home','rikishi','profiles','banzuke','basho','matchups','kimarite','headtohead'],viewportWidths:[1440,1280,768,390,320],realTouchTest:false},null,2));
  console.log('Sumo editorial browser QA passed: 1440/1280/768/390/320, five key wrestlers, H2H chronology, charts and no JS exceptions. Real-device touch remains separate.');
} catch(error) {
  await writeFile(OUT+'/qa-summary.json',JSON.stringify({status:'fail',browser:browser.version(),viewportResults,screenshotCount,error:String(error.stack||error),failures},null,2));
  throw error;
} finally {
  await browser.close();
}
