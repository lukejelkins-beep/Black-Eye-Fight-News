import test from 'node:test';
import assert from 'node:assert/strict';
import {permissionAllowsCollection,conservativeRobotsAllow}
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
