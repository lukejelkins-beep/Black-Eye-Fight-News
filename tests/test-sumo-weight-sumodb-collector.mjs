import test from 'node:test';
import assert from 'node:assert/strict';
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
