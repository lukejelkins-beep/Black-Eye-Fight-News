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

// ---- Attribute scores (step 3): off by default, escaped, honest about the basis ----
const sc = (o = {}) => Object.fromEntries(['power', 'defence', 'wrestling', 'durability', 'striking', 'grappling'].map(k => [k, k in o ? o[k] : { score: 60, band: 'gold' }]));
const scoreData = {
  minimums: { statFights: 3 },
  fighters: { aabb: { name: 'Aa Bb', newToDivision: true, previousDivision: 'Lightweight', division: 'Welterweight' }, ccdd: { name: 'Cc Dd', newToDivision: false } },
  events: [{ id: 'e1', bouts: [{ id: 'b', fighters: ['aabb', 'ccdd'], division: 'Welterweight', basis: { power: 'division', defence: 'roster' },
    scores: [sc({ power: { score: 80, band: 'green' } }), sc({ power: { score: 20, band: 'red' }, durability: null })] }] }]
};
// the flag is off unless the page opts in
assert.strictEqual(T.scoresEnabled(undefined), false, 'no window, no scores');
assert.strictEqual(T.scoresEnabled({}), true, 'on by default');
assert.strictEqual(T.scoresEnabled({ BEFN_FEATURES: {} }), true);
assert.strictEqual(T.scoresEnabled({ BEFN_FEATURES: { snapshotScores: true } }), true);
assert.strictEqual(T.scoresEnabled({ BEFN_FEATURES: { snapshotScores: false } }), false, 'kill switch in page config');
assert.strictEqual(T.scoresEnabled({ BEFN_FEATURES: { snapshotScores: 'false' } }), true, 'only boolean false switches off');
assert.strictEqual(T.scoresEnabled({ location: { search: '?snapshotScores=off' } }), false, 'kill switch in the address');
assert.strictEqual(T.scoresEnabled({ location: { search: '?x=1&snapshotScores=off&y=2' } }), false);
assert.strictEqual(T.scoresEnabled({ location: { search: '?notsnapshotScores=off' } }), true);
assert.strictEqual(T.scoresEnabled({ location: { search: '?snapshotScores=preview' } }), true, 'old preview address still works');

// lookup in the order of the names, flipping when the file has the bout the other way round
const sCardNames = ['Aa Bb', 'Cc Dd'];
const ls = T.lookupScores(scoreData, 'e1', sCardNames);
assert.strictEqual(ls.sides[0].power.score, 80);
assert.strictEqual(T.lookupScores(scoreData, 'e1', ['Cc Dd', 'Aa Bb']).sides[0].power.score, 20, 'flipped');
assert.strictEqual(T.lookupScores(scoreData, 'e2', sCardNames), null);
assert.strictEqual(T.lookupScores(scoreData, 'e1', ['Aa Bb', 'Zz Yy']), null);
assert.strictEqual(T.lookupScores(null, 'e1', sCardNames), null);

const sOut = T.scoresHTML(ls, sCardNames, { esc });
assert.ok(sOut.includes('Attribute scores') && sOut.includes('>80<') && sOut.includes('>20<'));
assert.ok(sOut.includes('st-band-green') && sOut.includes('st-band-red') && sOut.includes('width:80%'));
assert.ok(sOut.includes('Ranked against all UFC fighters.'), 'mixed basis (only some attributes are division) falls back to roster wording');
assert.ok(sOut.includes('Aa Bb is new to Welterweight (was Lightweight).'));
// ranked in one division, last fought in another: name the bout's division, never "new to" their own division
const elsewhere = JSON.parse(JSON.stringify(scoreData));
elsewhere.fighters.aabb = { name: 'Aa Bb', division: 'Light Heavyweight', latestBoutDivision: 'Heavyweight', newToDivision: false, previousDivision: null };
const sElsewhere = T.scoresHTML(T.lookupScores(elsewhere, 'e1', sCardNames), sCardNames, { esc });
assert.ok(sElsewhere.includes('Aa Bb’s last bout was at Heavyweight.'), 'the one-off move is reported');
assert.ok(!sElsewhere.includes('is new to'), 'and not as a division change');
const settled = JSON.parse(JSON.stringify(scoreData));
settled.fighters.aabb = { name: 'Aa Bb', division: 'Welterweight', latestBoutDivision: 'Welterweight', newToDivision: true, previousDivision: 'Lightweight' };
assert.ok(T.scoresHTML(T.lookupScores(settled, 'e1', sCardNames), sCardNames, { esc })
  .includes('Aa Bb is new to Welterweight (was Lightweight).'), 'agreeing divisions keep the move note');
// a bout contracted at a division the fighter has just fought at: say it once, not twice (Pereira vs Pavlovich)
const contracted = JSON.parse(JSON.stringify(scoreData));
contracted.events[0].bouts[0].basis = { power: 'contracted', defence: 'contracted', wrestling: 'contracted', durability: 'contracted', striking: 'contracted', grappling: 'contracted' };
contracted.events[0].bouts[0].division = 'Heavyweight';
contracted.fighters.aabb = { name: 'Aa Bb', division: 'Light Heavyweight', latestBoutDivision: 'Heavyweight', newToDivision: false, previousDivision: null };
const sContracted = T.scoresHTML(T.lookupScores(contracted, 'e1', sCardNames), sCardNames, { esc });
assert.ok(sContracted.includes('Ranked against Heavyweight fighters, the division this bout is contracted at.'));
assert.ok(!sContracted.includes('last bout was at Heavyweight'), 'the division the note just named is not repeated');
assert.strictEqual((sContracted.match(/Heavyweight/g) || []).length, 1, 'Heavyweight is named once');
// a last bout somewhere else is still reported
const otherDiv = JSON.parse(JSON.stringify(contracted));
otherDiv.fighters.aabb.latestBoutDivision = 'Middleweight';
assert.ok(T.scoresHTML(T.lookupScores(otherDiv, 'e1', sCardNames), sCardNames, { esc })
  .includes('Aa Bb\u2019s last bout was at Middleweight.'), 'a different division is still named');
assert.ok(sOut.includes('not predictions'));
assert.ok(/Durability[^]*?<span class="st-num">—<\/span>/.test(sOut) || sOut.includes('>—<'), 'a missing score is a dash');
assert.ok(sOut.includes('More scores') && sOut.includes('Striking') && sOut.includes('Grappling'));
const divData = JSON.parse(JSON.stringify(scoreData));
divData.events[0].bouts[0].basis = { power: 'division', defence: 'division', wrestling: 'division', durability: 'division', striking: 'division', grappling: 'division' };
assert.ok(T.scoresHTML(T.lookupScores(divData, 'e1', sCardNames), sCardNames, { esc }).includes('Ranked against Welterweight fighters.'));
// no scores for either side → nothing drawn
const empty = JSON.parse(JSON.stringify(scoreData));
empty.events[0].bouts[0].scores = [sc(Object.fromEntries(['power', 'defence', 'wrestling', 'durability', 'striking', 'grappling'].map(k => [k, null]))), sc(Object.fromEntries(['power', 'defence', 'wrestling', 'durability', 'striking', 'grappling'].map(k => [k, null])))];
assert.strictEqual(T.scoresHTML(T.lookupScores(empty, 'e1', sCardNames), sCardNames, { esc }), '');
assert.strictEqual(T.scoresHTML(null, sCardNames, { esc }), '');
// a non-integer score is not drawn
const bad = JSON.parse(JSON.stringify(scoreData));
bad.events[0].bouts[0].scores[0].power = { score: '80', band: 'green' };
assert.ok(!T.scoresHTML(T.lookupScores(bad, 'e1', sCardNames), sCardNames, { esc }).includes('>80<'));
// escaping
const evil2 = JSON.parse(JSON.stringify(scoreData));
evil2.events[0].bouts[0].scores[0].power.band = '"><img src=x>';
assert.ok(!T.scoresHTML(T.lookupScores(evil2, 'e1', sCardNames), sCardNames, { esc }).includes('<img'));
console.log('snapshot scores: all checks passed');
