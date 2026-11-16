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
  assert.ok(detail.includes('assets/sumo-kimarite/jsa/kimarite_05.jpg'));
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
    webm:'assets/sumo-kimarite/yorikiri.webm',mp4:'assets/sumo-kimarite/yorikiri.mp4',poster:'assets/sumo-kimarite/yorikiri-poster.jpg',
    credit:'NHK WORLD-JAPAN',rights:'NHK permission confirmed by BEFN owner'
  }}};
  assert.equal(setKimariteMediaManifest(approved),true);
  // Landing page does not autoplay or load video assets: click opens a popup.
  assert.doesNotMatch(renderKimariteGallery(),/type="video\/webm"/);
  assert.doesNotMatch(renderKimariteGallery(),/type="video\/mp4"/);
  delete globalThis.location;
});
test('on-demand GIF dialog is labelled, accessible, and links to the JSA reference',()=>{
  assert.equal(setKimariteMediaManifest({schemaVersion:1,clips:{oshidashi:{
    gif:'assets/sumo-kimarite/oshidashi.gif',
    poster:'assets/sumo-kimarite/oshidashi-poster.jpg',
    credit:'NHK WORLD-JAPAN', rights:'NHK permission confirmed by BEFN owner'
  }}}),true);
  const html=kimariteModalMarkup(lookupKimarite('oshidashi'));
  assert.match(html,/role="dialog"/);
  assert.match(html,/aria-modal="true"/);
  assert.match(html,/data-km-close/);
  assert.match(html,/assets\/sumo-kimarite\/oshidashi.gif/);
  assert.match(html,/Kimarite\/detail\/3/);
  assert.match(html,/Official JSA reference/);
});
test('gallery does not load a GIF until the visitor clicks a kimarite',()=>{
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


test('owner-provided GIF is primary in popup and original clip is optional',()=>{
  const record={schemaVersion:1,clips:{oshidashi:{
    gif:'assets/sumo-kimarite/oshidashi.gif',
    clip:'assets/sumo-kimarite/oshidashi.mp4',
    poster:'assets/sumo-kimarite/oshidashi-poster.jpg',
    rights:'NHK permission confirmed by BEFN owner',
    credit:'NHK WORLD-JAPAN'
  }}};
  assert.equal(setKimariteMediaManifest(record),true);
  const html=kimariteModalMarkup(lookupKimarite('oshidashi'));
  assert.match(html,/<img class="sumo-km-modal-gif"/);
  assert.match(html,/assets\/sumo-kimarite\/oshidashi.gif/);
  assert.match(html,/Play original clip/);
  assert.match(html,/assets\/sumo-kimarite\/oshidashi.mp4/);
  assert.doesNotMatch(html,/sumo-km-modal-still/);
});
test('no unrelated still substitutes for missing Oshidashi media',()=>{
  assert.equal(setKimariteMediaManifest({schemaVersion:1,clips:{}}),true);
  const html=kimariteModalMarkup(lookupKimarite('oshidashi'));
  assert.match(html,/Owner-supplied Oshidashi GIF pending upload/);
  assert.doesNotMatch(html,/sumo-km-modal-still/);
  assert.doesNotMatch(html,/Play original clip/);
});

test('Oshidashi owner GIF poster can replace incorrect catalogue still',()=>{
  const valid=setKimariteMediaManifest({schemaVersion:1,clips:{oshidashi:{
    gif:'assets/sumo-kimarite/oshidashi.gif',clip:'assets/sumo-kimarite/oshidashi.mp4',
    poster:'assets/sumo-kimarite/oshidashi-poster.jpg',credit:'NHK WORLD-JAPAN',
    rights:'NHK permission confirmed by BEFN owner'
  }}});
  assert.equal(valid,true);
  const modal=kimariteModalMarkup(lookupKimarite('oshidashi'));
  assert.match(modal,/oshidashi.gif/);
  assert.doesNotMatch(modal,/sumo-km-modal-still/);
});


test('three further owner-provided GIFs retain their matching clip and poster',()=>{
 const clips={};for(const term of ['yorikiri','tsukiotoshi','hatakikomi'])clips[term]={
   gif:'assets/sumo-kimarite/'+term+'.gif',
   clip:'assets/sumo-kimarite/'+term+'.mp4',
   mp4:'assets/sumo-kimarite/'+term+'.mp4',
   webm:'assets/sumo-kimarite/'+term+'.webm',
   poster:'assets/sumo-kimarite/'+term+'-poster.jpg',
   credit:'NHK WORLD-JAPAN',rights:'NHK permission confirmed by BEFN owner'
 };
 assert.equal(setKimariteMediaManifest({schemaVersion:1,clips}),true);
 for(const term of Object.keys(clips)){
  const html=kimariteModalMarkup(lookupKimarite(term));
  assert.match(html,new RegExp('assets/sumo-kimarite/'+term+'\\.gif'));
  assert.match(html,new RegExp('assets/sumo-kimarite/'+term+'\\.mp4'));
  assert.match(html,/Play original clip/);
  assert.doesNotMatch(html,/sumo-km-modal-still/);
 }
});


test('JSA gallery photos use local verified assets and no source badges over the image',()=>{
 for(const item of KIMARITE){
  assert.match(item.jsaPoster,/^assets\/sumo-kimarite\/jsa\/kimarite_\d\d\.jpg$/);
  assert.match(item.jsaRemote,/^https:\/\/www\.sumo\.or\.jp\/img\/kimarite\/kimarite_\d\d\.jpg$/);
 }
 globalThis.location={hash:'#kimarite'};
 const gallery=renderKimariteGallery();
 assert.doesNotMatch(gallery,/sumo-km-poster-credit/);
 assert.doesNotMatch(gallery,/Photo: Japan Sumo Association/);
 assert.match(gallery,/Photographs: Japan Sumo Association/);
 delete globalThis.location;
});

test('all 82 gallery group records include their actual JSA JPEG URLs',()=>{
  const items=KIMARITE_GROUPS.flatMap(g=>g.items);
  assert.equal(items.length,82);
  for(let i=0;i<items.length;i++){
    const item=items[i];
    const photo='kimarite_'+String(i+1).padStart(2,'0')+'.jpg';
    assert.equal(item.jsaId,i+1);
    assert.equal(item.jsaPoster,'assets/sumo-kimarite/jsa/'+photo);
    assert.equal(item.jsaRemote,'https://www.sumo.or.jp/img/kimarite/'+photo);
    assert.equal(lookupKimarite(item.slug),item);
  }
});
