#!/usr/bin/env node
/**
 * Schema and validator for per-fighter external combat-sport credentials.
 * Research only: nothing here is read by a site page, a rating or a certificate.
 * Offline: no network, no API calls. `node scripts/ufc-credentials-schema.mjs [dir]` validates saved files
 * (default: every research folder, research/ufc-credentials-pilot and research/ufc-ncaa-credentials).
 *
 * Rules (owner handover 22 Nov 2026, AGENTS.md wins on conflict):
 *  - A claim without an http(s) URL, a tier A/B/C or a valid retrieved date is dropped.
 *  - Unknown beats a guess: a status the claims cannot support is lowered, never raised.
 *  - Tier C (self-reported, Wikipedia-only, forums, social media) is always "claimed", never fact.
 *  - Claim text is in our own words: a long quoted span is dropped.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const SCHEMA_VERSION = 1;
export const SCOPE = 'ufc-external-credentials';
export const DISCIPLINES = ['wrestling', 'grappling', 'judo', 'kickboxing', 'boxing', 'bjj', 'sambo'];
export const STATUSES = ['none_found', 'claimed', 'verified', 'unknown'];
export const TIERS = ['A', 'B', 'C'];
export const FLAGS = ['conflict', 'thin_sources', 'identity_unclear', 'needs_escalation'];
export const AUDIT_VERDICTS = ['confirmed', 'partial', 'refuted', 'unreachable'];
export const BELT_COLOURS = ['white', 'blue', 'purple', 'brown', 'black', 'coral', 'red'];
/** Fixed level list. `belt_<colour>` covers BJJ belts and judo dan grades; `other` needs `level_note`. */
export const LEVELS = ['youth', 'high_school', 'ncaa_d1', 'ncaa_other', 'national_team', 'national_champion',
  'continental_medal', 'world_medal', 'olympic', 'pro', ...BELT_COLOURS.map(c => 'belt_' + c), 'other'];

/** Hosts whose records count as Tier A (governing body or database record). Anything else claimed as A is held at B. */
export const TIER_A_HOSTS = ['ijf.org', 'judoinside.com', 'uww.org', 'unitedworldwrestling.org', 'ncaa.com', 'ncaa.org',
  'sambo.sport', 'fias.sport', 'ibjjf.com', 'ibjjfdb.com', 'boxrec.com', 'adcombat.com', 'olympics.com', 'olympedia.org',
  'worldboxing.org', 'wako.sport', 'muaythai.sport', 'immaf.org', 'usawrestling.org', 'teamusa.org', 'usajudo.com'];
/** NCAA claims (owner, 24 Nov 2026). `ncaa_result` separates being on a team from placing at the championships. */
export const NCAA_DIVISIONS = ['I', 'II', 'III'];
export const NCAA_RESULTS = ['participant', 'all_american', 'finalist', 'champion'];
/** A college's own athletics site (a reviewed official athletics host, listed in
 * research/ufc-ncaa-credentials/_school-athletics-hosts.json) is Tier A proof of being on that NCAA team (ncaa_result
 * "participant") and nothing more (owner, 24 Nov 2026). A .edu host is not enough on its own: news, alumni and
 * student-paper pages are not rosters. Placings and titles still need ncaa.com / ncaa.org or two independent Tier B sources. */
export const isSchoolAthleticsHost = (host, reviewed = []) => Boolean(host) && hostIn(host, reviewed);
/** Hosts that are never better than Tier C, whatever the model says. */
export const TIER_C_HOSTS = ['wikipedia.org', 'wikidata.org', 'fandom.com', 'reddit.com', 'facebook.com', 'instagram.com',
  'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'quora.com', 'threads.net', 'bestfightodds.com'];
const SEARCH_URL = /(^|\.)((google|bing|duckduckgo|yahoo|baidu|yandex)\.[a-z.]+)$/;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = x => ISO.test(String(x ?? '')) && !Number.isNaN(Date.parse(x + 'T00:00:00Z')) &&
  new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const isPlain = x => x && typeof x === 'object' && !Array.isArray(x);
const str = x => (typeof x === 'string' ? x.trim() : '');

export function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch { return null; }
}
const hostIn = (host, list) => list.some(h => host === h || host.endsWith('.' + h));
const levelOk = l => LEVELS.includes(l);
/** A quoted span of 5+ words means copied wording. */
export const hasLongQuote = t => /["“”]([^"“”]*)["“”]/g.test(t) &&
  [...t.matchAll(/["“]([^"“”]+)["”]/g)].some(m => m[1].trim().split(/\s+/).length >= 5);

/** Validate one claim. Returns {claim} or {drop: reason}; `notes` collects non-fatal adjustments. */
export function validateClaim(raw, {today, notes = [], schoolHosts = []} = {}) {
  if (!isPlain(raw)) return {drop: 'not_an_object'};
  const text = str(raw.text);
  if (!text) return {drop: 'missing_text'};
  if (text.length > 300) return {drop: 'text_too_long'};
  if (hasLongQuote(text)) return {drop: 'copied_quote'};
  const url = str(raw.source_url);
  const host = hostOf(url);
  if (!host) return {drop: 'missing_or_invalid_url'};
  if (SEARCH_URL.test(host) || /\/search[/?]/.test(url)) return {drop: 'search_result_url'};
  if (!TIERS.includes(raw.tier)) return {drop: 'missing_or_invalid_tier'};
  if (!validDate(raw.retrieved)) return {drop: 'missing_or_invalid_retrieved_date'};
  if (today && raw.retrieved > today) return {drop: 'retrieved_date_in_future'};
  const name = str(raw.source_name);
  if (!name) return {drop: 'missing_source_name'};
  const level = str(raw.level);
  if (!levelOk(level)) return {drop: 'level_not_in_fixed_list'};
  const levelNote = str(raw.level_note);
  if (level === 'other' && !levelNote) return {drop: 'other_level_needs_note'};
  const audit = raw.audit === undefined || raw.audit === null ? null : raw.audit;
  if (audit !== null && !AUDIT_VERDICTS.includes(audit)) return {drop: 'invalid_audit_verdict'};
  if (audit === 'refuted') return {drop: 'refuted_by_audit'};

  const ncaa = level === 'ncaa_d1' || level === 'ncaa_other';
  let division = raw.ncaa_division ?? null, result = raw.ncaa_result ?? null;
  if (!ncaa && (division !== null || result !== null)) { notes.push('ncaa_fields_cleared_on_non_ncaa_level'); division = result = null; }
  if (ncaa) {
    if (division !== null && !NCAA_DIVISIONS.includes(division)) return {drop: 'invalid_ncaa_division'};
    if (result !== null && !NCAA_RESULTS.includes(result)) return {drop: 'invalid_ncaa_result'};
    if (level === 'ncaa_d1' && division !== null && division !== 'I') return {drop: 'ncaa_d1_with_other_division'};
    if (level === 'ncaa_other' && division === 'I') return {drop: 'ncaa_other_with_division_I'};
  }
  const effectiveDivision = level === 'ncaa_d1' ? 'I' : division;   // implied for Division I, never written for it

  let tier = raw.tier;
  if (hostIn(host, TIER_C_HOSTS) && tier !== 'C') { notes.push('tier_held_at_C_for_host:' + host); tier = 'C'; }
  else if (ncaa && result === 'participant' && effectiveDivision && isSchoolAthleticsHost(host, schoolHosts) && tier !== 'C') {
    if (tier !== 'A') notes.push('tier_A_school_athletics_participation:' + host);
    tier = 'A';
  }
  else if (tier === 'A' && !hostIn(host, TIER_A_HOSTS)) { notes.push('tier_A_held_at_B_unlisted_host:' + host); tier = 'B'; }
  const thisYear = Number((today || new Date().toISOString().slice(0, 10)).slice(0, 4));
  let year = raw.year ?? null;
  if (year !== null && !(Number.isInteger(year) && year >= 1950 && year <= thisYear)) { notes.push('invalid_year_cleared'); year = null; }
  const claim = {text, source_url: url, source_name: name, tier, retrieved: raw.retrieved, year, level};
  if (levelNote) claim.level_note = levelNote;
  if (ncaa && division) claim.ncaa_division = division;
  if (ncaa && result) claim.ncaa_result = result;
  if (audit) claim.audit = audit;
  claim.display = tier === 'C' ? 'claimed' : 'sourced';
  return {claim};
}

/** The highest status the surviving claims can support. */
export function supportedStatus(claims, identityUnclear = false) {
  const counted = claims.filter(c => c.audit !== 'unreachable');
  if (!claims.length) return 'unknown';
  const hasA = counted.some(c => c.tier === 'A');
  const bHosts = new Set(counted.filter(c => c.tier === 'B').map(c => hostOf(c.source_url)));
  if (!identityUnclear && (hasA || bHosts.size >= 2)) return 'verified';
  return 'claimed';
}

const rank = {unknown: 0, none_found: 0, claimed: 1, verified: 2};

function validateSourcesChecked(list, today, notes) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    const name = str(s?.name);
    if (name && validDate(s?.checked) && (!today || s.checked <= today)) {
      const e = {name, checked: s.checked};
      const u = str(s.url);
      if (u && hostOf(u)) e.url = u;
      out.push(e);
    } else notes.push('sources_checked_entry_dropped');
  }
  return out;
}

/**
 * Validate and normalise a whole fighter record.
 * @returns {{ok:boolean, errors:string[], record?:object, dropped:object[], adjustments:string[]}}
 */
export function validateRecord(raw, {today = new Date().toISOString().slice(0, 10), rosterSlugs = null, skipSlugs = null, schoolHosts = []} = {}) {
  const errors = [], dropped = [], adjustments = [];
  if (!isPlain(raw)) return {ok: false, errors: ['record_not_an_object'], dropped, adjustments};
  if (raw.schema !== SCHEMA_VERSION) errors.push('schema_version_mismatch');
  if (raw.scope !== SCOPE) errors.push('wrong_scope');
  const slug = str(raw.slug);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.push('invalid_slug');
  else {
    if (rosterSlugs && !rosterSlugs.has(slug)) errors.push('slug_not_in_approved_roster');
    if (skipSlugs && skipSlugs.has(slug)) errors.push('slug_is_skipped_duplicate_identity');
  }
  if (raw.nonproduction !== true) errors.push('nonproduction_must_be_true');
  if (!isPlain(raw.disciplines)) errors.push('disciplines_missing');
  if (errors.length) return {ok: false, errors, dropped, adjustments};

  const identityStatus = raw.identity?.status === 'unclear' ? 'unclear' : 'confirmed';
  const flags = new Set((Array.isArray(raw.flags) ? raw.flags : []).filter(f => FLAGS.includes(f)));
  if (Array.isArray(raw.flags) && raw.flags.some(f => !FLAGS.includes(f))) adjustments.push('unknown_flag_dropped');
  if (identityStatus === 'unclear') flags.add('identity_unclear');
  if (flags.has('identity_unclear')) { /* keep identity unclear if the model flagged it */ }
  const identityUnclear = identityStatus === 'unclear' || flags.has('identity_unclear');

  const disciplines = {};
  for (const d of DISCIPLINES) {
    const rd = raw.disciplines[d];
    const notes = [];
    if (!isPlain(rd)) {
      adjustments.push(`${d}:missing_discipline_set_unknown`);
      disciplines[d] = {status: 'unknown', levels: [], claims: [], sources_checked: []};
      continue;
    }
    const claims = [], seen = new Set();
    for (const c of Array.isArray(rd.claims) ? rd.claims : []) {
      const r = validateClaim(c, {today, notes, schoolHosts});
      if (r.drop) { dropped.push({discipline: d, reason: r.drop, source_url: str(c?.source_url) || null}); continue; }
      const key = r.claim.source_url + '|' + r.claim.text.toLowerCase();
      if (seen.has(key)) { dropped.push({discipline: d, reason: 'duplicate_claim', source_url: r.claim.source_url}); continue; }
      seen.add(key); claims.push(r.claim);
    }
    const sources_checked = validateSourcesChecked(rd.sources_checked, today, notes);
    let status = STATUSES.includes(rd.status) ? rd.status : 'unknown';
    if (!STATUSES.includes(rd.status)) notes.push('invalid_status_set_unknown');
    const cap = supportedStatus(claims, identityUnclear);
    if (claims.length === 0) {
      if (status === 'claimed' || status === 'verified') { notes.push('status_lowered_no_valid_claims'); status = 'unknown'; }
      // "not found" only means something if a governing body or database was actually searched (pilot: 45 of 46 were not)
      if (status === 'none_found' && !sources_checked.some(s => s.url && hostIn(hostOf(s.url) || '', TIER_A_HOSTS))) { notes.push('none_found_without_authority_search_set_unknown'); status = 'unknown'; }
    } else {
      if (status === 'none_found') { notes.push('none_found_contradicted_by_claims'); flags.add('conflict'); status = cap; }
      else if (status === 'unknown') status = cap === 'verified' ? 'claimed' : cap; // claims exist; never above claimed on the model's own doubt
      else if (rank[status] > rank[cap]) { notes.push(`status_lowered_${status}_to_${cap}`); status = cap; }
    }
    if (status === 'verified' || status === 'claimed') {
      const sourced = claims.filter(c => c.tier !== 'C');
      if (!sourced.length || (claims.length === 1 && claims[0].tier !== 'A')) flags.add('thin_sources');
    }
    const levels = [...new Set(claims.map(c => c.level))].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b));
    disciplines[d] = {status, levels, claims, sources_checked};
    const note = str(rd.note);
    if (note) disciplines[d].note = note.slice(0, 300).trim();
    for (const n of notes) adjustments.push(`${d}:${n}`);
  }

  const out = {
    schema: SCHEMA_VERSION, scope: SCOPE, nonproduction: true,
    slug, name: str(raw.name) || null,
    identity: {status: identityStatus},
    researched: isPlain(raw.researched) ? raw.researched : null,
    flags: FLAGS.filter(f => flags.has(f)),
    disciplines,
  };
  if (raw.identity?.note) out.identity.note = str(raw.identity.note).slice(0, 300).trim();
  if (Array.isArray(raw.history)) out.history = raw.history;
  if (isPlain(raw.audit)) out.audit = raw.audit;
  if (Array.isArray(raw.rejected_claims)) out.rejected_claims = raw.rejected_claims;
  out.validation = {dropped, adjustments};
  return {ok: true, errors: [], record: out, dropped, adjustments};
}

/** Counts used by run reports. */
export function summarise(records) {
  const byStatus = {}, byTier = {A: 0, B: 0, C: 0}, flags = {};
  for (const r of records) {
    for (const d of DISCIPLINES) {
      const x = r.disciplines[d];
      byStatus[x.status] = (byStatus[x.status] || 0) + 1;
      for (const c of x.claims) byTier[c.tier]++;
    }
    for (const f of r.flags) flags[f] = (flags[f] || 0) + 1;
  }
  return {fighters: records.length, disciplineStatus: byStatus, claimsByTier: byTier, flags};
}

/** Validate every saved fighter file in a directory (files starting with _ are run state, not fighters). */
export function validateDirectory(dir, opts = {}) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort() : [];
  const results = files.map(f => {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return {file: f, ok: false, errors: ['unreadable_json']}; }
    const r = validateRecord(raw, opts);
    const errors = [...r.errors];
    if (r.ok && f !== r.record.slug + '.json') errors.push('filename_does_not_match_slug');
    // a saved file must already be normalised: re-validation may not change it
    if (r.ok && JSON.stringify(r.record.disciplines) !== JSON.stringify(raw.disciplines)) errors.push('saved_file_not_normalised');
    return {file: f, ok: errors.length === 0, errors};
  });
  return {files: files.length, failures: results.filter(r => !r.ok), results};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  import('./ufc-credentials-run.mjs').then(({loadRoster, loadSchoolHosts, RESEARCH_DIRS}) => {
    const dirs = process.argv[2] ? [path.resolve(process.argv[2])] : RESEARCH_DIRS.map(d => path.join(root, d));
    let failing = 0;
    for (const dir of dirs) {
      const res = validateDirectory(dir, {rosterSlugs: loadRoster(root).set, schoolHosts: loadSchoolHosts(root)});
      for (const f of res.failures) console.error(path.relative(root, dir) + '/' + f.file + ': ' + f.errors.join(', '));
      console.log(`${path.relative(root, dir)}: ${res.files} fighter files, ${res.failures.length} failing`);
      failing += res.failures.length;
    }
    process.exit(failing ? 1 : 0);
  });
}
