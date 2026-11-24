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

export function badgesFor(rows) {
  const badges = [];
  const olympic = rows.filter(r => r.kind === 'games_participation' && r.lane === 'olympic');
  if (olympic.length) {
    const m = best(olympic);
    badges.push({ label: m === 'gold' ? 'Olympic champion' : m ? 'Olympic medallist' : 'Olympian', medal: m, highlight: m === 'gold' });
  }
  const worlds = rows.filter(r => /\bWorld\b/i.test(r.edition) && !/World Cup|University|Universiade|Games/i.test(r.edition) && r.medal);
  if (worlds.length) {
    const senior = worlds.filter(r => r.category === 'senior' || r.category === 'open');
    const pool = senior.length ? senior : worlds;
    const golds = pool.filter(r => r.medal === 'gold').length;
    const prefix = senior.length ? 'World' : 'Junior world';
    badges.push({ label: golds > 1 ? `${prefix} titles ×${golds}` : golds ? `${prefix} champion` : `${prefix} medallist`, medal: best(pool), highlight: false });
  }
  if (badges.length < 3) {
    for (const [re, name] of CONTINENTAL) {
      const cont = rows.filter(r => re.test(r.edition) && r.medal && (r.category === 'senior' || r.category === 'open'));
      if (!cont.length) continue;
      const m = best(cont);
      badges.push({ label: m === 'gold' ? `${name} champion` : `${name} medallist`, medal: m, highlight: false });
      break;
    }
  }
  if (badges.length < 3) {
    const team = rows.find(r => r.kind === 'team_appearance' && r.category === 'senior') || rows.find(r => r.kind === 'team_appearance');
    if (team) badges.push({ label: `${team.country} ${TEAM_LEVEL[team.category] || 'national team'}`, medal: null, highlight: false });
  }
  return badges.slice(0, 3);
}

export function build(dir = REVIEWS) {
  const fighters = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const record = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const rows = rowsFor(record);
    if (!rows.length) continue;
    fighters[record.slug] = { badges: badgesFor(rows), rows };
  }
  return {
    schema: 1,
    note: 'Verified amateur and national-team results for UFC profiles, built from research/ufc-representative-credentials by scripts/build-amateur-credentials.mjs. Leads and unresolved records are never included.',
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
