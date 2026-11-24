const assert = require('assert');
const B = require('../assets/snapshot-b.js');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = new Date(Date.UTC(2026, 10, 21));
const tiles = o => ({ slpm: 4, strAcc: .5, sapm: 3, strDef: .55, kd15: .3, td15: .5, tdDef: .7, ctrlShare: .1, sub15: 0, finishShareOfWins: .5, ...o });
const fighter = (o = {}, tape = {}, extra = {}) => ({ coverage: 'full', fights: 5, statFights: 5, record: { W: 3, L: 2, D: 0, NC: 0 }, tiles: tiles(o), tape, ...extra });
const names = ['Jiri Prochazka', 'Navajo Stirling'];

// age: birthday not yet reached this year, missing and implausible dates
assert.strictEqual(B.ageOn('1992-10-14', today), 34);
assert.strictEqual(B.ageOn('1992-11-22', today), 33, 'birthday tomorrow');
assert.strictEqual(B.ageOn('1992-11-21', today), 34, 'birthday today');
assert.strictEqual(B.ageOn(null, today), null);
assert.strictEqual(B.ageOn('2020-01-01', today), null, 'too young is not shown');
assert.strictEqual(B.ageOn('Oct 14, 1992', today), null, 'only ISO dates');

// height text
assert.strictEqual(B.inchesText(75), '6′3″');
assert.strictEqual(B.inchesText(72), '6′0″');
assert.strictEqual(B.inchesText(null), '—');

// short names: last word, suffix dropped, full names when surnames match
assert.deepStrictEqual(B.shortNames(names), ['Prochazka', 'Stirling']);
assert.deepStrictEqual(B.shortNames(['Mike Davis Jr.', 'Ann Lee']), ['Davis', 'Lee']);
assert.deepStrictEqual(B.shortNames(['Ann Lee', 'Bo Lee']), ['Ann Lee', 'Bo Lee']);

// tape rows: rows with no data on either side are hidden; the longer reach leads; a missing side is a dash, never zero
let rows = B.tapeRows(fighter({}, { heightIn: 75, reachIn: 80, weightLb: 205, born: '1992-10-14', stance: 'Orthodox' }),
  fighter({}, { heightIn: 76, reachIn: 79, weightLb: 205, born: '1997-11-07', stance: 'Orthodox' }), today);
assert.deepStrictEqual(rows.map(r => r.key), ['age', 'height', 'reach', 'weight', 'stance']);
assert.deepStrictEqual(rows.find(r => r.key === 'age').v, ['34', '29']);
assert.strictEqual(rows.find(r => r.key === 'reach').lead, 0);
assert.strictEqual(rows.find(r => r.key === 'height').lead, 1);
assert.strictEqual(rows.find(r => r.key === 'weight').lead, null, 'equal or unsortable values lead nowhere');
rows = B.tapeRows(fighter({}, { heightIn: 75 }), fighter({}, {}), today);
assert.deepStrictEqual(rows.map(r => r.key), ['height']);
assert.deepStrictEqual(rows[0].v, ['6′3″', '—']);
assert.strictEqual(rows[0].lead, null, 'no lead when one side is missing');
assert.deepStrictEqual(B.tapeRows(null, null, today), []);

// analysis: gaps over the threshold are said, gaps under it are not
let lines = B.analysisLines(fighter({ slpm: 5, sapm: 4.9 }), fighter({ slpm: 3.6, sapm: 3.1 }), names, today);
assert.deepStrictEqual(lines.map(l => l.text), [
  'Prochazka lands more: 5.0 to 3.6 significant strikes a minute.',
  'Stirling takes less: absorbs 3.1 to 4.9 strikes a minute.']);
assert.deepStrictEqual(lines.map(l => l.side), [0, 1]);
lines = B.analysisLines(fighter({ slpm: 4.9 }), fighter({ slpm: 4.0 }), names, today);
assert.deepStrictEqual(lines, [], 'a 0.9 gap is under the 1.0 threshold');

// wrestling, power, finishing and control
lines = B.analysisLines(fighter({ td15: 0, kd15: 1.1, finishShareOfWins: 1, ctrlShare: 0 }), fighter({ td15: 2.1, kd15: .2, finishShareOfWins: .5, ctrlShare: .4 }), names, today);
assert.deepStrictEqual(lines.map(l => l.text), [
  'Stirling shoots more: 2.1 to 0.0 takedowns per 15 minutes.',
  'Prochazka has the knockdown edge: 1.1 to 0.2 per 15 minutes.',
  'Prochazka finishes more: 100% of recent wins, against 50%.']);
const few = fighter({ finishShareOfWins: 1 }, {}, { record: { W: 1, L: 0, D: 0, NC: 0 } });
assert.ok(!B.analysisLines(few, fighter({ finishShareOfWins: 0 }), names, today).some(l => /finishes/.test(l.text)), 'finish share needs 2+ wins each');

// stats lines are capped at 3 and tape lines at 2
lines = B.analysisLines(fighter({ slpm: 6, sapm: 5, td15: 3, kd15: 1, ctrlShare: .5 }, { reachIn: 80, heightIn: 76, born: '1990-01-01', stance: 'Orthodox' }),
  fighter({ slpm: 3, sapm: 3, td15: 0, kd15: 0, ctrlShare: 0 }, { reachIn: 74, heightIn: 70, born: '1999-01-01', stance: 'Southpaw' }), names, today);
assert.strictEqual(lines.length, 5);
assert.strictEqual(lines.filter(l => /strikes a minute|takedowns|knockdown/.test(l.text)).length, 3);
assert.ok(lines[3].text.startsWith('Prochazka has the reach: 80″ to 74″'));
assert.strictEqual(lines[4].text, 'Prochazka is orthodox and Stirling is southpaw.');
assert.strictEqual(lines[4].side, null);

// limited or missing data says so, and shows no stat comparison, but tape lines still work
const limited = { coverage: 'limited', fights: 1, statFights: 1, record: { W: 1, L: 0, D: 0, NC: 0 }, tiles: tiles({ slpm: 9 }), tape: { reachIn: 80 } };
lines = B.analysisLines(limited, fighter({ slpm: 1 }, { reachIn: 70 }), names, today);
assert.deepStrictEqual(lines.map(l => l.text), [
  'Prochazka has limited fight data (1 fight), so strike and grappling comparisons are not shown.',
  'Prochazka has the reach: 80″ to 70″.']);
lines = B.analysisLines(null, null, names, today);
assert.strictEqual(lines.length, 2);
assert.ok(/no measured fight data/.test(lines[0].text));

// html: escapes names, cutout first then photo then initials, tape rows, hidden when empty
const sides = [{ name: 'A <b>', record: '11-5', form: ['W', 'L', 'W'], fig: { cutout: 'assets/img/ufc-cutouts/a.webp' } },
  { name: 'Bo Lee', record: '5-0', form: [], fig: { photo: 'assets/img/ufc/bo-lee-thumb.webp' } }];
const out = B.tapeHTML(sides, fighter({}, { heightIn: 75 }), fighter({}, { heightIn: 72 }), { esc, today, division: 'Light Heavyweight' });
assert.ok(out.includes('A &lt;b&gt;') && !out.includes('A <b>'));
assert.ok(out.includes('class="sb-cut" src="assets/img/ufc-cutouts/a.webp"'));
assert.ok(out.includes('sb-fig-photo') && out.includes('bo-lee-thumb.webp'));
assert.ok(out.includes('Light Heavyweight') && out.includes('6′3″') && out.includes('is-lead'));
assert.ok(!out.includes('Listed weight is as shown'), 'weight note only when a weight row exists');
assert.ok(B.tapeHTML(sides, fighter({}, { weightLb: 205 }), fighter({}), { esc, today }).includes('Listed weight is as shown'));
assert.ok(B.figureHTML(null, 'Jo Smith', esc).includes('<b>JS</b>'));
// A cutout with a country shows the flag in the disc; without one the disc stays plain red.
assert.ok(B.figureHTML({ cutout: 'c.webp', flag: 'assets/img/flags/au.svg' }, 'A B', esc).includes('class="sb-flag" src="assets/img/flags/au.svg"'));
assert.ok(!B.figureHTML({ cutout: 'c.webp', flag: '' }, 'A B', esc).includes('sb-flag'));
const noRows = B.tapeHTML(sides, fighter(), fighter(), { esc, today });
assert.ok(!noRows.includes('sb-rows'), 'no empty table');
assert.ok(B.analysisHTML([], { esc }).includes('No large gaps'));
assert.ok(B.analysisHTML([{ text: 'x <y>' }], { esc }).includes('x &lt;y&gt;'));
assert.ok(B.tabsHTML([['stats', 'Stats'], ['fights', 'Fights']], 'fights', { esc }).includes('aria-selected="true" class="is-active">Fights'));
console.log('snapshot-b: ok');

// Face-off layout (owner chose option B, 24 Nov 2026)
{
  const r = B.tapeRows(fighter({}, { heightIn: 65, reachIn: 65 }), fighter({}, { heightIn: 65, reachIn: 68 }), today);
  const reach = r.find(x => x.key === 'reach');
  assert.deepStrictEqual(B.barWidths(reach), [96, 100], 'bars start at zero: no exaggerated gap');
  assert.strictEqual(B.barWidths(r.find(x => x.key === 'age')), null, 'no bars for age');
  assert.strictEqual(B.barWidths({ n: [70, null] }), null, 'no bars when a side is missing');
  const html = B.tapeHTML([{ name: 'A One', record: '7-0', tags: ['#3'], fig: null }, { name: 'B Two', record: '9-1', fig: { cutout: 'c.webp' } }],
    fighter({}, { reachIn: 65 }), fighter({}, { reachIn: 68 }), { esc, today, billing: 'Main event', division: 'Flyweight', rounds: '5 rounds', status: 'Reported' });
  assert.ok(html.includes('<p class="sb-chip">Main event · Flyweight · 5 rounds · Reported</p>'), 'billing said once');
  assert.ok(html.includes('class="sb-vs"') && html.includes('<em>#3</em>'));
  assert.ok(html.includes('sb-row has-bars') && html.includes('style="width:100%"'));
  // a photo that fails to load leaves the initials showing, not an empty disc
  const photo = B.figureHTML({ photo: 'x.webp' }, 'Mairon Santos', esc);
  assert.ok(photo.indexOf('<b>MS</b>') < photo.indexOf('<img') && photo.indexOf('<b>MS</b>') > photo.indexOf('sb-disc'));
}
console.log('snapshot-b face-off: ok');
