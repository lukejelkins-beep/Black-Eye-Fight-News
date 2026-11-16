import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/sumo-editorial.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
const profile=ui.slice(ui.indexOf('function renderProfile('),ui.indexOf('\nfunction opponentResults('));
const opponents=ui.slice(ui.indexOf('function opponentResults('),ui.indexOf('\nfunction profileRivalries('));

test('portrait is the first DOM element and the first visual row on small screens',()=>{
  assert.match(profile,/<section class="profile-hero">'\+portraitFor\(w,'xl'\)/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(css,/\.profile-hero>\.profile-icon\.sumo-photo\.xl\s*\{[^}]*grid-row:1!important/);
  assert.match(css,/\.profile-hero>\.profile-title\{grid-column:1;grid-row:2!important/);
  assert.match(css,/object-position:center top!important/);
  assert.match(css,/height:clamp\(230px,70vw,305px\)!important/);
});

test('Career has exactly two dynamic source-grounded totals and an explicit coverage caveat',()=>{
  const summary=profile.slice(profile.indexOf('<div class="sumo-career-strip"'),
    profile.indexOf('<details class="sumo-career-facts"'));
  assert.equal((summary.match(/<div><span>/g)||[]).length,2);
  assert.match(summary,/<span>Basho<\/span><strong>'\+e\(s\?\.basho\?\?'Not available'\)/);
  assert.match(summary,/<span>Makuuchi Championships<\/span><strong>'\+e\(titleCount\?\?'Not available'\)/);
  assert.match(profile,/titleCount=s\?\.yushoByDivision\?\.Makuuchi/);
  assert.doesNotMatch(summary,/API stats|source scope|<span>Championships<\/span>/i);
  assert.match(profile,/Career summary scope:/);
  assert.match(summary,/coverage may be partial/);
  assert.match(css,/\.sumo-career-strip\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('H2H opponent record is source-derived, gold-on-solid-dark, and reflows at 320px',()=>{
  assert.match(opponents,/e\(r\.wins\)/);
  assert.match(opponents,/e\(r\.losses\)/);
  assert.match(opponents,/e\(r\.meetings\)/);
  assert.match(opponents,/headToHeadUrl\(w\.sourceId,r\.id\)/);
  assert.match(css,/\.sumo-rival \.sumo-rival-record\{[\s\S]*?color:#fff0c3;background:#40332f/);
  assert.match(css,/@media\(max-width:600px\)\{[\s\S]*?\.sumo-rival \.sumo-rival-record\{grid-column:2;grid-row:2/);
  assert.match(css,/@media\(max-width:360px\)\{\s*\.sumo-rival\{grid-template-columns:46px minmax\(0,1fr\)/);
  assert.match(html,/sumo-editorial\.css\?v=20261116-[\w-]+/);
});
