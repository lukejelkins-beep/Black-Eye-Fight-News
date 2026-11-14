import test from 'node:test';
import assert from 'node:assert/strict';
import {htmlToPublicText,parseOfficialProfile} from '../scripts/sumo-jsa-public-spotcheck.mjs';
const w={sourceId:16,officialNskId:2892,shikonaEn:'Nishikigi',
 currentRank:'Makushita 2 East',heya:'Isenoumi',heightCm:186,weightKg:184};
const official=String.raw`<!doctype html><html><head><script>fake injection</script></head><body>
<h2>Rikishi Profile</h2><h3>Basic Information</h3>
<div>Nishikigi Tetsuya</div><table>
<tr><th>Stable</th><td>Isenoumi</td></tr>
<tr><th>Name</th><td>Tetsuya Kumagai</td></tr>
<tr><th>Current Rank</th><td>Makushita #2</td></tr>
<tr><th>Height</th><td>186.0cm</td></tr>
<tr><th>Weight</th><td>184.0kg</td></tr>
</table><div>Career Record: <span>677-716-2</span></div>
<p>as of November 2026:Day 7</p></body></html>`;
test('parse official profile basic fields, no photos or certificates',()=>{
 const v=parseOfficialProfile(official,w);
 assert.equal(v.status,'basic-fields-parsed');
 assert.equal(v.profileName,'Nishikigi Tetsuya');
 assert.equal(v.stable,'Isenoumi');
 assert.deepEqual(v.rank,{division:'Makushita',position:2});
 assert.deepEqual(v.career,{wins:677,losses:716,absences:2});
 assert.deepEqual(v.officialAsOf,{monthYear:'November 2026',day:7});
 assert.equal(v.heightCm,186);
 assert.equal(v.weightKg,184);
 assert.equal(v.certification,'not-started');
 assert.equal(v.fieldComparisons.rankGrade,true);
 assert.equal(v.url,'https://www.sumo.or.jp/EnSumoDataRikishi/profile/2892/');
});
test('do not accept the wrong rikishi as a verified field snapshot',()=>{
 const wrong=official.replace('Nishikigi Tetsuya','Another Rikishi');
 const v=parseOfficialProfile(wrong,w);
 assert.equal(v.status,'identity-review');
 assert.equal(v.fieldComparisons.name,false);
});
test('missing records become review cases, never fabricated data',()=>{
 const v=parseOfficialProfile(official.replace('Career Record: <span>677-716-2</span>',''),w);
 assert.equal(v.status,'parse-review');
 assert.equal(v.career,null);
});
test('source drift in height or stable is reviewable without silently overwriting cache',()=>{
 const v=parseOfficialProfile(official.replace('184.0kg','199.0kg'),w);
 assert.equal(v.status,'field-disagreement');
 assert.equal(v.fieldComparisons.weight,false);
 assert.equal(v.weightKg,199);
});
test('public-text extractor strips scripts, tags and decodes entities',()=>{
 assert.ok(!htmlToPublicText(official).includes('fake injection'));
 assert.equal(htmlToPublicText('<div>A&nbsp;&amp;&nbsp;B</div>'),'A & B');
});

test('official Ozeki rank omits numeric side; grade is checked but position stays null',()=>{
 const source=official.replace('Makushita #2','Ozeki');
 const w2={...w,currentRank:'Ozeki 2 East'};
 const result=parseOfficialProfile(source,w2);
 assert.equal(result.status,'basic-fields-parsed');
 assert.deepEqual(result.rank,{division:'Ozeki',position:null});
 assert.equal(result.fieldComparisons.rankGrade,true);
 assert.equal(result.certification,'not-started');
});
