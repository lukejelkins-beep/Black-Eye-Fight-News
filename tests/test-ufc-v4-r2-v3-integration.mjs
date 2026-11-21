import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../assets/fighter-insights.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('V3 integrates optional R2 pilot without enabling it by default',()=>{
 assert.match(code,/window\.BEFN_UFC_R2_PILOT/);
 assert.match(code,/pilot\?\.featureEnabled===true/);
 assert.match(code,/pilot\.fighterSlug===active\.id/);
 assert.match(code,/mountVerifiedCareerPilot\(dialog,pilot\)/);
 assert.doesNotMatch(html,/BEFN_UFC_R2_PILOT\s*=/);
 assert.doesNotMatch(html,/ufc-v4-r2-v3-pilot-adapter\.mjs/);
});
test('V3 remains the source of fighter dialog and never equates review to Stage 3',()=>{
 assert.match(code,/\.befn-profile-insights\[data-befn-profile\]/);
 assert.match(code,/pilot\?\.audit&&pilot\?\.expectedCommit/);
});
