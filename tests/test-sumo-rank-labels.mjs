import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync('assets/sumo.js','utf8');
test('standings show prior and current rank labels, never numeric place counts',()=>{
 const start=js.indexOf('function movementMarkup(w) {');
 const end=js.indexOf('function headToHeadFor(',start);
 const body=js.slice(start,end);
 assert.match(body,/m.previousRank/);
 assert.match(body,/m.currentRank/);
 assert.doesNotMatch(body,/m.places/);
 assert.doesNotMatch(js,/Gained places · ↓ Lost places/);
});
