const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={window:{},URL};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/news-dedupe.js'),'utf8'),context);
const unique=context.window.BEFNNewsUnique;
const article=(title,id,extra={})=>({title,url:`https://publisher.example/${id}`,
  sport:'mma',publishedAt:'2026-11-14T00:00:00Z',...extra});
function separate(left,right){
  const a=article(left,'a'),b=article(right,'b');
  assert.equal(unique([a,b]).length,2);
  assert.equal(unique([b,a]).length,2);
}

test('confirmed and reported contract agreements stay separate',()=>{
  separate('Mike Perry re-signs with UFC','Mike Perry reportedly re-signs with UFC');
});
test('contracts with different named promotions stay separate',()=>{
  separate('Mike Perry re-signs with UFC','Mike Perry re-signs with PFL');
});
test('signing and later booking stay separate',()=>{
  separate('Mike Perry re-signs with UFC','Mike Perry re-signs with UFC and booked to face Robbie Lawler');
});
test('booking matcher cannot discard different editorial stages',()=>{
  const confirmed='Alistair Overeem vs. Jimi Manuwa added to Paul vs. Doumbe fight card';
  for(const word of ['reportedly','possibly'])separate(confirmed,confirmed.replace('added to',`${word} added to`));
});
test('known contract rewrites still group and prefer complete source',()=>{
  const a=article('UFC announcer Jon Anik signs long-term contract extension','a');
  const b=article('JON ANIK SIGNS MULTI-YEAR EXTENSION TO CONTINUE ROLE ON UFC BROADCAST TEAM','b',
    {image:{url:'https://publisher.example/anik.jpg'},summaryPoints:['one','two','three']});
  assert.equal(unique([a,b]).length,1);
  assert.equal(unique([a,b])[0].url,b.url);
});
test('Python-preferred Perry story remains present alongside distinct news',()=>{
  const preferred=article('Mike Perry re-signs with UFC','perry',
    {image:{url:'https://publisher.example/perry.jpg'},summaryPoints:['one','two','three']});
  const other=article('Brandon Royval is UFC 336 backup for Van vs. Kape title fight','royval');
  const output=unique([preferred,other]);
  assert.equal(output.length,2);
  assert.equal(output.find(a=>a.url===preferred.url),preferred);
});
