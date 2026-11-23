import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Sumo Stories page exists and old Fun Facts URL redirects to it',()=>{
 assert.match(read('sumo-stories.html'),/<title>Sumo Stories/);
 const old=read('sumo-fun-facts.html');
 assert.match(old,/url=sumo-stories\.html/);
 assert.match(old,/location\.replace\('sumo-stories\.html'/);
});
test('no Sumo nav still says Fun Facts',()=>{
 for(const f of ['sumo.html','sumo-stables.html','sumo-stories.html']){
  assert.doesNotMatch(read(f),/>Fun Facts</,f);
  assert.match(read(f),/href="sumo-stories\.html"[^>]*>Stories</,f);
 }
});
test('hub keeps its truth rules in the wording',()=>{
 const app=read('assets/sumo-facts.mjs');
 assert.match(app,/in BEFN’s records/);
 assert.match(app,/Fact of the day/);
 assert.match(app,/48 hours/);
});
