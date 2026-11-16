import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/sumo-editorial.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');

test('overview avoids duplicate featured-rikishi section but retains the complete-roster entry point',()=>{
  const start=ui.indexOf('function renderHome() {');
  const end=ui.indexOf('function directoryFacts(w)',start);
  assert.ok(start>=0&&end>start);
  const home=ui.slice(start,end);
  assert.doesNotMatch(home,/Rikishi in focus/);
  assert.match(home,/Explore the roster/);
  assert.match(home,/directoryCard/);
  assert.match(home,/standingsTable\(leaders\)/);
});
test('flag design uses birthplace-source decorations and never inserts a country name into the visual label',()=>{
  const flag=ui.slice(ui.indexOf('function flagMark(w)'),ui.indexOf('function portraitFor(w'));
  assert.match(flag,/originCountry\(w\?\.birthplace\)/);
  assert.match(flag,/aria-label="Birthplace country:/);
  assert.doesNotMatch(flag,/sumo-country-name/);
  assert.match(flag,/function flagBackdrop\(w\)/);
  assert.match(ui,/flagBackdrop\(w\)\+portraitFor\(w,'md'\)/);
  assert.match(ui,/flagBackdrop\(w\)\+portraitFor\(w,'lg'\)/);
  assert.match(css,/\.sumo-flag-backdrop/);
});
test('overview standings include movement based on the previous banzuke and remain readable at mobile widths',()=>{
  const src=ui.slice(ui.indexOf('function standingsTable(rows'),ui.indexOf('function featureCard(w)',ui.indexOf('function standingsTable(rows')));
  assert.match(src,/movementMarkup\(w\)/);
  assert.match(src,/details\(\)\.previousBashoId/);
  assert.match(src,/sumo-standings-ranking/);
  assert.match(src,/recordLabels\(summary\)/);
  assert.match(css,/@media\(max-width:480px\)/);
  assert.match(css,/\.sumo-standings-row/);
  assert.match(html,/assets\/sumo-editorial\.css\?v=20261116-reconciled-sumo/);
});
