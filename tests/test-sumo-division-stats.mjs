import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dailyStats,dailyWinPercentage,heightFeetInches} from '../assets/sumo-daily.mjs';
import {recordSummary} from '../assets/sumo-data.mjs';

const load=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const roster=load('data/sumo/rikishi-index.json');
const source=load('data/sumo/division-stats.json');
const details=load('data/sumo/preview-details.json');

test('all 190 approved Sumo identities have source-listed division records (never fabricated 0-0)',()=>{
  assert.equal(source.schemaVersion,1);
  assert.equal(source.source,'https://www.sumo-api.com/api');
  assert.equal(source.previewOnly,true);
  assert.equal(source.certified,false);
  assert.equal(source.cohortSize,roster.count);
  assert.equal(roster.count,190);
  assert.equal(Object.keys(source.bySourceId).length,190);
  assert.equal(source.availableCount,190);
  assert.equal(source.unavailableCount,0);
  for(const w of roster.rikishi){
    const cache=source.bySourceId[String(w.sourceId)];
    assert.ok(cache,'Missing stats cache for '+w.shikonaEn);
    assert.equal(cache.sourceId,w.sourceId);
    assert.equal(cache.shikonaEn,w.shikonaEn);
    assert.equal(cache.status,'available');
    for(const division of ['Makuuchi','Juryo','Makushita']){
      const wins=cache.stats.winsByDivision?.[division];
      const losses=cache.stats.lossByDivision?.[division];
      // Missing source keys stay missing. Explicit sourced zeros remain valid.
      if(wins===undefined||losses===undefined){
        assert.equal(wins,undefined);
        assert.equal(losses,undefined);
      }else{
        assert.ok(Number.isSafeInteger(wins)&&wins>=0);
        assert.ok(Number.isSafeInteger(losses)&&losses>=0);
      }
    }
  }
});
test('Tokihayate and Daiseizan division records are independently sourced, not inferred from H2H history',()=>{
  for(const name of ['Tokihayate','Daiseizan']){
    const w=roster.rikishi.find(r=>r.shikonaEn===name);
    assert.ok(w);
    const row=source.bySourceId[String(w.sourceId)].stats;
    assert.ok(Number.isSafeInteger(row.winsByDivision.Makushita));
    assert.ok(Number.isSafeInteger(row.lossByDivision.Makushita));
    assert.ok(dailyWinPercentage(row.winsByDivision.Makushita,row.lossByDivision.Makushita));
    const values=Object.fromEntries(dailyStats({
      makuuchiWins:row.winsByDivision.Makuuchi,
      makuuchiLosses:row.lossByDivision.Makuuchi,
      makushitaWins:row.winsByDivision.Makushita,
      makushitaLosses:row.lossByDivision.Makushita,
      heightCm:w.heightCm
    }));
    assert.notEqual(values['Makushita win %'],'Not available');
    assert.notEqual(values['Makuuchi win %'],'Not available');
    assert.match(values.Height,/^\d+(?:\.\d+)? cm \(\d+′\d+″\)$/);
  }
});
test('current basho W-L is from real banzuke bouts, not stale historical stats',()=>{
  for(const division of ['Makuuchi','Juryo','Makushita']){
    const b=details.banzuke[division].data;
    for(const wrestler of [...b.east,...b.west]){
      const current=recordSummary(wrestler.record,division);
      assert.ok(Number.isSafeInteger(current.win)&&current.win>=0);
      assert.ok(Number.isSafeInteger(current.loss)&&current.loss>=0);
    }
  }
  assert.equal(heightFeetInches(179),'5′10″');
  assert.equal(heightFeetInches(191),'6′3″');
});
