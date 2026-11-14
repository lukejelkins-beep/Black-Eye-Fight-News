import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyAttestedFullCareers} from '../scripts/certify-ufc-v4-independent-full-careers.mjs';
const target='maryna-moroz';
function fixture(){
 const approvedFighters=[target,...Array.from({length:782},(_,i)=>'athlete-'+i)];
 const approval={status:'approved',rosterAsOf:'2026-11-14',approvedFighters};
 const research={profiles:{[target]:{name:'Maryna Moroz',recentHistory:[{
  promotion:'UFC',source:'native',date:'2024-03-09',opponent:'Joanne Wood',
  result:'loss',boutId:'60915'
 }]}}};
 const progress={bouts:{'60915':{
  org:'ufc',event:'UFC 299: Original Title',eventDate:'2024-03-09',status:'completed',
  result:{winnerId:'2'},
  a:{id:'1113',slug:target,name:'Maryna Moroz'},
  b:{id:'2',slug:'joanne-wood',name:'Joanne Wood'}
 }}};
 const postfight={fighters:{[target]:{careerBouts:[{boutId:'60915',cageSec:900,
  metrics:{sigLanded:12,sigAttempted:30,knockdowns:0,takedowns:0,
   takedownAttempts:2,subAttempts:0,controlSec:0}}]}}};
 const base={schema:1,scope:'ufc-independent-full-career-verification',
   rosterAsOf:'2026-11-14',fighters:{}};
 const row={date:'2024-03-09',nativeSavedDate:'2024-03-09',nativeBoutId:'60915',
   opponent:'Joanne Wood',result:'loss',
   fightUrl:'https://ufcstats.com/fight-details/3677ce6c1ee06a83',
   nativeEventTitle:'UFC 299: Previous Advertised Title'};
 const batch={schema:1,scope:'ufc-v4-manual-independent-career-certification-batch',
   rosterAsOf:'2026-11-14',nonproduction:true,fighters:{[target]:{
     fighterName:'Maryna Moroz',fighterUrl:'https://ufcstats.com/fighter-details/b4192a975027aab6',
     ufcOfficialSourceUrl:'https://www.ufc.com/athlete/maryna-moroz',
     sourceCoverageAttested:true,verificationMethod:'full_official_ufc_fight_listing_crosscheck',
     verifiedAt:'2026-11-14',sourceScopeVerified:'exhaustive fighter history independently checked',
     completeOfficialUfcCareerCount:1,uniqueNativeFighterId:'1113',bouts:[row],dateDiscrepancies:[]
   }}};
 return {approval,research,progress,postfight,base,batch};
}
test('certifies exact independent full career despite a changed event display title',()=>{
 const f=fixture();
 const result=certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch);
 assert.equal(result.report.certifiedCount,1);
 assert.equal(result.registry.fighters[target].sourceCoverageAttested,true);
 assert.equal(result.registry.fighters[target].bouts[0].date,'2024-03-09');
 assert.equal(result.report.certifiedFighters[0].displayTitlesNonBlocking,true);
});
test('rejects native fight identity conflict, regardless of display title',()=>{
 const f=fixture();f.progress.bouts['60915'].a.id='55555';
 assert.throws(()=>certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch),/numeric_fighter_identity_mismatch/);
});
test('rejects wrongly classified feeder competition',()=>{
 const f=fixture();f.progress.bouts['60915'].event="Dana White's Contender Series";
 assert.throws(()=>certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch),/not_eligible_official_ufc_bout/);
});
test('rejects missing measured full career core statistics',()=>{
 const f=fixture();delete f.postfight.fighters[target].careerBouts[0].metrics.controlSec;
 assert.throws(()=>certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch),/required_statistics_missing/);
});
test('allows documented one-day UTC/local date shift and rejects undocumented shift',()=>{
 const f=fixture(),entry=f.batch.fighters[target],b=entry.bouts[0];
 b.date='2024-03-08';
 assert.throws(()=>certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch),/undocumented_time_zone_shift/);
 entry.dateDiscrepancies=[{boutId:'60915',officialLocalDate:b.date,nativeSavedDate:b.nativeSavedDate}];
 const verified=certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch);
 assert.equal(verified.report.certifiedFighters[0].dateOffsets,1);
});
test('rejects missing independently linked source fight',()=>{
 const f=fixture();f.batch.fighters[target].bouts[0].fightUrl='';
 assert.throws(()=>certifyAttestedFullCareers(f.approval,f.research,f.progress,f.postfight,f.base,f.batch),/invalid_duplicate_source_link/);
});
