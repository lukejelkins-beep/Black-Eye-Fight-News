import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { banzukeMovement } from '../assets/sumo-data.mjs';

test('standings cards render central approved portrait component',()=>{
 const src=fs.readFileSync('assets/sumo.js','utf8');
 assert.match(src,/portraitFor\(w,'sm'\).*sumo-standings-identity/);
});
test('elite rank lateral movement never displays false demotion',()=>{
 const current={Makuuchi:[{rikishiID:7,rank:'Ozeki 2 East'}]};
 const prior={Makuuchi:[{rikishiID:7,rank:'Ozeki 1 West'}]};
 const m=banzukeMovement(7,current,prior);
 assert.equal(m.status,'same');
 assert.equal(m.places,0);
});
