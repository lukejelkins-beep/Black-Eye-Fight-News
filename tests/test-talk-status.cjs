/* Fight Talk status wording keeps loading, content time, check time and outages apart (QA audit A05). */
const assert = require('assert');
const fs = require('fs'), path = require('path');
const T = require('../assets/talk-status.js');
const fmt = v => 'T(' + v + ')';
const base = { lastAttempt: 1, loading: false, checkedAt: 'c', updatedAt: 'u', platformStatus: [] };

assert.strictEqual(T.freshness({ ...base, lastAttempt: 0 }, fmt), 'Loading Fight Talk…', 'before the first request');
assert.strictEqual(T.freshness({ ...base, loading: true }, fmt), 'Loading Fight Talk…', 'while the request is in flight');
assert.strictEqual(T.freshness(base, fmt), 'Posts updated T(u) · checked T(c)', 'content time and check time are both shown');
const iso = { ...base, updatedAt: '2026-11-24T20:13:20Z', checkedAt: '2026-11-24T20:33:33Z' };
assert.strictEqual(T.freshness(iso, v => 'FULL', v => 'HH:MM'), 'Posts updated FULL · checked HH:MM', 'same day: check time shown as time only');
assert.strictEqual(T.freshness({ ...iso, checkedAt: '2026-11-27T20:33:33Z' }, v => 'FULL', v => 'HH:MM'), 'Posts updated FULL · checked FULL', 'different day: full date');
assert.strictEqual(T.freshness({ ...base, updatedAt: null }, fmt), 'Feed checked T(c)');
assert.strictEqual(T.freshness({ ...base, platformStatus: [{ platform: 'Instagram', state: 'unavailable' }, { platform: 'X', state: 'source-linked' }] }, fmt),
  'Posts updated T(u) · checked T(c) · Instagram is unavailable', 'a 401 platform is named; source-linked is normal');
assert.ok(T.freshness({ ...base, platformStatus: [{ platform: 'Instagram', state: 'unavailable' }, { platform: 'Threads', state: 'unavailable' }] }, fmt).endsWith('Instagram and Threads are unavailable'));
assert.strictEqual(T.freshness({ ...base, error: 'Feed unavailable' }, fmt), 'Feed unavailable');
assert.strictEqual(T.freshness({ ...base, highlights: true }, fmt), 'Highlights from the previous four weeks');

assert.strictEqual(T.emptyHeading({ ...base, loading: true }), 'Loading Fight Talk…', 'never "No posts match" while loading');
assert.strictEqual(T.emptyHeading({ ...base, lastAttempt: 0 }), 'Loading Fight Talk…');
assert.strictEqual(T.emptyHeading(base), 'No posts match these filters', 'a genuinely empty filter still says so');

const app = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app-inline-2.js'), 'utf8');
assert.ok(app.includes('BEFNTalkStatus.freshness(') && app.includes('BEFNTalkStatus.emptyHeading('), 'Fight Talk uses the helpers');
assert.ok(!app.includes("'Live feed checked '"), 'the old check-time-only label is gone');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('assets/talk-status.js') > -1 && html.indexOf('assets/talk-status.js') < html.indexOf('assets/app-inline-2.js'), 'helper loads before the app');
console.log('talk status: ok');
