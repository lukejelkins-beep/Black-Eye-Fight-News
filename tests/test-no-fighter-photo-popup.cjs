'use strict';
// Owner, 28 Nov 2026: "remove the function where you tap a fighters name and a photo pops up -
// its clunky and i dont like the underlining of names". Names are plain text (or a plain link
// to a profile): no photo pop-up and no dotted underline.
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=require('./helpers/read-index.cjs')();
const app=fs.readFileSync('assets/app-inline-2.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const news=fs.readFileSync('assets/news-front.css','utf8');
assert(!fs.existsSync('assets/fighter-hover.js'),'the name pop-up script is gone');
assert(!html.includes('fighter-hover.js'),'index.html no longer loads the name pop-up');
assert(!sw.includes('fighter-hover.js'),'the service worker no longer caches the name pop-up');
for(const gone of ['fighter-photo-preview','fighter-hover-name','champ-preview-trigger','data-hover-fighter']){
  assert(!app.includes(gone),'app-inline-2.js still has '+gone);
  assert(!html.includes(gone),'index.html still has '+gone);
}
const champPeek=app.match(/const champPeek=[^\n]*/)[0];
assert(/<strong class="champ-name">/.test(champPeek)&&!/button/.test(champPeek),'champion names are plain text');
const nwa=news.match(/\.nwa-name\{[^}]*\}/)[0];
assert(/text-decoration:none/.test(nwa)&&!/dotted/.test(nwa),'news fighter-name links are not underlined');
console.log('Fighter names: no photo pop-up, no dotted underline');
