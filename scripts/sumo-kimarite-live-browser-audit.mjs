import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';
const url='https://befn-sumo-preview.onrender.com/sumo.html?audit=20261117-v4#kimarite';
const results=[];
for(const [name,engine,options] of [['chromium-iphone',chromium,devices['iPhone 13']],['webkit-iphone',webkit,devices['iPhone 13']]]){
  let browser;
  try{
    browser=await engine.launch({headless:true});
    const context=await browser.newContext({...options,serviceWorkers:'block'});
    const page=await context.newPage();
    const responses=[];
    page.on('response',response=>{
      if(response.url().includes('sumo-kimarite/jsa/')) responses.push({url:response.url(),status:response.status(),type:response.headers()['content-type']});
    });
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#sumo-km-results .sumo-km-tile img').first().waitFor({timeout:40000});
    await page.locator('#sumo-km-results .sumo-km-tile').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    const images=await page.locator('#sumo-km-results .sumo-km-tile img').evaluateAll(els=>els.slice(0,7).map(img=>{
      const style=getComputedStyle(img);const rect=img.getBoundingClientRect();
      return {src:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
      display:style.display,visibility:style.visibility,opacity:style.opacity,width:rect.width,height:rect.height,
      objectFit:style.objectFit};
    }));
    fs.mkdirSync('qa/sumo-previews',{recursive:true});
    await page.screenshot({path:'qa/sumo-previews/kimarite-live-'+name+'.png',fullPage:false});
    const row={name,images,requests:responses.slice(0,10),errors:errors.slice(0,5)};
    results.push(row);
    console.log('BROWSER-AUDIT '+JSON.stringify(row));
    if(images.slice(0,3).some(x=>x.naturalWidth<100||x.width<50||x.height<50))process.exitCode=1;
    await context.close();
  }catch(e){console.error('BROWSER-ERROR '+name+' '+e.stack);results.push({name,error:String(e)});process.exitCode=1}
  finally{await browser?.close()}
}
fs.writeFileSync('qa/sumo-previews/kimarite-live-image-report.json',JSON.stringify(results,null,2));
