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
console.log('fight analysis tests passed');
// Stoppage videos (25 Nov 2026): the clip must be a finish whose title names the winner, dated on/after the fight and within two weeks; reactions, reels and loser-only titles never show.
const stops = [{ date: '2026-11-14', winner: 'Diego Pacheco', loser: 'Darius Fulghum', round: 2 }, { date: '2026-11-14', winner: 'Nobody Known', loser: 'Also Absent', round: 1 }];
const clip = (title, date, extra = {}) => Object.assign({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg', title, date, isFinish: true, kind: 'KO / TKO' }, extra);
const sc = A.stoppageClips(stops, [clip('Pacheco highlights', '2026-11-15', { isFinish: false, kind: 'Highlights' }), clip('Pacheco stops Fulghum', '2026-11-16'),
  clip('Hooker reacting to Pacheco\u2019s KNOCKOUT', '2026-11-14'), clip('Every Pacheco KNOCKOUT', '2026-11-15'), clip('Fulghum knocked out by someone', '2026-11-15'),
  clip('Pacheco KO', '2026-11-13'), clip('Pacheco old KO', '2026-09-01'), clip('Unrelated KO', '2026-11-15')]);
assert.strictEqual(sc[0].clip.title, 'Pacheco stops Fulghum', 'only a finish naming the winner, in the window, that is not a reaction or reel');
assert.strictEqual(sc[1].clip, null, 'no matching clip means no clip');
console.log('stoppage clip tests passed');
// UFC's own shorts rarely name fighters: matched by #ufc<place> card tag + the stoppage's technique, only when that technique is unique on the card.
const ev2 = 'UFC Fight Night: A vs B', loc = 'Doha, Qatar';
const r2 = (n, l, m) => ({ sport: 'MMA', date: '2026-11-21', eventId: 'q', event: ev2, location: loc, winner: 0, method: m, round: 1, fighters: [f(n), f(l)] });
const e2 = A.ended(A.recent({ results: [r2('John Mitchell', 'Shoaib Yousaf', 'KO/TKO (knee to head at distance)'), r2('Diyar Nurgozhay', 'Alik Lorenz', 'KO/TKO (kick to head at distance)'),
  r2('Navajo Stirling', 'Jiri Prochazka', 'KO/TKO (punch to head at distance)'), r2('Same Punch', 'Other Loser', 'KO/TKO (punches)')] }, 'MMA', now));
const sc2 = A.stoppageClips(e2.stoppages, [clip('BEAUTIFUL KNEE KNOCKOUT #ufcqatar', '2026-11-21'), clip('BRUTAL KICK KNOCKOUT #ufcvegas124', '2026-11-21'), clip('PUNCH KNOCKOUT #ufcqatar', '2026-11-21')]);
const by = n => sc2.find(s => s.winner === n);
assert.strictEqual(by('John Mitchell').clip.title, 'BEAUTIFUL KNEE KNOCKOUT #ufcqatar', 'unique knee on the card matches the knee short');
assert.strictEqual(by('Diyar Nurgozhay').clip, null, 'a short tagged for a different card never matches');
assert.strictEqual(by('Navajo Stirling').clip, null, 'two punch finishes on the card: ambiguous, so none');
assert.strictEqual(A.technique('KO (punches)'), 'punch'); assert.strictEqual(A.technique('TKO (retirement)'), '');
console.log('short clip tests passed');
