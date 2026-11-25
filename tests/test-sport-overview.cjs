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

// ---- All-sports front page (owner, 24 Nov 2026: design A, hero rotates by sport) ----
{
  // Own links and photos: site routes and BEFN-held webp files only.
  assert.strictEqual(O.ownLink(h, '#results'), '#results'); assert.strictEqual(O.ownLink(h, 'sumo.html#review'), 'sumo.html#review');
  assert.strictEqual(O.ownLink(h, 'javascript:alert(1)'), '#'); assert(!O.ownLink(h, '#x"onclick').includes('"'), 'a quote never reaches the attribute');
  assert.strictEqual(O.ownSrc(h, 'assets/sumo-photos/cutout/jsa-8850.webp'), 'assets/sumo-photos/cutout/jsa-8850.webp');
  assert.strictEqual(O.ownSrc(h, 'assets/../secret.webp'), '#');
  // Sumo: the second Sunday, and the latest finished basho with the next one's banzuke date.
  assert.strictEqual(O.bashoStart('202701'), '2027-01-10'); assert.strictEqual(O.bashoStart('202611'), '2026-11-08');
  const index = { basho: [
    { bashoId: '202609', endDate: '2026-09-27T00:00:00Z', makuuchiChampion: 'Onosato', makuuchiChampionId: 8850, makuuchiChampionRecord: { wins: 12, losses: 3 } },
    { bashoId: '202611', endDate: '2026-11-22T00:00:00Z', makuuchiChampion: 'Onosato', makuuchiChampionId: 8850, makuuchiChampionRank: 'Yokozuna 1 East', makuuchiChampionRecord: { wins: 13, losses: 2 } },
    { bashoId: '202701', endDate: '2027-01-24T00:00:00Z', makuuchiChampion: null } ] };
  const releases = { releases: { '202701': { date: '2026-12-21' } } };
  const sm = O.sumoSummary(index, releases, now);
  assert.strictEqual(sm.last.id, '202611'); assert.strictEqual(sm.last.record, '13–2'); assert.strictEqual(sm.last.name, 'November basho');
  assert.strictEqual(sm.next.id, '202701'); assert.strictEqual(sm.next.start, '2027-01-10'); assert.strictEqual(sm.next.banzuke, '2026-12-21');
  assert.strictEqual(O.sumoSummary({ basho: [] }, releases, now), null);
  const ctx = { now, events, results, featured, sumoIndex: index, sumoReleases: releases, sumoPhoto: 'assets/sumo-photos/cutout/jsa-8850.webp',
    stories: [{ title: 'Box story', url: 'https://example.com/b', sport: 'boxing' }, { title: 'Box two', url: 'https://example.com/b2', sport: 'boxing' },
      { title: 'Sumo story', url: 'https://example.com/s', sport: 'sumo', language: 'ja' }, { title: 'MMA story', url: 'https://example.com/m', sport: 'mma' }] };
  // The hero follows the rotation order; each sport's hero is that sport's own.
  const first = order => /fp-tag fp-(\w+)/.exec(/<section class="sov-hero fp-hero[\s\S]*?<\/section>/.exec(O.buildFront({ ...ctx, heroOrder: order }, h))[0])[1];
  assert.strictEqual(first(['mma', 'sumo', 'boxing']), 'mma'); assert.strictEqual(first(['sumo', 'boxing', 'mma']), 'sumo'); assert.strictEqual(first(['boxing', 'mma', 'sumo']), 'boxing');
  const page = O.buildFront({ ...ctx, heroOrder: ['sumo', 'boxing', 'mma'] }, h);
  assert(page.includes('Onosato wins the November basho at <span class="sov-nw">13–2</span>'));
  assert(page.includes('Pick a sport') && page.includes('href="sumo.html#home"') && page.includes('data-area="boxing"'));
  assert(page.includes('The January banzuke is out on'));
  // Mixed results include the sumo champion; news takes each sport in turn and marks translations.
  assert(page.includes('fp-res"><span class="fp-tag fp-sumo">'));
  const news = /Latest news[\s\S]*$/.exec(page)[0];
  assert(news.indexOf('Box story') < news.indexOf('MMA story') && news.indexOf('MMA story') < news.indexOf('Sumo story') && news.includes('translated'));
  // When the boxing hero is the featured fight, the boxing card shows something else.
  const boxFirst = O.buildFront({ ...ctx, heroOrder: ['boxing', 'mma', 'sumo'] }, h);
  const cards = /Pick a sport[\s\S]*?<\/section>/.exec(boxFirst)[0];
  assert(!/fp-sc fp-boxing[\s\S]*?Fury vs Joshua/.test(cards.split('fp-sc fp-mma')[0]));
  // No dead links anywhere on the page.
  assert(!/href="#"/.test(page) && !/href="#"/.test(boxFirst));
  assert(O.buildFront({ now, events: [], results: null }, h).includes('Loading'));
  console.log('front page tests passed');
}

// UFC champion spotlight: owner-supplied belt portraits as cut-outs, heavyweight first, looping; the grid without the register.
{
  const fs = require('fs'), path = require('path');
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ufc-champion-photo-register.json'), 'utf8'));
  const champions = { mma: [{ division: 'Heavyweight', name: 'Ciryl Gane', start: '14 Sep 2026', defences: 0 },
    { division: 'Featherweight', name: 'Alexander Volkanovski', start: '12 Apr 2025', defences: 2 },
    { division: 'Flyweight', name: 'No Photo <b>', start: '', defences: 1 }, { division: 'Middleweight', name: 'Vacant' },
    { division: 'Women’s strawweight', name: 'Mackenzie Dern', start: '1 Jan 2026', defences: 0 }] };
  const base = { area: 'mma', now, events, results, featured, champions, stories: [] };
  const html = O.build(Object.assign({ championPhotos: reg }, base), h);
  assert(html.includes('class="sov-spot"') && html.includes('data-spot-n="4"'), 'spotlight shown with 4 champions (vacant left out)');
  assert(!/Vacant/.test(html), 'vacant titles left out');
  assert(/class="sov-spot-f is-c" data-spot-i="0" href="#fighter\/ufc--ciryl-gane"/.test(html), 'heavyweight starts in the centre');
  assert(html.includes('src="assets/img/ufc-champions/cutout/ciryl-gane.webp"'), 'the cut-out, not the photo');
  assert(/class="sov-spot-f is-r" data-spot-i="1"/.test(html), 'next champion on the right');
  assert(/class="sov-spot-f is-l[^"]*" data-spot-i="3"/.test(html), 'it loops: the last champion is on the left');
  assert(/data-spot-i="1"[^>]*tabindex="-1" aria-hidden="true"/.test(html), 'side champions are not tab stops');
  assert(html.includes('Since 12 Apr 2025 · 2 defences') && html.includes('Since 14 Sep 2026<'), 'reign line, no "0 defences"');
  assert(html.includes('No Photo &lt;b&gt;') && html.includes('sov-spot-none'), 'a champion without a photo gets initials, escaped');
  assert(html.includes('>W strawweight</button>') && (html.match(/data-spot-go=/g) || []).length === 4, 'one division button each');
  assert(html.includes('data-spot="play"') && html.includes('aria-label="Pause rotation"'), 'rotation can be paused');
  assert(html.includes('1 / 4'));
  assert(!O.build(base, h).includes('sov-spot') && O.build(base, h).includes('sov-chs'), 'grid without the register');
  assert.strictEqual(O.championCutoutURL('Petr Yan', { photos: [{ slug: 'petr-yan', file: 'x', cutout: { file: 'https://evil.example/x.webp' } }] }), '', 'only BEFN-held files');
  assert.deepStrictEqual([0, 1, 2, 9, 10].map(j => O.spotOffset(j, 0, 11)), [0, 1, 2, -2, -1], 'loop offsets');
  assert.deepStrictEqual([0, 9, 10].map(j => O.spotOffset(j, 10, 11)), [1, -1, 0]);
  // Every photo and cut-out in the register exists and names a current UFC champion.
  const divs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ufc-divisions.json'), 'utf8')).divisions;
  const champs = new Set(Object.values(divs).map(d => d.champion && d.champion.slug).filter(Boolean));
  for (const p of reg.photos) {
    assert(fs.existsSync(path.join(__dirname, '..', p.file)), p.file);
    assert(p.cutout && fs.existsSync(path.join(__dirname, '..', p.cutout.file)), p.slug + ' has a cut-out');
    assert.strictEqual(p.width * 5, p.height * 4, p.slug + ' is 4:5');
    assert(champs.has(p.slug), p.slug + ' is a current champion');
    assert(p.rights && p.credit && p.sha256 && p.cutout.sha256, p.slug + ' has provenance');
  }
}
console.log('champion spotlight ok');
