/* Regression: supplemental UFC data must not resurrect cancelled / replaced fights. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const event={
 id:'test-ufc',date:day,title:'UFC Test',sport:'mma',promotion:'UFC',
 bouts:[
  {id:'main',section:'main',fighters:['Fighter One','Fighter Two'],division:'Heavyweight'},
  {id:'co',section:'prelims',fighters:['Donte Johnson','Cesar Almeida'],division:'Middleweight'},
  {id:'early',section:'early',fighters:['Alatengheili','Juan Diaz'],division:'Bantamweight'}
 ]
};
const canonical={reviewedAt:day,events:[event]};
const research={schema:1,events:{outdated:{
 org:'ufc',status:'scheduled',slug:'test-ufc',date:day,
 bouts:[
  {id:'match-1',a:'Fighter One',b:'Fighter Two',section:'main'},
  {id:'match-2',a:'Donte Johnson',b:'Cesar Almeida',section:'prelims'},
  {id:'stale-1',a:'Donte Johnson',b:'Baisangur Susurkaev',section:'prelims'},
  {id:'stale-2',a:'Nazim Sadykhov',b:'Jefferson Nascimento',section:'early'}
 ]
}}};
const document={
 hidden:false,
 addEventListener(){},
 getElementById(id){
  return id==='fighter-portrait-registry'?{textContent:'{"fighters":{}}'}:null;
 },
 querySelectorAll(){return []}
};
const sandbox={
 window:{BEFNSport:{get:()=> 'mma'},BEFNFightsUI:{view:'upcoming',promotion:'ufc',query:''}},
 document,URL,Date,Intl,console,location:{hash:'#fights'},setInterval(){},
 requestAnimationFrame(){},AbortSignal,
 fetch:async(url)=>({ok:true,json:async()=>String(url).includes('ufcalendar-card-enhancements')
  ?research:canonical})
};
vm.runInNewContext(fs.readFileSync('assets/local-time.js','utf8'),sandbox);
vm.runInNewContext(fs.readFileSync('assets/upcoming-cards.js','utf8'),sandbox);
(async()=>{
 await sandbox.window.UpcomingCards.load();
 const html=sandbox.window.UpcomingCards.render('mma');
 assert(html.includes('Donte Johnson')&&html.includes('Cesar Almeida'));
 assert(!html.includes('Baisangur Susurkaev'),'Withdrawn opponent must not be added');
 assert(!html.includes('Nazim Sadykhov'),'Cancelled bout must not be resurrected');
 assert(!html.includes('Jefferson Nascimento'),'Cancelled bout must not be resurrected');
 assert(html.includes('3 total'),'Original verified card count is unchanged');
 console.log('Upcoming card merge: cancelled and withdrawn UFC pairings not reintroduced');
})().catch(e=>{console.error(e);process.exitCode=1});
