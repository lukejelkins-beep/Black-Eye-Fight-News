import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {permissionAllowsCollection,conservativeRobotsAllow,sourceIdentityEvidence,
 corroborateSavedMeasurements,requiresIdentityRecheck,
 parseSumoDbCareerRecord,requiresCareerRecordCrosscheck}
 from '../scripts/sumo-weight-sumodb-collector.mjs';

test('no automated historical collection without documented provider permission',()=>{
 const draft={approvedForAutomatedCollection:false,
  approvalEvidence:'email from administrator 2026-11-15',allowedRequestsPerMinute:3};
 assert.equal(permissionAllowsCollection(draft),false);
 assert.equal(permissionAllowsCollection({...draft,approvedForAutomatedCollection:true,approvalEvidence:null}),false);
 assert.equal(permissionAllowsCollection({...draft,approvedForAutomatedCollection:true,allowedRequestsPerMinute:60}),false);
 assert.equal(permissionAllowsCollection({...draft,approvedForAutomatedCollection:true,allowedRequestsPerMinute:3}),true);
});
test('conservative robots policy rejects blocked SumoDB pages and accepts unrelated exclusions',()=>{
 assert.equal(conservativeRobotsAllow('User-agent: *\nDisallow: /\n'),false);
 assert.equal(conservativeRobotsAllow('User-agent: *\nDisallow: /Rikishi.aspx\n'),false);
 assert.equal(conservativeRobotsAllow('User-agent: BEFNResearchBot\nDisallow: /Rikishi\n'),false);
 assert.equal(conservativeRobotsAllow('User-agent: *\nDisallow: /admin/\n'),true);
 assert.equal(conservativeRobotsAllow('User-agent: *\nDisallow:\n'),true);
 assert.equal(conservativeRobotsAllow('Disallow: /\n'),false);
});

test('historical shikona is accepted only when explicitly present in the sourced ring-name timeline',()=>{
 const wrestler={sourceId:557,shikonaEn:'Izumifuji'};
 const api={data:{profile:{shikonaEn:'Izumifuji'},shikonas:[
  {bashoId:'202203',shikonaEn:'Detachi Takuya'},
  {bashoId:'202405',shikonaEn:'Senshoho Takuya'},
  {bashoId:'202601',shikonaEn:'Izumifuji'}
 ]}};
 const historical='<title>Senshoho Takuya Rikishi Information</title><h2>Senshoho Takuya</h2>';
 const found=sourceIdentityEvidence(historical,wrestler,api);
 assert.equal(found.valid,true);
 assert.equal(found.matchedCurrentName,false);
 assert.equal(found.matchedShikona,'Senshoho Takuya');
 const unrelated=sourceIdentityEvidence('<title>Random Rikishi Information</title>',wrestler,api);
 assert.equal(unrelated.valid,false);
});

test('all 190 SumoDB IDs mapped uniquely with November banzuke evidence for seven previously missing',()=>{
 const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
 const review=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/sumodb-id-review.json',import.meta.url),'utf8'));
 assert.equal(roster.rikishi.length,190);
 assert.equal(roster.count,190);
 const mapped=roster.rikishi.map(x=>x.sumoDbId);
 assert.ok(mapped.every(x=>Number.isSafeInteger(x)&&x>0));
 assert.equal(new Set(mapped).size,190);
 assert.equal(review.remaining,0);
 assert.equal(review.cases.length,7);
 for(const entry of review.cases){
   const wrestler=roster.rikishi.find(x=>x.sourceId===entry.sourceId);
   assert.ok(wrestler,'unrecognised source id '+entry.sourceId);
   assert.equal(entry.sumoDbId,wrestler.sumoDbId);
   assert.equal(entry.rikishi,wrestler.shikonaEn);
   assert.equal(entry.matchedRank,wrestler.currentRank);
   assert.equal(entry.profileEvidenceUrl,
    'https://sumodb.sumogames.de/Rikishi.aspx?r='+wrestler.sumoDbId);
   assert.equal(entry.historicalWeightsCertified,false);
 }
});

test('enforce birth date in profile header to avoid similarly named wrestlers',()=>{
 const wrestler={sourceId:28,shikonaEn:'Ura',birthDate:'1992-06-22T00:00:00Z'};
 const source={data:{profile:{shikonaEn:'Ura'},shikonas:[]}};
 const page='<h1>Ura Kazuki Rikishi Information</h1>'+
   '<div>Birth Date June 22, 1992 (34 years)</div>'+
   '<p>Career Record 400-300</p><p>Ura was beaten by Onosato</p>';
 const ok=sourceIdentityEvidence(page,wrestler,source);
 assert.equal(ok.valid,true);
 assert.equal(ok.birthDateStatus,'match');
 assert.equal(ok.publishedDob,'June 22, 1992');
 const wrong=sourceIdentityEvidence(page.replace('June 22, 1992','June 21, 1992'),wrestler,source);
 assert.equal(wrong.valid,false);
 assert.equal(wrong.birthDateStatus,'mismatch');
 const withoutDate=sourceIdentityEvidence(page.replace('Birth Date June 22, 1992',''),wrestler,source);
 assert.equal(withoutDate.valid,true,'missing DOB remains separately flagged, not misreported as mismatch');
 assert.equal(withoutDate.birthDateStatus,'source-birth-date-missing');
 assert.equal(withoutDate.publishedDob,null);
});
test('source birth date is compared in Japan time for UTC entries at 15:00Z',()=>{
 const wrestler={sourceId:9103,shikonaEn:'Asahifuji',birthDate:'2002-05-16T15:00:00Z'};
 const sample='<h1>Asahifuji Rikishi Information</h1><div>Birth Date May 17, 2002</div>'+
   '<div>Career Record 10-2</div>';
 const check=sourceIdentityEvidence(sample,wrestler,{data:{shikonas:[]}});
 assert.equal(check.expectedDob,'May 17, 2002');
 assert.equal(check.valid,true);
});
test('names appearing only in opponents section never establish a source identity',()=>{
 const w={sourceId:28,shikonaEn:'Ura',birthDate:'1992-06-22T00:00:00Z'};
 const sample='<h1>Unknown Rikishi Profile</h1><p>Birth Date June 22, 1992</p>'+
   '<p>Career Record 4-5</p><p>won against Ura Kazuki in May</p>';
 const check=sourceIdentityEvidence(sample,w,{data:{shikonas:[]}});
 assert.equal(check.valid,false);
});

test('missing DOB still accepts a fully mapped and header-matched rikishi but does not claim DOB verification',()=>{
 const wrestler={sourceId:28,shikonaEn:'Ura',birthDate:'1992-06-22T00:00:00Z'};
 const page='<h1>Ura Kazuki Rikishi Information</h1><p>Career Record 10-2</p>';
 const r=sourceIdentityEvidence(page,wrestler,{data:{profile:{shikonaEn:'Ura'},shikonas:[]}});
 assert.equal(r.valid,true);
 assert.equal(r.birthDateStatus,'source-birth-date-missing');
 assert.equal(r.matchedCurrentName,true);
 assert.equal(r.publishedDob,null);
});

test('second-pass identity QA retains every original dated source weight',()=>{
 const saved=[{bashoId:'202405',weightKg:142.5,heightCm:179},
  {bashoId:'202505',weightKg:144,heightCm:180}];
 const fetched=[{bashoId:'202405',weightKg:142.5,heightCm:179},
  {bashoId:'202505',weightKg:144,heightCm:180},
  {bashoId:'202603',weightKg:147,heightCm:181}];
 const before=structuredClone(saved);
 const result=corroborateSavedMeasurements(saved,fetched);
 assert.deepEqual(result,{ok:true,corroborated:2,issues:[]});
 assert.deepEqual(saved,before,'recheck must never mutate saved evidence');
});
test('second-pass identity QA refuses missing or changed historical source observations',()=>{
 const saved=[{bashoId:'202405',weightKg:142,heightCm:180}];
 assert.equal(corroborateSavedMeasurements(saved,[]).ok,false);
 assert.match(corroborateSavedMeasurements(saved,[
   {bashoId:'202505',weightKg:142,heightCm:180}]).issues[0],/source date absent/);
 assert.match(corroborateSavedMeasurements(saved,[
   {bashoId:'202405',weightKg:143,heightCm:180}]).issues[0],/value differs/);
 assert.match(corroborateSavedMeasurements(saved,[
   {bashoId:'202405',weightKg:142,heightCm:181}]).issues[0],/value differs/);
});
test('reverify only legacy identity evidence, once, after source collection',()=>{
 assert.equal(requiresIdentityRecheck({datedEvidence:[{}]}),true);
 assert.equal(requiresIdentityRecheck({identityEvidence:{valid:true}}),true);
 assert.equal(requiresIdentityRecheck({identityEvidence:{birthDateStatus:'match'}}),false);
 assert.equal(requiresIdentityRecheck({identityEvidence:{birthDateStatus:'source-birth-date-missing'}}),false);
 assert.equal(requiresIdentityRecheck({identityRecheck:{sourceParserVersion:4}}),false);
 assert.equal(requiresIdentityRecheck(null),false);
});

test('parse separately published SumoDB career W-L-A without assuming /N counts all bouts',()=>{
 const html='<h2>Onosato Daiki</h2><p>Career Record 207-73-26/278 (22 basho)</p>'+
  '<div>In Makuuchi 173-63-26/234</div>';
 assert.deepEqual(parseSumoDbCareerRecord(html),{
  wins:207,losses:73,absences:26,providerReportedBoutCount:278
 });
 const thousands='<h2>Test</h2> Career Record 1,207-1,073-140/2,275 (130 basho)';
 assert.equal(parseSumoDbCareerRecord(thousands).wins,1207);
 assert.equal(parseSumoDbCareerRecord(thousands).absences,140);
});
test('unpublished SumoDB absences remain null; no guessing or leaking division record',()=>{
 const withoutAbsences='<p>Career Record 175-189/364</p>';
 const parsed=parseSumoDbCareerRecord(withoutAbsences);
 assert.deepEqual(parsed,{wins:175,losses:189,absences:null,providerReportedBoutCount:364});
 assert.equal(parseSumoDbCareerRecord('<p>In Juryo 22-7-0/29</p>'),null);
 assert.equal(parseSumoDbCareerRecord('Career Record unknown'),null);
});
test('run SumoDB career crosscheck only for unresolved official totals and only once',()=>{
 const missing={blockers:['official-absence-total-unpublished-or-disagree'],
  classification:'needs-source-or-manual-review'};
 const other={blockers:['independent-JSA-historical-ranks-not-compared'],
  classification:'needs-source-or-manual-review'};
 assert.equal(requiresCareerRecordCrosscheck({identityEvidence:{valid:true}},missing),true);
 assert.equal(requiresCareerRecordCrosscheck({careerRecordCrosscheck:{sourceRecordPublished:false}},missing),false);
 assert.equal(requiresCareerRecordCrosscheck({identityEvidence:{valid:true}},other),false);
 assert.equal(requiresCareerRecordCrosscheck({},{
  classification:'candidate-for-strict-audit',blockers:['official-absence-total-unpublished-or-disagree']}),false);
 assert.equal(requiresCareerRecordCrosscheck(null,missing),false);
});
