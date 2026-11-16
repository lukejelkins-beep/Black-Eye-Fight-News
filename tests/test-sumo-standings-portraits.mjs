import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { banzukeMovement } from '../assets/sumo-data.mjs';

test('standings cards render central approved portrait component',()=>{
 const src=fs.readFileSync('assets/sumo.js','utf8');
 assert.match(src,/portraitFor\(w,'sm',title\).*sumo-standings-identity/);
 assert.match(src,/sumo-standings-record/);
});
test('elite rank lateral movement never displays false demotion',()=>{
 const current={
 Makuuchi:{east:[{rikishiID:7,rank:'Ozeki 2 East',rankValue:202,side:'East'}],west:[{rikishiID:8,rank:'Ozeki 1 West',rankValue:201,side:'West'}]},
 Juryo:{east:[{rikishiID:9,rank:'Juryo 1 East',rankValue:601,side:'East'}],west:[{rikishiID:10,rank:'Juryo 1 West',rankValue:601,side:'West'}]},
 Makushita:{east:[{rikishiID:11,rank:'Makushita 1 East',rankValue:701,side:'East'}],west:[{rikishiID:12,rank:'Makushita 1 West',rankValue:701,side:'West'}]}
 };
 const prior={...current,Makuuchi:{east:[{rikishiID:7,rank:'Ozeki 1 East',rankValue:201,side:'East'}],west:[{rikishiID:8,rank:'Ozeki 2 West',rankValue:202,side:'West'}]}};
 const m=banzukeMovement(7,current,prior);
 assert.equal(m.status,'same');
 assert.equal(m.places,0);
});
