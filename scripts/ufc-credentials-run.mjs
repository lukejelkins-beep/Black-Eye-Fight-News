#!/usr/bin/env node
/**
 * Research runner for external combat-sport credentials of approved UFC fighters.
 * Research only: writes data/ufc-credentials/<slug>.json and a run directory. It never touches site pages,
 * collector-owned files, the Cito API or the UFCalendar budget, and never changes the 783-fighter cohort.
 *
 * Passes (owner plan, 22 Nov 2026):
 *   1  Sonnet 5.5 + web search, medium effort, one fighter per call, parallel workers.
 *   2  Opus 5.5, high effort, only fighters carrying a flag after pass 1 (or 2).
 *   3  Opus 5.5, high effort: a seeded random 5-10% sample of fighters, plus every Tier A claim.
 *
 *   node scripts/ufc-credentials-run.mjs --pass 1 --pilot --max-calls 60 --workers 4 [--run-id ID] [--dry-run]
 *   node scripts/ufc-credentials-run.mjs --pass 2 --pilot --max-calls 40 --run-id ID --resume
 *   node scripts/ufc-credentials-run.mjs --pass 3 --pilot --max-calls 30 --sample 0.075 --seed s
 *
 * Fail closed: --max-calls is mandatory, selection above 25 fighters needs BEFN_CREDENTIALS_APPROVED_CALLS
 * (the owner's approved model-call budget) to be set to at least --max-calls, and ANTHROPIC credentials are
 * only read by the Anthropic SDK from its usual environment, never from files or arguments.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCHEMA_VERSION, SCOPE, DISCIPLINES, LEVELS, FLAGS, TIERS, validateRecord, summarise} from './ufc-credentials-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PILOT_CAP = 25;
export const PASSES = {
  1: {model: 'claude-sonnet-5-5', effort: 'medium', tools: ['web_search']},
  2: {model: 'claude-opus-5-5', effort: 'high', tools: ['web_search']},
  3: {model: 'claude-opus-5-5', effort: 'high', tools: ['web_search', 'web_fetch']},
};
/** USD per million tokens (Anthropic price list cached 2026-11-03) and an ASSUMED per-search price: check before relying on cost. */
export const PRICES = {
  'claude-sonnet-5-5': {in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5},
  'claude-opus-5-5': {in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5},
  searchUsd: 0.01,
};
const MAX_CONTINUATIONS = 4;
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

/* ---------- roster, skip list, selection ---------- */
/** Every fighter with a certified BEFN UFC profile (owner, 24 Nov 2026): the frozen 783, the 24 Nov extension cohort
 * and the weekly rolling cohort. `resolved` are slugs whose identity certification settled (certified, not an alias). */
export function loadRoster(rootDir = root) {
  const approval = read(path.join(rootDir, 'data/ufc-36-month-roster-approval.json'));
  if (approval.approvedFighters?.length !== 783 || approval.approvedCount !== 783) throw Error('Approved 783-fighter roster required');
  const opt = f => { try { return read(path.join(rootDir, f)); } catch { return null; } };
  const ext = opt('data/ufc-extension-cohort-approval-20261124.json')?.approvedFighters || [];
  const rolling = Object.keys(opt('data/ufc-rolling-certification.json')?.members || {});
  const slugs = [...new Set([...approval.approvedFighters, ...ext, ...rolling])];
  const names = new Map();
  try {
    for (const f of read(path.join(rootDir, 'data/ufc-36-month-candidates.json')).fighters || []) names.set(f.slug, {name: f.name, lastUfcFight: f.lastUfcFight || null});
  } catch { /* names fall back to the slug */ }
  const form = opt('data/ufc-fighter-form.json')?.fighters || {};
  for (const s of slugs) if (!names.has(s) && form[s]) names.set(s, {name: form[s].name, lastUfcFight: form[s].lastFight || null});
  const careers = opt('data/ufc-v4-certified-careers.json') || {};
  const register = opt('data/ufc-independent-full-career-verification.json')?.fighters || {};
  const aliases = new Set([...Object.keys(careers.statsAliases || {}),
    ...Object.entries(register).filter(([, e]) => e?.ownerConfirmedDuplicateOf).map(([s]) => s)]);
  const certified = new Set([...Object.keys(careers.certified || {}), ...Object.keys(careers.extension?.certified || {}),
    ...Object.keys(careers.rolling?.certified || {})]);
  const resolved = new Set([...certified].filter(s => !aliases.has(s)));
  return {slugs, set: new Set(slugs), names, resolved, aliases};
}

/** Reviewed official college athletics hosts that are not .edu (e.g. gopsusports.com), host -> school. */
export function loadSchoolHosts(rootDir = root) {
  try { return Object.keys(read(path.join(rootDir, 'data/ufc-credentials/_school-athletics-hosts.json')).hosts || {}); }
  catch { return []; }
}

/** Duplicate identities. A "-N" slug and its base are skipped unless certification settled that slug's identity
 * (`resolved`); a confirmed alias (`aliases`) and the saved list are always skipped. */
export function duplicateIdentitySkips(slugs, extra = [], {resolved = new Set(), aliases = new Set()} = {}) {
  const set = new Set(slugs), skip = new Set([...extra, ...[...aliases].filter(a => set.has(a))]), pairs = [];
  for (const s of slugs) {
    const m = /^(.*)-(\d+)$/.exec(s);
    if (!m) continue;
    pairs.push({suffixed: s, base: set.has(m[1]) ? m[1] : null});
    if (!resolved.has(s)) skip.add(s);
    if (set.has(m[1]) && !resolved.has(m[1])) skip.add(m[1]);
  }
  return {skip, pairs};
}

/* ---------- prompts ---------- */
const TEMPLATE = {
  identity: {status: 'confirmed | unclear', note: 'optional: how identity was matched'},
  flags: ['conflict | thin_sources | identity_unclear | needs_escalation'],
  disciplines: Object.fromEntries(DISCIPLINES.map(d => [d, {
    status: 'none_found | claimed | verified | unknown', note: 'optional',
    sources_checked: [{name: 'source or database searched', url: 'optional', checked: 'YYYY-MM-DD'}],
    claims: [{text: 'one fact in your own words', level: 'from the level list', level_note: 'only when level is other',
      source_url: 'https page that states it', source_name: 'publisher or database', tier: 'A | B | C',
      retrieved: 'YYYY-MM-DD', year: 2015,
      ncaa_division: 'only for ncaa_d1 / ncaa_other: I | II | III',
      ncaa_result: 'only for ncaa_d1 / ncaa_other: participant | all_american | finalist | champion'}],
  }])),
};
export function systemPrompt(pass) {
  return [
    'You research the external combat-sport background of one UFC fighter for a personal, non-commercial fight-news site. Accuracy matters more than coverage: the main risk is confident invention of belts, medals and titles, so a wrong claim is far worse than an empty answer.',
    `Disciplines, all required: ${DISCIPLINES.join(', ')}. "grappling" means submission grappling (for example ADCC), not a gym label. A bio calling someone a "wrestler" can mean high school only. A BJJ belt is verified only with a federation or lineage record.`,
    `Evidence tiers: A = governing-body or database record (IJF, JudoInside, UWW, NCAA, FIAS, IBJJF, BoxRec, ADCC, Olympics). B = reputable outlet, or the fighter's own gym or team page. C = self-reported, Wikipedia-only, forums, social media. Tier C is only ever a claim. Search results pages are never a source: cite the exact page that states the fact.`,
    `Level list (use exactly one per claim): ${LEVELS.join(', ')}. "belt_<colour>" covers BJJ belts and judo dan grades. "other" needs level_note.`,
    'College wrestling: NCAA means NCAA only. Use ncaa_d1 (Division I) or ncaa_other (Division II or III) with ncaa_division, and ncaa_result: participant = on the team roster; all_american = placed top eight at the NCAA championships; finalist = reached the final; champion = won the NCAA title. One claim per season or result. Junior college (NJCAA) and NAIA are not NCAA: use level "other" with level_note "NJCAA" or "NAIA". A college\'s own athletics site (its roster or wrestler bio) counts as Tier A for participation only; All-American, finalist and champion need the NCAA championship bracket or results (ncaa.com, ncaa.org) or two independent Tier B outlets. Check the division of the school in that season: schools move between divisions.',
    'Status per discipline: none_found = you searched the relevant sources and list them in sources_checked and found nothing; claimed = a claim exists but only Tier C or a single weak source; verified = a Tier A record, or two independent Tier B sources; unknown = you could not tell. Unknown beats a guess. Never infer a credential from a fight style or a gym name.',
    'Identity: confirm the person with the UFC athlete page (name, division, country, age) before using any result. Common names and same-name athletes are traps: if you cannot tell them apart, set identity.status to "unclear" and add the identity_unclear flag instead of choosing one.',
    'Write every claim in your own words, one fact each, under 300 characters, with no quotation marks around source wording.',
    `Flags: ${FLAGS.join(', ')}. Use conflict when sources disagree, thin_sources when a claim rests on a single or weak source, needs_escalation when a stronger model should look again.`,
    `Use today's date for every "retrieved" and "checked" value. Reply with one JSON object only, no prose, in this shape:\n${JSON.stringify(TEMPLATE)}`,
    pass === 2 ? 'This is a second look at a flagged result. Re-check the flagged points with better sources, remove anything you cannot support, and return the complete corrected object.' : '',
  ].filter(Boolean).join('\n\n');
}
export function pass1User({slug, name, lastUfcFight, today, only = null}) {
  const scope = only && only.length ? `Research ONLY: ${only.join(', ')}. Return every other discipline as {"status":"unknown","claims":[],"sources_checked":[]}` : 'Research all seven disciplines';
  return `Today is ${today}. Fighter: ${name} (roster slug ${slug})${lastUfcFight ? `, last UFC bout ${lastUfcFight}` : ''}. ${scope} and return the JSON object.`;
}
export function pass2User({slug, name, today, record}) {
  const keep = {identity: record.identity, flags: record.flags, disciplines: Object.fromEntries(DISCIPLINES.map(d => [d, {status: record.disciplines[d].status, claims: record.disciplines[d].claims.map(({text, source_url, source_name, tier, level, level_note, year, ncaa_division, ncaa_result}) => ({text, source_url, source_name, tier, level, level_note, year, ncaa_division, ncaa_result}))}]))};
  return `Today is ${today}. Fighter: ${name} (roster slug ${slug}). The first pass flagged: ${record.flags.join(', ') || 'nothing'}. First-pass result:\n${JSON.stringify(keep)}\nResolve the flags and return the full JSON object.`;
}
export function pass3System() {
  return `You audit research claims about a UFC fighter's combat-sport background. For each claim, open its source_url yourself (fetch it, or search for the exact record) and check three things: the page states the fact, it is about this same person, and the level and year are right. Never trust the claim text. Verdicts: confirmed, partial (supported but level, year or detail is off), refuted (the source does not say this, or it is another person), unreachable (you could not open or find the source). Reply with one JSON object only: {"audits":[{"id":"...","verdict":"confirmed|partial|refuted|unreachable","note":"short, own words"}]}. Use today's date nowhere; no other fields.`;
}
export function pass3User({slug, name, items, today}) {
  return `Today is ${today}. Fighter: ${name} (roster slug ${slug}). Audit these claims:\n${JSON.stringify(items)}`;
}

/* ---------- model output handling ---------- */
export function extractJson(text) {
  const s = String(text ?? '').replace(/```(?:json)?/g, '');
  for (let start = s.indexOf('{'); start !== -1; start = s.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

export function buildRecord({slug, name, parsed, pass, usage, today, model, effort, at}) {
  return {
    schema: SCHEMA_VERSION, scope: SCOPE, nonproduction: true, slug, name,
    identity: parsed.identity, flags: parsed.flags, disciplines: parsed.disciplines,
    researched: {date: today, pass},
    history: [{pass, model, effort, at, requests: usage.requests, input_tokens: usage.input, output_tokens: usage.output, web_searches: usage.searches}],
  };
}

export function claimItems(record, {allClaims}) {
  const items = [];
  for (const d of DISCIPLINES) record.disciplines[d].claims.forEach((c, i) => {
    if (allClaims || c.tier === 'A') items.push({id: `${d}:${i}`, discipline: d, tier: c.tier, text: c.text, source_url: c.source_url, level: c.level, year: c.year});
  });
  return items;
}

export function applyAudit(record, audits, {today, model, sampled, at}) {
  const next = JSON.parse(JSON.stringify(record));
  const rejected = next.rejected_claims || [];
  const byId = new Map((audits || []).filter(a => a && typeof a.id === 'string').map(a => [a.id, a]));
  let refuted = 0, partial = 0, unreachable = 0, confirmed = 0;
  const flags = new Set(next.flags);
  for (const d of DISCIPLINES) {
    const kept = [];
    next.disciplines[d].claims.forEach((c, i) => {
      const a = byId.get(`${d}:${i}`);
      if (!a) return kept.push(c);
      if (a.verdict === 'refuted') {
        refuted++; flags.add('conflict'); flags.add('needs_escalation');
        rejected.push({discipline: d, text: c.text, source_url: c.source_url, reason: 'refuted_in_pass_3', note: String(a.note || '').slice(0, 200)});
        return;
      }
      if (a.verdict === 'partial') { partial++; flags.add('needs_escalation'); c.audit = 'partial'; }
      else if (a.verdict === 'unreachable') { unreachable++; c.audit = 'unreachable'; }
      else if (a.verdict === 'confirmed') { confirmed++; c.audit = 'confirmed'; }
      kept.push(c);
    });
    next.disciplines[d].claims = kept;
  }
  next.flags = [...flags];
  next.rejected_claims = rejected;
  next.audit = {pass: 3, model, at, date: today, sampled, hasTierA: DISCIPLINES.some(d => record.disciplines[d].claims.some(c => c.tier === 'A')), confirmed, partial, refuted, unreachable, audited: byId.size};
  next.history = [...(next.history || []), {pass: 3, model, at}];
  return next;
}

/* ---------- sampling ---------- */
export function mulberry32(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Pass 3 selection: seeded 5-10% random sample of fighters (all their claims) plus every Tier A claim. */
export function selectPass3(records, {rate = 0.075, seed = 'befn-credentials'} = {}) {
  if (!(rate >= 0.05 && rate <= 0.10)) throw Error('Pass 3 sample rate must be 5-10%');
  const slugs = records.map(r => r.slug).sort();
  const rnd = mulberry32(seed + ':' + slugs.length), pool = [...slugs];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const n = slugs.length ? Math.max(1, Math.round(rate * slugs.length)) : 0;
  const sampled = new Set(pool.slice(0, n));
  const out = [];
  for (const r of records) {
    const hasA = DISCIPLINES.some(d => r.disciplines[d].claims.some(c => c.tier === 'A'));
    const hasClaims = DISCIPLINES.some(d => r.disciplines[d].claims.length);
    if ((sampled.has(r.slug) && hasClaims) || hasA) out.push({slug: r.slug, sampled: sampled.has(r.slug), hasTierA: hasA});
  }
  return out;
}

/* ---------- cost, log, checkpoint ---------- */
export function estimateCost(model, u) {
  const p = PRICES[model]; if (!p) return null;
  return (u.input * p.in + u.output * p.out + (u.cacheRead || 0) * p.cacheRead + (u.cacheWrite || 0) * p.cacheWrite) / 1e6 + (u.searches || 0) * PRICES.searchUsd;
}
export class RunLog {
  constructor(dir, meta) {
    this.dir = dir; fs.mkdirSync(dir, {recursive: true});
    this.file = path.join(dir, 'run-log.json'); this.reqFile = path.join(dir, 'requests.jsonl');
    this.data = fs.existsSync(this.file) ? read(this.file) : {schema: 1, ...meta, startedAt: new Date().toISOString(), passes: {}, totals: {requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, web_searches: 0, estimated_cost_usd: 0}, outcomes: {}};
    this.data.resumes = (this.data.resumes || 0) + (fs.existsSync(this.file) ? 1 : 0);
  }
  request(rec) {
    fs.appendFileSync(this.reqFile, JSON.stringify(rec) + '\n');
    const t = this.data.totals, p = (this.data.passes[rec.pass] ||= {requests: 0, input_tokens: 0, output_tokens: 0, web_searches: 0, estimated_cost_usd: 0});
    for (const x of [t, p]) { x.requests++; x.input_tokens += rec.input_tokens; x.output_tokens += rec.output_tokens; x.web_searches += rec.web_searches; x.estimated_cost_usd += rec.estimated_cost_usd || 0; }
    t.cache_read_tokens += rec.cache_read_tokens || 0; t.cache_write_tokens += rec.cache_write_tokens || 0;
  }
  outcome(pass, kind) { const o = (this.data.outcomes[pass] ||= {}); o[kind] = (o[kind] || 0) + 1; }
  save(extra = {}) { Object.assign(this.data, extra, {updatedAt: new Date().toISOString()}); fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1) + '\n'); }
}
export function loadCheckpoint(dir) {
  const f = path.join(dir, 'checkpoint.jsonl'), done = new Set();
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.outcome === 'ok') done.add(`${r.pass}:${r.slug}`); } catch { /* torn last line from a killed run */ }
  }
  return done;
}
const writeAtomic = (file, data) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n'); fs.renameSync(tmp, file); };

export class Budget {
  constructor(max) { this.max = max; this.used = 0; }
  take() { if (this.used >= this.max) return false; this.used++; return true; }
}
export async function pool(items, workers, fn) {
  let i = 0;
  await Promise.all(Array.from({length: Math.max(1, Math.min(workers, items.length))}, async () => { while (i < items.length) { const item = items[i++]; await fn(item); } }));
}

/* ---------- live model client ---------- */
export async function createLiveCall({fallbacks = true} = {}) {
  let Anthropic;
  try { ({default: Anthropic} = await import('@anthropic-ai/sdk')); }
  catch { throw Error('The Anthropic SDK is not installed. Run `npm install --no-save @anthropic-ai/sdk` (it is deliberately not a repo dependency).'); }
  const client = new Anthropic({maxRetries: 4});
  const toolDefs = {
    web_search: {type: 'web_search_20260209', name: 'web_search', max_uses: 10},
    web_fetch: {type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12},
  };
  /** One research call: loops on pause_turn (server-side search turn limit). Each HTTP request takes one budget unit. */
  return async function call({model, effort, system, user, tools, budget, onRequest}) {
    const messages = [{role: 'user', content: user}];
    const usage = {requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0};
    let text = '', stop = null;
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      if (!budget.take()) { const e = Error('model-call budget exhausted'); e.code = 'budget'; throw e; }
      const t0 = Date.now();
      const body = {model, max_tokens: 16000, system, messages, tools: tools.map(t => toolDefs[t]), output_config: {effort}};
      if (fallbacks) Object.assign(body, {betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'});
      const resp = await client.beta.messages.create(body);
      const u = resp.usage || {};
      const r = {input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, searches: u.server_tool_use?.web_search_requests || 0};
      usage.requests++; usage.input += r.input; usage.output += r.output; usage.cacheRead += r.cacheRead; usage.cacheWrite += r.cacheWrite; usage.searches += r.searches;
      onRequest?.({...r, ms: Date.now() - t0, stop_reason: resp.stop_reason, served_by: resp.model});
      stop = resp.stop_reason;
      if (stop === 'pause_turn') { messages.push({role: 'assistant', content: resp.content}); continue; }
      text = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      break;
    }
    return {text, usage, stop};
  };
}

/* ---------- pass runners ---------- */
function fighterFile(out, slug) { return path.join(out, slug + '.json'); }
function loadRecord(out, slug) { const f = fighterFile(out, slug); return fs.existsSync(f) ? read(f) : null; }

/**
 * Run one pass over `slugs`. `call` is injectable so tests never touch the network.
 * Returns per-outcome counts. Fighters are checkpointed one by one; --resume skips completed ones.
 */
export async function runPass({pass, slugs, roster, out, runDir, call, workers = 4, maxCalls, resume = false, today, only = null, sample = {}, log = null, now = () => new Date().toISOString()}) {
  const cfg = PASSES[pass]; if (!cfg) throw Error('pass must be 1, 2 or 3');
  fs.mkdirSync(runDir, {recursive: true});
  const runLog = log || new RunLog(runDir, {runId: path.basename(runDir)});
  const done = resume ? loadCheckpoint(runDir) : new Set();
  const budget = new Budget(maxCalls);
  const checkpoint = rec => fs.appendFileSync(path.join(runDir, 'checkpoint.jsonl'), JSON.stringify({...rec, at: now()}) + '\n');
  let queue;
  if (pass === 1) queue = slugs.map(slug => ({slug}));
  else if (pass === 2) queue = slugs.map(slug => ({slug, record: loadRecord(out, slug)})).filter(x => x.record && x.record.flags.length && !(x.record.history || []).some(h => h.pass >= 2));
  else {
    const recs = slugs.map(slug => loadRecord(out, slug)).filter(Boolean);
    queue = selectPass3(recs, sample).filter(x => !(loadRecord(out, x.slug).history || []).some(h => h.pass === 3)).map(x => ({...x, record: loadRecord(out, x.slug)}));
  }
  queue = queue.filter(x => !done.has(`${pass}:${x.slug}`));
  const counts = {queued: queue.length, ok: 0, invalid: 0, error: 0, budget: 0};

  await pool(queue, workers, async item => {
    const {slug} = item, info = roster.names.get(slug) || {name: slug.replace(/-/g, ' ')};
    if (budget.used >= budget.max) { counts.budget++; runLog.outcome(pass, 'budget'); return; }
    try {
      const sys = pass === 3 ? pass3System() : systemPrompt(pass);
      let user, items;
      if (pass === 1) user = pass1User({slug, name: info.name, lastUfcFight: info.lastUfcFight, today, only});
      else if (pass === 2) user = pass2User({slug, name: info.name, today, record: item.record});
      else { items = claimItems(item.record, {allClaims: item.sampled}); user = pass3User({slug, name: info.name, items, today}); }
      const res = await call({model: cfg.model, effort: cfg.effort, system: sys, user, tools: cfg.tools, budget,
        onRequest: r => runLog.request({slug, pass, model: cfg.model, effort: cfg.effort, input_tokens: r.input, output_tokens: r.output, cache_read_tokens: r.cacheRead, cache_write_tokens: r.cacheWrite, web_searches: r.searches, ms: r.ms, stop_reason: r.stop_reason, served_by: r.served_by, estimated_cost_usd: estimateCost(cfg.model, r)})});
      const parsed = extractJson(res.text);
      let raw;
      if (!parsed) throw Object.assign(Error('no JSON in model reply (stop_reason ' + res.stop + ')'), {code: 'invalid'});
      if (pass === 3) raw = applyAudit(item.record, parsed.audits, {today, model: cfg.model, sampled: item.sampled, at: now()});
      else {
        raw = buildRecord({slug, name: info.name, parsed, pass, usage: res.usage, today, model: cfg.model, effort: cfg.effort, at: now()});
        if (pass === 2) { raw.history = [...(item.record.history || []), ...raw.history]; }
      }
      const v = validateRecord(raw, {today, rosterSlugs: roster.set, skipSlugs: roster.skip, schoolHosts: roster.schoolHosts || []});
      if (!v.ok) throw Object.assign(Error('validation: ' + v.errors.join(',')), {code: 'invalid'});
      writeAtomic(fighterFile(out, slug), v.record);
      counts.ok++; runLog.outcome(pass, 'ok');
      checkpoint({pass, slug, outcome: 'ok', flags: v.record.flags, dropped: v.dropped.length});
    } catch (e) {
      const kind = e.code === 'budget' ? 'budget' : e.code === 'invalid' ? 'invalid' : 'error';
      counts[kind]++; runLog.outcome(pass, kind);
      checkpoint({pass, slug, outcome: kind, message: String(e.message).slice(0, 200)});
    }
    runLog.save();
  });
  runLog.save({lastPass: pass, counts: {...(runLog.data.counts || {}), [pass]: counts}, budget: {max: maxCalls, used: budget.used}});
  return counts;
}

/* ---------- CLI ---------- */
function parseArgs(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) continue; const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; } }
  return a;
}
export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const pass = Number(a.pass); if (![1, 2, 3].includes(pass)) throw Error('--pass 1|2|3 required');
  const maxCalls = Number(a['max-calls']); if (!Number.isInteger(maxCalls) || maxCalls < 1) throw Error('--max-calls N is mandatory (model-call budget)');
  const roster = loadRoster();
  const out = path.resolve(root, a.out || 'data/ufc-credentials');
  const extraSkips = (() => { try { return read(path.join(out, '_skip-duplicate-identities.json')).skipSlugs || []; } catch { return []; } })();
  const dup = duplicateIdentitySkips(roster.slugs, extraSkips, roster);
  roster.schoolHosts = loadSchoolHosts();
  roster.skip = dup.skip;
  let selection;
  if (a.pilot) selection = read(path.join(root, 'data/ufc-credentials-pilot.json')).fighters.map(f => f.slug);
  else if (a.slugs) selection = String(a.slugs).split(',').map(s => s.trim()).filter(Boolean);
  else throw Error('choose --pilot or --slugs a,b (a full-roster run is not wired: it needs the owner\'s budget and approval)');
  const bad = selection.filter(s => !roster.set.has(s)); if (bad.length) throw Error('not in approved roster: ' + bad.join(', '));
  const skipped = selection.filter(s => roster.skip.has(s)); selection = selection.filter(s => !roster.skip.has(s));
  // A plan-only run (prompts out, saved replies in) makes no model call, so the API budget guard does not apply.
  const planOnly = Boolean(a['emit-prompts'] || a['from-dir']);
  const only = a.disciplines ? String(a.disciplines).split(',').map(x => x.trim()).filter(Boolean) : null;
  if (only && only.some(d => !DISCIPLINES.includes(d))) throw Error('unknown discipline in --disciplines');
  if (!planOnly && selection.length > PILOT_CAP && !(Number(process.env.BEFN_CREDENTIALS_APPROVED_CALLS) >= maxCalls))
    throw Error(`More than ${PILOT_CAP} fighters needs the owner's approved model-call budget: set BEFN_CREDENTIALS_APPROVED_CALLS to at least --max-calls`);
  const today = a.today || new Date().toISOString().slice(0, 10);
  const runId = a['run-id'] || `run-${today}-${Date.now().toString(36)}`;
  const runDir = path.join(out, '_runs', runId);
  console.log(JSON.stringify({pass, model: PASSES[pass].model, effort: PASSES[pass].effort, fighters: selection.length, skippedDuplicateIdentity: skipped, maxCalls, runDir: path.relative(root, runDir), dryRun: !!a['dry-run']}));
  if (a['dry-run']) return;
  fs.mkdirSync(out, {recursive: true});
  if (a['emit-prompts']) { // write one prompt file per fighter for a human-driven (Claude Code subagent) run; no model call
    const dir = path.resolve(a['emit-prompts']); fs.mkdirSync(dir, {recursive: true});
    for (const slug of selection) {
      const info = roster.names.get(slug) || {name: slug}, rec = loadRecord(out, slug);
      if (pass === 2 && !(rec && rec.flags.length)) continue;
      let user;
      if (pass === 1) user = pass1User({slug, name: info.name, lastUfcFight: info.lastUfcFight, today, only});
      else if (pass === 2) user = pass2User({slug, name: info.name, today, record: rec});
      else { const s = selectPass3(selection.map(x => loadRecord(out, x)).filter(Boolean), {rate: a.sample ? Number(a.sample) : 0.075, seed: a.seed || 'befn-credentials'}).find(x => x.slug === slug); if (!s) continue; user = pass3User({slug, name: info.name, items: claimItems(rec, {allClaims: s.sampled}), today}); }
      fs.writeFileSync(path.join(dir, slug + '.txt'), (pass === 3 ? pass3System() : systemPrompt(pass)) + '\n\n---\n\n' + user + '\n');
    }
    console.log('prompts written: ' + fs.readdirSync(dir).length); return;
  }
  // --from-dir: ingest replies a person or Claude Code subagents saved as <slug>.json; no API, no key, tokens unknown
  const call = a['from-dir'] ? async ({user, budget}) => {
    const slug = /roster slug ([a-z0-9-]+)/.exec(user)[1], f = path.join(path.resolve(a['from-dir']), slug + '.json');
    if (!fs.existsSync(f)) throw Object.assign(Error('no reply file'), {code: 'error'});
    budget.take(); return {text: fs.readFileSync(f, 'utf8'), usage: {requests: 0, input: 0, output: 0, searches: 0}, stop: 'end_turn'};
  } : await createLiveCall({fallbacks: !a['no-fallbacks']});
  const log = new RunLog(runDir, {runId, dataset: SCOPE});
  const onStop = () => { log.save({interrupted: true}); process.exit(130); };
  process.on('SIGINT', onStop); process.on('SIGTERM', onStop);
  const counts = await runPass({pass, slugs: selection, roster, out, runDir, call, workers: Number(a.workers || 4), maxCalls, resume: !!a.resume, today, only, log,
    sample: {rate: a.sample ? Number(a.sample) : 0.075, seed: a.seed || 'befn-credentials'}});
  console.log(JSON.stringify({counts, totals: log.data.totals}));
  const recs = selection.map(s => loadRecord(out, s)).filter(Boolean);
  console.log(JSON.stringify(summarise(recs)));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
