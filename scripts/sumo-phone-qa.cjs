/* BEFN Sumo phone QA: runs docs/design/PHONE-CHECKLIST-2026-11-28-sumo.md as a script on emulated phones
   (iPhone 13 and iPhone SE in Chromium, touch, real finger swipes via CDP touch events) and at 1440 px.
   Serve the site first (python3 -m http.server 8765 --bind 127.0.0.1), then:
     node scripts/sumo-phone-qa.cjs [screenshot dir]    (BASE=<url> to point it elsewhere)
   Not a substitute for Safari: WebKit, the iOS share sheet and native pickers need a real iPhone. */
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const OUT = process.argv[2] || 'qa/sumo-previews';
require('fs').mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (dev, section, item, ok, note = '') => { results.push({ dev, section, item, ok: !!ok, note }); console.log((ok ? 'PASS' : 'FAIL') + ' [' + dev + '] ' + section + ': ' + item + (note ? ' (' + note + ')' : '')); };
/* A real finger swipe: touch start, moves in small steps, touch end (dx < 0 moves the finger left). */
async function swipe(page, cdp, sel, dx) {
  const b = await page.locator(sel).first().boundingBox();
  const x = b.x + b.width * (dx < 0 ? 0.8 : 0.2), y = b.y + b.height / 2, steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / steps, y }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
}
const go = async (page, hash, wait = 1200) => { await page.goto(BASE + hash, { waitUntil: 'networkidle' }); await page.waitForTimeout(wait); };
const inView = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight; }, sel);

(async () => {
  const browser = await chromium.launch();
  for (const [name, dev] of [['iPhone 13', devices['iPhone 13']], ['iPhone SE', devices['iPhone SE']]]) {
    const ctx = await browser.newContext({ ...dev, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const shot = async n => page.screenshot({ path: OUT + '/' + name.replace(/\W/g, '') + '-' + n + '.png' });

    // ---- Navigation
    await go(page, 'sumo.html#review');
    const pills = await page.evaluate(() => { const a = [...document.querySelectorAll('.sh-sub a')].filter(x => !x.hidden && x.offsetParent); return { n: a.length, rows: new Set(a.map(x => Math.round(x.getBoundingClientRect().top))).size, cut: a.filter(x => x.getBoundingClientRect().right > innerWidth + 1).map(x => x.textContent) }; });
    rec(name, 'Navigation', 'Analysis: five buttons, none cut off', pills.n === 5 && !pills.cut.length, pills.rows + ' rows');
    await go(page, 'sumo.html#rikishi');
    const fp = await page.evaluate(() => { const a = [...document.querySelectorAll('.sh-sub a')].filter(x => !x.hidden && x.offsetParent); return { n: a.length, cut: a.filter(x => x.getBoundingClientRect().right > innerWidth + 1).length }; });
    rec(name, 'Navigation', 'Fighters: all four visible', fp.n === 4 && !fp.cut);
    await go(page, 'sumo.html#profile/8850');
    const h1 = await page.evaluate(() => { const r = document.querySelector('#sumo-main h1').getBoundingClientRect(); return { top: Math.round(r.top), vh: innerHeight }; });
    rec(name, 'Navigation', 'Profile name visible without scrolling', h1.top < h1.vh - 30, h1.top + ' of ' + h1.vh + ' px');
    // Profile results: one compact line per bout (owner, 28 Nov 2026), details one tap deeper, names never cut off.
    const rows = await page.evaluate(() => { const r = [...document.querySelectorAll('.sumo-results-desk .sumo-ed-row')]; return { n: r.length, avg: Math.round(r.reduce((s, x) => s + x.getBoundingClientRect().height, 0) / Math.max(1, r.length)), cut: [...document.querySelectorAll('.sumo-ed-who>a')].filter(a => a.scrollWidth > a.clientWidth + 1).map(a => a.textContent) }; });
    rec(name, 'Profile results', 'Compact bout rows (under 72 px), no name cut off', rows.n >= 10 && rows.avg < 72 && !rows.cut.length, rows.n + ' rows, ' + rows.avg + ' px each');
    const r2 = page.locator('.sumo-results-desk .sumo-ed-row .sumo-ed-row-main').nth(1); await r2.scrollIntoViewIfNeeded(); await r2.tap({ position: { x: 6, y: 20 } }); await page.waitForTimeout(400);
    rec(name, 'Profile results', 'Tap a bout: its details open', await page.locator('.sumo-results-desk .sumo-ed-row').nth(1).getAttribute('open') === '');

    // ---- Sumo home
    await go(page, 'sumo.html#home');
    const brief = await page.evaluate(() => [...document.querySelectorAll('.shome-bcard')].map(c => ({ t: c.querySelector('strong')?.textContent, faces: c.querySelectorAll('.shome-face').length })));
    rec(name, 'Home', 'Basho in brief: four cards with faces', brief.length === 4 && brief.every(c => c.faces > 0), brief.map(c => c.t).join(' / '));
    await page.locator('.shome-bcard[href*="at=stars"]').tap(); await page.waitForTimeout(2200);
    rec(name, 'Home', 'Tap Gold stars: review opens at Gold stars', page.url().includes('#review') && await inView(page, '#at-stars'));
    await shot('home-to-stars');
    await page.goBack(); await page.waitForTimeout(1500);
    rec(name, 'Home', 'Back returns to the Sumo home', /#home/.test(page.url()) && await page.locator('.shome-brief').count() === 1);

    // ---- Basho review
    await go(page, 'sumo.html#review', 2000);
    const chart = await page.evaluate(() => { const svg = [...document.querySelectorAll('.sana-chart svg')].find(s => s.getBoundingClientRect().width > 0); return { lines: svg ? svg.querySelectorAll('.sana-line').length : 0, legend: document.querySelectorAll('.sana-legend li').length }; });
    rec(name, 'Basho review', 'Title race: four lines, names and records above', chart.lines === 4 && chart.legend === 4);
    await page.locator('.sana-chart').scrollIntoViewIfNeeded();
    const svgBox = await page.locator('.sana-chart svg.is-narrow').boundingBox();
    const before = await page.evaluate(() => document.getElementById('day-by-day').getBoundingClientRect().top);
    // day 8 column centre in the narrow drawing: L=30, R=12, width 360 -> x = 30 + 7*(318/14)
    await page.touchscreen.tap(svgBox.x + (30 + 7 * (318 / 14)) * svgBox.width / 360, svgBox.y + svgBox.height * 0.4); await page.waitForTimeout(700);
    const after = await page.evaluate(() => document.getElementById('day-by-day').getBoundingClientRect().top);
    rec(name, 'Basho review', 'Tap chart near day 8: Day 8 shows, page does not jump', (await page.locator('.sana-dayhead h3').textContent()).trim() === 'Day 8' && Math.abs(after - before) < 4, 'moved ' + Math.round(after - before) + ' px');
    await go(page, 'sumo.html#review', 2000);
    await page.locator('.sana-pick').scrollIntoViewIfNeeded();
    const strip = await page.evaluate(() => { const s = document.querySelector('.sana-pick'), on = s.querySelector('[aria-pressed="true"]'); const r = on.getBoundingClientRect(), q = s.getBoundingClientRect(); return { rows: new Set([...s.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().top))).size, chosen: on.textContent, visible: r.left >= q.left - 1 && r.right <= q.right + 1 }; });
    rec(name, 'Basho review', 'Day buttons: one row, chosen day in view', strip.rows === 1 && strip.visible, 'day ' + strip.chosen);
    await swipe(page, cdp, '.sana-pick', 280); await swipe(page, cdp, '.sana-pick', 280);
    const d3vis = await page.evaluate(() => { const s = document.querySelector('.sana-pick'), b = s.querySelector('[data-analysis-day="3"]'); const r = b.getBoundingClientRect(), q = s.getBoundingClientRect(); return r.left >= q.left - 1 && r.right <= q.right + 1; });
    rec(name, 'Basho review', 'Swipe the strip to day 3', d3vis);
    const sl = await page.evaluate(() => document.querySelector('.sana-pick').scrollLeft);
    await page.locator('.sana-pick [data-analysis-day="3"]').tap(); await page.waitForTimeout(700);
    const sl2 = await page.evaluate(() => document.querySelector('.sana-pick').scrollLeft);
    const d3after = await page.evaluate(() => { const s = document.querySelector('.sana-pick'), b = s.querySelector('[data-analysis-day="3"]'); const r = b.getBoundingClientRect(), q = s.getBoundingClientRect(); return r.left >= q.left - 1 && r.right <= q.right + 1; });
    rec(name, 'Basho review', 'Tap day 3: Day 3 shows and its button stays in view', (await page.locator('.sana-dayhead h3').textContent()).trim() === 'Day 3' && d3after, 'strip moved ' + Math.round(sl2 - sl) + ' px to keep it centred');
    await page.locator('[data-analysis-division="Juryo"]').tap(); await page.waitForTimeout(700);
    const jur = (await page.locator('.sana-bouts h3').textContent()).startsWith('Juryo') && await page.evaluate(() => [...document.querySelectorAll('.sana-standings li small')].every(s => /^J\d/.test(s.textContent)));
    rec(name, 'Basho review', 'Juryo tab: Juryo results and standings', jur);
    await shot('review-juryo');
    const link = page.url();
    await page.locator('[data-analysis-division="Makuuchi"]').tap(); await page.waitForTimeout(600);
    rec(name, 'Basho review', 'Makuuchi tab: back to Makuuchi', (await page.locator('.sana-bouts h3').textContent()).startsWith('Makuuchi'));
    const p2 = await ctx.newPage(); await p2.goto(link, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1500);
    rec(name, 'Basho review', 'Pasted link opens the same day and division', (await p2.locator('.sana-dayhead h3').textContent()).trim() === 'Day 3' && (await p2.locator('.sana-bouts h3').textContent()).startsWith('Juryo'), link.split('#')[1]);
    await p2.close();
    await go(page, 'sumo.html#review', 2000);
    await page.locator('.srev-tiles').first().scrollIntoViewIfNeeded();
    const t0 = await page.evaluate(() => document.querySelector('.srev-tiles').scrollLeft);
    await swipe(page, cdp, '.srev-tiles', -300);
    const tiles = await page.evaluate(() => { const s = document.querySelector('.srev-tiles'); const imgs = [...s.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth); const stretched = imgs.filter(i => { const fit = getComputedStyle(i).objectFit; return fit !== 'contain' && fit !== 'cover'; }); return { left: s.scrollLeft, snap: getComputedStyle(s).scrollSnapType, imgs: imgs.length, stretched: stretched.length }; });
    rec(name, 'Basho review', 'Photo tiles swipe and snap, nothing stretched', tiles.left > t0 && /mandatory|proximity/.test(tiles.snap) && tiles.stretched === 0, tiles.imgs + ' photos, snap ' + tiles.snap);
    await page.locator('[data-review-select]').selectOption('202507'); await page.waitForTimeout(2500);
    rec(name, 'Basho review', 'Tournament picker: July 2025 loads', /July 2025/.test(await page.locator('.sumo-review h1').textContent()));
    await go(page, 'sumo.html#review', 2000);
    const share = await page.evaluate(() => typeof navigator.share);
    await page.locator('[data-recap-copy]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-recap-copy]').first().tap(); await page.waitForTimeout(600);
    const copied = (await page.locator('.slive-recap-ok').first().textContent()).trim();
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    rec(name, 'Basho review', 'Copy recap: "Copied" and the text is on the clipboard', copied === 'Copied' && /November 2026, day 15/.test(clip), 'share sheet API: ' + share + ' (real share sheet needs Safari)');

    // ---- Live preview
    await go(page, 'sumo.html#review?liveday=9', 2000);
    rec(name, 'Live preview', 'Preview label, Day 10 picks, race chart and day view', await page.locator('.slive-preview').count() === 1 && /Day 10 picks/.test(await page.locator('#sumo-main').innerText()) && await page.locator('.sana-chart').count() === 1 && await page.locator('#day-by-day').count() === 1);

    // ---- Predictor
    await go(page, 'sumo.html#predict', 2000);
    await page.locator('.spr-face').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -100));
    const y0 = await page.evaluate(() => scrollY);
    const ids = await page.evaluate(() => { const o = [...document.querySelectorAll('[data-predict-select="a"] option')]; return { hosh: o.find(x => /^Hoshoryu/.test(x.textContent))?.value, koto: o.find(x => /^Kotozakura/.test(x.textContent))?.value }; });
    await page.locator('[data-predict-select="a"]').selectOption(ids.hosh); await page.waitForTimeout(900);
    await page.locator('[data-predict-select="b"]').selectOption(ids.koto); await page.waitForTimeout(900);
    const names = await page.locator('.spr-side strong').allTextContents(), y1 = await page.evaluate(() => scrollY);
    rec(name, 'Predictor', 'Pickers: Hoshoryu v Kotozakura updates, no jump to top', names[0] === 'Hoshoryu' && names[1] === 'Kotozakura' && Math.abs(y1 - y0) < 60, (await page.locator('.spr-pct').allTextContents()).join(' v ') + ', scroll moved ' + (y1 - y0));
    await page.locator('[data-predict-swap]').tap(); await page.waitForTimeout(900);
    const sw = await page.locator('.spr-side strong').allTextContents();
    rec(name, 'Predictor', 'Swap button swaps the two', sw[0] === 'Kotozakura' && sw[1] === 'Hoshoryu');
    const why = await page.evaluate(() => { const li = [...document.querySelectorAll('.spr-why li')]; const overlap = li.filter(l => { const b = l.querySelector('.spr-wbar').getBoundingClientRect(); return [...l.querySelectorAll('.spr-wl,.spr-wn')].some(t => { const r = t.getBoundingClientRect(); return !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom); }); }); return { n: li.length, overlap: overlap.length }; });
    rec(name, 'Predictor', 'What decides it: seven rows, no text over a bar', why.n === 7 && why.overlap === 0);
    rec(name, 'Predictor', 'Live record says it starts in January 2027', /Starts with the January 2027 basho/.test(await page.locator('#live-record').innerText()));
    const det = page.locator('#track-record details summary'); await det.scrollIntoViewIfNeeded(); await det.tap(); await page.waitForTimeout(300);
    const open1 = await page.evaluate(() => document.querySelector('#track-record details').open); await det.tap(); await page.waitForTimeout(300);
    rec(name, 'Predictor', '"How the predictor works" opens and closes', open1 && !(await page.evaluate(() => document.querySelector('#track-record details').open)));
    await shot('predictor');

    // ---- Bouts
    await go(page, 'sumo.html#matchups', 2200);
    const bouts = await page.evaluate(() => ({ items: document.querySelectorAll('.sumo-daily-grid .bout-item').length, strips: document.querySelectorAll('.sumo-daily-grid .bout-chance').length, tags: [...document.querySelectorAll('.sumo-daily-grid .bout-chance em')].map(e => e.textContent) }));
    rec(name, 'Bouts', 'A strip under each Makuuchi bout, with Called/Missed/Upset', bouts.items > 0 && bouts.strips === bouts.items && bouts.tags.every(t => /^(Called|Missed|Upset)$/.test(t)), bouts.strips + ' of ' + bouts.items);
    const firstStrip = page.locator('.sumo-daily-grid .bout-chance').first(); await firstStrip.scrollIntoViewIfNeeded(); await shot('bouts');
    await firstStrip.tap(); await page.waitForTimeout(1800);
    rec(name, 'Bouts', 'Tap a strip: Predictor opens with those two', /#predict\?a=\d+&b=\d+/.test(page.url()) && await page.locator('.spr-side').count() === 2);
    await go(page, 'sumo.html#matchups', 2200);
    await page.locator('[data-matchup-division="Juryo"]').first().tap(); await page.waitForTimeout(900);
    const jb = await page.evaluate(() => ({ items: document.querySelectorAll('.sumo-daily-grid .bout-item').length, strips: document.querySelectorAll('.sumo-daily-grid .bout-chance').length }));
    rec(name, 'Bouts', 'Juryo: most bouts have the strip', jb.strips >= jb.items - 2 && jb.strips > 0, jb.strips + ' of ' + jb.items);
    await page.locator('[data-matchup-division="Makushita"]').first().tap(); await page.waitForTimeout(900);
    rec(name, 'Bouts', 'Makushita: no strip (expected)', await page.locator('.sumo-daily-grid .bout-chance').count() === 0);

    // ---- Stories
    await go(page, 'sumo-stories.html', 2500);
    const hero = await page.evaluate(() => { const h = document.querySelector('.st-hero h1'); const heads = [...document.querySelectorAll('.st-rowhead h2,.st-card h3')]; return { title: h?.textContent, bg: getComputedStyle(document.querySelector('.st-hero')).backgroundColor, caps: heads.filter(x => getComputedStyle(x).textTransform === 'uppercase').length }; });
    rec(name, 'Stories', 'Dark band "True, surprising and sourced", headings not in capitals', hero.title === 'True, surprising and sourced' && /21, 17, 21/.test(hero.bg) && hero.caps === 0);
    for (let y = 0; y < 9000; y += 700) { await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(60); }
    const cards = await page.evaluate(() => { const rails = [...document.querySelectorAll('.st-rail')]; let noBand = 0, uneven = 0; for (const r of rails) { const cs = [...r.querySelectorAll('.st-card')]; noBand += cs.filter(c => !c.querySelector('.st-band') && getComputedStyle(c, '::before').content === 'none').length; const bottoms = new Set(cs.map(c => Math.round(c.getBoundingClientRect().height))); if (bottoms.size > 1) uneven++; } return { rails: rails.length, noBand, uneven }; });
    rec(name, 'Stories', 'Every card has a blue band; cards in a row line up', cards.noBand === 0 && cards.uneven === 0, cards.rails + ' rows');
    await page.evaluate(() => scrollTo(0, 0)); await page.locator('.st-rail').first().scrollIntoViewIfNeeded();
    const r0 = await page.evaluate(() => document.querySelector('.st-rail').scrollLeft);
    await swipe(page, cdp, '.st-rail', -250);
    rec(name, 'Stories', 'Rows swipe sideways', await page.evaluate(() => document.querySelector('.st-rail').scrollLeft) > r0);
    const seeAll = page.locator('.st-all').first(); await seeAll.scrollIntoViewIfNeeded(); await seeAll.tap(); await page.waitForTimeout(500);
    const grid = await page.locator('.st-rail.is-open').count(); const fewer = (await page.locator('.st-all').first().textContent()).trim();
    await page.locator('.st-all').first().tap(); await page.waitForTimeout(500);
    rec(name, 'Stories', '"See all" opens a grid, "Show fewer" closes it', grid === 1 && fewer === 'Show fewer' && await page.locator('.st-rail.is-open').count() === 0);
    const clamp = await page.evaluate(() => [...document.querySelectorAll('.st-card p')].every(p => getComputedStyle(p).webkitLineClamp === '6'));
    rec(name, 'Stories', 'Long descriptions stop at six lines', clamp);
    await shot('stories');

    // ---- Insights
    await go(page, 'sumo.html#insights/power', 4000);
    const ins = await page.evaluate(() => { const s = [...document.querySelectorAll('#power .srev-tile-bd strong')]; return { n: s.length, cut: s.filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent) }; });
    rec(name, 'Insights', 'Underrated and overrated: tiles, names not cut off', ins.n >= 6 && !ins.cut.length, ins.n + ' tiles');

    rec(name, 'All pages', 'No JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  // ---- Desktop
  const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await d.goto(BASE + 'sumo.html#review', { waitUntil: 'networkidle' }); await d.waitForTimeout(2000);
  const desk = await d.evaluate(() => { const w = document.querySelector('.sana-chart svg.is-wide'); const g = document.querySelector('.sana-grid2'); return { ends: w && w.getBoundingClientRect().width > 0 ? w.querySelectorAll('.sana-end').length : 0, cols: g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0 }; });
  rec('Desktop 1440', 'Desktop', 'Chart names at line ends; results and standings side by side', desk.ends === 4 && desk.cols === 2);
  await browser.close();
  const fail = results.filter(r => !r.ok);
  require('fs').writeFileSync(OUT + '/phonecheck.json', JSON.stringify(results, null, 1));
  console.log('\n' + (results.length - fail.length) + ' of ' + results.length + ' passed' + (fail.length ? '; FAILED: ' + fail.map(f => f.dev + ' ' + f.item).join(' | ') : ''));
})();
