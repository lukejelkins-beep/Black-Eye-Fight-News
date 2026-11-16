import test from 'node:test';
import assert from 'node:assert/strict';
import { knownNonnegativeInt,dailyWinPercentage,dailyStats,dailyRecentMeetings,dailyDefaultDay,dailySelectedDate } from '../assets/sumo-daily.mjs';

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
    heightCm:192,weightKg:181,careerWins:120,careerLosses:30,
    makuuchiWins:24,makuuchiLosses:16
  }));
  assert.equal(rows['Career wins'],'120');
  assert.equal(rows['Career losses'],'30');
  assert.equal(rows['Career win %'],'80.0%');
  assert.equal(rows['Makuuchi wins'],'24');
  assert.equal(rows['Makuuchi losses'],'16');
  assert.equal(rows['Makuuchi win %'],'60.0%');
  assert.equal(rows.Height,'192 cm');
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
  assert.equal(dailyDefaultDay({today:9,lastCompleted:8,announced:10,hasAnnounced:true}),9);
  assert.equal(dailyDefaultDay({lastCompleted:8,announced:9,hasAnnounced:true}),9);
  assert.equal(dailyDefaultDay({lastCompleted:8,announced:9,hasAnnounced:false}),8);
  assert.equal(dailyDefaultDay({today:19,lastCompleted:0}),1);
  assert.equal(dailySelectedDate('2026-11-08',9),'2026-11-16');
  assert.equal(dailySelectedDate('2026-11-08',16),null);
  assert.equal(dailySelectedDate('not-a-date',9),null);
});
