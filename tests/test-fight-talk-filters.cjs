const assert = require('assert');
const tf = require('../assets/fight-talk-filters.js');
const rn = require('../assets/related-news.js');
globalThis.BEFNRelatedNews = rn;

// namedIn uses the related-news rules: any order, close spelling, no one-word names, no surname-only.
assert(rn.namedIn('Kevin Vallejos fires back', 'Kevin Vallejos'));
assert(rn.namedIn("Vallejos Kevin's camp", 'Kevin Vallejos'));
assert(!rn.namedIn('Vallejos fires back', 'Kevin Vallejos'));
assert(!rn.namedIn('Topuria wins', 'Topuria'));

const events = [
  { sport: 'mma', promotion: 'UFC', bouts: [{ fighters: ['Aljamain Sterling', 'Kevin Vallejos'] }] },
  { sport: 'mma', promotion: 'ONE Championship', bouts: [{ fighters: ['Rodtang Jitmuangnon', 'Superlek Kiatmoo9'] }] },
  { sport: 'mma', promotion: 'PFL', bouts: [{ fighters: ['Paul Hughes', 'Jesus Pinedo'] }, { fighters: [] }, null] },
  { sport: 'mma', promotion: 'KSW', bouts: [{ fighters: ['Mateusz Gamrot', 'Some Pole'] }] },
  { sport: 'boxing', promotion: 'UFC', bouts: [{ fighters: ['Boxing Person', 'Other Person'] }] },
  null, { sport: 'mma' }
];
const index = tf.cardIndex(events);
assert.deepStrictEqual(index.ufc, ['Aljamain Sterling', 'Kevin Vallejos']);
assert.deepStrictEqual(index.one, ['Rodtang Jitmuangnon', 'Superlek Kiatmoo9']);
assert.deepStrictEqual(index.pfl, ['Paul Hughes', 'Jesus Pinedo']);
assert.deepStrictEqual(tf.cardIndex(null), { ufc: [], one: [], pfl: [] });

const post = (name, quote, extra = {}) => ({ name, quote, sport: 'mma', role: 'fighter', ...extra });
const posts = [
  post('UFC', 'Fight week is here', { role: 'promoter' }),                                   // official UFC account
  post('ONE Championship', 'Tonight in Bangkok', { role: 'promoter' }),                      // official ONE account
  post('PFL', 'New season', { role: 'promoter' }),                                           // official PFL account
  post('Kevin Vallejos', 'Ready for the cage'),                        // fighter on a UFC card
  post('MMA Fighting', 'Aljamain Sterling opens up on his comeback'),  // media naming a UFC-card fighter
  post('Bloody Elbow', 'Sterling opens up on his comeback'),           // surname only: no guess
  post('MMA Fighting', 'Rodtang Jitmuangnon returns'),                 // ONE-card fighter named
  post('Uncle Dave', 'Unfamiliar fight chatter'),                      // nothing to tie it to a promotion
  post('Mateusz Gamrot', 'KSW card update')                            // KSW is not a filter option
];
const names = (opts, idx = index) => tf.filterPosts(posts, opts, idx).map(p => p.name + ': ' + p.quote.slice(0, 12));

assert.deepStrictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'ufc' }, index).map(p => p.name), ['UFC', 'Kevin Vallejos', 'MMA Fighting']);
assert.deepStrictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'one' }, index).map(p => p.name), ['ONE Championship', 'MMA Fighting']);
assert.deepStrictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'pfl' }, index).map(p => p.name), ['PFL']);
// A fighter name is not the same as a promotion name: "ONE" must not match words like "someone".
assert(!tf.postPromotions(post('Someone Else', 'x'), index).has('one'));
assert(!tf.postPromotions(post('One Punch Gym', 'x'), index).has('one'), 'only the official account name counts');
assert(!tf.postPromotions(post('PFL Fan Page', 'x', { role: 'fan' }), index).has('pfl'), 'fan and meme pages are not the promotion');
assert(tf.postPromotions(post('PFL', 'x', { role: 'promoter' }), index).has('pfl'));
// Cards still loading: only official accounts qualify, nobody is guessed.
assert.deepStrictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'ufc' }, null).map(p => p.name), ['UFC']);
// Promotion only applies to MMA, and unknown values are ignored.
assert.strictEqual(tf.filterPosts(posts, { sport: 'all', promotion: 'ufc' }, index).length, posts.length);
assert.strictEqual(tf.filterPosts(posts, { sport: 'boxing', promotion: 'ufc' }, index).length, posts.length);
assert.strictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'all' }, index).length, posts.length);
assert.strictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'bogus' }, index).length, posts.length);

// Fighter search: author or post text, ignoring case, accents and spacing; blank shows all.
assert.deepStrictEqual(tf.filterPosts(posts, { query: 'kevin vallejos' }).map(p => p.name), ['Kevin Vallejos']);
assert.deepStrictEqual(tf.filterPosts(posts, { query: 'STERLING' }).map(p => p.name), ['MMA Fighting', 'Bloody Elbow']);
assert.deepStrictEqual(tf.filterPosts([post('A', 'José Aldo talks')], { query: 'jose aldo' }).length, 1);
assert.strictEqual(tf.filterPosts(posts, { query: '   ' }).length, posts.length);
assert.strictEqual(tf.filterPosts(posts, { query: 'nobody at all' }).length, 0);
// Both filters together.
assert.deepStrictEqual(tf.filterPosts(posts, { sport: 'mma', promotion: 'ufc', query: 'sterling' }, index).map(p => p.name), ['MMA Fighting']);
assert.deepStrictEqual(tf.filterPosts(null, {}, index), []);
assert.deepStrictEqual(Object.values(tf.PROMOTIONS), ['All promotions', 'UFC', 'ONE', 'PFL']);

console.log('fight-talk-filters tests passed');
