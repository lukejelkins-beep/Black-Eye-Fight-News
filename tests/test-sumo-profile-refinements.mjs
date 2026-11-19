import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/sumo-editorial.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
const profile=ui.slice(ui.indexOf('function renderProfile('),ui.indexOf('\nfunction opponentResults('));
const opponents=ui.slice(ui.indexOf('function opponentResults('),ui.indexOf('\nfunction profileRivalries('));

test('portrait is the first visual row on small screens (banzuke-poster hero)',()=>{
  const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  const poster=readFileSync(new URL('../assets/sumo-poster.css',import.meta.url),'utf8');
  assert.match(js,/posterHero\(w,\{r,wins,losses,careerPercent\}\)/);
  // Figure comes before the text body; the decorative kanji is aria-hidden and taken out of flow on phones.
  assert.match(js,/aria-hidden="true" style="--kanji-count:'\+\[\.\.\.kanji\]\.length\+'">'\+e\(kanji\)\+'<\/div>':''\)\+\s*posterFigure\(w\)\+\s*'<div class="sumo-poster-body">/);
  assert.match(poster,/@media\(max-width:900px\)\{[^]*\.sumo-poster\{grid-template-columns:1fr/);
  assert.match(poster,/@media\(max-width:900px\)\{[^]*\.sumo-poster-kanji\{position:absolute/);
  // Headshots are framed from the top so faces are never cut.
  assert.match(poster,/\.is-photo img\{[^}]*object-position:50% 12%/);
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
