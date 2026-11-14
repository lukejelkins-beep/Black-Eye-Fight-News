import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {permissionAllowsCollection,conservativeRobotsAllow,sourceIdentityEvidence}
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
