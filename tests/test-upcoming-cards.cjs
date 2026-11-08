const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync('data/upcoming-cards.json','utf8'));
const script=fs.readFileSync('assets/upcoming-cards.js','utf8');
const docs={addEventListener(){},getElementById(id){
  return id==='fighter-portrait-registry'?{textContent:'{"fighters":{}}'}:null;
}};
const context={
  window:{},document:docs,location:{hash:'#calendar'},setInterval(){},
  Date,URL,AbortSignal,console,
  fetch:async()=>({ok:true,json:async()=>data})
};
vm.runInNewContext(script,context);
(async()=>{
  await context.window.UpcomingCards.load();
  const boxing=context.window.UpcomingCards.render('boxing');
  const mma=context.window.UpcomingCards.render('mma');
  const all=[...data.events];
  assert(all.length>=15,'Expected broad coverage of confirmed upcoming cards');
  assert(all.every(e=>e.bouts.length>0&&e.bouts.every(b=>b.source&&b.division)));
  for(const e of all.filter(e=>e.date>='2026-11-08')){
    assert((e.sport==='boxing'?boxing:mma).includes(e.title),'Missing '+e.title);
  }
  assert(boxing.includes('David Benavidez vs Michał Cieślak'));
  assert(boxing.includes('5 announced fights'),'Complete December 5 PBC main card expected');
  assert(mma.includes('UFC Fight Night: Adesanya vs Magomedov'));
  assert(mma.includes('UFC CONFIRMATION PENDING'),'December 5 UFC must remain provisional');
  assert(mma.includes('9 reported bouts'),'All sourced Riyadh pairings must be labelled as reported, not confirmed');
  assert(!mma.includes('9 announced fights'),'Provisional UFC card must not be called announced');
  const ufc334=all.find(e=>e.id==='ufc-334-2026-11-14');
  assert.equal(ufc334.bouts.length,13,'Official UFC 334 lists 13 bouts including early prelims');
  assert(ufc334.bouts.some(b=>b.section==='early'&&b.fighters.includes('Evan Elder')));
  const sydney=all.find(e=>e.title==='UFC Fight Night: Salkilld vs Saint Denis');
  assert.equal(sydney.date,'2027-02-07','Australian venue-local date must be Sunday February 7');
  assert.equal(sydney.bouts.length,4,'Preserve all four sourced Australian UFC matchups');
  assert(mma.includes('data-upcoming-section="prelims"'));
  assert(mma.includes('data-upcoming-section="announced"'));
  assert(boxing.includes('data-upcoming-section="main"'));
  assert(!boxing.includes('undefined')&&!mma.includes('undefined'));
  console.log('Upcoming calendar coverage, Dec 5 UFC/PBC, Main/Prelims tabs and verification labels passed');
})().catch(e=>{console.error(e);process.exitCode=1});
