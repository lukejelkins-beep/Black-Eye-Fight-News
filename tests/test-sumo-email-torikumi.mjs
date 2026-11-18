import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTorikumiEmail,emailBoutsToJsaRows,nameKey,jsaTorikumiUrl} from '../assets/sumo-email-torikumi.mjs';
import {jsaToTorikumiSource} from '../assets/sumo-jsa.mjs';
import {announcedTorikumiMatches} from '../assets/sumo-data.mjs';
import {applyEmails,splitInboxFile} from '../scripts/sumo-email-torikumi.mjs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const FIXTURE=read('./fixtures/email-torikumi-202611-day11.txt');
const roster=JSON.parse(read('../data/sumo/rikishi-index.json')).rikishi;
const jsa=JSON.parse(read('../data/sumo/jsa-torikumi.json'));
const email=()=>splitInboxFile(FIXTURE);
const edit=fn=>({...email(),body:fn(email().body)});

test('a well-formed email parses into all three divisions',()=>{
  const e=parseTorikumiEmail(email());
  assert.equal(e.bashoId,'202611');assert.equal(e.day,11);
  assert.deepEqual(Object.keys(e.divisions),['Makuuchi','Juryo','Makushita']);
  assert.equal(e.divisions.Makuuchi.bouts.length,21);
  assert.deepEqual(e.divisions.Makuuchi.bouts[0],{east:{name:'Tokihayate',record:'3-7'},west:{name:'Arashifuji',record:'6-4'}});
  assert.equal(e.divisions.Juryo.source,'https://www.sumo.or.jp/EnHonbashoMain/torikumi/2/11/');
});

test('email rows give the same wrestlers, sides and order as the JSA page itself',()=>{
  const e=parseTorikumiEmail(email());
  for(const division of ['Makuuchi','Juryo','Makushita']){
    const {rows}=emailBoutsToJsaRows({division,bouts:e.divisions[division].bouts,roster});
    const page=jsa.pages[division]['11'].rows;
    const ids=rs=>rs.map(r=>[r.east.nskId,r.west.nskId]);
    // Makushita: wrestlers outside the tracked roster are null on the email side and dropped in conversion.
    const tracked=new Set(roster.map(r=>Number(r.officialNskId)));
    const expected=ids(page).map(([a,b])=>[tracked.has(a)?a:null,tracked.has(b)?b:null]);
    assert.deepEqual(ids(rows),expected,division);
    const fromEmail=jsaToTorikumiSource({rows,roster,bashoId:'202611',division,day:11});
    const fromJsa=jsaToTorikumiSource({rows:page,roster,bashoId:'202611',division,day:11});
    assert.deepEqual(fromEmail.source.torikumi.map(t=>[t.eastId,t.westId]),fromJsa.source.torikumi.map(t=>[t.eastId,t.westId]),division);
    assert.equal(announcedTorikumiMatches(fromEmail.source,{bashoId:'202611',division,day:11}).length,fromJsa.source.torikumi.length);
  }
});

test('only the JSA torikumi page for that division and day is accepted as a source',()=>{
  for(const bad of ['https://sumo-guide.com/schedule-of-torikumi','https://www.sumo.or.jp/EnHonbashoMain/torikumi/1/12/',
    'https://www.sumo.or.jp/EnHonbashoMain/torikumi/2/11/','http://www.sumo.or.jp/EnHonbashoMain/torikumi/1/11/','']){
    assert.throws(()=>parseTorikumiEmail(edit(b=>b.replace(jsaTorikumiUrl('Makuuchi',11),bad))),/source|SOURCE|unrecognised/,bad);
  }
  assert.throws(()=>parseTorikumiEmail(edit(b=>b.replace(/^SOURCE: .*\/1\/11\/\n/m,''))),/SOURCE/);
});

test('subject, header and layout are strict',()=>{
  assert.throws(()=>parseTorikumiEmail({...email(),subject:'Kyushu Basho 2026 — Day 11 Makuuchi Matchups'}),/subject/);
  assert.throws(()=>parseTorikumiEmail({...email(),subject:'BEFN torikumi 202611 day 12'}),/do not match/);
  assert.throws(()=>parseTorikumiEmail({...email(),subject:'BEFN torikumi 202611 day 16'}),/out of range/);
  assert.throws(()=>parseTorikumiEmail(edit(b=>b.replace('BASHO: 202611','BASHO: 202609'))),/do not match/);
  assert.throws(()=>parseTorikumiEmail(edit(b=>b.replace('DIVISION: Juryo','DIVISION: Sandanme'))),/unknown division/);
  assert.throws(()=>parseTorikumiEmail(edit(b=>b.replace('2. Toshinofuji','3. Toshinofuji'))),/numbered/);
  assert.throws(()=>parseTorikumiEmail(edit(b=>b+'Schedule source: somewhere else\n')),/unrecognised/);
  assert.throws(()=>parseTorikumiEmail(edit(b=>b.replace('Arashifuji (6-4)','Tokihayate (6-4)'))),/more than one bout/);
  assert.throws(()=>parseTorikumiEmail(edit(b=>b+'DIVISION: Makuuchi\n')),/twice/);
});

test('names match the roster without case or diacritics, and unknown top-division names reject',()=>{
  assert.equal(nameKey('Ōnosato'),nameKey('ONOSATO'));
  const e=parseTorikumiEmail(edit(b=>b.replace('Tokihayate','tokihayate')));
  assert.equal(emailBoutsToJsaRows({division:'Makuuchi',bouts:e.divisions.Makuuchi.bouts,roster}).rows[0].east.name,'Tokihayate');
  const bad=parseTorikumiEmail(edit(b=>b.replace('Tokihayate','Tokihayat')));
  assert.throws(()=>emailBoutsToJsaRows({division:'Makuuchi',bouts:bad.divisions.Makuuchi.bouts,roster}),/not in the tracked roster: Tokihayat/);
});

const blank={schemaVersion:1,bashoId:'202611',pages:{}};
const file=(name,text=FIXTURE)=>({name,text});

test('applying an email fills empty days and marks them as relayed by email',()=>{
  const {next,report}=applyEmails({files:[file('202611-day11-1.txt')],previous:blank,bashoId:'202611',roster,now:'2026-11-18T05:00:00Z'});
  assert.equal(next.pages.Makuuchi['11'].via,'email');
  assert.equal(next.pages.Makuuchi['11'].source,jsaTorikumiUrl('Makuuchi',11));
  assert.equal(next.pages.Makuuchi['11'].rows.length,21);
  assert.deepEqual(report.map(r=>r.status),['applied','applied','applied']);
  const again=applyEmails({files:[file('202611-day11-1.txt')],previous:next,bashoId:'202611',roster,now:'later'});
  assert.deepEqual(again.next,next,'re-applying the same email changes nothing');
});

test('fail closed: rejected, foreign-basho or partial emails change nothing',()=>{
  const bad=FIXTURE.replace('Tokihayate','Nobody Known');
  const r1=applyEmails({files:[file('a.txt',bad)],previous:blank,bashoId:'202611',roster});
  assert.deepEqual(r1.next,blank);assert.equal(r1.report[0].status,'rejected');
  const r2=applyEmails({files:[file('a.txt',FIXTURE.replace(/202611/g,'202609'))],previous:blank,bashoId:'202611',roster});
  assert.deepEqual(r2.next,blank);assert.equal(r2.report[0].status,'skipped');
  const r3=applyEmails({files:[file('a.txt','no subject line')],previous:blank,bashoId:'202611',roster});
  assert.deepEqual(r3.next,blank);assert.equal(r3.report[0].status,'rejected');
});

test('a page collected by the JSA scraper is never overwritten by an email',()=>{
  const {next,report}=applyEmails({files:[file('a.txt')],previous:jsa,bashoId:'202611',roster});
  assert.deepEqual(next.pages.Makuuchi['11'],jsa.pages.Makuuchi['11']);
  assert.ok(report.every(r=>r.status==='kept'));
});
