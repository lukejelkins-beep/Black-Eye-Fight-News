import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ageInJapan} from '../assets/sumo-matchup.mjs';
const js=fs.readFileSync('assets/sumo.js','utf8');
test('age labels are live and not snapshot based',()=>{
 assert.doesNotMatch(js,/Age at snapshot/);
 assert.doesNotMatch(js,/ageInJapan\(w\.birthDate,STATE\.roster/);
 assert.match(js,/setInterval\(refreshAgeOnDateChange,60000\)/);
});
test('age increments on birthday in Japan',()=>{
 assert.equal(ageInJapan('2000-11-17',new Date('2026-11-16T14:59:00Z')),25);
 assert.equal(ageInJapan('2000-11-17',new Date('2026-11-16T15:01:00Z')),26);
});
