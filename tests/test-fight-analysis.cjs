/* Analysis pages (owner, 24 Nov 2026): title grid, title fights, how fights ended, defences, zeros ended. */
const assert = require('assert');
const A = require('../assets/fight-analysis.js');
const now = Date.parse('2026-11-24T08:00:00Z');
// Title grid: full champions, regular holders shown as regular, undisputed / unified / split.
const grid = A.titleGrid([
  { division: 'Heavyweight', belts: { WBA: [{ name: 'Murat Gassiev', status: '· Regular' }], WBC: [{ name: 'Agit Kabayel', defences: 0 }], IBF: [{ name: 'Filip Hrgovic' }], WBO: [{ name: 'Daniel Dubois' }] } },
  { division: 'Super bantamweight', belts: { WBA: [{ name: 'Naoya Inoue', defences: 8 }], WBC: [{ name: 'Naoya Inoue' }], IBF: [{ name: 'Naoya Inoue' }], WBO: [{ name: 'Naoya Inoue' }] } },
  { division: 'Cruiserweight', belts: { WBA: [{ name: 'David Benavidez' }], WBC: [{ name: 'Michal Cieslak' }], IBF: [{ name: 'Vacant' }], WBO: [{ name: 'David Benavidez' }] } },
]);
assert.strictEqual(grid[0].kind, 'split'); assert.deepStrictEqual(grid[0].cells.WBA, { name: 'Murat Gassiev', regular: true });
assert.strictEqual(grid[1].kind, 'undisputed'); assert.strictEqual(grid[2].kind, 'unified'); assert.strictEqual(grid[2].lead, 'David Benavidez');
assert.strictEqual(grid[2].cells.IBF, null, 'a vacant belt is empty');
// Title fights: next four weeks only, eliminators excluded, belts and tags read from the note; MMA is UFC only.
const ev = (id, date, sport, note, extra = {}) => ({ id, date, sport, promotion: extra.promotion || 'P', sourceStatus: extra.status, bouts: [{ fighters: ['A One', 'B Two'], division: 'D', note }] });
const tf = A.titleFights([ev('a', '2026-11-28', 'boxing', 'WBC heavyweight world title'), ev('b', '2026-12-05', 'boxing', 'WBA/WBC/WBO world title unification'),
  ev('c', '2026-12-04', 'boxing', 'IBF world title eliminator'), ev('d', '2027-02-01', 'boxing', 'WBA world title'), ev('e', '2026-11-20', 'boxing', 'WBA world title'),
  ev('f', '2026-12-05', 'boxing', 'WBA/WBC vacant world titles')], 'boxing', now);
assert.deepStrictEqual(tf.map(x => x.id), ['a', 'b', 'f']);
assert.deepStrictEqual(tf[1].belts, ['WBA', 'WBC', 'WBO']); assert(tf[1].unification); assert(tf[2].vacant);
const mm = A.titleFights([ev('u', '2026-12-12', 'mma', 'BMF title', { promotion: 'UFC' }), ev('k', '2026-12-19', 'mma', 'KSW championship', { promotion: 'KSW' }),
  ev('r', '2026-12-05', 'mma', 'UFC title', { promotion: 'UFC', status: 'reported' })], 'mma', now);
assert.deepStrictEqual(mm.map(x => x.id), ['r', 'u']); assert(mm[0].reported, 'a reported card stays marked');
// Recent results, how they ended, and unbeaten records ended (from sourced pre-fight records).
const f = (n, pre) => ({ name: n, preRecord: pre });
const results = { results: [
  { sport: 'Boxing', date: '2026-11-14', winner: 1, method: 'unanimous decision', division: 'SMW', fighters: [f('Diego Pacheco', '26-0-0'), f('Darius Fulghum', '15-1-1')] },
  { sport: 'Boxing', date: '2026-11-18', winner: 0, method: 'TKO', round: 2, fighters: [f('Teremoana Teremoana', '12-0-0'), f('Hemi Ahio', '25-1-0')] },
  { sport: 'Boxing', date: '2026-11-18', winner: null, method: 'draw', fighters: [f('X Y', '1-0-0'), f('Z W', '2-0-0')] },
  { sport: 'Boxing', date: '2026-10-01', winner: 0, method: 'KO', fighters: [f('Old One', '1-0'), f('Old Two', '3-0-0')] },
  { sport: 'MMA', date: '2026-11-21', winner: 0, method: 'Submission (rear-naked choke)', round: 1, fighters: [f('M A'), f('M B')] } ] };
const rows = A.recent(results, 'Boxing', now);
assert.strictEqual(rows.length, 3, 'only the last two weeks');
const e = A.ended(rows);
assert.deepStrictEqual([e.ko, e.dec, e.other, e.total], [1, 1, 1, 3]); assert.strictEqual(e.stoppages[0].winner, 'Teremoana Teremoana');
assert.strictEqual(A.methodKind('Submission (rear-naked choke)'), 'sub');
const z = A.zerosEnded(rows);
assert.strictEqual(z.length, 1); assert.strictEqual(z[0].loser, 'Diego Pacheco'); assert.strictEqual(z[0].record, '26–0');
// Defences: full champions only, most first.
const d = A.defences([{ division: 'SBW', belts: { WBA: [{ name: 'Naoya Inoue', defences: 8 }], WBC: [{ name: 'Naoya Inoue', defences: 8 }] } },
  { division: 'HW', belts: { WBA: [{ name: 'Murat Gassiev', status: '· Regular', defences: 9 }], WBC: [{ name: 'Agit Kabayel', defences: 0 }] } }]);
assert.deepStrictEqual(d.map(x => x.name), ['Naoya Inoue', 'Agit Kabayel']); assert.deepStrictEqual(d[0].belts, ['WBA', 'WBC']);
// Pages render, escape, and carry their sections.
global.window = undefined;
const page = A.boxingPage({ data: { champions: { boxing: [{ division: '<b>x</b>', belts: {} }] }, fighters: [] }, events: [], results, now });
assert(page.includes('The title picture') && page.includes('&lt;b&gt;x&lt;/b&gt;') && !page.includes('<b>x</b>'));
const top = A.mmaTop({ data: { champions: { mma: [{ division: 'Heavyweight', name: 'Ciryl Gane', start: '14 Sep 2026', defences: 0 }] } }, events: [], results, now });
assert(top.includes('UFC champions') && top.includes('Ciryl Gane') && top.includes('Submission'));
// The champions list became a carousel (25 Nov 2026): the old list markup is gone from both pages.
assert(top.includes('aria-roledescription="carousel"') && !top.includes('fa-champs'), 'MMA: carousel in place of the champions list');
const bxTop = A.boxingPage({ data: { champions: { boxing: [{ division: 'Heavyweight', belts: { WBO: [{ name: 'Daniel Dubois', days: '182 days', defences: 1 }] } }] }, fighters: [] }, events: [], results, now });
assert(bxTop.includes('aria-roledescription="carousel"') && bxTop.includes('The title picture') && bxTop.indexOf('World champions') < bxTop.indexOf('The title picture'), 'boxing: carousel first, title picture kept');

/* ---------- champions carousel ---------- */
// Order: heaviest first; UFC women's divisions after every men's one, whatever order the tracker lists them in.
const mmaChamps = [
  { division: 'Women’s strawweight', name: 'Mackenzie Dern', start: '25 Oct 2025', defences: 1 },
  { division: 'Flyweight', name: 'Joshua Van', start: '6 Dec 2025', defences: 2 },
  { division: 'Heavyweight', name: 'Ciryl Gane', start: '14 Sep 2026', defences: 0 },
  { division: "Women's bantamweight", name: 'Kayla Harrison', start: '7 Jun 2025', defences: 0 },
  { division: 'Light heavyweight', name: 'Carlos Ulberg', start: '11 Apr 2026', defences: 0 },
  { division: 'Women’s flyweight', name: 'Natália Silva', start: '3 Oct 2026', defences: 0 },
  { division: 'Middleweight', name: 'Vacant' }];
const ms = A.mmaSlides({ champions: mmaChamps, now, events: [], form: null, regs: {}, portrait: () => '' });
assert.deepStrictEqual(ms.map(s => s.name), ['Ciryl Gane', 'Carlos Ulberg', 'Joshua Van', 'Kayla Harrison', 'Natália Silva', 'Mackenzie Dern'], 'UFC: heaviest first, women after men, vacant left out');
const bs = A.boxingSlides({ now, events: [], regs: {}, portrait: () => '', champions: [
  { division: 'Bantamweight', belts: { WBO: [{ name: 'B One', days: '10 days' }] } },
  { division: 'Heavyweight', belts: { WBO: [{ name: 'H One', days: '10 days' }] } },
  { division: 'Super middleweight', belts: { WBC: [{ name: 'S One', days: '10 days' }] } },
  { division: 'Cruiserweight', belts: { IBF: [{ name: 'Vacant' }] } },
  { division: 'Middleweight', belts: { WBA: [{ name: 'M One', days: '10 days' }] } }] });
assert.deepStrictEqual(bs.map(s => s.division), ['Heavyweight', 'Super middleweight', 'Middleweight', 'Bantamweight'], 'boxing: heaviest first, an all-vacant division has no slide');
// Days as champion are counted from the reign start to today; a UFC record and the last five come from the form file.
const form = { fighters: { 'ciryl-gane': { name: 'Ciryl Gane', record: [12, 2, 0, 1], last5: ['W', 'W', 'NC', 'W', 'W'] }, 'natalia-silva': { name: 'Natalia Silva', record: [9, 0, 0, 0], last5: [] } } };
const full = A.mmaSlides({ champions: mmaChamps, now, events: [], form, regs: {}, portrait: () => '' });
assert.deepStrictEqual(full[0].stats, [{ label: 'Champion since', value: '14 Sep 2026' }, { label: 'Days as champion', value: '71' },
  { label: 'Title defences', value: '0' }, { label: 'UFC record', value: '12–2 (1 NC)' }]);
assert.deepStrictEqual(full[0].form, ['W', 'W', 'NC', 'W', 'W']); assert.strictEqual(full[0].href, '#fighter/ufc--ciryl-gane');
// Field omission: no start, no defences, no form entry, no title bout: nothing shown for them, and no placeholder.
const bare = A.mmaSlides({ champions: [{ division: 'Lightweight', name: 'No Data' }], now, events: [], form, regs: {}, portrait: () => '' })[0];
assert.deepStrictEqual([bare.stats, bare.form, bare.next, bare.href], [[], null, null, '']);
const bareHTML = A.carouselHTML([bare], { title: 'UFC champions' });
for (const gone of ['Champion since', 'Days as champion', 'Title defences', 'UFC record', 'Next title fight', 'Last ', '<dl', '<a ', '–', 'undefined', 'null'])
  assert(!bareHTML.includes(gone), 'omitted field leaks: ' + gone);
assert(!/fa-cs-arrow/.test(bareHTML), 'one slide: no arrows');
const silva = full.find(s => s.name === 'Natália Silva');
assert.strictEqual(silva.form, null, 'an empty last five is left out'); assert.strictEqual(silva.href, '#fighter/ufc--natalia-silva');
const days = A.mmaSlides({ champions: [{ division: 'Flyweight', name: 'Old Days', days: '336' }], now, events: [], regs: {} })[0];
assert.deepStrictEqual(days.stats, [{ label: 'Days as champion', value: '336' }], 'no start date: the tracker’s day count, no "since"');
// Next title fight: the champion's own title bout only (not interim, BMF, eliminators, past dates or other promotions).
const card = (date, fighters, note, promotion = 'UFC', status) => ({ date, sport: 'mma', promotion, sourceStatus: status, bouts: [{ fighters: ['X', 'Y'], note: '' }, { fighters, note }] });
const evs = [card('2026-11-20', ['Joshua Van', 'Past Man'], 'UFC title'), card('2026-12-01', ['Joshua Van', 'Interim Man'], 'Interim title'),
  card('2026-12-02', ['Joshua Van', 'BMF Man'], 'BMF title'), card('2026-12-03', ['Joshua Van', 'KSW Man'], 'KSW championship', 'KSW'),
  card('2027-01-30', ['Manel Kape', 'Joshua Van'], 'UFC title', 'UFC', 'reported'), card('2027-03-01', ['Joshua Van', 'Later Man'], 'UFC title')];
assert.deepStrictEqual(A.nextTitleFight(evs, 'mma', 'Joshua Van', now), { date: '2027-01-30', opponent: 'Manel Kape', note: 'UFC title', reported: true });
assert.strictEqual(A.nextTitleFight(evs, 'mma', 'Ciryl Gane', now), null);
const vanHTML = A.carouselHTML(A.mmaSlides({ champions: [mmaChamps[1]], now, events: evs, regs: {} }), { title: 'UFC champions' });
assert(vanHTML.includes('Next title fight') && vanHTML.includes('vs Manel Kape') && vanHTML.includes('Sat 30 Jan 2027') && vanHTML.includes('Reported'));
// Figure fallback order: full-body cut-out (right sport, attested), then the sport's cut-out, then the portrait, then initials.
const portrait = n => n === 'Has Photo' ? 'assets/img/ufc/has-photo-portrait.webp' : '';
const regs = { fullbody: { 'full-body': { ok: true, sport: 'ufc', attestation: 'owner, 2026-11-25: mine' }, 'wrong-sport': { ok: true, sport: 'boxing', attestation: 'owner, 2026-11-25: mine' },
  'no-attest': { ok: true, sport: 'ufc' }, 'not-kept': { ok: false, sport: 'ufc', attestation: 'x' } },
  cutouts: { 'full-body': { ok: true }, 'wrong-sport': { ok: true }, 'no-attest': { ok: true }, 'not-kept': { ok: true }, 'bad-cut': { ok: false } } };
assert.deepStrictEqual(A.figureFor('Full Body', 'ufc', regs, portrait), { kind: 'full', url: 'assets/img/fullbody-cutouts/full-body.webp' });
for (const n of ['Wrong Sport', 'No Attest', 'Not Kept']) assert.strictEqual(A.figureFor(n, 'ufc', regs, portrait).kind, 'cut', n);
assert.strictEqual(A.figureFor('Wrong Sport', 'ufc', regs, portrait).url, 'assets/img/ufc-cutouts/wrong-sport.webp');
assert.strictEqual(A.figureFor('Wrong Sport', 'boxing', regs, portrait).url, 'assets/img/fullbody-cutouts/wrong-sport.webp');
assert.strictEqual(A.figureFor('Bad Cut', 'boxing', { cutouts: regs.cutouts }, portrait).kind, 'none');
assert.deepStrictEqual(A.figureFor('Has Photo', 'ufc', regs, portrait), { kind: 'photo', url: 'assets/img/ufc/has-photo-portrait.webp' });
assert.deepStrictEqual(A.figureFor('Nobody Atall', 'ufc', {}, null), { kind: 'none', url: '', initials: 'NA' });
assert.strictEqual(A.figureFor('Michał Cieślak', 'boxing', { cutouts: { 'michal-cieslak': { ok: true } } }).url, 'assets/img/boxing-cutouts/michal-cieslak.webp', 'register keys spell out ł');
const figHTML = A.carouselHTML([{ division: 'D', name: 'A B', eyebrow: 'D champion', href: '', figure: { kind: 'none', initials: 'AB' }, stats: [], next: null, form: null, holders: null }], { title: 'T' });
assert(figHTML.includes('fa-cs-fig is-none') && figHTML.includes('>AB<') && !figHTML.includes('<img'));
// Boxing: the figure holds the most belts; a tie goes to the longest reign; regular titles count only when no one holds a full belt.
const box = A.boxingSlides({ now, events: [], regs: {}, portrait: () => '', champions: [
  { division: 'Cruiserweight', belts: { WBA: [{ name: 'Two Belts', days: '189 days', status: '· Super', defences: 0 }, { name: 'Reg Holder', days: '956 days', status: '· Regular' }],
    WBC: [{ name: 'Long Single', days: '1,500 days', defences: 9 }], IBF: [{ name: 'Vacant' }], WBO: [{ name: 'Two Belts', days: '190 days', defences: 1 }] } },
  { division: 'Welterweight', belts: { WBA: [{ name: 'Short Reign', days: '77 days' }], WBC: [{ name: 'Long Reign', days: '1,259 days', defences: 1 }], IBF: [{ name: 'Mid Reign', days: '136 days' }] } },
  { division: 'Featherweight', belts: { WBA: [{ name: 'Only Regular', days: '40 days', status: '· Regular', defences: 3 }] } }] });
assert.strictEqual(box[0].name, 'Two Belts'); assert.strictEqual(box[0].eyebrow, 'Cruiserweight · unified champion');
assert.deepStrictEqual(box[0].stats, [{ label: 'Days as champion', value: '190' }, { label: 'Title defences', value: '1' }]);
assert.deepStrictEqual(box[0].holders.map(h => h.name), ['Two Belts', 'Reg Holder', 'Long Single']); assert.deepStrictEqual(box[0].vacant, ['IBF']);
assert.strictEqual(box[1].name, 'Long Reign', 'tie on belts: the longest reign'); assert.strictEqual(box[1].eyebrow, 'Welterweight · WBC champion');
assert.strictEqual(box[2].name, 'Only Regular'); assert.strictEqual(box[2].eyebrow, 'Featherweight · WBA regular champion');
assert.deepStrictEqual(box[2].stats, [{ label: 'Days as champion', value: '40' }], 'a regular holder’s defences are not world-title defences');
const boxHTML = A.carouselHTML(box, { title: 'World champions' });
assert(boxHTML.includes('<i class="is-reg">WBA (regular)</i>') && boxHTML.includes('Vacant: IBF') && !boxHTML.includes('Pro record'), 'regular flagged; no record without data');
// Boxing record and form only from the roster, and the last five only with at least three results.
const rosterBox = (last) => A.boxingSlides({ now, events: [], regs: {}, champions: [{ division: 'Heavyweight', belts: { WBO: [{ name: 'Daniel Dubois', days: '182 days', defences: 1 }] } }],
  roster: [{ id: 'boxing--daniel-dubois', name: 'Daniel Dubois', record: '22–3', last }] })[0];
assert.deepStrictEqual(rosterBox(['W', 'L', 'W']).form, ['W', 'L', 'W']); assert.strictEqual(rosterBox(['W', 'L']).form, null);
assert.deepStrictEqual(rosterBox([]).stats.at(-1), { label: 'Pro record', value: '22–3' }); assert.strictEqual(rosterBox([]).href, '#fighter/boxing--daniel-dubois');
// Markup: one slide per champion, chips and dots in step, counter, accessible names, escaping.
const html = A.carouselHTML(full, { title: 'UFC champions', sub: 'From BEFN’s title tracker.' });
assert.strictEqual((html.match(/aria-roledescription="slide"/g) || []).length, 6);
assert.strictEqual((html.match(/data-cs-go=/g) || []).length, 6); assert.strictEqual((html.match(/<i( class="is-on")?><\/i>/g) || []).length, 6);
assert(html.includes('<span data-cs-n>1</span> / 6') && html.includes('aria-live="polite"') && html.includes('aria-label="1 of 6: Ciryl Gane, Heavyweight"'));
assert(html.includes('aria-label="Previous champion: Women’s strawweight, Mackenzie Dern"') && html.includes('aria-label="Next champion: Light heavyweight, Carlos Ulberg"'));
assert(html.includes('>W bantamweight<'), 'short chip label for women’s divisions');
const evil = A.carouselHTML(A.mmaSlides({ champions: [{ division: '<i>D</i>', name: '<img src=x>', start: '1 Jan 2026' }], now, events: [], regs: {} }), { title: 'T' });
assert(!evil.includes('<img src=x>') && evil.includes('&lt;img src=x&gt;') && !evil.includes('<i>D</i>'));
console.log('fight analysis tests passed');
// Stoppage videos (25 Nov 2026): a clip must name the winner or loser and fall from a day before to three weeks after the fight; finishes lead; none if none match.
const stops = [{ date: '2026-11-14', winner: 'Diego Pacheco', loser: 'Darius Fulghum', round: 2 }, { date: '2026-11-14', winner: 'Nobody Known', loser: 'Also Absent', round: 1 }];
const clip = (title, date, extra = {}) => Object.assign({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg', title, date }, extra);
const sc = A.stoppageClips(stops, [clip('Pacheco highlights', '2026-11-15'), clip('Pacheco vs Fulghum KO', '2026-11-16', { isFinish: true }), clip('Pacheco full fight', '2026-11-15', { isFinish: true }),
  clip('Pacheco old', '2026-09-01', { isFinish: true }), clip('Unrelated bout', '2026-11-15', { isFinish: true })]);
assert.strictEqual(sc[0].clip.title, 'Pacheco vs Fulghum KO', 'finish beats highlights; full fights and out-of-window clips are skipped');
assert.strictEqual(sc[1].clip, null, 'no matching clip means no clip');
console.log('stoppage clip tests passed');
