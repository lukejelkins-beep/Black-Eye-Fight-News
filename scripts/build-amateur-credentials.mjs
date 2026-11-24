#!/usr/bin/env node
// Builds data/ufc-amateur-credentials.json for the "Amateur career" section and badges on UFC profiles
// (owner approved option A with metallic medals, 25 Nov 2026).
//
// Reads only verified research: research/ufc-representative-credentials/reviews/*.json, lanes in state
// "seed" or "reviewed", claims that record a competition appearance (Games, youth Games or a national
// team appearance) with at least one https source from a games body, federation or delegation.
// Leads, needs_review lanes, selections, squads, trials and qualifiers are never published.
// Offline: no network. Usage: node scripts/build-amateur-credentials.mjs [--check]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWS = join(ROOT, 'research/ufc-representative-credentials/reviews');
const OUT = join(ROOT, 'data/ufc-amateur-credentials.json');

const SHOWN_KINDS = new Set(['games_participation', 'youth_games', 'team_appearance']);
const AUTHORITIES = new Set(['games', 'federation', 'delegation']);
const MEDAL_PLACE = { gold: 1, silver: 2, bronze: 3 };
const ORDINAL_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const COUNTRIES = {
  USA: 'USA', GBR: 'Great Britain', MDA: 'Moldova', RUS: 'Russia', FRA: 'France', CHN: 'China', KAZ: 'Kazakhstan',
  BRN: 'Bahrain', MEX: 'Mexico', IRI: 'Iran', IRL: 'Ireland', SWE: 'Sweden', AUS: 'Australia', NZL: 'New Zealand',
  CUB: 'Cuba', ESP: 'Spain', BRA: 'Brazil', POL: 'Poland', UKR: 'Ukraine', JPN: 'Japan', AUT: 'Austria', EGY: 'Egypt',
  LTU: 'Lithuania', EOR: 'Refugee Olympic Team', ISV: 'U.S. Virgin Islands', PER: 'Peru', FIN: 'Finland', THA: 'Thailand',
  KOR: 'South Korea', TJK: 'Tajikistan', GEO: 'Georgia', RSA: 'South Africa', SVK: 'Slovakia', CMR: 'Cameroon', SRB: 'Serbia',
  CAN: 'Canada', GER: 'Germany', ITA: 'Italy', NED: 'Netherlands', ARG: 'Argentina', CHI: 'Chile', COL: 'Colombia',
  ECU: 'Ecuador', VEN: 'Venezuela', UZB: 'Uzbekistan', KGZ: 'Kyrgyzstan', AZE: 'Azerbaijan', ARM: 'Armenia', TUR: 'Turkey',
  BUL: 'Bulgaria', ROU: 'Romania', HUN: 'Hungary', CZE: 'Czechia', CRO: 'Croatia', SUI: 'Switzerland', NOR: 'Norway',
  DEN: 'Denmark', BEL: 'Belgium', POR: 'Portugal', GRE: 'Greece', ISR: 'Israel', IND: 'India', PHI: 'Philippines',
  MGL: 'Mongolia', BLR: 'Belarus', LAT: 'Latvia', EST: 'Estonia', ALG: 'Algeria', MAR: 'Morocco', TUN: 'Tunisia',
  NGR: 'Nigeria', PUR: 'Puerto Rico', DOM: 'Dominican Republic', WAL: 'Wales', SCO: 'Scotland', ENG: 'England',
};
const CONTINENTAL = [
  [/\bEuropean\b/i, 'European'], [/\bPan[- ]?American\b|\bPan Am\b/i, 'Pan-American'], [/\bAsian\b/i, 'Asian'],
  [/\bAfrican\b/i, 'African'], [/\bOceania\b/i, 'Oceania'], [/\bSouth American\b/i, 'South American'],
  [/\bCommonwealth\b/i, 'Commonwealth'],
];
const TEAM_LEVEL = { senior: 'national team', open: 'national team', under_23: 'U23 team', junior: 'junior team', cadet: 'youth team', youth: 'youth team' };

export const country = d => COUNTRIES[d] || d;

export function yearOf(edition) {
  const m = String(edition).match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

export function placeOf(claim) {
  if (MEDAL_PLACE[claim.medal]) return MEDAL_PLACE[claim.medal];
  const r = String(claim.result || '');
  const n = r.match(/\b(\d{1,3})(?:st|nd|rd|th)\b/i);
  if (n) return Number(n[1]);
  const w = r.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  return w ? ORDINAL_WORDS[w[1]] : null;
}

const goodSource = s => s && AUTHORITIES.has(s.authority) && /^https:\/\//i.test(s.url || '') && !/google\.[a-z.]+\/search/i.test(s.url);

export function rowsFor(record) {
  const rows = [];
  for (const [lane, review] of Object.entries(record.lanes || {})) {
    if (!['seed', 'reviewed'].includes(review?.state)) continue;
    for (const c of review.claims || []) {
      if (!SHOWN_KINDS.has(c.kind)) continue;
      const source = (c.sources || []).find(goodSource);
      if (!source) continue;
      rows.push({
        lane, kind: c.kind, year: yearOf(c.edition), edition: c.edition, sport: c.sport, event: c.event,
        country: country(c.delegation), category: c.category, result: c.result,
        medal: MEDAL_PLACE[c.medal] ? c.medal : null, place: placeOf(c),
        source: { name: source.name, url: source.url },
      });
    }
  }
  return rows.sort((a, b) => (b.year || 0) - (a.year || 0) || (a.place || 99) - (b.place || 99));
}

const best = rows => rows.reduce((m, r) => (r.medal && (!m || MEDAL_PLACE[r.medal] < MEDAL_PLACE[m]) ? r.medal : m), null);

const titleLabel = (pool, prefix) => {
  const golds = pool.filter(r => r.medal === 'gold').length;
  return golds > 1 ? `${prefix} titles ×${golds}` : golds ? `${prefix} champion` : `${prefix} medallist`;
};

export function badgesFor(rows) {
  const badges = [];
  const rep = rows.filter(r => r.lane !== 'grappling');
  const grap = rows.filter(r => r.lane === 'grappling' && r.medal);
  const olympic = rep.filter(r => r.kind === 'games_participation' && r.lane === 'olympic');
  if (olympic.length) {
    const m = best(olympic);
    badges.push({ label: m === 'gold' ? 'Olympic champion' : m ? 'Olympic medallist' : 'Olympian', medal: m, highlight: m === 'gold' });
  }
  const worlds = rep.filter(r => /\bWorld\b/i.test(r.edition) && !/World Cup|University|Universiade|Games/i.test(r.edition) && r.medal);
  if (worlds.length) {
    const senior = worlds.filter(r => r.category === 'senior' || r.category === 'open');
    const pool = senior.length ? senior : worlds;
    badges.push({ label: titleLabel(pool, senior.length ? 'World' : 'Junior world'), medal: best(pool), highlight: false });
  }
  // Grappling: ADCC Worlds, then IBJJF black-belt titles (Worlds, then Pan or European).
  const adcc = grap.filter(r => r.org === 'ADCC' && r.kind !== 'grappling_trials');
  if (adcc.length) badges.push({ label: titleLabel(adcc, 'ADCC world'), medal: best(adcc), highlight: best(adcc) === 'gold' && !badges.some(b => b.highlight) });
  const black = grap.filter(r => r.org === 'IBJJF' && r.belt === 'black' && r.category === 'senior');
  const bjjWorlds = black.filter(r => /Worlds/.test(r.edition));
  if (bjjWorlds.length) badges.push({ label: titleLabel(bjjWorlds, 'BJJ world'), medal: best(bjjWorlds), highlight: false });
  else {
    const bjjCont = black.filter(r => /\bPan\b|European/.test(r.edition));
    if (bjjCont.length) badges.push({ label: titleLabel(bjjCont, /European/.test(bjjCont[0].edition) ? 'BJJ European' : 'BJJ Pan'), medal: best(bjjCont), highlight: false });
  }
  if (badges.length < 3) {
    for (const [re, name] of CONTINENTAL) {
      const cont = rep.filter(r => re.test(r.edition) && r.medal && (r.category === 'senior' || r.category === 'open'));
      if (!cont.length) continue;
      const m = best(cont);
      badges.push({ label: m === 'gold' ? `${name} champion` : `${name} medallist`, medal: m, highlight: false });
      break;
    }
  }
  if (badges.length < 3) {
    const team = rep.find(r => r.kind === 'team_appearance' && r.category === 'senior') || rep.find(r => r.kind === 'team_appearance');
    if (team) badges.push({ label: `${team.country} ${TEAM_LEVEL[team.category] || 'national team'}`, medal: null, highlight: false });
  }
  if (!badges.some(b => b.label.startsWith('ADCC')) && badges.length < 3) {
    const trials = rows.filter(r => r.kind === 'grappling_trials' && r.medal === 'gold');
    if (trials.length) badges.push({ label: 'ADCC Trials champion', medal: 'gold', highlight: false });
    else if (rows.some(r => r.org === 'ADCC' && r.kind === 'grappling_entry')) badges.push({ label: 'ADCC Worlds competitor', medal: null, highlight: false });
  }
  return badges.slice(0, 3);
}

// ---- BJJ and submission grappling (research/ufc-bjj-credentials) ----
// Rows come from the markdown results tables, only for fighters listed in profile-verified.json
// for that file, only adult or juvenile divisions (no masters, teens or kids), only names that
// start with the fighter's first name and end with their surname.
const BJJ_DIR = join(ROOT, 'research/ufc-bjj-credentials');
const BELTS = ['white', 'blue', 'purple', 'brown', 'black'];
const PLACE_WORDS = { gold: 1, silver: 2, bronze: 3, first: 1, second: 2, third: 3, fourth: 4 };
const norm = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

export function tables(markdown) {
  const out = []; let header = null;
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) { header = null; continue; }
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (!header) { header = cells; out.push({ header, rows: [] }); continue; }
    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
    out[out.length - 1].rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
  }
  return out;
}
const link = cell => { const m = String(cell).match(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/); return m ? { name: m[1], url: m[2] } : null; };
const medalOf = place => ({ 1: 'gold', 2: 'silver', 3: 'bronze' })[place] || null;
const nameFits = (published, slugName) => { const p = norm(published), w = norm(slugName); return p.length >= 2 && p[0] === w[0] && p[p.length - 1] === w[w.length - 1]; };

export function grapplingRows(names, dir = BJJ_DIR) {
  const verified = JSON.parse(readFileSync(join(dir, 'profile-verified.json'), 'utf8'));
  const rows = {};
  const add = (slug, row) => (rows[slug] ||= []).push(row);
  const adcc = tables(readFileSync(join(dir, 'adcc-results.md'), 'utf8'));
  for (const t of adcc) {
    if (t.header.includes('Placement') && t.header.includes('Event')) {
      // ADCC Trials wins (a separate table): shown as results, with a trials badge when nothing bigger exists.
      for (const r of t.rows) {
        const slug = r['Fighter slug']; const src = link(r.Source);
        if (!(verified['adcc-results.md'].trials || []).includes(slug) || !src) continue;
        const place = PLACE_WORDS[String(r.Placement).toLowerCase()] || null;
        add(slug, { lane: 'grappling', org: 'ADCC', kind: 'grappling_trials', year: yearOf(r.Event), edition: r.Event,
          sport: 'Submission grappling', event: r.Division, country: null, category: 'senior', result: r.Placement,
          medal: medalOf(place), place, belt: null, source: src });
      }
    } else if (t.header.includes('Placement')) {
      for (const r of t.rows) {
        const slug = r['Fighter slug']; const src = link(r.Source);
        if (!verified['adcc-results.md'].placements.includes(slug) || !src) continue;
        const place = PLACE_WORDS[String(r.Placement).toLowerCase()] || null;
        add(slug, { lane: 'grappling', org: 'ADCC', kind: 'grappling_result', year: yearOf(r.Edition), edition: `${r.Edition} ADCC World Championship`,
          sport: 'Submission grappling', event: r.Division, country: null, category: 'senior', result: r.Placement,
          medal: medalOf(place), place, belt: null, source: src });
      }
    } else if (t.header.includes('What is documented')) {
      for (const r of t.rows) {
        const slug = r['Fighter slug']; const src = link(r.Sources); const text = r['What is documented'];
        if (!verified['adcc-results.md'].entries.includes(slug) || !src || !/Competed/.test(text)) continue;
        add(slug, { lane: 'grappling', org: 'ADCC', kind: 'grappling_entry', year: yearOf(r.Edition), edition: `${yearOf(r.Edition)} ADCC World Championship`,
          sport: 'Submission grappling', event: r.Division, country: null, category: 'senior',
          result: text.replace(/^.*?Competed:\s*/, '').replace(/^./, c => c.toUpperCase()), medal: null, place: null, belt: null, source: src });
      }
    }
  }
  for (const file of ['ibjjf-world-results.md', 'ibjjf-majors-results.md']) {
    for (const t of tables(readFileSync(join(dir, file), 'utf8'))) {
      if (!t.header.includes('Published name')) continue;
      for (const r of t.rows) {
        const slug = r['Fighter slug']; const src = link(r.Source);
        if (!verified[file].includes(slug) || !src || !names[slug]) continue;
        // 'Corroborated' rows need the strict name match below. 'Corroborated (gym: …)' rows were
        // matched on academy against the UFC profile's gym; their published names carry extra
        // surnames, so only the first name and the fighter's surname have to appear.
        const gymCorroborated = /^Corroborated \(gym/.test(r.Identity || '');
        if (r.Identity && r.Identity !== 'Corroborated' && !gymCorroborated) continue;
        const div = r.Division; const d = div.toLowerCase();
        if (/master|teen|kids|infant|mirim|pee wee/.test(d)) continue;
        if (!/adult|juvenile/.test(d)) continue;
        const aliases = [names[slug], ...(names.aliases?.[slug] || [])];
        const loose = n => { const p = norm(r['Published name']), w = norm(n); return p[0] === w[0] && p.includes(w[w.length - 1]); };
        if (!aliases.some(n => nameFits(r['Published name'], n) || (gymCorroborated && loose(n)))) continue;
        const place = Number(r.Place) || null;
        const belt = BELTS.find(b => new RegExp(`\\b${b}\\b`, 'i').test(div)) || null;
        add(slug, { lane: 'grappling', org: 'IBJJF', kind: 'grappling_result', year: yearOf(r.Event), edition: `${r.Event} (IBJJF)`,
          sport: 'Brazilian jiu-jitsu', event: div.replace(/\s+\/\s+/g, ' · ').replace(/\s+/g, ' '), country: null,
          category: /juvenile/.test(d) ? 'junior' : 'senior', result: place ? `Place ${place}` : '', medal: medalOf(place), place, belt, source: src });
      }
    }
  }
  return rows;
}

export function build(dir = REVIEWS, bjjDir = BJJ_DIR) {
  const fighters = {};
  const all = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const record = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const rows = rowsFor(record);
    if (rows.length) all[record.slug] = rows;
  }
  if (bjjDir) {
    const cohort = JSON.parse(readFileSync(join(dir, '..', 'cohort.json'), 'utf8'));
    const names = Object.fromEntries((cohort.fighters || []).map(f => [f.slug, f.name]));
    names.aliases = { 'bia-mesquita': ['Beatriz Mesquita', 'Beatriz de Oliveira Mesquita'], 'marcus-almeida': ['Marcus Almeida', 'Marcus Buchecha Almeida'] };
    for (const [slug, rows] of Object.entries(grapplingRows(names, bjjDir))) (all[slug] ||= []).push(...rows);
  }
  for (const slug of Object.keys(all).sort()) {
    const rows = all[slug].sort((a, b) => (b.year || 0) - (a.year || 0) || (a.place || 99) - (b.place || 99));
    fighters[slug] = { badges: badgesFor(rows), rows };
  }
  return {
    schema: 1,
    note: 'Verified amateur and national-team results for UFC profiles, built from research/ufc-representative-credentials and research/ufc-bjj-credentials by scripts/build-amateur-credentials.mjs. Leads and unresolved records are never included.',
    fighters,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = JSON.stringify(build(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const current = readFileSync(OUT, 'utf8');
    if (current !== text) { console.error('data/ufc-amateur-credentials.json is out of date: run node scripts/build-amateur-credentials.mjs'); process.exit(1); }
    console.log('data/ufc-amateur-credentials.json is up to date');
  } else {
    writeFileSync(OUT, text);
    const d = JSON.parse(text);
    console.log(`${Object.keys(d.fighters).length} fighters, ${Object.values(d.fighters).reduce((n, f) => n + f.rows.length, 0)} results → ${OUT}`);
  }
}
