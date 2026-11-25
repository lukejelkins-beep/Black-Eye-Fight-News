// Finish videos on fighter profiles: which bouts get a clip (assets/fighter-finish-clips.js).
const assert = require('assert');
global.FightFilm = require('../assets/fight-film.js');
const { clipFor } = require('../assets/fighter-finish-clips.js');
const NOW = Date.parse('2026-11-25T12:00:00Z');
const au = { auAvailable: true, auVerification: 'youtube-api-region-restriction', auVerifiedAt: '2026-11-25T02:00:00Z', thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg' };
const bout = { fighter: 'Cam Rowston', opponent: 'Cody Brundage', date: '2026-01-31', outcome: 'W', method: 'KO/TKO · R2 4:08' };
const curated = { schema: 1, clips: [Object.assign({ fighter: 'Cam Rowston', opponent: 'Cody Brundage', date: '2026-01-31', videoId: 'abcdefghijk', kind: 'finish', title: 'Cam Rowston knocks out Cody Brundage' }, au)] };

// Curated clip of the exact bout.
assert.deepStrictEqual(clipFor(bout, curated, null, NOW), { id: 'abcdefghijk', kind: 'finish', title: 'Cam Rowston knocks out Cody Brundage', publisher: 'UFC', source: 'curated' });
// A broadcaster clip keeps its channel name, which the button shows.
assert.strictEqual(clipFor(bout, { schema: 1, clips: [Object.assign({}, curated.clips[0], { publisher: 'ESPN MMA' })] }, null, NOW).publisher, 'ESPN MMA');
// Not a win, not a finish, other date, other opponent: nothing.
assert.strictEqual(clipFor(Object.assign({}, bout, { outcome: '' }), curated, null, NOW), null);
assert.strictEqual(clipFor(Object.assign({}, bout, { method: 'Decision (unanimous)' }), curated, null, NOW), null);
assert.strictEqual(clipFor(Object.assign({}, bout, { date: '2026-02-01' }), curated, null, NOW), null);
assert.strictEqual(clipFor(Object.assign({}, bout, { opponent: 'Andre Petroski' }), curated, null, NOW), null);
// Australian check older than 48 hours, or missing: hidden (fail closed).
const stale = { schema: 1, clips: [Object.assign({}, curated.clips[0], { auVerifiedAt: '2026-11-23T11:00:00Z' })] };
assert.strictEqual(clipFor(bout, stale, null, NOW), null);
const unchecked = { schema: 1, clips: [{ fighter: 'Cam Rowston', opponent: 'Cody Brundage', date: '2026-01-31', videoId: 'abcdefghijk', kind: 'finish' }] };
assert.strictEqual(clipFor(bout, unchecked, null, NOW), null);
// Submissions count as finishes; snake case methods are read as words.
assert.ok(clipFor(Object.assign({}, bout, { method: 'submission' }), curated, null, NOW));
assert.ok(clipFor(Object.assign({}, bout, { method: 'ko_tko' }), curated, null, NOW));

// Film feed: finish clip naming the winner within 14 days.
const v = (title, date, extra) => Object.assign({ url: 'https://www.youtube.com/watch?v=zyxwvutsrqp', title, date, category: 'combat', sport: 'mma', isFinish: true, kind: 'KO' }, au, { auVerifiedAt: '2026-11-25T02:00:00Z' }, extra || {});
const recent = { fighter: 'Cam Rowston', opponent: 'Abus Magomedov', date: '2026-11-20', outcome: 'W', method: 'KO/TKO' };
assert.strictEqual(clipFor(recent, null, { videos: [v('Cam Rowston STUNNING knockout', '2026-11-21')] }, NOW).id, 'zyxwvutsrqp');
// Reaction, older than the fight, more than 14 days later, or naming only the loser: none.
assert.strictEqual(clipFor(recent, null, { videos: [v('Rowston reacts to knockout', '2026-11-21')] }, NOW), null);
assert.strictEqual(clipFor(recent, null, { videos: [v('Cam Rowston knockout', '2026-11-19')] }, NOW), null);
assert.strictEqual(clipFor(Object.assign({}, recent, { date: '2026-10-01' }), null, { videos: [v('Cam Rowston knockout', '2026-10-20')] }, NOW), null);
assert.strictEqual(clipFor(recent, null, { videos: [v('Abus Magomedov gets knocked out', '2026-11-21')] }, NOW), null);
console.log('fighter finish clips: ok');
