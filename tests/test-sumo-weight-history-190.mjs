import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSumoDbDatedMeasurements,reconcileWeightHistory,
 summarizeWeightCoverage} from '../scripts/sumo-weight-history-190.mjs';

const uraUrl='https://sumodb.sumogames.de/Rikishi.aspx?r=12226';
const dated=(bashoId,heightCm,weightKg)=>({bashoId,heightCm,weightKg,sourceUrl:uraUrl});
test('extract only dated SumoDB row measurements; do not read undated header weight',()=>{
 const html='<html><div>Height and Weight 175 cm 143 kg</div><table>'+
 '<tr><td>2015.03</td><td>Mz</td><td>172 cm 113 kg</td></tr>'+
 '<tr><td>2021.03</td><td>J7e</td><td>175 cm 136 kg</td></tr>'+
 '<tr><td>2022.05</td><td>M6e</td><td>173 cm 148 kg</td></tr>'+
 '<tr><td>2022.07</td><td>M3w</td><td>7-8</td></tr>'+
 '<tr><td>2025.05</td><td>M5e</td><td>175 cm 139 kg</td></tr>'+
 '</table></html>';
 assert.deepEqual(parseSumoDbDatedMeasurements(html),[
 {bashoId:'201503',heightCm:172,weightKg:113},
 {bashoId:'202103',heightCm:175,weightKg:136},
 {bashoId:'202205',heightCm:173,weightKg:148},
 {bashoId:'202505',heightCm:175,weightKg:139}
 ]);
});
test('ignore headers, false dates, and unreasonably large or small measurements',()=>{
 const h='<tr><td>Height and Weight 175 cm 143 kg</td></tr>'+
 '<tr><td>2024.05</td><td>169 cm 440 kg</td></tr>'+
 '<tr><td>2025.02</td><td>175 cm 142 kg</td></tr>'+
 '<tr><td>2025.05</td><td>175 cm 142 kg</td><td>2025.07</td></tr>';
 assert.deepEqual(parseSumoDbDatedMeasurements(h),[]);
});
test('Ura known independent six points reconcile with two API records, preserving four new dates',()=>{
 const api=[
 {bashoId:'201503',height:172,weight:113},
 {bashoId:'202103',height:175,weight:136}];
 const independent=[
 dated('201503',172,113),dated('202103',175,136),
 dated('202205',173,148),dated('202305',175,143),
 dated('202405',175,142),dated('202505',175,139)];
 const c=reconcileWeightHistory(api,independent,12226);
 assert.equal(c.apiDatedPoints,2);
 assert.equal(c.independentDatedPoints,6);
 assert.equal(c.matchingOverlaps,2);
 assert.deepEqual(c.additional.map(x=>x.bashoId),['202205','202305','202405','202505']);
 assert.equal(c.conflictingOverlaps.length,0);
 assert.equal(c.displayableAdditionalPoints,0);
});
test('conflicts are preserved, never automatically overwritten or classified as extra',()=>{
 const result=reconcileWeightHistory([{bashoId:'202505',weight:139,height:175}],
  [dated('202505',175,141)],12226);
 assert.equal(result.additionalDatedPoints,0);
 assert.equal(result.conflictingOverlaps.length,1);
 assert.equal(result.apiDatedPoints,1);
 assert.throws(()=>reconcileWeightHistory([],[dated('202505',175,139)],999),/identity mismatch/);
 assert.throws(()=>reconcileWeightHistory([],[dated('202505',175,139),dated('202505',175,140)],12226),/Repeated/);
});
test('190 source files are required and unverified rikishi are not certified',()=>{
 const roster={count:190,rikishi:Array.from({length:190},(_,i)=>({
  sourceId:i+1,shikonaEn:'Rikishi'+(i+1),sumoDbId:i<183?i+100:null}))};
 const api=new Map(roster.rikishi.map(r=>[r.sourceId,{data:{measurements:[{bashoId:'202505',weight:130,height:175}]}}]));
 const report=summarizeWeightCoverage(roster,api,new Map());
 assert.equal(report.rawApiWeightEntries,190);
 assert.equal(report.mappedSumoDbRikishi,183);
 assert.equal(report.unmappedSumoDbRikishi.length,7);
 assert.equal(report.awaitingIndependentResearch,190);
 assert.equal(report.publishedAdditionalPoints,0);
 assert.equal(report.certifiedWeightHistories,0);
 api.delete(5);
 assert.throws(()=>summarizeWeightCoverage(roster,api,new Map()),/Missing cached API weights/);
});

test('report distinguishes DOB-checked and older unverified historical weight evidence',()=>{
 const roster={count:190,rikishi:Array.from({length:190},(_,i)=>({
  sourceId:i+1,shikonaEn:'Rikishi'+(i+1),sumoDbId:i+200}))};
 const api=new Map(roster.rikishi.map(x=>[x.sourceId,{data:{
  measurements:[{bashoId:'202505',weight:142,height:180}]}}]));
 const extra=new Map([
  [1,{sourceId:1,sumoDbId:200,identityEvidence:{birthDateStatus:'match'},
   datedEvidence:[{bashoId:'202505',heightCm:180,weightKg:142,
     sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=200'}]}],
  [2,{sourceId:2,sumoDbId:201,datedEvidence:[{bashoId:'202505',heightCm:180,weightKg:142,
     sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=201'}]}]
 ]);
 const report=summarizeWeightCoverage(roster,api,extra);
 assert.equal(report.checkedIndependentRikishi,2);
 assert.equal(report.independentIdentityBirthDateVerified,1);
 assert.equal(report.independentIdentityBirthDatePending,1);
 assert.equal(report.independentIdentityBirthDateMismatch,0);
 assert.equal(report.entries.find(x=>x.sourceId===2).independentSourceBirthDateStatus,
  'prior-check-needs-birthdate-proof');
 assert.equal(report.certifiedWeightHistories,0);
});

test('legacy DOB recheck strengthens identity coverage without increasing historical weight dots',()=>{
 const roster={count:190,rikishi:Array.from({length:190},(_,i)=>({
  sourceId:i+1,shikonaEn:'Wrestler '+i,sumoDbId:500+i}))};
 const apis=new Map(roster.rikishi.map(x=>[x.sourceId,{data:{
  measurements:[{bashoId:'202405',weight:143,height:180}]}}]));
 const saved={sourceId:1,sumoDbId:500,datedEvidence:[{
  bashoId:'202405',weightKg:143,heightCm:180,
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=500'}],
  identityRecheck:{originalEvidencePreserved:true,unchangedSavedMeasurements:1,
   identityEvidence:{valid:true,birthDateStatus:'match'}}};
 const report=summarizeWeightCoverage(roster,apis,new Map([[1,saved]]));
 assert.equal(report.independentDatedPoints,1);
 assert.equal(report.additionalDatedPoints,0);
 assert.equal(report.historicalSourceIdentityRechecks,1);
 assert.equal(report.corroboratedLegacyWeightObservations,1);
 assert.equal(report.independentIdentityBirthDateVerified,1);
 assert.equal(report.independentIdentityBirthDatePending,0);
 assert.equal(report.entries[0].sourceIdentityRechecked,true);
 assert.equal(report.entries[0].weightTimelineCertified,false);
});
