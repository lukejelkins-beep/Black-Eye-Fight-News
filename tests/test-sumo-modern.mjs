import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {originCountry} from '../assets/sumo-data.mjs';
const css=readFileSync(new URL('../assets/sumo-modern.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
test('red sun is Japan only; every roster country has its own disc',()=>{
  const codes=['JP','MN','UA','RU','CN','KZ','GE','BG','EG','BR','US'];
  for(const c of codes)assert.match(css,new RegExp('\\[data-country="'+c+'"\\]\\{--disc:'));
  assert.equal((css.match(/--disc:#cf1824/g)||[]).length,1);
  assert.match(css,/\[data-country="JP"\]\{--disc:#cf1824\}/);
});
test('poster and face-off carry the origin country code',()=>{
  assert.match(js,/sumo-poster-stage is-cutout"'\+ca/);
  assert.match(js,/fo-side fo-'\+side\+'" data-country=/);
  assert.equal(originCountry('Mongolia, Ulaanbaatar').code,'MN');
  assert.equal(originCountry('Tokyo').code,'JP');
});
test('head-to-head uses the face-off hero, not the old boxed hero',()=>{
  const fn=js.slice(js.indexOf('function renderHeadToHead'),js.indexOf('function getAnnouncedTorikumi'));
  assert.match(fn,/sumo-faceoff/);
  assert.doesNotMatch(fn,/sumo-h2h-hero/);
});
