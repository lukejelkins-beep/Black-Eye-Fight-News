import test from 'node:test';
import assert from 'node:assert/strict';
import {htmlToPublicText,parseOfficialProfile,parseJsaBashoResults,reconcileJsaBashoResults} from '../scripts/sumo-jsa-public-spotcheck.mjs';
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

test('parse official previous-basho W-L with historical dates and absences',()=>{
 const html=official.replace('</body>',
  '<h2>Tournament Records</h2><div>2026 November West Makushita #18 Nishikigi 2-2 | Day results</div>'+
  '<div>2026 September West Makushita #24 Nishikigi 4-3 | Recorded outcomes</div>'+
  '<div>2026 July East Makushita #21 Nishikigi 4-1-2 | Injury absences</div></body>');
 const v=parseJsaBashoResults(html);
 assert.deepEqual(v.map(x=>[x.bashoId,x.wins,x.losses,x.absences]),
  [['202607',4,1,2],['202609',4,3,null],['202611',2,2,null]]);
});
test('compare prior official tournament W-L without confusing current basho cutoffs',()=>{
 const officialRows=[
  {bashoId:'202605',wins:2,losses:0,absences:null},
  {bashoId:'202609',wins:1,losses:1,absences:null},
  {bashoId:'202611',wins:5,losses:1,absences:null}];
 const ledger={rikishiId:16,stages:{matches:{complete:true}},data:{matches:[
  {bashoId:'202605',division:'Makushita',day:1,winnerId:16},
  {bashoId:'202605',division:'Makushita',day:3,winnerId:16},
  {bashoId:'202609',division:'Makushita',day:1,winnerId:16},
  {bashoId:'202609',division:'Makushita',day:2,winnerId:99},
  {bashoId:'202611',division:'Makushita',day:1,winnerId:99}
 ]}};
 const report=reconcileJsaBashoResults(officialRows,ledger,{monthYear:'November 2026',day:7});
 assert.equal(report.comparedBasho,2);
 assert.equal(report.agreeingBasho,2);
 assert.equal(report.discrepantBasho,0);
 assert.equal(report.excludedCurrentBasho,'202611');
 assert.equal(report.certified,false);
 ledger.data.matches.find(x=>x.bashoId==='202609'&&x.day===2).winnerId=16;
 const drift=reconcileJsaBashoResults(officialRows,ledger,{monthYear:'November 2026',day:7});
 assert.equal(drift.discrepantBasho,1);
 assert.deepEqual(drift.discrepancies.map(x=>x.bashoId),['202609']);
 assert.equal(drift.status,'historical-results-disagree');
});
test('missing source tournaments do not become certification',()=>{
 const out=reconcileJsaBashoResults([{bashoId:'202509',wins:4,losses:3}],null,
    {monthYear:'November 2026',day:8});
 assert.equal(out.comparedBasho,0);
 assert.equal(out.unmatchedOfficialBasho.length,1);
 assert.notEqual(out.status,'historical-tournaments-agree');
 assert.equal(out.certified,false);
});
