import test from 'node:test';
import assert from 'node:assert/strict';
import {renderVerifiedCareerPanel} from '../scripts/ufc-v4-r2-career-panel.mjs';
const sha='a'.repeat(40);
const audit={status:'success',scope:'full_cohort',approved:783,passed:true,commitSha:sha,
  certified:1,exceptions:782,certifiedSlugs:['pilot-one']};
const bouts=[
  {date:'2026-01-10',opponent:'Fighter <Two>',event:'UFC Fight Night',result:'win',method:'Submission',round:2},
  {date:'2024-01-10',opponent:'Fighter Three',event:'UFC 300',result:'no_contest'}
];
const render=overrides=>renderVerifiedCareerPanel({featureEnabled:true,fighterSlug:'pilot-one',
  audit,expectedCommit:sha,bouts,verifiedOfficialBoutCount:2,...overrides});
test('no panel or leaked data unless flag and exact audit pass',()=>{
  assert.equal(render({featureEnabled:false}).html,'');
  assert.equal(render({expectedCommit:'b'.repeat(40)}).visible,false);
  assert.equal(render({fighterSlug:'uncertified'}).visible,false);
  assert.equal(render({duplicateIdentitySlugs:['pilot-one']}).visible,false);
});
test('render complete ordered history with accessible table and escaped source text',()=>{
  const r=render();
  assert.equal(r.visible,true);
  assert.match(r.html,/aria-label="Verified UFC career"/);
  assert.match(r.html,/Fighter &lt;Two&gt;/);
  assert.doesNotMatch(r.html,/Fighter <Two>/);
  assert.match(r.html,/no contest/);
  assert.match(r.html,/Unavailable/);
  assert.ok(r.html.indexOf('2026-01-10')<r.html.indexOf('2024-01-10'));
});
test('fail closed on missing, malformed or duplicate career rows',()=>{
  assert.equal(render({bouts:[]}).reason,'incomplete_official_history');
  assert.equal(render({verifiedOfficialBoutCount:3}).reason,'incomplete_official_history');
  assert.equal(render({verifiedOfficialBoutCount:null}).visible,false);
  assert.equal(render({bouts:[{...bouts[0],event:''},bouts[1]]}).reason,'invalid_bout_data');
  assert.equal(render({bouts:[bouts[0],bouts[0]]}).reason,'duplicate_bouts');
  assert.equal(render({bouts:[{...bouts[0],date:'2026-02-30'},bouts[1]]}).reason,'invalid_bout_data');
  assert.equal(render({bouts:[{...bouts[0],date:'2099-01-01'},bouts[1]]}).reason,'invalid_bout_data');
  assert.equal(render({bouts:[{...bouts[0],round:0},bouts[1]]}).reason,'invalid_bout_data');
  assert.equal(render({bouts:[{...bouts[0],method:{bad:true}},bouts[1]]}).reason,'invalid_bout_data');
});
