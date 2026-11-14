import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditParkDoubleNative} from '../scripts/audit-ufc-park-two-native-ids.mjs';
const load=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=load('data/ufc-36-month-roster-approval.json');
const official=load('data/ufc-official-career-bout-inventory.json');
const src=load('data/ufc-three-pilot-source-linked-evidence.json');
const record=(id,parkId,brunoId)=>({id,org:'ufc',
 eventDate:'2025-10-18',event:'UFC Vancouver: De Ridder vs Allen',status:'completed',
 a:{name:'Bruno Silva',id:brunoId},b:{name:'HyunSung Park',id:parkId},
 result:{winnerId:brunoId}});
const history={profiles:{'park-hyun-sung':{recentHistory:[
 {boutId:'38150',result:'loss',promotion:'ufc'},
 {boutId:'83254',result:'loss',promotion:'ufc'}]},
 'bruno-gustavo-da-silva':{recentHistory:[{boutId:'83254',result:'win',promotion:'ufc'}]}}};
test('source linked same date/athlete/result with distinct numeric corners remains research only',()=>{
 const out=auditParkDoubleNative(approval,official,src,{bouts:{
 '38150':record('38150','146','158'),
 '83254':record('83254','102972','87')}},history);
 assert.equal(out.matchedSameOfficialEventOpponentOutcome,true);
 assert.equal(out.cases.length,2);
 assert.equal(out.nativeCacheChanges,0);
 assert.equal(out.fullCareerCertificationsIssued,0);
 assert.equal(out.cases[0].parkId,'146');
 assert.equal(out.cases[1].parkId,'102972');
});
test('opposite winner or wrong event date cannot prove a duplicate',()=>{
 const bad=record('83254','102972','87');bad.result.winnerId='102972';
 let o=auditParkDoubleNative(approval,official,src,{bouts:{'38150':record('38150','146','158'),'83254':bad}},history);
 assert.equal(o.matchedSameOfficialEventOpponentOutcome,false);
 bad.result.winnerId='87';bad.eventDate='2025-11-01';
 o=auditParkDoubleNative(approval,official,src,{bouts:{'38150':record('38150','146','158'),'83254':bad}},history);
 assert.equal(o.matchedSameOfficialEventOpponentOutcome,false);
});
test('no approval or altered source chronology can silently establish a match',()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 const fake=clone(src);fake.fighters['park-hyun-sung'].bouts.find(x=>x.date==='2025-10-18').fightUrl='https://wrong.example/fight';
 assert.throws(()=>auditParkDoubleNative(approval,official,fake,{},history),/Exact independent/);
 assert.throws(()=>auditParkDoubleNative({...approval,approvedFighters:[]},official,src,{},history),/Approved source/);
});
