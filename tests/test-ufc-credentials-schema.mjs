import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateClaim, validateRecord, supportedStatus, validateDirectory, summarise, DISCIPLINES, LEVELS, SCHEMA_VERSION, SCOPE} from '../scripts/ufc-credentials-schema.mjs';

const today = '2026-11-22';
const claim = (o = {}) => ({text: 'Won a national title in 2012.', source_url: 'https://www.ijf.org/judoka/1', source_name: 'IJF', tier: 'A', retrieved: today, year: 2012, level: 'national_champion', ...o});
const rec = (disciplines = {}, o = {}) => ({schema: SCHEMA_VERSION, scope: SCOPE, nonproduction: true, slug: 'test-fighter', name: 'Test Fighter', identity: {status: 'confirmed'}, flags: [], disciplines, ...o});
const v = (r, o = {}) => validateRecord(r, {today, ...o});

test('a claim missing URL, tier or retrieved date is dropped', () => {
  assert.equal(validateClaim(claim({source_url: ''}), {today}).drop, 'missing_or_invalid_url');
  assert.equal(validateClaim(claim({source_url: 'not a url'}), {today}).drop, 'missing_or_invalid_url');
  assert.equal(validateClaim(claim({source_url: 'javascript:alert(1)'}), {today}).drop, 'missing_or_invalid_url');
  assert.equal(validateClaim(claim({tier: undefined}), {today}).drop, 'missing_or_invalid_tier');
  assert.equal(validateClaim(claim({tier: 'D'}), {today}).drop, 'missing_or_invalid_tier');
  assert.equal(validateClaim(claim({retrieved: undefined}), {today}).drop, 'missing_or_invalid_retrieved_date');
  assert.equal(validateClaim(claim({retrieved: '2026-02-30'}), {today}).drop, 'missing_or_invalid_retrieved_date');
  assert.equal(validateClaim(claim({retrieved: '2026-12-01'}), {today}).drop, 'retrieved_date_in_future');
  assert.ok(validateClaim(claim(), {today}).claim);
});

test('search-result pages are never a source', () => {
  assert.equal(validateClaim(claim({source_url: 'https://www.google.com/search?q=x'}), {today}).drop, 'search_result_url');
  assert.equal(validateClaim(claim({source_url: 'https://example.com/search?q=x'}), {today}).drop, 'search_result_url');
});

test('level must come from the fixed list and other needs a note', () => {
  assert.ok(LEVELS.includes('belt_black') && LEVELS.includes('ncaa_d1') && LEVELS.includes('olympic'));
  assert.equal(validateClaim(claim({level: 'champion_of_the_world'}), {today}).drop, 'level_not_in_fixed_list');
  assert.equal(validateClaim(claim({level: 'other'}), {today}).drop, 'other_level_needs_note');
  assert.ok(validateClaim(claim({level: 'other', level_note: 'regional promotion title'}), {today}).claim);
});

test('long quoted source wording is dropped, short quoted terms are kept', () => {
  assert.equal(validateClaim(claim({text: 'He was described as "the most decorated amateur in the region by far".'}), {today}).drop, 'copied_quote');
  assert.ok(validateClaim(claim({text: 'Won the "Golden Gloves" in 2010.'}), {today}).claim);
});

test('Tier C hosts are held at C and shown as claimed; unlisted Tier A is held at B', () => {
  const notes = [];
  const wiki = validateClaim(claim({source_url: 'https://en.wikipedia.org/wiki/X', tier: 'A'}), {today, notes}).claim;
  assert.equal(wiki.tier, 'C'); assert.equal(wiki.display, 'claimed');
  const blog = validateClaim(claim({source_url: 'https://some-outlet.example/story', tier: 'A'}), {today, notes}).claim;
  assert.equal(blog.tier, 'B'); assert.equal(blog.display, 'sourced');
  assert.equal(validateClaim(claim(), {today}).claim.tier, 'A');
  assert.equal(notes.length, 2);
});

test('an invalid year is cleared, not guessed', () => {
  assert.equal(validateClaim(claim({year: 3000}), {today}).claim.year, null);
  assert.equal(validateClaim(claim({year: undefined}), {today}).claim.year, null);
});

test('status is lowered to what the claims support, never raised', () => {
  assert.equal(supportedStatus([]), 'unknown');
  assert.equal(supportedStatus([{tier: 'C', source_url: 'https://a.example/x'}]), 'claimed');
  assert.equal(supportedStatus([{tier: 'B', source_url: 'https://a.example/x'}]), 'claimed');
  assert.equal(supportedStatus([{tier: 'B', source_url: 'https://a.example/x'}, {tier: 'B', source_url: 'https://a.example/y'}]), 'claimed');
  assert.equal(supportedStatus([{tier: 'B', source_url: 'https://a.example/x'}, {tier: 'B', source_url: 'https://b.example/y'}]), 'verified');
  assert.equal(supportedStatus([{tier: 'A', source_url: 'https://ijf.org/x'}]), 'verified');
  assert.equal(supportedStatus([{tier: 'A', source_url: 'https://ijf.org/x', audit: 'unreachable'}]), 'claimed');
  assert.equal(supportedStatus([{tier: 'A', source_url: 'https://ijf.org/x'}], true), 'claimed');
});

test('verified with only a Tier C claim becomes claimed and is flagged thin', () => {
  const r = v(rec({wrestling: {status: 'verified', claims: [claim({source_url: 'https://en.wikipedia.org/wiki/X', tier: 'C', level: 'ncaa_d1'})]}}));
  assert.equal(r.ok, true);
  assert.equal(r.record.disciplines.wrestling.status, 'claimed');
  assert.ok(r.record.flags.includes('thin_sources'));
});

test('claimed or verified with no valid claim falls back to unknown', () => {
  const r = v(rec({judo: {status: 'verified', claims: [claim({source_url: ''})]}}));
  assert.equal(r.record.disciplines.judo.status, 'unknown');
  assert.equal(r.dropped.length, 1);
});

test('none_found needs a dated search of a governing body or database, otherwise unknown', () => {
  const bare = v(rec({sambo: {status: 'none_found', claims: []}}));
  assert.equal(bare.record.disciplines.sambo.status, 'unknown');
  const sourced = v(rec({sambo: {status: 'none_found', claims: [], sources_checked: [{name: 'FIAS results', url: 'https://sambo.sport/results', checked: today}]}}));
  assert.equal(sourced.record.disciplines.sambo.status, 'none_found');
  const nameOnly = v(rec({sambo: {status: 'none_found', claims: [], sources_checked: [{name: 'FIAS results', checked: today}]}}));
  assert.equal(nameOnly.record.disciplines.sambo.status, 'unknown');
  const wikiOnly = v(rec({sambo: {status: 'none_found', claims: [], sources_checked: [{name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X', checked: today}, {name: 'UFC page', url: 'https://www.ufc.com/athlete/x', checked: today}]}}));
  assert.equal(wikiOnly.record.disciplines.sambo.status, 'unknown');
  const badEntry = v(rec({sambo: {status: 'none_found', claims: [], sources_checked: [{name: 'FIAS results'}]}}));
  assert.equal(badEntry.record.disciplines.sambo.status, 'unknown');
});

test('none_found contradicted by a claim is a conflict', () => {
  const r = v(rec({bjj: {status: 'none_found', sources_checked: [{name: 'IBJJF', url: 'https://ibjjf.com/x', checked: today}], claims: [claim({level: 'belt_black'})]}}));
  assert.ok(r.record.flags.includes('conflict'));
  assert.notEqual(r.record.disciplines.bjj.status, 'none_found');
});

test('every discipline is present; missing ones are unknown, not none', () => {
  const r = v(rec({}));
  assert.deepEqual(Object.keys(r.record.disciplines), DISCIPLINES);
  for (const d of DISCIPLINES) assert.equal(r.record.disciplines[d].status, 'unknown');
});

test('unclear identity caps every discipline at claimed and sets the flag', () => {
  const r = v(rec({judo: {status: 'verified', claims: [claim()]}}, {identity: {status: 'unclear'}}));
  assert.equal(r.record.disciplines.judo.status, 'claimed');
  assert.ok(r.record.flags.includes('identity_unclear'));
});

test('unknown flags are removed and duplicate claims collapse', () => {
  const r = v(rec({judo: {status: 'claimed', claims: [claim(), claim()]}}, {flags: ['made_up', 'conflict']}));
  assert.deepEqual(r.record.flags, ['conflict']);
  assert.equal(r.record.disciplines.judo.claims.length, 1);
});

test('refuted audit claims are dropped and unreachable ones do not verify', () => {
  const r = v(rec({judo: {status: 'verified', claims: [claim({audit: 'refuted'})]}}));
  assert.equal(r.record.disciplines.judo.claims.length, 0);
  const u = v(rec({judo: {status: 'verified', claims: [claim({audit: 'unreachable'})]}}));
  assert.equal(u.record.disciplines.judo.status, 'claimed');
});

test('structural errors reject the whole record', () => {
  assert.equal(v({...rec(), schema: 2}).ok, false);
  assert.equal(v({...rec(), nonproduction: false}).ok, false);
  assert.equal(v({...rec(), slug: 'Bad Slug'}).ok, false);
  assert.equal(v(rec(), {rosterSlugs: new Set(['someone-else'])}).errors[0], 'slug_not_in_approved_roster');
  assert.equal(v(rec(), {skipSlugs: new Set(['test-fighter'])}).errors[0], 'slug_is_skipped_duplicate_identity');
  assert.equal(v(null).ok, false);
});

test('validation is idempotent: a normalised record revalidates unchanged', () => {
  const first = v(rec({judo: {status: 'verified', claims: [claim()]}, wrestling: {status: 'claimed', claims: [claim({source_url: 'https://en.wikipedia.org/wiki/X', level: 'ncaa_d1'})]}}));
  const second = v(first.record);
  assert.deepEqual(second.record.disciplines, first.record.disciplines);
  assert.deepEqual(second.record.flags, first.record.flags);
});

test('a long note cut at 300 characters does not end in a space (idempotence found in the pilot)', () => {
  const note = 'x'.repeat(299) + ' tail';
  const first = v(rec({judo: {status: 'unknown', note, claims: []}, }, {identity: {status: 'unclear', note}}));
  assert.equal(first.record.disciplines.judo.note.length, 299);
  assert.equal(first.record.identity.note.length, 299);
  const second = v(first.record);
  assert.deepEqual(second.record.disciplines, first.record.disciplines);
  assert.deepEqual(second.record.identity, first.record.identity);
});

test('summarise counts statuses, tiers and flags', () => {
  const r = v(rec({judo: {status: 'verified', claims: [claim()]}})).record;
  const s = summarise([r]);
  assert.equal(s.claimsByTier.A, 1); assert.equal(s.disciplineStatus.verified, 1); assert.equal(s.disciplineStatus.unknown, 6);
});

test('directory validation rejects hand-edited, non-normalised or misnamed files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-'));
  const good = v(rec({judo: {status: 'verified', claims: [claim()]}})).record;
  fs.writeFileSync(path.join(dir, 'test-fighter.json'), JSON.stringify(good));
  fs.writeFileSync(path.join(dir, '_skip-duplicate-identities.json'), '{}');
  assert.equal(validateDirectory(dir, {today}).failures.length, 0);
  const edited = JSON.parse(JSON.stringify(good)); edited.disciplines.wrestling.status = 'verified';
  fs.writeFileSync(path.join(dir, 'test-fighter.json'), JSON.stringify(edited));
  assert.deepEqual(validateDirectory(dir, {today}).failures[0].errors, ['saved_file_not_normalised']);
  fs.writeFileSync(path.join(dir, 'test-fighter.json'), JSON.stringify(good));
  fs.renameSync(path.join(dir, 'test-fighter.json'), path.join(dir, 'other-name.json'));
  assert.deepEqual(validateDirectory(dir, {today}).failures[0].errors, ['filename_does_not_match_slug']);
});

test('every saved fighter file in every research folder validates against the certified profile roster', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const {loadRoster, loadSchoolHosts, RESEARCH_DIRS} = await import('../scripts/ufc-credentials-run.mjs');
  assert.ok(!fs.existsSync(path.join(root, 'data/ufc-credentials')), 'research lives under research/, not data/');
  for (const d of RESEARCH_DIRS) {
    const res = validateDirectory(path.join(root, d), {rosterSlugs: loadRoster(root).set, schoolHosts: loadSchoolHosts(root)});
    assert.ok(res.files > 0, d);
    assert.deepEqual(res.failures, [], d);
  }
});

// ---- NCAA claims and college athletics sites (owner, 24 Nov 2026) ----
test('a college athletics page is Tier A for NCAA team participation only', () => {
  const base = {text: 'On the wrestling roster for the 2016-17 season.', source_name: 'School athletics', tier: 'B',
    retrieved: '2026-11-24', year: 2016, level: 'ncaa_other', ncaa_division: 'II', ncaa_result: 'participant'};
  const ok = validateClaim({...base, source_url: 'https://athletics.example.edu/roster/x'}, {today: '2026-11-24', schoolHosts: ['athletics.example.edu']});
  assert.equal(ok.claim.tier, 'A');
  const plainEdu = validateClaim({...base, source_url: 'https://alumni.example.edu/story'}, {today: '2026-11-24'});
  assert.equal(plainEdu.claim.tier, 'B', 'a .edu host that is not a reviewed athletics site is not upgraded');
  assert.equal(ok.claim.ncaa_division, 'II');
  const reviewed = validateClaim({...base, source_url: 'https://gopsusports.com/roster/x'}, {today: '2026-11-24', schoolHosts: ['gopsusports.com']});
  assert.equal(reviewed.claim.tier, 'A');
  const unreviewed = validateClaim({...base, source_url: 'https://someschoolsports.com/roster/x'}, {today: '2026-11-24'});
  assert.equal(unreviewed.claim.tier, 'B', 'an unreviewed non-.edu host is not upgraded');
  for (const result of ['all_american', 'finalist', 'champion'])
    assert.equal(validateClaim({...base, ncaa_result: result, source_url: 'https://athletics.example.edu/x'}, {today: '2026-11-24', schoolHosts: ['athletics.example.edu']}).claim.tier, 'B', result);
  assert.equal(validateClaim({...base, tier: 'A', source_url: 'https://www.wikipedia.org/wiki/X'}, {today: '2026-11-24'}).claim.tier, 'C');
  assert.equal(validateClaim({...base, ncaa_division: undefined, source_url: 'https://athletics.example.edu/x'}, {today: '2026-11-24', schoolHosts: ['athletics.example.edu']}).claim.tier, 'B',
    'Division II/III participation must name its division');
});

test('NCAA fields are checked against the level', () => {
  const c = o => validateClaim({text: 'Wrestled in college.', source_url: 'https://www.ncaa.com/x', source_name: 'NCAA', tier: 'A',
    retrieved: '2026-11-24', year: 2016, ...o}, {today: '2026-11-24'});
  assert.equal(c({level: 'ncaa_d1', ncaa_division: 'II'}).drop, 'ncaa_d1_with_other_division');
  assert.equal(c({level: 'ncaa_other', ncaa_division: 'I'}).drop, 'ncaa_other_with_division_I');
  assert.equal(c({level: 'ncaa_d1', ncaa_result: 'gold'}).drop, 'invalid_ncaa_result');
  assert.equal(c({level: 'ncaa_d1', ncaa_result: 'champion'}).claim.ncaa_result, 'champion');
  assert.equal(c({level: 'ncaa_d1'}).claim.ncaa_division, undefined, 'Division I is implied, not written');
  assert.equal(c({level: 'high_school', ncaa_result: 'champion'}).claim.ncaa_result, undefined, 'NCAA fields only on NCAA levels');
  assert.equal(c({level: 'other', level_note: 'NJCAA'}).claim.level, 'other');
});

test('a Division I participation claim from a school site verifies; a title from it alone does not', () => {
  const rec = claims => validateRecord({schema: SCHEMA_VERSION, scope: SCOPE, nonproduction: true, slug: 'x-y', identity: {status: 'confirmed'},
    disciplines: {wrestling: {status: 'verified', claims, sources_checked: []}}}, {today: '2026-11-24', schoolHosts: ['athletics.example.edu']}).record.disciplines.wrestling.status;
  const roster = {text: 'Wrestled for the team.', source_url: 'https://athletics.example.edu/r', source_name: 'School', tier: 'B',
    retrieved: '2026-11-24', year: 2015, level: 'ncaa_d1', ncaa_result: 'participant'};
  assert.equal(rec([roster]), 'verified');
  assert.equal(rec([{...roster, ncaa_result: 'champion'}]), 'claimed');
});
