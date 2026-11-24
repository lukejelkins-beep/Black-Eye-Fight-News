import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractJson, loadRoster, duplicateIdentitySkips, selectPass3, applyAudit, claimItems, runPass, RunLog, loadCheckpoint, Budget, pool,
  estimateCost, systemPrompt, pass1User, PASSES, PILOT_CAP, mulberry32} from '../scripts/ufc-credentials-run.mjs';
import {validateRecord, DISCIPLINES, SCHEMA_VERSION, SCOPE} from '../scripts/ufc-credentials-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = '2026-11-22';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'credrun-'));
const claim = (o = {}) => ({text: 'Won a national title in 2012.', source_url: 'https://www.ijf.org/judoka/1', source_name: 'IJF', tier: 'A', retrieved: today, year: 2012, level: 'national_champion', ...o});
const modelReply = (d = {}, flags = []) => JSON.stringify({identity: {status: 'confirmed'}, flags, disciplines: d});
const mkRoster = slugs => ({slugs, set: new Set(slugs), skip: new Set(), names: new Map(slugs.map(s => [s, {name: s.toUpperCase(), lastUfcFight: '2026-01-01'}]))});
const usage = (o = {}) => ({requests: 1, input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, searches: 3, ...o});
/** A fake model: reply per slug, counting every call and honouring the budget like the live client does. */
const fake = (replies, calls = []) => async ({model, effort, user, budget, onRequest}) => {
  if (!budget.take()) throw Object.assign(Error('budget'), {code: 'budget'});
  const slug = /roster slug ([a-z0-9-]+)/.exec(user)[1];
  calls.push({slug, model, effort});
  onRequest?.({input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, searches: 3, ms: 5, stop_reason: 'end_turn'});
  const r = typeof replies === 'function' ? replies(slug, user) : replies[slug];
  return {text: 'Here you go:\n```json\n' + r + '\n```', usage: usage(), stop: 'end_turn'};
};

test('extractJson finds the object in fenced or chatty replies and survives braces inside strings', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), {a: 1});
  assert.deepEqual(extractJson('Sure! {"a":"x } y"} thanks'), {a: 'x } y'});
  assert.deepEqual(extractJson('{bad json} then {"ok":true}'), {ok: true});
  assert.equal(extractJson('no json here'), null);
});

test('the real approved roster loads and names resolve', () => {
  const r = loadRoster(root);
  assert.equal(r.slugs.length, 783);
  assert.equal(r.names.get('bo-nickal').name, 'Bo Nickal');
});

test('duplicate-identity slugs are skipped with their base, and listed', () => {
  const {skip, pairs} = duplicateIdentitySkips(['carlos-hernandez', 'carlos-hernandez-7', 'anthony-romero-3', 'bo-nickal']);
  assert.deepEqual([...skip].sort(), ['anthony-romero-3', 'carlos-hernandez', 'carlos-hernandez-7']);
  assert.deepEqual(pairs, [{suffixed: 'carlos-hernandez-7', base: 'carlos-hernandez'}, {suffixed: 'anthony-romero-3', base: null}]);
  const real = duplicateIdentitySkips(loadRoster(root).slugs);
  assert.deepEqual([...real.skip].sort(), ['anthony-romero-3', 'carlos-calderon-3', 'carlos-hernandez', 'carlos-hernandez-7', 'waldo-cortes-acosta-2']);
});

test('the pilot has 25 roster fighters, none of them duplicate-identity, and the models match the plan', () => {
  const pilot = JSON.parse(fs.readFileSync(path.join(root, 'data/ufc-credentials-pilot.json'), 'utf8')).fighters;
  const roster = loadRoster(root), {skip} = duplicateIdentitySkips(roster.slugs);
  assert.equal(pilot.length, PILOT_CAP);
  assert.equal(new Set(pilot.map(f => f.slug)).size, 25);
  for (const f of pilot) { assert.ok(roster.set.has(f.slug), f.slug); assert.ok(!skip.has(f.slug), f.slug); }
  assert.deepEqual([PASSES[1].model, PASSES[1].effort], ['claude-sonnet-5-5', 'medium']);
  assert.deepEqual([PASSES[2].model, PASSES[2].effort], ['claude-opus-5-5', 'high']);
  assert.deepEqual([PASSES[3].model, PASSES[3].effort], ['claude-opus-5-5', 'high']);
});

test('the prompt never carries the owner-check hints and names every discipline and flag', () => {
  const s = systemPrompt(1);
  for (const d of DISCIPLINES) assert.ok(s.includes(d));
  for (const f of ['conflict', 'thin_sources', 'identity_unclear', 'needs_escalation']) assert.ok(s.includes(f));
  assert.ok(!pass1User({slug: 'x', name: 'X', today}).includes('ownerCheck'));
});

test('pass 1 writes one validated file per fighter, a checkpoint and a log with request and token counts', async () => {
  const out = tmp(), runDir = path.join(out, '_runs', 'r1'), calls = [];
  const roster = mkRoster(['a-one', 'b-two']);
  const replies = {
    'a-one': modelReply({judo: {status: 'verified', claims: [claim()]}}),
    'b-two': modelReply({wrestling: {status: 'verified', claims: [claim({source_url: 'https://en.wikipedia.org/wiki/B', level: 'ncaa_d1'}), claim({source_url: ''})]}}),
  };
  const counts = await runPass({pass: 1, slugs: roster.slugs, roster, out, runDir, call: fake(replies, calls), maxCalls: 10, today, workers: 2});
  assert.deepEqual([counts.ok, counts.invalid, counts.error], [2, 0, 0]);
  assert.deepEqual(calls.map(c => c.model), ['claude-sonnet-5-5', 'claude-sonnet-5-5']);
  assert.ok(calls.every(c => c.effort === 'medium'));
  const a = JSON.parse(fs.readFileSync(path.join(out, 'a-one.json'), 'utf8'));
  assert.equal(a.disciplines.judo.status, 'verified');
  const b = JSON.parse(fs.readFileSync(path.join(out, 'b-two.json'), 'utf8'));
  assert.equal(b.disciplines.wrestling.status, 'claimed');           // Wikipedia-only is never fact
  assert.equal(b.disciplines.wrestling.claims.length, 1);              // the claim without a URL was dropped
  assert.ok(b.flags.includes('thin_sources'));
  const log = JSON.parse(fs.readFileSync(path.join(runDir, 'run-log.json'), 'utf8'));
  assert.equal(log.totals.requests, 2); assert.equal(log.totals.input_tokens, 2000); assert.equal(log.totals.output_tokens, 1000);
  assert.equal(log.totals.web_searches, 6); assert.ok(log.totals.estimated_cost_usd > 0);
  assert.equal(fs.readFileSync(path.join(runDir, 'requests.jsonl'), 'utf8').trim().split('\n').length, 2);
  assert.equal(loadCheckpoint(runDir).size, 2);
});

test('resume skips fighters already checkpointed and retries failures', async () => {
  const out = tmp(), runDir = path.join(out, '_runs', 'r2'), calls = [];
  const roster = mkRoster(['a-one', 'b-two']);
  let bFails = true;
  const replies = (slug) => slug === 'b-two' && bFails ? 'not json at all' : modelReply({judo: {status: 'claimed', claims: [claim({tier: 'C', source_url: 'https://reddit.com/r/x'})]}});
  const first = await runPass({pass: 1, slugs: roster.slugs, roster, out, runDir, call: fake(replies, calls), maxCalls: 10, today});
  assert.deepEqual([first.ok, first.invalid], [1, 1]);
  assert.equal(fs.existsSync(path.join(out, 'b-two.json')), false);   // invalid output is never saved
  bFails = false; calls.length = 0;
  const second = await runPass({pass: 1, slugs: roster.slugs, roster, out, runDir, call: fake(replies, calls), maxCalls: 10, today, resume: true});
  assert.deepEqual(calls.map(c => c.slug), ['b-two']);
  assert.equal(second.ok, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, 'run-log.json'), 'utf8')).resumes, 1);
});

test('the model-call budget stops the run and is never exceeded', async () => {
  const out = tmp(), runDir = path.join(out, '_runs', 'r3'), calls = [];
  const slugs = ['a-1', 'b-2', 'c-3', 'd-4'], roster = mkRoster(slugs);
  const counts = await runPass({pass: 1, slugs, roster, out, runDir, call: fake(() => modelReply(), calls), maxCalls: 2, today, workers: 1});
  assert.equal(calls.length, 2);
  assert.equal(counts.ok, 2); assert.equal(counts.budget, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, 'run-log.json'), 'utf8')).budget.used, 2);
});

test('a slug outside the roster or on the skip list is refused by validation, not saved', async () => {
  const out = tmp(), runDir = path.join(out, '_runs', 'r4');
  const roster = mkRoster(['a-one']); roster.skip = new Set(['a-one']);
  const counts = await runPass({pass: 1, slugs: ['a-one'], roster, out, runDir, call: fake(() => modelReply()), maxCalls: 5, today});
  assert.equal(counts.invalid, 1); assert.equal(fs.existsSync(path.join(out, 'a-one.json')), false);
});

test('pass 2 runs on Opus 5.5 at high effort and only for flagged fighters', async () => {
  const out = tmp(), runDir1 = path.join(out, '_runs', 'p1'), runDir2 = path.join(out, '_runs', 'p2'), calls = [];
  const roster = mkRoster(['flagged-one', 'clean-two']);
  const p1 = {'flagged-one': modelReply({judo: {status: 'claimed', claims: [claim({tier: 'C', source_url: 'https://reddit.com/x'})]}}, ['conflict']), 'clean-two': modelReply({judo: {status: 'verified', claims: [claim()]}})};
  await runPass({pass: 1, slugs: roster.slugs, roster, out, runDir: runDir1, call: fake(p1), maxCalls: 10, today});
  const p2 = () => modelReply({judo: {status: 'verified', claims: [claim({source_url: 'https://www.judoinside.com/judoka/1'})]}});
  const counts = await runPass({pass: 2, slugs: roster.slugs, roster, out, runDir: runDir2, call: fake(p2, calls), maxCalls: 10, today});
  assert.deepEqual(calls, [{slug: 'flagged-one', model: 'claude-opus-5-5', effort: 'high'}]);
  assert.equal(counts.ok, 1);
  const rec = JSON.parse(fs.readFileSync(path.join(out, 'flagged-one.json'), 'utf8'));
  assert.equal(rec.disciplines.judo.status, 'verified');
  assert.deepEqual(rec.history.map(h => h.pass), [1, 2]);
  // a second pass 2 does not re-run the same fighter
  calls.length = 0;
  await runPass({pass: 2, slugs: roster.slugs, roster, out, runDir: path.join(out, '_runs', 'p2b'), call: fake(p2, calls), maxCalls: 10, today});
  assert.equal(calls.length, 0);
});

test('pass 3 samples 5-10% by seed and always includes every Tier A claim', () => {
  const mk = (slug, tier) => validateRecord({schema: SCHEMA_VERSION, scope: SCOPE, nonproduction: true, slug, identity: {status: 'confirmed'},
    disciplines: {judo: {status: 'claimed', claims: [claim({tier, source_url: tier === 'A' ? 'https://ijf.org/x' : 'https://reddit.com/x'})]}}}, {today}).record;
  const recs = Array.from({length: 40}, (_, i) => mk('f-' + String(i).padStart(2, '0'), i % 10 === 0 ? 'A' : 'C'));
  const sel = selectPass3(recs, {rate: 0.075, seed: 's'});
  const withA = recs.filter((_, i) => i % 10 === 0).map(r => r.slug);
  for (const s of withA) assert.ok(sel.find(x => x.slug === s && x.hasTierA), s);
  assert.equal(sel.filter(x => x.sampled).length, 3);                        // round(0.075 * 40)
  assert.deepEqual(selectPass3(recs, {rate: 0.075, seed: 's'}), sel);         // reproducible
  assert.notDeepEqual(selectPass3(recs, {rate: 0.075, seed: 'other'}).map(x => x.slug), sel.map(x => x.slug));
  assert.throws(() => selectPass3(recs, {rate: 0.2}), /5-10%/);
  assert.throws(() => selectPass3(recs, {rate: 0.01}), /5-10%/);
  assert.ok(mulberry32('x')() < 1);
});

test('pass 3 audit drops refuted claims, keeps confirmed ones and flags what needs another look', async () => {
  const out = tmp(), roster = mkRoster(['aud-one']);
  await runPass({pass: 1, slugs: ['aud-one'], roster, out, runDir: path.join(out, '_runs', 'a1'), today, maxCalls: 5,
    call: fake(() => modelReply({judo: {status: 'verified', claims: [claim(), claim({text: 'Won world gold in 2015.', level: 'world_medal', source_url: 'https://www.judoinside.com/x'})]}}))});
  const calls = [];
  const audits = JSON.stringify({audits: [{id: 'judo:0', verdict: 'confirmed', note: 'ok'}, {id: 'judo:1', verdict: 'refuted', note: 'page lists a different athlete'}]});
  const counts = await runPass({pass: 3, slugs: ['aud-one'], roster, out, runDir: path.join(out, '_runs', 'a3'), today, maxCalls: 5, sample: {rate: 0.075, seed: 'x'}, call: fake(() => audits, calls)});
  assert.equal(counts.ok, 1);
  assert.deepEqual([calls[0].model, calls[0].effort], ['claude-opus-5-5', 'high']);
  const rec = JSON.parse(fs.readFileSync(path.join(out, 'aud-one.json'), 'utf8'));
  assert.equal(rec.disciplines.judo.claims.length, 1);
  assert.equal(rec.disciplines.judo.claims[0].audit, 'confirmed');
  assert.equal(rec.rejected_claims[0].reason, 'refuted_in_pass_3');
  assert.ok(rec.flags.includes('conflict') && rec.flags.includes('needs_escalation'));
  assert.equal(rec.audit.refuted, 1);
});

test('applyAudit: unreachable Tier A stops counting toward verified, claims not listed stay untouched', () => {
  const rec = validateRecord({schema: SCHEMA_VERSION, scope: SCOPE, nonproduction: true, slug: 'z-z', identity: {status: 'confirmed'},
    disciplines: {judo: {status: 'verified', claims: [claim()]}}}, {today}).record;
  const next = applyAudit(rec, [{id: 'judo:0', verdict: 'unreachable'}], {today, model: 'm', sampled: false, at: 'now'});
  const v = validateRecord(next, {today}).record;
  assert.equal(v.disciplines.judo.status, 'claimed');
  assert.equal(claimItems(rec, {allClaims: false}).length, 1);
});

test('budget, pool and cost helpers behave', async () => {
  const b = new Budget(2); assert.deepEqual([b.take(), b.take(), b.take()], [true, true, false]);
  let live = 0, peak = 0;
  await pool([1, 2, 3, 4, 5, 6], 3, async () => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 5)); live--; });
  assert.equal(peak, 3);
  assert.ok(Math.abs(estimateCost('claude-sonnet-5-5', {input: 1e6, output: 1e6, searches: 100}) - (2 + 10 + 1)) < 1e-9);
  assert.equal(estimateCost('unknown-model', {input: 1, output: 1}), null);
});

test('RunLog survives a restart and counts it', () => {
  const dir = tmp();
  const l = new RunLog(dir, {runId: 'x'}); l.request({pass: 1, input_tokens: 5, output_tokens: 2, web_searches: 1}); l.save();
  const again = new RunLog(dir, {runId: 'x'});
  assert.equal(again.data.totals.requests, 1); assert.equal(again.data.resumes, 1);
});
