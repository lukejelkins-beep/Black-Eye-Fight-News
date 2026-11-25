/* Fight film wall (owner, design A, 24 Nov 2026): title tidier, shorts filter,
   feature choice, tags, in-page YouTube play and staff text only inside "About this film". */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require('../assets/fight-film.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'fight-film.js'), 'utf8');

// Title tidier: emojis, hashtags and shouting go; the "X vs Y" part leads; the hook is a subtitle.
let t = F.tidyTitle('15 SECOND KO ⏰ 😨 | Adam Cullen VS El Hadji Ndiaye | CW 215 Free Fight');
assert.deepStrictEqual([t.main, t.hook], ['Adam Cullen vs El Hadji Ndiaye', '15 Second KO']);
assert.strictEqual(t.original, '15 SECOND KO ⏰ 😨 | Adam Cullen VS El Hadji Ndiaye | CW 215 Free Fight');
t = F.tidyTitle("JAPAN'S NEW THREAT! | Sergio Pettis v Jōji Gotō | Full Fight | PFL Dubai");
assert.deepStrictEqual([t.main, t.hook], ['Sergio Pettis v Jōji Gotō', "Japan's New Threat!"]);
t = F.tidyTitle('Aleksandre Topuria vs Bekzat Almakhan | FULL FIGHT | UFC Qatar');
assert.deepStrictEqual([t.main, t.hook], ['Aleksandre Topuria vs Bekzat Almakhan', 'UFC Qatar'], 'boilerplate "FULL FIGHT" is not a hook');
t = F.tidyTitle('BEAUTIFUL KNEE KNOCKOUT #ufcqatar');
assert.deepStrictEqual([t.main, t.hook], ['Beautiful Knee Knockout', '']);
t = F.tidyTitle('Joshua Pacio 🇵🇭 vs. Mansur Malachiev 🇷🇺 II | MMA Full Fight');
assert.deepStrictEqual([t.main, t.hook], ['Joshua Pacio vs. Mansur Malachiev II', '']);
t = F.tidyTitle('WHAT A FINISH 😳 Jarred Brooks and Mansur Malachiev clash');
assert.strictEqual(t.main, 'What a Finish Jarred Brooks and Mansur Malachiev clash');
t = F.tidyTitle('ABSOLUTE VIOLENCE🩸 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | Ollie Sarwa vs. Ieuan Mackenzie | CW 213 London Fight Highlights');
assert.deepStrictEqual([t.main, t.hook], ['Ollie Sarwa vs. Ieuan Mackenzie', 'Absolute Violence']);
assert(!/[\u{1F000}-\u{1FFFF}]|#/u.test(t.main + t.hook), 'no emoji or hashtag left');
t = F.tidyTitle('Vadim Nemkov v Sergei Bilostenniy - Fight Highlights | CLASH OF RUSSIAN TITANS!');
assert.deepStrictEqual([t.main, t.hook], ['Vadim Nemkov v Sergei Bilostenniy', 'Clash of Russian Titans!']);
assert.strictEqual(F.tidyTitle('ERMIL XHAFERI vs. YAN BLASCO | 3RD ROUND TKO').hook, '3rd Round TKO', 'acronyms stay, ordinals are not mangled');

// Shorts never show.
assert(F.isShort({ title: 'Reakcja na nokaut #shorts #ksw123' }));
assert(F.isShort({ title: 'x', kind: 'Short' }));
assert(F.isShort({ title: 'x', url: 'https://www.youtube.com/shorts/AbCdEf12345' }));
assert(!F.isShort({ title: 'Short notice KO | A vs B' }));

// Tags: Finish, Full fight, Highlights.
assert.strictEqual(F.tagOf({ title: 'A vs B', isFinish: true }), 'finish');
assert.strictEqual(F.tagOf({ title: 'A vs B', kind: 'TKO · R2 4:39' }), 'finish');
assert.strictEqual(F.tagOf({ title: 'CLINICAL RD 1 FINISH | A VS B | CW 215 FREE FIGHT' }), 'finish');
assert.strictEqual(F.tagOf({ title: 'A vs B | FULL FIGHT | UFC Qatar' }), 'full');
assert.strictEqual(F.tagOf({ title: 'HIGHLIGHTS | A vs. B' }), 'highlights');
assert.strictEqual(F.isShort({ title: 'WHAT A FINISH Jarred Brooks and Mansur Malachiev', url: 'https://www.youtube.com/watch?v=mUKBT9jY--w', isShort: true }), true, 'A Short marked by the collector is a Short even without #shorts');
assert.strictEqual(F.isShort({ title: 'A vs B', url: 'https://www.youtube.com/watch?v=08tvCDKpPRo', isShort: false }), false);
// Owner, 24 Nov 2026: compilations are not fight finishes.
for (const t of ['AND NEW! 5 CRAZY Knockouts That Won Championships | HIGHLIGHTS', '4 Forgotten Knockouts, Do You Remember Them?', 'Every Knockout & Submission From UFC Qatar | UFC Highlights', "PFL's Most Dominant Performances | Full Fight Compilation", 'AND THE CROWD WAS STUNNED! | 100 Knockouts In PFL MMA!'])
  assert.strictEqual(F.tagOf({ title: t }), 'highlights', t);
assert.strictEqual(F.tagOf({ title: 'Alex Pereira vs Sergei Pavlovich | Full Fight Marathon' }), 'full');
assert.strictEqual(F.tagOf({ title: 'INSANE KNOCKOUT | Jordan Vucenic VS Daniel Konrad | CW 215 FREE FIGHT' }), 'finish');
assert.strictEqual(F.tagOf({ title: "I'M BACK FOR FINISHES! | UFC 334 Media Day" }), 'highlights', 'media day is not a finish');

// YouTube ids.
assert.strictEqual(F.youtubeId('https://www.youtube.com/watch?v=mUKBT9jY--w'), 'mUKBT9jY--w');
assert.strictEqual(F.youtubeId('https://youtu.be/mUKBT9jY--w'), 'mUKBT9jY--w');
assert.strictEqual(F.youtubeId('https://www.ufc.com/video/161720'), '');

// Fixture feed.
const now = Date.parse('2026-11-24T12:00:00Z');
const checked = '2026-11-24T06:00:00Z';
let n = 0;
const yt = (date, title, extra = {}) => {
  const id = ('vid' + String(++n).padStart(8, '0')).slice(0, 11);
  return { id: 'yt-' + id, category: extra.sport === 'boxing' ? 'boxing' : 'combat', sport: 'mma', title, date, publisher: 'UFC',
    url: 'https://www.youtube.com/watch?v=' + id, thumbnail: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, verified: true,
    auAvailable: true, auVerification: 'youtube-api-region-restriction', auVerifiedAt: checked, isFinish: false, ...extra };
};
const videos = [
  yt('2026-11-24', 'Reakcja na nokaut #shorts', { publisher: 'KSW', isFinish: true }),
  yt('2026-11-23', 'Newest | A vs B | FULL FIGHT', { publisher: 'PFL' }),
  yt('2026-11-22', 'Older finish | C vs D', { isFinish: true, publisher: 'Cage Warriors' }),
  yt('2026-11-21', 'E vs F', { isFinish: true }),
  yt('2026-11-20', 'G vs H', { isFinish: true }),
  yt('2026-11-19', 'I vs J', { isFinish: true }),
  yt('2026-11-23', 'Boxing clip | K vs L', { sport: 'boxing', publisher: 'DAZN Boxing' }),
  yt('2026-11-23', 'Unchecked clip', { auVerifiedAt: '2026-11-01T00:00:00Z' }),
  { id: 'ufc-x', category: 'combat', sport: 'mma', sourceType: 'publisher-video-page', verified: true, isFinish: true, date: '2026-11-07',
    title: 'M stops N', url: 'https://www.ufc.com/video/161720', thumbnail: 'https://ufc.com/images/x.jpg', publisher: 'UFC' },
];
for (let i = 0; i < 20; i++) videos.push(yt('2026-11-1' + (i % 9), `Filler ${i} | P${i} vs Q${i} | HIGHLIGHTS`));
const data = { updatedAt: '2026-11-24T10:00:00Z', sources: ['YouTube public uploads from official rights holders'], videos };

const mma = F.pool(data, 'mma', now);
assert(!mma.some(F.isShort), 'shorts never in the pool');
assert(!mma.some(v => v.title === 'Unchecked clip'), 'AU check older than 48 hours is withheld');
assert(!mma.some(v => v.sport === 'boxing'));
assert(mma.some(v => v.id === 'ufc-x'), 'publisher clip page kept');
const top = F.pickTop(mma, now);
assert.strictEqual(top.feature.title, 'Older finish | C vs D', 'a finish from the last 7 days is preferred over a newer non-finish');
assert.deepStrictEqual(top.finishes.map(v => v.title), ['E vs F', 'G vs H', 'I vs J']);
const noFinish = F.pickTop(mma.filter(v => F.tagOf(v) !== 'finish'), now);
assert.strictEqual(noFinish.feature.title, 'Newest | A vs B | FULL FIGHT', 'otherwise the newest clip leads');
const stale = F.pickTop(F.pool(data, 'mma', now).filter(v => v.date < '2026-11-17' || F.tagOf(v) !== 'finish'), now);
assert.strictEqual(stale.feature.date, '2026-11-23', 'a finish older than a week does not lead');
assert.strictEqual(F.pool(data, 'all', now).filter(v => v.sport === 'boxing').length, 1, '"all" covers boxing and MMA');
assert.deepStrictEqual(F.filterList(mma, 'full', 'all').map(v => v.title), ['Newest | A vs B | FULL FIGHT']);
assert.deepStrictEqual(F.filterList(mma, 'all', 'pub:Cage Warriors').map(v => v.title), ['Older finish | C vs D']);
assert.strictEqual(F.publishers(mma, 5)[0], 'UFC');

// Rendered page: no stale hard-coded feature, no staff text outside About, 12 cards then "More film".
const html = F.content(data, 'mma', now);
assert(!/7 NOVEMBER 2026|UFC VEGAS 124|Walker vs Cortes/i.test(html), 'stale hard-coded feature is gone');
assert(!/Fight film<\/h1>|class="eyebrow"/.test(html), 'no extra Fight film heading or kicker');
const about = html.match(/<details class="ff-about">[\s\S]*?<\/details>/);
assert(about, 'About this film panel exists');
assert(!/<details class="ff-about" open/.test(html), 'About is closed by default');
const outside = html.replace(about[0], '');
assert(!/AU playback|Australian|not verified|Publisher clip/i.test(outside), 'staff text only inside About');
assert(/AU playback/.test(about[0]) && /Updated:/.test(about[0]) && /Sources:/.test(about[0]));
assert.strictEqual((html.match(/class="ff-card ff-c-big"/g) || []).length, 1);
assert.strictEqual((html.match(/class="ff-card ff-c-mini"/g) || []).length, 3);
assert.strictEqual((html.match(/class="ff-card ff-c-grid"/g) || []).length, 12, 'first page is 12 cards');
assert(/data-ff-more/.test(html), 'More film button when more clips exist');
assert(!/#shorts|Reakcja/.test(html));
assert(/data-ff-play="vid00000003"/.test(html), 'YouTube clips play in the page');
assert(/aria-label="Play Older finish \| C vs D"/.test(html), 'original title kept in the label');
assert(/href="https:\/\/www\.youtube\.com\/watch\?v=vid00000003"[^>]*>Watch on YouTube/.test(html), 'visible Watch on YouTube link');
assert(/<a class="ff-thumb" href="https:\/\/www\.ufc\.com\/video\/161720" target="_blank"/.test(F.content({ ...data, videos: [videos[8]] }, 'mma', now)), 'publisher clips open on the publisher site');
assert(/data-ff-type="finish"[^>]*>Finishes/.test(html) && /data-ff-chip="pub:UFC"/.test(html));
assert(/data-ff-chip="sport:boxing"/.test(F.content(data, 'all', now)), '"all" has a sport chip');
// The player is the privacy-enhanced one and is only built on tap.
assert(src.includes("'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1"));
assert(src.includes("'autoplay; encrypted-media; picture-in-picture'") && src.includes("'allowfullscreen'"));
assert(!/<iframe/.test(html), 'no iframe until the reader taps');
console.log('fight film wall: ok');
