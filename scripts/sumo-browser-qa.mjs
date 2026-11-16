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
  await open(page,'home','.sumo-overview-lede');
  const home=await page.locator('#sumo-main').innerText();
  assertContains(home,'Sumo','Sumo home context');
  assertContains(home,'results','latest results priority');
  assertContains(home,'five leaders','home leaders');
  assert.ok(await page.locator('.sumo-home-grid').count()===1,'Results and leaders appear in first dashboard');
  assert.equal(await page.locator('.sumo-home-leaders .sumo-standings-row').count(),5,'Homepage shows exactly five leaders');
  for(const division of ['Makuuchi','Juryo','Makushita']){
    await page.locator('[data-home-leader-division="'+division+'"]').click();
    assert.equal(await page.locator('[data-home-leader-division="'+division+'"]').getAttribute('aria-pressed'),'true',
      'Selected '+division+' leader tab is accessible');
    assert.equal(await page.locator('.sumo-home-leaders .sumo-leader-card').count(),5,
      'Exactly five source-ranked leaders for '+division);
    assert.equal(await page.locator('.sumo-leader-card .sumo-leader-vitals').count(),5,'Height and weight in all '+division+' cards');
    assert.equal(await page.locator('.sumo-leader-card .sumo-leader-career').count(),5,'Recorded career W-L in all '+division+' cards');
    assert.equal(await page.locator('.sumo-leader-card .sumo-leader-last').count(),5,'Latest completed result details in all '+division+' cards');
    const proportions=await page.locator('.sumo-leader-card').first().evaluate(card=>{
      const image=card.querySelector('.profile-icon.sumo-photo');
      return {cardWidth:card.getBoundingClientRect().width,photoWidth:image?.getBoundingClientRect().width,
        photoHeight:image?.getBoundingClientRect().height,cardHeight:card.getBoundingClientRect().height};
    });
    assert.ok(proportions.photoWidth>=proportions.cardWidth*.40,'Leader portrait dominates left edge '+JSON.stringify(proportions));
    assert.ok(proportions.photoHeight>=proportions.cardHeight-3,'Portrait fills the height '+JSON.stringify(proportions));
    const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(widths.page<=widths.viewport+6,'No mobile horizontal overflow after '+division+' toggle: '+JSON.stringify(widths));
  }
  await page.locator('[data-home-leader-division="Makuuchi"]').click();
  await page.locator('.sumo-home-leaders').screenshot({path:OUT+'/'+label+'-top-five.png',animations:'disabled'});
  screenshotCount++;
  if(isMobile){
    const nav=await page.evaluate(()=>{
      const links=[...document.querySelector('.subnav-inner').children]
        .filter(el=>getComputedStyle(el).display!=='none');
      return links.map(el=>({label:el.innerText.trim(),
        client:el.clientWidth,scroll:el.scrollWidth,
        left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
    });
    assert.equal(nav.length,4,'Mobile navigation has four unambiguous destinations');
    assert.ok(nav.every((item,i)=>item.scroll<=item.client+2&&
      (i===0||item.left>=nav[i-1].right-2)),
      'No overlapping or clipped mobile navigation text: '+JSON.stringify(nav));
  }
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
  if(viewport.width<=650){
    const imageFirst=await page.evaluate(()=>{
      const hero=document.querySelector('.profile-hero');
      const photo=hero.querySelector(':scope>.profile-icon.sumo-photo.xl');
      const heading=hero.querySelector(':scope>.profile-title');
      const photoRect=photo.getBoundingClientRect(),titleRect=heading.getBoundingClientRect(),heroRect=hero.getBoundingClientRect();
      const img=photo.querySelector('img');
      return {photoTop:photoRect.top,titleTop:titleRect.top,
        photoWidth:photoRect.width,heroWidth:heroRect.width,
        photoHeight:photoRect.height,objectPosition:img?getComputedStyle(img).objectPosition:null};
    });
    assert.ok(imageFirst.photoTop<imageFirst.titleTop,'Photo precedes name on mobile: '+JSON.stringify(imageFirst));
    assert.ok(imageFirst.photoWidth>=imageFirst.heroWidth-3,'Photo fills mobile hero width: '+JSON.stringify(imageFirst));
    assert.ok(imageFirst.photoHeight<=306,'Portrait bounded and not excessively tall: '+JSON.stringify(imageFirst));
    assert.ok(!imageFirst.objectPosition||/\\btop\\b|0%$/.test(imageFirst.objectPosition),'Portrait preserves top of head: '+JSON.stringify(imageFirst));
  }else{
    assert.ok(heroMeasurements.headingTop<heroMeasurements.viewport/2,
      'Desktop/tablet profile name appears high in first screen: '+JSON.stringify(heroMeasurements));
  }
  assert.ok(heroMeasurements.imageHeight<=(isMobile?321:521),
    'Approved portrait is bounded rather than full-page: '+JSON.stringify(heroMeasurements));
  assertContains(profile,'Yokozuna','rank');
  assertContains(profile,'Winning techniques','techniques');
  assertContains(profile,'Results','canonical results');
  assertContains(profile,'Career','career section');
  const careerTiles=page.locator('#sumo-career .sumo-career-strip>div');
  assert.equal(await careerTiles.count(),2,'Career summary has exactly Basho and Makuuchi Championships');
  assert.deepEqual(await careerTiles.locator('span').allInnerTexts(),['Basho','Makuuchi Championships'],
    'Two clear, nonduplicative labels');
  assert.deepEqual(await careerTiles.locator('strong').allInnerTexts(),['22','6'],
    'Onosato source-listed Basho 22 and Makuuchi titles 6');
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
  assertContains(profile,'Career results: independently corroborated','career evidence is labelled separately');
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
  assert.ok(!unfeatured.includes('API-TRUSTED'),'Technical badge removed on nonfeatured profiles');
  await page.waitForSelector('.sumo-rival',{timeout:25000});
  assert.ok(await page.locator('.sumo-rival').count()>0,'Unfeatured rikishi has complete opponent library');
  assert.equal(await page.locator('.sumo-signature h3').count(),0,'No speculative signature manoeuvres on unsourced profiles');
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
  const rankSource=await (await page.request.get('http://127.0.0.1:8765/data/sumo/preview-details.json')).json();
  const assertRankedHeadToHeads=async division=>{
    const rows=[...(rankSource.banzuke?.[division]?.data?.east||[]),
      ...(rankSource.banzuke?.[division]?.data?.west||[])].sort((a,b)=>
      (Number(a.rankValue)||99999)-(Number(b.rankValue)||99999)||
      (a.side==='East'?-1:1));
    const positions=new Map(rows.map((row,i)=>[Number(row.rikishiID),i]));
    const ranks=await page.locator('.sumo-daily-card').evaluateAll(cards=>cards.map(card=>
      [...card.querySelectorAll('.sumo-daily-facts a[href^="#profile/"]')]
        .map(a=>Number(a.getAttribute('href').split('/')[1]))));
    assert.ok(ranks.length>0,'Head-to-head cards exist for '+division);
    const highs=ranks.map(pair=>Math.min(...pair.map(id=>positions.get(id)??99999)));
    assert.deepEqual(highs,[...highs].sort((a,b)=>a-b),'Matchups descend from top of '+division+' banzuke');
  };
  await open(page,'matchups','.sumo-daily-page');
  await page.locator('#sumo-matchup-day').selectOption('1');
  assert.ok(await page.locator('.sumo-daily-card').count()>0,'Makuuchi Day 1 verified cards rendered');
  await assertRankedHeadToHeads('Makuuchi');
  const firstCard=page.locator('.sumo-daily-card').first();
  assert.equal(await firstCard.locator('.sumo-daily-facts').count(),2,'Both wrestler stat columns are present');
  assert.equal(await firstCard.locator('.sumo-daily-photo').count(),2,'Portraits occupy both edges');
  assert.equal(await firstCard.locator('.sumo-comparison-row').count(),7,'Shared comparison includes the seven requested source-backed statistics');
  assert.equal(await firstCard.locator('.sumo-daily-facts>.sumo-flag-backdrop').count(),2,'Birthplace flags are decorative backgrounds behind both identities');
  assert.match(await firstCard.locator('.sumo-comparison-row').first().innerText(),/\d+′\d+″/,'Sourced centimetres are displayed as feet and inches');
  const data=await firstCard.innerText();
  for(const label of ['Current basho W–L','Career W–L','Career win %','Makuuchi W–L','Makuuchi win %','Height','Weight','Peak:']){
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
    const scopedLabels=await page.locator('.sumo-daily-card').first().locator('.sumo-comparison-row>span').allInnerTexts();
    assert.ok(scopedLabels.includes(division+' W–L')&&scopedLabels.includes(division+' win %'),
      'Comparison labels follow the active bout division: '+division);
    assert.ok(!scopedLabels.includes('Makuuchi W–L'),'Other division career record is not shown');
    await assertRankedHeadToHeads(division);
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
    await page.waitForFunction(name=>document.querySelector('.profile-hero h1')?.textContent?.trim()===name,
      w.shikonaEn,{timeout:15000});
    const headingText=await page.locator('.profile-hero h1').innerText();
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
  await page.waitForSelector('.profile-hero h1');
  assert.equal(await page.locator('#sumo-period').inputValue(),'current');

  for(const route of ['kimarite','banzuke','basho','rikishi','home']){
    if(isMobile && (route==='kimarite'||route==='banzuke')){
      const menu=page.locator('.sumo-mobile-more');
      if(await menu.getAttribute('open')===null)await menu.locator('summary').press('Enter');
      await menu.locator('[data-page="'+route+'"]').press('Enter');
      await page.waitForURL('**#'+route);
      await menu.locator('summary').press('Enter');
    }else{
      await page.locator('.subnav-inner>[data-page="'+route+'"]').press('Enter');
      await page.waitForURL('**#'+route);
    }
    const active=page.locator('.subnav [data-page="'+route+'"][aria-current="page"]').first();
    assert.equal(await active.getAttribute('aria-current'),'page','Destination is announced as current');
  }
  // The Nov 2026 Day 10 Tokihayate–Daiseizan card is the design acceptance fixture.
  await open(page,'matchups','#sumo-main');
  await page.locator('#sumo-matchup-day').selectOption('10');
  await page.waitForTimeout(100);
  const screenshotFixture=page.locator('.sumo-daily-card')
    .filter({hasText:'Tokihayate'}).filter({hasText:'Daiseizan'}).first();
  assert.ok(await screenshotFixture.count()>0,'The sourced Tokihayate–Daiseizan Day 10 matchup is present');
  const identities=screenshotFixture.locator('.sumo-daily-facts');
  assert.equal(await identities.count(),2);
  const flags=screenshotFixture.locator('.sumo-daily-facts>.sumo-flag-backdrop');
  assert.equal(await flags.count(),2,'Full-panel flags for both source countries');
  const flagImages=await flags.evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el,'::before').backgroundImage));
  assert.ok(flagImages.some(url=>url.includes('/jp.png')),'Japanese flag backdrop');
  assert.ok(flagImages.some(url=>url.includes('/cn.png')),'Chinese flag backdrop');
  const overlay=await identities.first().evaluate(el=>getComputedStyle(el,'::after').background);
  assert.ok(overlay.includes('rgba('),'Light cream overlay protects text contrast');
  const comparison=await screenshotFixture.locator('.sumo-comparison').innerText();
  for(const expected of ['179 cm (5′10″)','191 cm (6′3″)','135 kg','171 kg',
    'Current basho W–L','Career W–L','Career win %','Makuuchi W–L','Makuuchi win %'])
    assertContains(comparison,expected,'Daily card comparisons');
  // Compare the visible pair with the actual November 2026 source snapshots.
  const sourceDetails=await (await page.request.get('http://127.0.0.1:8765/data/sumo/preview-details.json')).json();
  const divisionCache=await (await page.request.get('http://127.0.0.1:8765/data/sumo/division-stats.json')).json();
  const banzuke=[...sourceDetails.banzuke.Makuuchi.data.east,...sourceDetails.banzuke.Makuuchi.data.west];
  const currentFor=id=>{
    const row=banzuke.find(x=>Number(x.rikishiID)===id);
    assert.ok(Array.isArray(row?.record),'Current-basho source record for '+id);
    const summary=recordSummary(row.record,'Makuuchi');
    return summary.win+'–'+summary.loss;
  };
  const historicalFor=id=>{
    const row=divisionCache.bySourceId[String(id)];
    assert.equal(row?.status,'available','Division-specific source data for '+id);
    const wins=row.stats.winsByDivision?.Makuuchi,losses=row.stats.lossByDivision?.Makuuchi;
    assert.ok(Number.isSafeInteger(wins)&&Number.isSafeInteger(losses),'Sourced Makuuchi W-L for '+id);
    return {wl:wins+'–'+losses,pct:(100*wins/(wins+losses)).toFixed(1)+'%'};
  };
  const comparisonRows=await screenshotFixture.locator('.sumo-comparison-row').evaluateAll(nodes=>
    Object.fromEntries(nodes.map(row=>[row.querySelector('span')?.textContent?.trim(),
      [...row.querySelectorAll('strong')].map(el=>el.textContent.trim())])));
  const headingNames=await screenshotFixture.locator('.sumo-comparison-head>span').allInnerTexts();
  const pairIds=[headingNames[0],headingNames[2]].map(name=>{
    if(name==='Tokihayate')return 83;
    if(name==='Daiseizan')return 378;
    throw new Error('Unexpected wrestler identity in source matchup: '+name);
  });
  assert.deepEqual(comparisonRows['Current basho W–L'],pairIds.map(currentFor),
    'Current W-L matches source banzuke records, without invented non-bout losses');
  assert.deepEqual(comparisonRows['Makuuchi W–L'],pairIds.map(id=>historicalFor(id).wl),
    'Career Makuuchi W-L matches the division-specific source');
  assert.deepEqual(comparisonRows['Makuuchi win %'],pairIds.map(id=>historicalFor(id).pct),
    'Makuuchi percentages use only historical Makuuchi wins and losses');
  const textFlow=await identities.evaluateAll(panels=>panels.map(panel=>{
    const els=[...panel.querySelectorAll('h2,.sumo-daily-origin,.sumo-daily-ranks')];
    const rects=els.map(el=>el.getBoundingClientRect());
    return rects.every((r,i)=>r.width>0&&r.right<=panel.getBoundingClientRect().right+2&&
      (i===0||r.top>=rects[i-1].bottom-1));
  }));
  assert.ok(textFlow.every(Boolean),'Names, birthplace and ranks do not overlap or clip');
  const wrapping=await screenshotFixture.locator('.sumo-daily-facts h2')
    .evaluateAll(nodes=>nodes.map(el=>({scroll:el.scrollWidth,width:el.clientWidth})));
  assert.ok(wrapping.every(x=>x.scroll<=x.width+4),'No clipped wrestler names');
  const pageWidth=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(pageWidth.scroll<=pageWidth.viewport+6,'Matchups page has no horizontal overflow');
  await snap(page,label+'-tokihayate-daiseizan',{fullPage:false});
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
