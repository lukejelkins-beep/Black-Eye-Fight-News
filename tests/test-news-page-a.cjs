/* News page, design A "Front page + timeline" (owner, 25 Nov 2026): assets/news-front.js. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
global.window = globalThis;
require('../assets/news-dedupe.js');
const F = require('../assets/news-front.js');
const readIndex = require('./helpers/read-index.cjs');

const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = { esc, safeURL: x => /^https:\/\//.test(x) ? esc(x) : '#' };
const TZ = 'Australia/Melbourne';
const NOW = Date.parse('2026-11-25T03:30:00Z'); // 2:30 pm Wednesday 25 Nov in Melbourne
const iso = ms => new Date(ms).toISOString();
let n = 0;
const art = (o = {}) => {
  n++;
  return Object.assign({ id: 'a' + n, title: 'Story number ' + n + ' about a fight', url: 'https://pub' + n + '.test/s' + n, source: 'Pub ' + n, sport: 'mma', publishedAt: iso(NOW - n * 3600e3), score: 1, image: null, coverage: 1 }, o);
};
const pic = u => ({ url: u, alt: 'x', kind: 'publisher' });

// --- (b) local times: relative under 24 h, local date after, never a zone name ---
assert.strictEqual(F.relTime(iso(NOW - 58 * 60e3), NOW, TZ), '58m ago');
assert.strictEqual(F.relTime(iso(NOW - 20e3), NOW, TZ), 'just now');
assert.strictEqual(F.relTime(iso(NOW + 10 * 60e3), NOW, TZ), 'just now', 'slightly future times are not negative');
assert.strictEqual(F.relTime(iso(NOW - 3 * 3600e3 - 5 * 60e3), NOW, TZ), '3h ago');
assert.strictEqual(F.relTime('2026-11-24T00:00:00Z', NOW, TZ), 'Tue 24 Nov', 'over 24 hours: weekday, day, month in local time');
assert.strictEqual(F.relTime('2026-11-23T14:30:00Z', NOW, TZ), 'Tue 24 Nov', 'the local day, not the UTC day (14:30 UTC on 23 Nov is 01:30 on 24 Nov in Melbourne)');
assert.strictEqual(F.relTime('2026-11-23T14:30:00Z', NOW, 'UTC'), 'Mon 23 Nov');
assert.strictEqual(F.relTime('not a date', NOW, TZ), '');

// --- day grouping: Today, Yesterday, then weekday dates, in the visitor's zone ---
assert.strictEqual(F.dayLabel('2026-11-24T14:00:00Z', NOW, TZ), 'Today', '01:00 on 25 Nov in Melbourne');
assert.strictEqual(F.dayLabel('2026-11-24T12:00:00Z', NOW, TZ), 'Yesterday', '23:00 on 24 Nov in Melbourne');
assert.strictEqual(F.dayLabel('2026-11-24T12:00:00Z', NOW, 'UTC'), 'Yesterday');
assert.strictEqual(F.dayLabel('2026-11-22T12:00:00Z', NOW, TZ), 'Sun 22 Nov');
{
  const items = [art({ publishedAt: '2026-11-25T02:00:00Z' }), art({ publishedAt: '2026-11-24T20:00:00Z' }), art({ publishedAt: '2026-11-24T10:00:00Z' }), art({ publishedAt: '2026-11-22T10:00:00Z' })];
  const html = F.timelineHTML(F.order(F.buildClusters(items), 'latest'), { now: NOW, tz: TZ, sort: 'latest' }, h);
  const days = [...html.matchAll(/<div class="nwa-day"><h2>([^<]+)<\/h2>/g)].map(m => m[1]);
  assert.deepStrictEqual(days, ['Today', 'Yesterday', 'Sun 22 Nov'], 'one heading per local day, newest first');
}

// --- page output: no UTC, local relative times, no placeholder tile ---
const live = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'news-live.json'), 'utf8'));
const lang = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'news-language-live.json'), 'utf8'));
const pool = live.articles.filter(a => a.sport === 'boxing' || a.sport === 'mma');
const liveNow = Date.parse(live.lastSuccessfulAt) + 30 * 60e3;
const clusters = F.buildClusters(pool, live.deduplication, window.BEFNNewsClusters);
const liveSumo = lang.stories.filter(s => s.title && s.title !== s.originalTitle);
/* The translation feed can legitimately come back empty for a refresh (28 Nov 2026: 0 stories, no
   successful fetch). The box rules are then checked on a fixed set of translated stories so this test
   does not depend on whatever the feed held at the last refresh; an empty feed must show no box. */
const sumo = liveSumo.length >= 4 ? liveSumo : ['Asahi', 'Nikkan', 'Sankei', 'Mainichi', 'Kyodo'].map((source, i) => ({
  source, url: 'https://example.com/sumo/' + i, title: 'Translated sumo headline ' + i, originalTitle: '相撲 ' + i,
  publishedAt: new Date(liveNow - (i + 1) * 3600e3).toISOString(), translationProvider: 'DeepL'
}));
for (const tz of [TZ, 'UTC', 'America/New_York']) {
  for (const view of ['all', 'boxing', 'mma', 'sumo']) {
    const page = F.pageHTML({ view, sort: 'latest', page: 3, clusters: view === 'sumo' ? [] : clusters.filter(c => view === 'all' || c.story.sport === view), sumo, updatedAt: live.lastSuccessfulAt, now: liveNow, tz }, h);
    const text = page.replace(/<[^>]+>/g, ' ');
    assert(!/\bUTC\b|\bGMT\b|\+00:00|Z\b/.test(text), 'no UTC string in the visible text (' + view + ', ' + tz + ')');
    assert(!/np-photo-empty|nwa-photo-empty|PHOTOGRAPH UNAVAILABLE/.test(page), 'never the striped placeholder tile');
    assert(!/grappling/i.test(text), 'grappling is not part of the News page');
    if (view !== 'sumo') assert(/\d+m ago|\d+h ago/.test(text), 'recent stories show relative local times');
  }
}
{
  const all = F.pageHTML({ view: 'all', sort: 'latest', clusters, sumo, updatedAt: live.lastSuccessfulAt, now: liveNow, tz: TZ }, h);
  assert(/<h1>News<\/h1><p>Boxing, MMA and sumo from the publishers that cover them/.test(all), 'head: News and one context line, no grappling');
  assert(all.includes('updated <time') && all.includes('>30m ago</time>'), 'updated line is relative and local');
  assert(all.includes('Sumo news from Japan') && /More from Japan \(\d+\)/.test(all) && all.includes('translated'), 'sumo box with its translated note');
  assert.strictEqual((all.match(/<li><a [^>]*lang="en"/g) || []).length, sumo.length, 'sumo box holds every translated story (3 shown, the rest behind the button)');
  assert(/id="nwa-sumo-more" hidden/.test(all), 'the extra sumo headlines start closed');
  assert(!F.pageHTML({ view: 'all', sort: 'latest', clusters, sumo: [], updatedAt: live.lastSuccessfulAt, now: liveNow, tz: TZ }, h).includes('Sumo news from Japan'), 'an empty translation feed shows no sumo box');
  const box = F.pageHTML({ view: 'boxing', sort: 'latest', clusters, sumo, now: liveNow, tz: TZ }, h);
  assert(!box.includes('Sumo news from Japan'), 'no sumo box on Boxing');
  const su = F.pageHTML({ view: 'sumo', sort: 'latest', clusters: [], sumo, now: liveNow, tz: TZ }, h);
  assert(su.includes('Sumo news from Japan') && !su.includes('data-nwa-sort'), 'Sumo: the box, no order chips');
  assert(/data-nwa-sport="sumo" aria-pressed="true"/.test(su));
}

// --- top section only from stories with their own photo ---
{
  const items = [art({ title: 'No photo newest', publishedAt: iso(NOW - 60e3) }), art({ title: 'Photo one', image: pic('https://img.test/1.jpg') }), art({ title: 'Photo two', image: pic('https://img.test/2.jpg') }),
    art({ title: 'Fighter file photo only', fighterImage: { url: 'assets/img/ufc/x.webp', name: 'X' } }), art({ title: 'Insecure photo', image: pic('http://img.test/3.jpg') })];
  const page = F.pageHTML({ view: 'mma', clusters: F.buildClusters(items), now: NOW, tz: TZ }, h);
  const top = page.slice(page.indexOf('class="nwa-top'), page.indexOf('id="news-feed"'));
  assert(top.includes('Photo one') && top.includes('Photo two'), 'imaged stories lead');
  assert(!top.includes('No photo newest') && !top.includes('Fighter file photo only') && !top.includes('Insecure photo'), 'stories without their own https photo stay out of the top');
  assert.strictEqual((top.match(/<article/g) || []).length, 2, 'fewer than four imaged stories: show fewer');
  const feed = page.slice(page.indexOf('id="news-feed"'));
  assert(feed.includes('No photo newest') && !feed.includes('Photo one'), 'top stories are not repeated in the timeline');
  assert(/<article class="nwa-row" [^>]*>(?:(?!<\/article>).)*No photo newest/.test(feed) && !/nwa-row has-img[^>]*>(?:(?!<\/article>).)*No photo newest/.test(feed), 'a story without a photo is a text-only row');
  const none = F.pageHTML({ view: 'mma', clusters: F.buildClusters([art(), art()]), now: NOW, tz: TZ }, h);
  assert(!none.includes('nwa-top') && none.includes('nwa-day'), 'no imaged story: no top block, the timeline starts');
  const six = F.pageHTML({ view: 'mma', clusters: F.buildClusters([1, 2, 3, 4, 5, 6].map(i => art({ title: 'Pic ' + i, image: pic('https://img.test/p' + i + '.jpg') }))), now: NOW, tz: TZ }, h);
  assert.strictEqual((six.slice(0, six.indexOf('news-feed')).match(/<article/g) || []).length, 4, 'at most a lead and three compact stories');
  assert(six.includes('data-nwa-img') && six.indexOf('nwa-thumb') > six.indexOf('news-feed'), 'timeline thumbnails exist only for imaged rows');
  F.failed.add('https://img.test/p1.jpg');
  assert.strictEqual(F.realImage({ image: pic('https://img.test/p1.jpg') }), '', 'a photo that failed to load counts as no photo on the next draw');
  F.failed.clear();
}

// --- (c) duplicate groups from the existing dedupe data ---
{
  const dan = clusters.find(c => /Dan Hooker reveals/.test(c.story.title));
  assert(dan, 'publishing-time duplicate is present');
  assert.strictEqual(dan.size, 2);
  assert.deepStrictEqual(dan.others.map(o => o.source), ['MMA News']);
  assert(/^https:\/\/www\.mmanews\.com\//.test(dan.others[0].url), 'the other outlet links to its own copy (deduplication.examples)');
  const a = art({ title: 'Jon Jones signs contract extension with UFC through 2028 deal', source: 'Alpha', publishedAt: iso(NOW - 3600e3) });
  const b = art({ title: 'Jon Jones signs contract extension with UFC through 2028 deal', source: 'Beta', url: 'https://beta.test/jj', publishedAt: iso(NOW - 2 * 3600e3) });
  const c = art({ title: 'Different story entirely about a boxing card', source: 'Gamma' });
  const kept = art({ title: 'Kept story with a removed copy', source: 'Delta', url: 'https://delta.test/k', alsoCoveredBy: ['Epsilon', 'Zeta'], coverage: 3 });
  const dedup = { examples: [{ url: 'https://www.epsilon.com/copy', title: 'Removed copy', keptUrl: 'https://delta.test/k', reason: 'same story' }] };
  const cl = F.buildClusters([a, b, c, kept], dedup, window.BEFNNewsClusters);
  assert.strictEqual(cl.length, 3, 'the display-time rule (assets/news-dedupe.js) folds the identical headline');
  const jj = cl.find(x => /Jon Jones/.test(x.story.title));
  assert.strictEqual(jj.size, 2);
  const k = cl.find(x => x.story.url === 'https://delta.test/k');
  assert.deepStrictEqual(k.others.map(o => [o.source, o.url]), [['Epsilon', 'https://www.epsilon.com/copy'], ['Zeta', '']], 'named outlets keep their link when the feed kept one');
  const html = F.timelineHTML(F.order(cl, 'latest'), { now: NOW, tz: TZ, sort: 'latest' }, h);
  assert((html.match(/<h3 class="nwa-row-title">Jon Jones signs/g) || []).length === 1, 'shown once');
  assert(/data-nwa-outlets aria-expanded="false" aria-controls="(nwa-o\d+)">\+1 outlet<\/button>/.test(html));
  assert(/>\+2 outlets<\/button>/.test(html));
  const id = html.match(/aria-controls="(nwa-o\d+)">\+2 outlets/)[1];
  assert(new RegExp('<ul class="nwa-outlets" id="' + id + '" hidden><li><a href="https://www.epsilon.com/copy"').test(html), 'the list expands in place and links the other outlet');

  // Most covered: by cluster size, then newest.
  const covered = F.order(cl, 'covered').map(x => x.size);
  assert.deepStrictEqual(covered, [3, 2, 1]);
  const liveCovered = F.order(clusters, 'covered');
  for (let i = 1; i < liveCovered.length; i++) assert(liveCovered[i - 1].size >= liveCovered[i].size, 'Most covered never puts a smaller group first');
  assert(liveCovered[0].size > 1);
  const mc = F.timelineHTML(F.order(cl, 'covered'), { now: NOW, tz: TZ, sort: 'covered' }, h);
  assert(mc.indexOf('Kept story') < mc.indexOf('Jon Jones') && mc.indexOf('Jon Jones') < mc.indexOf('Different story'));
}

// --- (d) fighter names: exact matches open the profile; the row stays one link, no nested anchors ---
{
  const m = [{ name: 'Khamzat Chimaev', id: 'mma-contenders--khamzat-chimaev' }, { name: 'Sean O’Malley', id: 'ufc--sean-omalley' }];
  const t = F.titleHTML('Kevin Holland fought Khamzat Chimaev – and Sean O’Malley; khamzat chimaev again', F.nameMatcher(m), h);
  assert((t.match(/class="nwa-name"/g) || []).length === 2, 'exact spelling only, once per name');
  assert(t.includes('href="#fighter/mma-contenders--khamzat-chimaev"'));
  assert(t.includes('>Sean O’Malley</a>'), 'curly apostrophes match');
  assert(!F.titleHTML('Khamzat Chimaevs cousin', F.nameMatcher(m), h).includes('nwa-name'), 'no partial-word match');
  const row = F.timelineHTML([{ story: art({ title: 'Khamzat Chimaev returns' }), others: [], size: 1 }], { now: NOW, tz: TZ, sort: 'latest', matcher: F.nameMatcher(m) }, h);
  assert(!/<a [^>]*>(?:(?!<\/a>).)*<a /.test(row), 'no anchor inside an anchor');
  assert(/<a class="nwa-hit" href="https:\/\/pub\d+\.test\/s\d+" target="_blank"/.test(row), 'the row opens the article');
  const page = F.pageHTML({ view: 'mma', clusters: [{ story: art({ title: 'Khamzat Chimaev returns' }), others: [], size: 1 }], names: m, now: NOW, tz: TZ }, h);
  assert(page.includes('#fighter/mma-contenders--khamzat-chimaev') && page.includes('data-portrait-ignore'));
}

// --- paging ---
{
  const many = F.buildClusters(Array.from({ length: 45 }, () => art()));
  const p1 = F.timelineHTML(many, { now: NOW, tz: TZ, sort: 'latest', page: 1 }, h);
  assert.strictEqual((p1.match(/<article class="nwa-row/g) || []).length, F.PAGE);
  assert(p1.includes('data-news-more>More news</button>'));
  const p3 = F.timelineHTML(many, { now: NOW, tz: TZ, sort: 'latest', page: 3 }, h);
  assert.strictEqual((p3.match(/<article class="nwa-row/g) || []).length, 45);
  assert(!p3.includes('data-news-more'));
}

// --- (a) News in the section bar, the phone menu and the Sumo header; page wiring ---
{
  const site = readIndex();
  assert(/<a href="#home" data-nav="home" data-section-label>Front page<\/a><a href="#news" data-nav="news">News<\/a>/.test(site), 'News sits after Overview / Front page in the section bar');
  assert(site.includes('assets/news-front.js?v=') && site.includes('assets/news-front.css?v='), 'module and styles load');
  assert(site.includes('pages={home:renderLanding,news:renderHome,'), '#news opens the News page');
  assert(site.includes('BEFNNewsFront.pageHTML(newsFrontModel()'), 'renderHome draws design A');
  assert(/x\.dataset\.nav===\(navGroup\[key\]\|\|key\)/.test(site), 'the section bar marks the current page, News included');
  const mobile = fs.readFileSync(path.join(__dirname, '..', 'assets', 'mobile-app.js'), 'utf8');
  assert(mobile.includes("['#news','News']"), 'News is in the phone menu sheet');
  assert(!mobile.includes("['news','News','news']"), 'no sixth bottom tab');
  for (const f of ['sumo.html', 'sumo-stables.html', 'sumo-stories.html']) {
    assert(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('<a href="index.html#news/sumo" data-sumo-section="news">News</a>'), f + ' lists News beside its sections');
  }
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  // The News bump must still be in the cache name; later changes append their own suffixes after it.
  assert(/CACHE_NAME = '[^']*-nwa1(-[^']*)?'/.test(sw) && sw.includes("'/assets/news-front.js'"), 'service worker cache bumped');
}

console.log('news page A: ok');

/* Speed (28 Nov 2026): the display-time dedupe works out each story's URL and headline terms once, not once per pair.
   Same clusters as before on the saved news feed, and well under the old ~0.6 s in Node. */
{
  const fs = require('fs');
  const feed = JSON.parse(fs.readFileSync('data/news-live.json', 'utf8')).articles || [];
  const t = Date.now();
  const a = window.BEFNNewsClusters(feed);
  const ms = Date.now() - t;
  const b = window.BEFNNewsClusters(feed);
  assert.deepStrictEqual(a.map(c => [c.item.url, c.dupes.length]), b.map(c => [c.item.url, c.dupes.length]), 'repeat calls give the same clusters');
  assert.ok(ms < 1500, 'dedupe of the saved feed took ' + ms + ' ms');
}
