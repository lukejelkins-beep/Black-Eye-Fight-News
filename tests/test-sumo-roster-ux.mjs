import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/sumo-editorial.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
const method=name=>{
  const start=ui.indexOf('function '+name+'(');
  const end=ui.indexOf('\nfunction ',start+8);
  assert.ok(start>=0&&end>start,name+' renderer must exist');
  return ui.slice(start,end);
};

test('home prioritises real snapshot results, five leaders and complete-roster discovery',()=>{
  const home=method('renderHome');
  assert.match(home,/verifiedDayMatchups\(maku/);
  assert.match(home,/\.filter\(m=>m\.finished\)/);
  assert.match(home,/leadingRikishi\(maku,5\)/);
  assert.match(home,/standingsTable\(leaders,5\)/);
  assert.match(home,/Search all /);
  assert.doesNotMatch(home,/Rikishi in focus/);
  assert.match(method('renderDirectory'),/data-directory-division/);
});

test('birthplace design retains sourced flags and approved portrait component',()=>{
  const flag=ui.slice(ui.indexOf('function flagMark(w)'),ui.indexOf('function portraitFor(w'));
  assert.match(flag,/originCountry\(w\?\.birthplace\)/);
  assert.match(flag,/aria-label="Birthplace country:/);
  assert.doesNotMatch(flag,/sumo-country-name/);
  assert.match(method('directoryCard'),/flagBackdrop\(w\)\+portraitFor\(w,'md',w\.shikonaEn\)/);
  assert.match(method('banzukeCard'),/portraitFor\(w,'sm'\)/);
  assert.match(css,/\.sumo-flag-backdrop/);
  assert.match(ui,/photo\?\.approved===true/);
});

test('standings are compact results while ranking movement remains on Banzuke',()=>{
  const standings=method('standingsTable');
  assert.match(standings,/sumo-standings-record/);
  assert.match(standings,/recordLabels\(summary\)/);
  assert.match(standings,/portraitFor\(w,'sm',title\)/);
  assert.doesNotMatch(standings,/movementMarkup/);
  assert.match(method('banzukeCard'),/movementMarkup\(w\)/);
  assert.match(method('movementMarkup'),/rankPositions\(previousBanzukeData\(\)\)/);
  assert.match(css,/\.sumo-standings-row/);
  assert.match(css,/@media\(max-width:540px\)/);
  assert.match(html,/assets\/sumo-editorial\.css\?v=20261116-[a-z0-9-]+/);
});

test('scoped directory empty state retains the search and offers Search all',()=>{
  const src=method('directoryResults');
  assert.match(src,/STATE\.division==='All'/);
  assert.match(src,/No matches in /);
  assert.match(src,/data-directory-reset/);
  assert.match(ui,/STATE\.division='All';STATE\.visible=24;refreshDir\(\)/);
});
