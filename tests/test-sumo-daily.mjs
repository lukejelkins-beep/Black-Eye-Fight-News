import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {originCountry,recordSummary} from '../assets/sumo-data.mjs';
import { knownNonnegativeInt,dailyWinPercentage,heightFeetInches,dailyStats,dailyRecentMeetings,dailyDefaultDay,dailySelectedDate } from '../assets/sumo-daily.mjs';

test('career and Makuuchi win percentages are scoped to respective known win/loss pairs',()=>{
  assert.equal(dailyWinPercentage(7,3),'70.0%');
  assert.equal(dailyWinPercentage(0,5),'0.0%');
  assert.equal(dailyWinPercentage(1,2),'33.3%');
  assert.equal(dailyWinPercentage(0,0),null);
  for(const invalid of [null,undefined,NaN,-1,'4',4.5,Infinity]){
    assert.equal(knownNonnegativeInt(invalid),false);
    assert.equal(dailyWinPercentage(invalid,2),null);
  }
  const rows=Object.fromEntries(dailyStats({
    currentRank:'Yokozuna 1 East',highestRank:'Yokozuna',
    heightCm:192,weightKg:181,currentBashoWins:8,currentBashoLosses:1,careerWins:120,careerLosses:30,
    makuuchiWins:24,makuuchiLosses:16,makushitaWins:11,makushitaLosses:3
  }));
  assert.equal(rows['Career wins'],'120');
  assert.equal(rows['Career losses'],'30');
  assert.equal(rows['Career win %'],'80.0%');
  assert.equal(rows['Makuuchi wins'],'24');
  assert.equal(rows['Makuuchi losses'],'16');
  assert.equal(rows['Makuuchi win %'],'60.0%');
  assert.equal(rows.Height,'192 cm (6′4″)');
  assert.equal(rows['Current basho wins'],'8');
  assert.equal(rows['Current basho losses'],'1');
  assert.equal(rows['Makushita wins'],'11');
  assert.equal(rows['Makushita losses'],'3');
  assert.equal(rows['Makushita win %'],'78.6%');
  assert.equal(rows.Weight,'181 kg');
  assert.equal(rows['Highest rank'],'Yokozuna');
});
test('missing source values are never substituted with zeros or computed percentages',()=>{
  const rows=Object.fromEntries(dailyStats({careerWins:17,careerLosses:null,makuuchiWins:0,makuuchiLosses:0}));
  assert.equal(rows['Career losses'],'Not available');
  assert.equal(rows['Career win %'],'Not available');
  assert.equal(rows['Makuuchi win %'],'Not available');
  assert.equal(rows['Makuuchi wins'],'0');
  assert.equal(rows.Height,'Not available');
  assert.equal(rows['Current basho wins'],'Not available');
  assert.equal(rows['Makushita win %'],'Not available');
  assert.equal(heightFeetInches(179),'5′10″');
  assert.equal(heightFeetInches(191),'6′3″');
  assert.equal(heightFeetInches(null),'Not available');
  assert.equal(heightFeetInches(-1),'Not available');
  assert.equal(heightFeetInches(0),'Not available');
  assert.equal(rows.Weight,'Not available');
});
test('recent five are real source rows, preserve order, winner, kimarite, and no fabricated extras',()=>{
  const rows=Array.from({length:7},(_,i)=>({
    bashoId:'202611',day:15-i,winnerId:i%2?2:1,kimarite:i===1?null:i===2?'fusen':'yorikiri'
  }));
  rows.push({bashoId:'202611',day:10,winnerId:9,kimarite:'oshidashi'});
  const meetings=dailyRecentMeetings({rows},1,2);
  assert.equal(meetings.length,5);
  assert.deepEqual(meetings.map(x=>x.day),[15,14,13,12,11]);
  assert.equal(meetings[0].winnerId,1);
  assert.equal(meetings[1].winnerId,2);
  assert.equal(meetings[1].kimarite,null);
  assert.equal(meetings[2].kimarite,'fusen');
  assert.deepEqual(dailyRecentMeetings(null,1,2),[]);
  assert.equal(dailyRecentMeetings({rows:[]},1,2).length,0);
});
test('daily date and selection respect Japan tournament day, do not infer an event',()=>{
  assert.equal(dailyDefaultDay({today:9,lastCompleted:9,announced:10,hasAnnounced:true}),10);
  assert.equal(dailyDefaultDay({today:9,lastCompleted:9,announced:10,hasAnnounced:false}),9);
  assert.equal(dailyDefaultDay({today:9,lastCompleted:9,announced:8,hasAnnounced:true}),9);
  assert.equal(dailyDefaultDay({lastCompleted:8,announced:9,hasAnnounced:true}),9);
  assert.equal(dailyDefaultDay({lastCompleted:8,announced:9,hasAnnounced:false}),8);
  assert.equal(dailyDefaultDay({today:19,lastCompleted:0}),1);
  assert.equal(dailySelectedDate('2026-11-08',9),'2026-11-16');
  assert.equal(dailySelectedDate('2026-11-08',16),null);
  assert.equal(dailySelectedDate('not-a-date',9),null);
});

test('centimetre height is retained with nearest whole imperial inch',()=>{
  assert.equal(heightFeetInches(179),'5′10″');
  assert.equal(heightFeetInches(191),'6′3″');
  assert.equal(heightFeetInches(182.88),'6′0″');
  for(const invalid of [null,undefined,-1,0,NaN])assert.equal(heightFeetInches(invalid),'Not available');
  const rows=Object.fromEntries(dailyStats({heightCm:179,weightKg:135}));
  assert.equal(rows.Height,'179 cm (5′10″)');
  assert.equal(rows.Weight,'135 kg');
});

test('historical Makushita values are sourced division-specific pairs, never inferred',()=>{
  const facts=Object.fromEntries(dailyStats({
    careerWins:300,careerLosses:220,makushitaWins:84,makushitaLosses:28,
    currentBashoWins:8,currentBashoLosses:1
  }));
  assert.equal(facts['Makushita wins'],'84');
  assert.equal(facts['Makushita losses'],'28');
  assert.equal(facts['Makushita win %'],'75.0%');
  assert.equal(facts['Current basho wins'],'8');
  assert.equal(facts['Current basho losses'],'1');
  const missing=Object.fromEntries(dailyStats({careerWins:300,careerLosses:220,makushitaWins:84}));
  assert.equal(missing['Makushita losses'],'Not available');
  assert.equal(missing['Makushita win %'],'Not available');
});

test('Makushita non-bout days do not count as wins, losses or assumed absences',()=>{
  const result=recordSummary([
    {result:'win'},{result:'absent'},{result:'loss'},
    {result:'absent'},{result:'pending'},{result:'win'}
  ],'Makushita');
  assert.equal(result.win,2);
  assert.equal(result.loss,1);
  assert.equal(result.noBout,2);
  assert.equal(result.absence,null);
});

test('Tokihayate and Daiseizan use actual source roster measures and birthplace-country mappings',()=>{
  const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
  const first=roster.rikishi.find(w=>w.shikonaEn==='Tokihayate');
  const second=roster.rikishi.find(w=>w.shikonaEn==='Daiseizan');
  assert.ok(first&&second);
  assert.equal(first.heightCm,179);assert.equal(first.weightKg,135);
  assert.equal(second.heightCm,191);assert.equal(second.weightKg,171);
  assert.equal(originCountry(first.birthplace)?.code,'JP');
  assert.equal(originCountry(second.birthplace)?.code,'CN');
  assert.equal(originCountry('Unknown location'),null);
  const rowsA=Object.fromEntries(dailyStats({heightCm:first.heightCm,weightKg:first.weightKg}));
  const rowsB=Object.fromEntries(dailyStats({heightCm:second.heightCm,weightKg:second.weightKg}));
  assert.equal(rowsA.Height,'179 cm (5′10″)');
  assert.equal(rowsB.Height,'191 cm (6′3″)');
});

test('full-panel flag overlays preserve readability and historical statistics field mapping',()=>{
  const css=readFileSync(new URL('../assets/sumo-daily.css',import.meta.url),'utf8');
  const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  assert.match(css,/\.sumo-daily-facts>\.sumo-flag-backdrop\s*\{[^}]*inset:0/s);
  assert.match(css,/\.sumo-daily-facts::after\s*\{[^}]*rgba\(255,253,247,\.83\)/s);
  assert.match(css,/\.sumo-daily-facts-content\s*\{[^}]*z-index:2/s);
  assert.match(js,/--sumo-flag-url:url\(https:\/\/flagcdn\.com\/w640\//);
  assert.match(js,/makushitaWins:stats\?\.winsByDivision\?\.Makushita/);
  assert.match(js,/makushitaLosses:stats\?\.lossByDivision\?\.Makushita/);
  assert.doesNotMatch(js,/\['Height',f=>pair\(f,'Height'\)\+\(/);
});
