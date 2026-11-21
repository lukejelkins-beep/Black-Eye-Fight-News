const assert = require('assert');
const T = require('../assets/snapshot-tiles.js');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tiles = o => ({ slpm: 4.5, strAcc: .5, sapm: 3.1, strDef: .55, kd15: 0, td15: 1.2, tdDef: .7, ctrlShare: .1, sub15: 0, ...o });
const fighter = (name, o = {}, extra = {}) => ({ name, coverage: 'full', fights: 5, statFights: 5, record: { W: 3, L: 1, D: 0, NC: 1 }, tiles: tiles(o), ...extra });

// formatting: zero is a real number, null is a dash
assert.strictEqual(T.show(0, false), '0.0');
assert.strictEqual(T.show(null, false), '—');
assert.strictEqual(T.show(undefined, true), '—');
assert.strictEqual(T.show(.618, true), '62%');
assert.strictEqual(T.show('8.1', false), '—', 'strings are not numbers');
assert.strictEqual(T.recordText({ W: 4, L: 1, D: 0, NC: 0 }), '4-1');
assert.strictEqual(T.recordText({ W: 3, L: 1, D: 1, NC: 1 }), '3-1-1 (1 NC)');
assert.strictEqual(T.recordText(null), '—');

// bar widths: rates scale to the larger fighter, percentages to 100, null draws no bar, all-zero draws none
assert.deepStrictEqual(T.widths(4, 2, false), [100, 50]);
assert.deepStrictEqual(T.widths(0, 0, false), [0, 0]);
assert.deepStrictEqual(T.widths(null, 2, false), [null, 100]);
assert.deepStrictEqual(T.widths(.5, .25, true), [50, 25]);
assert.deepStrictEqual(T.widths(1.4, null, true), [100, null], 'clamped');

// status wording
assert.strictEqual(T.status(fighter('A')), 'Based on 5 fights');
assert.strictEqual(T.status(fighter('A', {}, { statFights: 3 })), 'Based on 3 of 5 fights');
assert.strictEqual(T.status(fighter('A', {}, { coverage: 'limited', statFights: 2 })), 'Limited data · 2 fights');
assert.strictEqual(T.status(fighter('A', {}, { coverage: 'limited', statFights: 1 })), 'Limited data · 1 fight');
assert.strictEqual(T.status(fighter('A', {}, { coverage: 'none' })), 'Not available yet');
assert.strictEqual(T.status(null), 'Not available yet');

// lookup needs the right event and the bout on it, either order
const data = { fighters: { aabb: fighter('Aa Bb'), ccdd: fighter('Cc Dd') }, events: [{ id: 'e1', bouts: [{ fighters: ['aabb', 'ccdd'] }] }] };
assert.strictEqual(T.lookup(data, 'e1', ['Aa Bb', 'Cc Dd'])[0].name, 'Aa Bb');
assert.strictEqual(T.lookup(data, 'e1', ['Cc Dd', 'Aa Bb'])[0].name, 'Cc Dd');
assert.strictEqual(T.lookup(data, 'e2', ['Aa Bb', 'Cc Dd']), null, 'wrong event');
assert.strictEqual(T.lookup(data, 'e1', ['Aa Bb', 'Zz Yy']), null, 'bout not on the card');
assert.strictEqual(T.lookup(null, 'e1', ['A', 'B']), null);
assert.strictEqual(T.lookup(data, 'e1', ['Only One']), null);
assert.deepStrictEqual(T.lookup(data, 'e1', ['Aa Bb', 'Cc Dd']).map(x => x && x.name), ['Aa Bb', 'Cc Dd']);
const half = { ...data, fighters: { aabb: data.fighters.aabb } };
assert.strictEqual(T.lookup(half, 'e1', ['Aa Bb', 'Cc Dd'])[1], null, 'unknown fighter is null, not a crash');

// html: both fighters
const out = T.html(fighter('Aa Bb', { slpm: 6 }), fighter('Cc Dd', { slpm: 3 }), { esc });
assert.ok(out.includes('Aa Bb') && out.includes('Cc Dd') && out.includes('Last 5 fights'));
assert.ok(out.includes('6.0') && out.includes('3.0'));
assert.ok(out.includes('width:100.0%') && out.includes('width:50.0%'));
assert.ok(out.includes('3-1 (1 NC)'));
assert.strictEqual((out.match(/class="st-row"/g) || []).length, T.ROWS.length);

// html: a missing stat shows a dash and no bar; the other side is still drawn
const gap = T.html(fighter('Aa Bb', { tdDef: null }), fighter('Cc Dd', { tdDef: .5 }), { esc });
const row = gap.match(/<div class="st-row"[^>]*aria-label="Takedown defence">.*?<\/div>/)[0];
assert.ok(row.includes('—') && row.includes('50%'));
assert.strictEqual((row.match(/class="st-fill"/g) || []).length, 1);

// html: a row measured for nobody is left out
const none = T.html(fighter('Aa Bb', { sub15: null }), fighter('Cc Dd', { sub15: null }), { esc });
assert.ok(!none.includes('Sub attempts'));

// html: one side without data still renders the other, with a clear status
const one = T.html(fighter('Aa Bb'), fighter('New Guy', {}, { coverage: 'none' }), { esc });
assert.ok(one.includes('Not available yet') && one.includes('Aa Bb'));
// html: nobody has data → nothing is drawn
assert.strictEqual(T.html(fighter('A', {}, { coverage: 'none' }), null, { esc }), '');
assert.strictEqual(T.html(null, null, { esc }), '');

// names are escaped
const evil = T.html(fighter('<img src=x onerror=1>'), fighter('Cc Dd'), { esc });
assert.ok(!evil.includes('<img') && evil.includes('&lt;img'));

console.log('snapshot tiles: all checks passed');
