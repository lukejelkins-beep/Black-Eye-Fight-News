import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ageInJapan, japanDate, bashoDayForDate, nextDayForBasho, pairKey, h2hHistory, techniqueText } from '../assets/sumo-matchup.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../data/sumo/preview-details.json',import.meta.url),'utf8'));

test('2026 November basho shows tomorrow as day 9 in Japan on November 15',()=>{
  const when='2026-11-15T00:25:00Z'; // 09:25 Melbourne, 09:25 JST (JST is UTC+9)
  assert.equal(japanDate(when),'2026-11-15');
  assert.equal(bashoDayForDate(when,'2026-11-08T00:00:00Z'),8);
  assert.equal(nextDayForBasho(when,'2026-11-08T00:00:00Z'),9);
  assert.equal(nextDayForBasho('2026-11-21T21:00:00Z','2026-11-08'),null,'no day 16 is published');
  assert.equal(nextDayForBasho('2026-11-07T00:00:00Z','2026-11-08'),1);
});
test('age follows Japan calendar date rather than user browser timezone',()=>{
  assert.equal(ageInJapan('2000-11-16','2026-11-15T09:00:00Z'),25);
  assert.equal(ageInJapan('2000-11-16','2026-11-15T15:00:00Z'),26);
  assert.equal(ageInJapan(null),null);
});
test('cached pair records provide all-time totals and ordered individual winners with kimarite',()=>{
  const history=h2hHistory(snapshot,8850,8857);
  assert.ok(history,'Onosato and Yoshinofuji source pair should be cached');
  assert.equal(history.wins,1);
  assert.equal(history.losses,5);
  assert.equal(history.total,6);
  assert.equal(history.complete,true);
  assert.equal(history.rows.length,6);
  assert.equal(history.rows[0].bashoId,'202611');
  assert.equal(history.rows[0].day,1);
  assert.equal(history.rows[0].winnerId,8857);
  assert.equal(history.rows[0].kimarite,'tsukiotoshi');
  assert.equal(history.rows[3].kimarite,'fusen');
  assert.equal(techniqueText(history.rows[3].kimarite),'Fusen (forfeit; no technique)');
  const reversed=h2hHistory(snapshot,8857,8850);
  assert.equal(reversed.wins,5);
  assert.equal(reversed.losses,1);
  assert.deepEqual(reversed.rows,history.rows,'reversing the matchup must not change chronological match facts');
});
test('fewer than five meetings are displayed as their actual count, not padded',()=>{
  const h=h2hHistory(snapshot,12,15);
  assert.equal(h.total,4);
  assert.equal(h.rows.length,4);
  assert.equal(h.rows[0].winnerId,12);
  assert.equal(h.rows[0].kimarite,'yorikiri');
});
test('missing pair is not a fabricated 0–0 career series',()=>{
  assert.equal(h2hHistory(snapshot,999991,999992),null);
  assert.equal(h2hHistory(snapshot,2,2),null);
  assert.equal(techniqueText(''),'Technique not recorded');
  assert.equal(pairKey(15,12),pairKey(12,15));
});
test('partial and invalid bouts do not masquerade as complete all-time match history',()=>{
  const fixture={collectedAt:'2026-11-15',h2hPairs:[{
    status:'available',rikishiId:1,opponentId:2,data:{rikishiWins:2,opponentWins:1,
      matches:[{eastId:1,westId:2,winnerId:1,day:2,bashoId:'202611',kimarite:'yorikiri'},
        {eastId:1,westId:999,winnerId:1,day:3,bashoId:'202611',kimarite:'oshidashi'}]}
  }]};
  const h=h2hHistory(fixture,1,2);
  assert.equal(h.total,3);
  assert.equal(h.rows.length,1);
  assert.equal(h.complete,false);
});
test('preview markup provides accessible full head-to-head navigation',()=>{
  const source=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  assert.match(source,/function renderHeadToHead/);
  assert.match(source,/case 'headtohead'/);
  assert.match(source,/historyRowsMarkup\(h2h,a,b,5\)/);
  assert.match(source,/nextDayForBasho\(new Date\(\)/);
  assert.match(source,/techniqueText\(m\.kimarite\)/);
  const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
  assert.match(html,/20261115-matchups1/);
});
