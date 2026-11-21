import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync('assets/sumo.js','utf8');
const css=fs.readFileSync('assets/sumo-editorial.css','utf8');
test('head-to-head includes two kimarite charts sourced from actual bout rows',()=>{
 assert.match(js,/h2hKimaritePanel\(history,a,firstName,secondName\)/);
 assert.match(js,/history\?\.rows\|\|\[\]/);
 assert.match(js,/Number\(m\.winnerId\)/);
 assert.match(js,/if\(!k\|\|k==='unknown'/);
 assert.match(js,/history\.complete\?'all recorded regular meetings':'a partial historical sample'/);
});
test('mobile head-to-head preserves side-by-side portrait columns',()=>{
 assert.match(css,/\.sumo-h2h-hero\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.sumo-kimarite-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
});
