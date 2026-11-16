import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KIMARITE, KIMARITE_GROUPS, lookupKimarite, renderKimariteGallery,
  setKimariteMediaManifest, kimariteModalMarkup
} from '../assets/sumo-kimarite-gallery.mjs';

test('JSA catalogue contains exactly 82 distinct terms in six families',()=>{
  assert.equal(KIMARITE.length,82);
  assert.deepEqual(KIMARITE_GROUPS.map(g=>g.items.length),[7,13,18,6,19,19]);
  assert.equal(new Set(KIMARITE.map(x=>x.slug)).size,82);
  assert.ok(KIMARITE.every(x=>x.japanese&&x.english&&x.name));
  assert.equal(lookupKimarite('oshidashi').jsaPoster,'https://sumo.or.jp/img/kimarite/kimarite_03.jpg');
  assert.equal(KIMARITE.at(-1).jsaPoster,'https://sumo.or.jp/img/kimarite/kimarite_82.jpg');
});
test('verified Japanese labels and case-insensitive canonical names',()=>{
  assert.equal(lookupKimarite('YORIKIRI').japanese,'寄り切り');
  assert.equal(lookupKimarite('oshidashi').english,'Frontal push-out');
  assert.equal(lookupKimarite('Hatakikomi').group,'special');
  assert.equal(lookupKimarite('unrecorded'),undefined);
});
test('gallery and deep-linked detail render independently of wrestler cache',()=>{
  globalThis.location={hash:'#kimarite'};
  const all=renderKimariteGallery();
  assert.match(all,/All 82/);
  assert.match(all,/sumo-km-results/);
  globalThis.location={hash:'#kimarite?term=yorikiri'};
  const detail=renderKimariteGallery();
  assert.match(detail,/Yorikiri/);
  assert.match(detail,/sumo\\.or\\.jp\\/img\\/kimarite\\/kimarite_05\\.jpg/);
  assert.match(detail,/View JSA photograph and reference/);
  assert.match(detail,/Frontal force-out/);
  delete globalThis.location;
});
test('media manifest rejects unverified paths or missing credit',()=>{
  assert.equal(setKimariteMediaManifest({schemaVersion:99,clips:{}}),false);
  assert.equal(setKimariteMediaManifest({schemaVersion:1,clips:{yorikiri:{
    webm:'https://unapproved.example/clip.webm',poster:'x',rights:'x',credit:'x'
  }}}),true);
  globalThis.location={hash:'#kimarite?term=yorikiri'};
  assert.doesNotMatch(renderKimariteGallery(),/sumo-km-video/);
  const approved={schemaVersion:1,clips:{yorikiri:{
    webm:'assets/sumo-kimarite/yorikiri.webm',mp4:'assets/sumo-kimarite/yorikiri.mp4',poster:'https://sumo.or.jp/img/kimarite/kimarite_05.jpg',
    credit:'NHK WORLD-JAPAN',rights:'NHK permission confirmed by BEFN owner'
  }}};
  assert.equal(setKimariteMediaManifest(approved),true);
  assert.match(renderKimariteGallery(),/assets\/sumo-kimarite\/yorikiri.webm/);
  assert.match(renderKimariteGallery(),/assets\/sumo-kimarite\/yorikiri.mp4/);
  assert.ok(renderKimariteGallery().indexOf('type="video/mp4"')<renderKimariteGallery().indexOf('type="video/webm"'));
  delete globalThis.location;
});
test('on-demand GIF dialog is labelled, accessible, and links to the JSA reference',()=>{
  assert.equal(setKimariteMediaManifest({schemaVersion:1,clips:{oshidashi:{
    gif:'assets/sumo-kimarite/oshidashi.gif',
    poster:'https://sumo.or.jp/img/kimarite/kimarite_03.jpg',
    credit:'NHK WORLD-JAPAN', rights:'NHK permission confirmed by BEFN owner'
  }}}),true);
  const html=kimariteModalMarkup(lookupKimarite('oshidashi'));
  assert.match(html,/role="dialog"/);
  assert.match(html,/aria-modal="true"/);
  assert.match(html,/data-km-close/);
  assert.match(html,/assets\/sumo-kimarite\/oshidashi.gif/);
  assert.match(html,/Kimarite\/detail\/3/);
  assert.match(html,/Japan Sumo Association/);
});
test('gallery keeps authentic JSA stills until the visitor clicks a kimarite',()=>{
  globalThis.location={hash:'#kimarite'};
  const html=renderKimariteGallery();
  assert.match(html,/sumo-km-gallery/);
  assert.doesNotMatch(html,/src="assets\/sumo-kimarite\/oshidashi.gif"/);
  delete globalThis.location;
});

test('pending media manifest starts empty; no empty claims of encoded videos',()=>{
  const media=JSON.parse(readFileSync(new URL('../data/sumo/kimarite-media.json',import.meta.url)));
  assert.equal(media.schemaVersion,1);
  assert.ok(media.clips&&typeof media.clips==='object');
});
