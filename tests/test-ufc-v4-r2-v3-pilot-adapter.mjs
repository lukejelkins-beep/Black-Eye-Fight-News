import test from 'node:test';
import assert from 'node:assert/strict';
import {mountVerifiedCareerPilot} from '../scripts/ufc-v4-r2-v3-pilot-adapter.mjs';
const sha='a'.repeat(40);
const audit={status:'success',scope:'full_cohort',approved:783,passed:true,commitSha:sha,
 certified:1,exceptions:782,certifiedSlugs:['pilot-one']};
const opts={featureEnabled:true,fighterSlug:'pilot-one',audit,expectedCommit:sha,
 verifiedOfficialBoutCount:1,bouts:[{date:'2026-01-01',opponent:'Opponent',event:'UFC 300',result:'win'}]};
function dialog(){
 const host={children:[],append(x){this.children.push(x)}};
 const doc={createElement(){return {dataset:{},innerHTML:'',remove(){}}}};
 return {ownerDocument:doc,host,querySelector(selector){
  if(selector==='[data-befn-r2-career-pilot]')return null;
  if(selector==='.befn-profile-insights[data-befn-profile]')return host;
  return null;
 }};
}
test('opt-in adapter does not mount without explicit flag and exact audit',()=>{
 const d=dialog();
 assert.equal(mountVerifiedCareerPilot(d,{...opts,featureEnabled:false}).mounted,false);
 assert.equal(d.host.children.length,0);
 assert.equal(mountVerifiedCareerPilot(d,{...opts,expectedCommit:'b'.repeat(40)}).mounted,false);
});
test('adapter mounts only into existing V3 profile host with certified full career',()=>{
 const d=dialog();
 assert.equal(mountVerifiedCareerPilot(d,opts).mounted,true);
 assert.equal(d.host.children.length,1);
 assert.match(d.host.children[0].innerHTML,/UFC career history/);
 assert.equal(mountVerifiedCareerPilot({querySelector(){return null}},opts).mounted,false);
});
