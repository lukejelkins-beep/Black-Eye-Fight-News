import test from 'node:test';
import assert from 'node:assert/strict';
import {htmlToPublicText,parseOfficialProfile,parseJsaBashoResults,reconcileJsaBashoResults,cohortCurrentBasho,parseJsaBashoRanks,reconcileJsaBashoRanks,officialSpotcheckPriority,compareJsaListedMeasurement,requiresJsaRankRecheck,summarizeJsaRankCoverage} from '../scripts/sumo-jsa-public-spotcheck.mjs';
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

test('official JSA two-part career totals retain unknown absences as null',()=>{
 const html=official.replace('677-716-2','624-630');
 const actual=parseOfficialProfile(html,w);
 assert.equal(actual.status,'basic-fields-parsed');
 assert.deepEqual(actual.career,{wins:624,losses:630,absences:null});
 assert.equal(actual.careerAbsencesPublished,false);
 assert.equal(actual.parserVersion,4);
});
test('three-part JSA career record retains reported absences including zero',()=>{
 const result=parseOfficialProfile(official.replace('677-716-2','677-716-0'),w);
 assert.deepEqual(result.career,{wins:677,losses:716,absences:0});
 assert.equal(result.careerAbsencesPublished,true);
});
test('official career records with thousands separators parse as numbers',()=>{
 const result=parseOfficialProfile(official.replace('677-716-2','1,244-1,029'),w);
 assert.deepEqual(result.career,{wins:1244,losses:1029,absences:null});
 assert.equal(result.status,'basic-fields-parsed');
});

test('cohort snapshot exclusion without JSA as-of prevents counting ongoing November tournament',()=>{
 const matchSource={rikishiId:16,stages:{matches:{complete:true}},data:{matches:[
  {bashoId:'202609',division:'Makushita',day:2,winnerId:16},
  {bashoId:'202611',division:'Makushita',day:2,winnerId:2}
 ]}};
 const rows=[{bashoId:'202609',wins:1,losses:0},
  {bashoId:'202611',wins:3,losses:1}];
 const cohortBasho=cohortCurrentBasho({collectedAt:'2026-10-31T15:05:00Z'});
 assert.equal(cohortBasho,'202611','Japan time is Nov 1, not Oct 31');
 const report=reconcileJsaBashoResults(rows,matchSource,null,cohortBasho);
 assert.equal(report.comparedBasho,1);
 assert.equal(report.agreeingBasho,1);
 assert.equal(report.discrepantBasho,0);
 assert.equal(report.excludedCurrentBasho,'202611');
 assert.equal(report.currentBashoExclusionEvidence,'frozen-cohort-basho');
 assert.equal(report.certified,false);
});
test('without JSA as-of or cohort hint, exclude latest source tournament conservatively',()=>{
 const source={rikishiId:16,stages:{matches:{complete:true}},data:{matches:[
  {bashoId:'202605',division:'Makushita',day:1,winnerId:16},
  {bashoId:'202609',division:'Makushita',day:1,winnerId:2}
 ]}};
 const rows=[{bashoId:'202605',wins:1,losses:0},
  {bashoId:'202609',wins:2,losses:0}];
 const report=reconcileJsaBashoResults(rows,source,null);
 assert.equal(report.comparedBasho,1);
 assert.equal(report.discrepantBasho,0);
 assert.equal(report.excludedCurrentBasho,'202609');
 assert.equal(report.currentBashoExclusionEvidence,'conservative-latest-source-basho');
 assert.equal(report.certified,false);
});
test('official dated current tournament takes precedence over fallback frozen cohort date',()=>{
 const rows=[{bashoId:'202607',wins:3,losses:4},
  {bashoId:'202609',wins:2,losses:5}];
 const empty={rikishiId:16,stages:{matches:{complete:true}},data:{matches:[]}};
 const r=reconcileJsaBashoResults(rows,empty,{monthYear:'September 2026',day:7},'202611');
 assert.equal(r.excludedCurrentBasho,'202609');
 assert.equal(r.currentBashoExclusionEvidence,'official-as-of');
 assert.deepEqual(r.unmatchedOfficialBasho,['202607']);
});

test('JSA per-basho rank parser respects tournament dates and does not use current profile banner',()=>{
 const html=official.replace('</body>',
  '<h2>Tournament Records</h2>'+
  '<div>2026 November East Makushita #41 Ikawasakura Ryota 2-1</div>'+
  '<div>2026 September East Sandanme #1 Kanpuzan Ryota 5-2</div>'+
  '<div>2026 July West Ozeki Wrestler 3-4</div>'+
  '<div>2026 May West Jonidan #88 Wrestler 4-3</div></body>');
 const rows=parseJsaBashoRanks(html);
 assert.deepEqual(rows.map(x=>[x.bashoId,x.rank]),[
  ['202605','Jonidan 88 West'],['202607','Ozeki West'],
  ['202609','Sandanme 1 East'],['202611','Makushita 41 East']]);
 assert.equal(rows.find(x=>x.bashoId==='202607').position,null);
 assert.equal(rows.length,4);
});
test('JSA ranks compare source banzuke exactly where numbered and preserve disagreement review',()=>{
 const rows=[
  {bashoId:'202609',division:'Sandanme',side:'East',position:1,rank:'Sandanme 1 East'},
  {bashoId:'202611',division:'Makushita',side:'East',position:41,rank:'Makushita 41 East'},
  {bashoId:'202607',division:'Ozeki',side:'West',position:null,rank:'Ozeki West'}
 ];
 const cached={data:{ranks:[
  {bashoId:'202607',rank:'Ozeki 2 West'},
  {bashoId:'202609',rank:'Sandanme 1 East'},
  {bashoId:'202611',rank:'Makushita 40 East'}
 ]}};
 const report=reconcileJsaBashoRanks(rows,cached);
 assert.equal(report.comparedBasho,3);
 assert.equal(report.agreedBasho,2);
 assert.deepEqual(report.mismatches.map(x=>x.bashoId),['202611']);
 assert.equal(report.certification,'not-started');
});
test('missing source rank cannot be silently counted as an agreement or career certificate',()=>{
 const rows=[{bashoId:'202509',division:'Juryo',side:'East',position:8,rank:'Juryo 8 East'}];
 const out=reconcileJsaBashoRanks(rows,{data:{ranks:[]}});
 assert.equal(out.comparedBasho,0);
 assert.deepEqual(out.missingSourceRankBasho,['202509']);
 assert.equal(out.certification,'not-started');
});

test('prioritise current top-division JSA official profile checks without repeating cached snapshots',()=>{
 const rows=[
  {sourceId:8001,currentRank:'Juryo 2 East'},
  {sourceId:8002,currentRank:'Makushita 2 West'},
  {sourceId:8003,currentRank:'Maegashira 5 West'},
  {sourceId:8004,currentRank:'Yokozuna 1 East'},
  {sourceId:8005,currentRank:'Ozeki 1 West'},
  {sourceId:8006,currentRank:'Maegashira 2 East'},
  {sourceId:242,currentRank:'Makushita 50 East'},
  {sourceId:82,currentRank:'Maegashira 1 East'},
 ];
 const ordered=rows.sort(officialSpotcheckPriority).map(x=>x.sourceId);
 assert.deepEqual(ordered,[242,82,8004,8005,8006,8003,8001,8002]);
 assert.equal(officialSpotcheckPriority(
  {sourceId:1,currentRank:'Juryo 1 East'},
  {sourceId:2,currentRank:'Juryo 1 West'})<0,true);
});

test('numeric JSA display precision versus decimal API retains source differences',()=>{
 assert.deepEqual(compareJsaListedMeasurement(192,191.5),{
  match:true,method:'integer-display-rounding-compatible',published:192,api:191.5});
 assert.equal(compareJsaListedMeasurement(162,161.6).match,true);
 assert.equal(compareJsaListedMeasurement(160,160.1).match,true);
 assert.equal(compareJsaListedMeasurement(152,152.3).match,true);
 assert.deepEqual(compareJsaListedMeasurement(173,172),{
  match:false,method:'disagreement',published:173,api:172});
 assert.equal(compareJsaListedMeasurement(null,172).match,null);
 assert.equal(compareJsaListedMeasurement(172,null).match,null);
 assert.equal(compareJsaListedMeasurement(171,171).method,'exact');
});
test('official public profile reports rounding compatibility without modifying decimal API measurement',()=>{
 const api={...w,heightCm:191.5,weightKg:161.6};
 const html=official.replace('186.0cm','192cm').replace('184.0kg','162kg');
 const p=parseOfficialProfile(html,api);
 assert.equal(p.status,'basic-fields-parsed');
 assert.equal(p.fieldComparisons.height,true);
 assert.equal(p.fieldComparisons.weight,true);
 assert.equal(p.measurementComparisonDetails.height.method,'integer-display-rounding-compatible');
 assert.equal(p.measurementComparisonDetails.weight.method,'integer-display-rounding-compatible');
 assert.equal(api.heightCm,191.5);
 assert.equal(api.weightKg,161.6);
 assert.equal(p.historicMeasurementsChanged,false);
});

test('older JSA snapshots are checked once for missing dated historical ranks',()=>{
 const legacy={sourceId:28,officialNskId:3616,
  parserVersion:4,status:'basic-fields-parsed',
  career:{wins:432,losses:331,absences:96}};
 assert.equal(requiresJsaRankRecheck(legacy),true);
 assert.equal(requiresJsaRankRecheck({...legacy,
  rankReconciliation:{comparedBasho:59,mismatches:[]}}),false);
 assert.equal(requiresJsaRankRecheck({...legacy,
  rankRecheck:{parserVersion:1,status:'dated-official-ranks-not-parseable'}}),false);
 assert.equal(requiresJsaRankRecheck({...legacy,sourceId:null}),false);
 assert.equal(requiresJsaRankRecheck(null),false);
});

test('scheduled rank rechecks continue only until every legacy page is checked once',()=>{
 const docs=[
  {sourceId:7,officialNskId:3601,parserVersion:3,career:{wins:1}},
  {sourceId:28,officialNskId:3616,parserVersion:3,career:{wins:1}},
  {sourceId:2,officialNskId:3682,parserVersion:4,
   rankReconciliation:{comparedBasho:54,mismatches:[]}},
  {sourceId:8850,officialNskId:5100,parserVersion:4,
   rankRecheck:{status:'dated-official-ranks-not-parseable'},
   rankReconciliation:{comparedBasho:0,mismatches:[]}}
 ];
 assert.deepEqual(summarizeJsaRankCoverage(docs),{
  historicalRankRechecksOutstanding:2,
  historicalRankProfilesCompared:1,
  historicalRankRowsCompared:54,
  historicalRankManualReview:1
 });
 const completed=docs.map(x=>requiresJsaRankRecheck(x)?{
  ...x,rankReconciliation:{comparedBasho:40,mismatches:[]},
  rankRecheck:{status:'source-ranks-compared'}
 }:x);
 const coverage=summarizeJsaRankCoverage(completed);
 assert.equal(coverage.historicalRankRechecksOutstanding,0);
 assert.equal(coverage.historicalRankProfilesCompared,3);
 assert.equal(coverage.historicalRankRowsCompared,134);
 assert.equal(coverage.historicalRankManualReview,1);
 assert.equal(summarizeJsaRankCoverage([null,{}]).historicalRankRechecksOutstanding,0);
});
