import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJsaTable,jsaHeadingDay,jsaToTorikumiSource} from '../assets/sumo-jsa.mjs';
import {announcedTorikumiMatches} from '../assets/sumo-data.mjs';

const html=readFileSync(new URL('./fixtures/jsa-torikumi-sample.html',import.meta.url),'utf8');
const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8')).rikishi;

test('parses JSA rows: ids, ranks, winner side and kimarite',()=>{
  const rows=parseJsaTable(html);
  assert.equal(rows.length,3);
  assert.deepEqual([rows[0].east.nskId,rows[0].west.nskId,rows[0].winner,rows[0].kimarite],[3521,3983,'west','yorikiri']);
  assert.deepEqual([rows[1].winner,rows[1].kimarite],['east','uwatenage']);
  assert.deepEqual([rows[2].winner,rows[2].kimarite],[null,'']);
  assert.equal(rows[2].west.rank,'Makushita #2');
});
test('heading day is read from the page, not the URL',()=>{
  assert.equal(jsaHeadingDay('Day 11  November 18, 2026'),11);
  assert.equal(jsaHeadingDay(''),null);
});
test('JSA rows convert to the shape the site already reads, using roster ids',()=>{
  const {source,dropped}=jsaToTorikumiSource({rows:parseJsaTable(html),roster,bashoId:'202611',division:'Makuuchi',day:9});
  assert.equal(dropped,0);
  const pairs=announcedTorikumiMatches(source,{bashoId:'202611',division:'Makuuchi',day:9});
  assert.equal(pairs.length,3);
  assert.equal(pairs[0].finished,true);
  assert.equal(pairs[2].finished,false);
  assert.equal(pairs[2].kimarite,null);
});
test('bouts with an untracked wrestler are dropped, not guessed',()=>{
  const rows=parseJsaTable(html);
  const {source,dropped}=jsaToTorikumiSource({rows,roster:roster.filter(r=>r.officialNskId!==3337),bashoId:'202611',division:'Juryo',day:9});
  assert.equal(dropped,1);assert.equal(source.torikumi.length,2);
});
test('every wrestler on the scraped JSA pages maps onto the roster',(t)=>{
  const d=JSON.parse(readFileSync(new URL('../data/sumo/jsa-torikumi.json',import.meta.url),'utf8'));
  const page=d.pages.Makuuchi?.['11'];
  if(!page||page.status!=='available')return t.skip('Day 11 not in the data file');
  const {source,dropped}=jsaToTorikumiSource({rows:page.rows,roster,bashoId:'202611',division:'Makuuchi',day:11});
  assert.equal(dropped,0);
  assert.equal(announcedTorikumiMatches(source,{bashoId:'202611',division:'Makuuchi',day:11}).length,page.rows.length);
});
