/* Boxing and MMA Overviews: hero choice, results, champions, page safety. */
const assert = require('assert');
const O = require('../assets/sport-overview.js');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = { esc, safeURL: x => /^https:|^assets\/|^#/.test(x) ? esc(x) : '#', localImage: () => '' };
const now = Date.parse('2026-11-24T06:00:00Z');
const ev = (id, date, sport, fighters, note, division = 'Heavyweight') => ({ id, date, sport, title: fighters.join(' vs '), location: 'Arena, City, Country', promotion: 'P', bouts: [{ section: 'main', fighters, division, note }] });
const events = [
  ev('past', '2026-11-20', 'boxing', ['Old One', 'Old Two'], 'WBC world title'),
  ev('kab', '2026-11-28', 'boxing', ['Agit Kabayel', 'Nelson Hysa'], 'WBC heavyweight world title'),
  ev('elim', '2026-12-04', 'boxing', ['Adam Azim', 'Gabriel Valenzuela'], 'IBF world title eliminator', 'Super Lightweight'),
  ev('uni', '2026-12-05', 'boxing', ['David Benavidez', 'Michal Cieslak'], 'WBA/WBC/WBO world title unification', 'Cruiserweight'),
  ev('fury', '2026-12-11', 'boxing', ['Tyson Fury', 'Anthony Joshua'], 'Main event'),
  ev('ufc', '2026-12-05', 'mma', ['Israel Adesanya', 'Sharabutdin Magomedov'], 'Reported headline bout', 'Middleweight'),
];
const bout = (id, sport, a, b, winner, method, round) => ({ id, sport, event: id, division: 'Light Heavyweight', fighters: [{ name: a }, { name: b }], winner, method, round });
const results = {
  results: [bout('m1', 'MMA', 'Navajo Stirling', 'Jiri Prochazka', 0, 'KO/TKO (punch)', 2), bout('b1', 'Boxing', 'Lauren Price', 'Michaela Kotaskova', 0, 'unanimous decision', 10),
    bout('m2', 'MMA', 'Nik Bagley', 'Bruno Souza', null, 'no contest (accidental groin kick)', 1)],
  events: [{ id: 'E1', name: 'UFC Fight Night', date: '2026-11-21', status: 'completed', mainBoutId: 'm1', takeaways: [{ text: 'Stirling knocked out Prochazka.' }] },
    { id: 'E2', name: 'Price vs Kotaskova', date: '2026-11-20', status: 'completed', mainBoutId: 'b1' },
    { id: 'E3', name: 'CW 213', date: '2026-11-14', status: 'completed', mainBoutId: 'm2' }],
};
const featured = { boxing: ['fury'], mma: [] };

// Hero: a result for 3 days after a main event, else the biggest upcoming fight.
let hero = O.pickHero({ events, results, featured, now }, 'mma');
assert.strictEqual(hero.type, 'result'); assert.strictEqual(O.resultHeadline(O.outcome(hero.bout), hero.bout), 'Stirling stops Prochazka in round 2');
hero = O.pickHero({ events, results, featured, now: Date.parse('2026-11-25T06:00:00Z') }, 'mma');
assert.strictEqual(hero.type, 'upcoming', 'four days on, the result gives way');
hero = O.pickHero({ events, results, featured, now }, 'boxing');
assert.strictEqual(hero.type, 'upcoming'); assert.strictEqual(hero.event.id, 'fury', 'Price was 4 days ago; the featured fight leads');
// Without a featured fight: the strongest title fight within 3 weeks, and an eliminator is not a world title.
assert.strictEqual(O.bigUpcoming(events, 'boxing', {}, now).id, 'uni');
assert(O.titleScore({ note: 'IBF world title eliminator' }) < O.titleScore({ note: 'WBC world title' }));
// A featured fight too far away does not lead.
assert.strictEqual(O.bigUpcoming(events, 'boxing', featured, Date.parse('2026-10-01T00:00:00Z')).id !== 'fury', true);

// Outcomes and wording.
assert.strictEqual(O.outcome(results.results[2]).kind, 'nc');
assert.strictEqual(O.resultHeadline(O.outcome(results.results[1]), results.results[1]), 'Price beats Kotaskova on points');
assert.strictEqual(O.methodShort('unanimous decision'), 'UD'); assert.strictEqual(O.methodShort('KO/TKO (punch)'), 'KO/TKO');
assert.strictEqual(O.mainEvents(results, 'mma').length, 2); assert.strictEqual(O.mainEvents(results, 'boxing').length, 1);

// Boxing champions: most of the four belts; regular titles left out; undisputed flagged.
const ch = O.boxingChampions([
  { division: 'Heavyweight', belts: { WBA: [{ name: 'Murat Gassiev', status: '· Regular' }], WBC: [{ name: 'Agit Kabayel' }], IBF: [{ name: 'Filip Hrgovic' }], WBO: [{ name: 'Daniel Dubois' }] } },
  { division: 'Super Bantamweight', belts: { WBA: [{ name: 'Naoya Inoue' }], WBC: [{ name: 'Naoya Inoue' }], IBF: [{ name: 'Naoya Inoue' }], WBO: [{ name: 'Naoya Inoue' }] } },
  { division: 'Empty', belts: { WBA: [{ name: 'Vacant' }] } },
]);
assert.strictEqual(ch.length, 2); assert(!ch[0].others.includes('Murat Gassiev')); assert.strictEqual(ch[1].undisputed, true); assert.strictEqual(ch[0].undisputed, false);

// Page: both areas render, sport-scoped, escaped, and the past card is gone.
const stories = [{ title: '<b>x</b> news', url: 'https://example.com/a', source: 'Src', publishedAt: '2026-11-24T01:00:00Z' }];
const box = O.build({ area: 'boxing', now, events, results, featured, stories, champions: { boxing: [], mma: [] } }, h);
assert(box.includes('Fury vs Joshua') && box.includes('in 17 days')); assert(!box.includes('Old One')); assert(!box.includes('Adesanya'));
assert(box.includes('&lt;b&gt;x&lt;/b&gt;') && !box.includes('<b>x</b> news'));
assert(box.includes('Price')); assert(!box.includes('Stirling'));
const mma = O.build({ area: 'mma', now, events, results, featured, stories: [], champions: { mma: [{ division: 'Heavyweight', name: 'Ciryl Gane' }] } }, h);
assert(mma.includes('Stirling stops Prochazka') && mma.includes('UFC champions') && mma.includes('Ciryl Gane') && mma.includes('No contest'));
assert(!mma.includes('Latest news'), 'no news block without stories');
assert(O.build({ area: 'mma', now, events: [], results: null }, h).includes('Loading'));
console.log('sport overview tests passed');
