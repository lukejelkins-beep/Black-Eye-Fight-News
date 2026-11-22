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

