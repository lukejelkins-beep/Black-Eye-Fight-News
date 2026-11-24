import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('./', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, directory), 'utf8'));
const roster = readJson('cohort.json');
const knownCohorts = ['frozen', 'extension'];
const lanes = ['olympic', 'commonwealth', 'national'];
const states = ['seed', 'reviewed', 'needs_review'];
const claimKinds = {
  olympic: ['games_participation', 'trials', 'trials_qualified', 'qualifier',
    'qualified_no_start', 'alternate', 'coach', 'youth_games'],
  commonwealth: ['games_participation', 'selected_no_start', 'qualifier',
    'alternate', 'coach', 'youth_games'],
  national: ['team_appearance', 'team_selected', 'squad_member', 'alternate', 'coach'],
};
const categories = ['senior', 'under_23', 'junior', 'cadet', 'youth', 'open', 'unspecified'];
const medalKinds = ['gold', 'silver', 'bronze'];
const batchFor = (index) => String(Math.floor(index / 25) + 1).padStart(2, '0');
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isSlug = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

function publicUrl(value, context) {
  assert(isText(value), context + ' requires a URL');
  const url = new URL(value);
  assert(url.protocol === 'https:' && !url.username && !url.password, context + ' requires a public HTTPS source');
  return url;
}

assert.equal(roster.schema, 1);
assert.match(roster.sourceRef, /^[0-9a-f]{40}$/);
assert.deepEqual(roster.counts, { frozen: 780, extension: 141, total: 921 });
assert.equal(roster.batchSize, 25);
assert.equal(roster.fighters.length, roster.counts.total);
const rosterKeys = new Set(roster.fighters.map((fighter) => fighter.slug));
assert.equal(rosterKeys.size, roster.counts.total, 'Duplicate canonical slug');
assert.deepEqual([...rosterKeys], [...rosterKeys].sort(), 'Roster order changed');
const profileSlugs = new Set();
for (const [index, fighter] of roster.fighters.entries()) {
  assert(isSlug(fighter.slug) && isText(fighter.name), 'Invalid fighter identity');
  assert(knownCohorts.includes(fighter.cohort), fighter.slug + ' has an invalid cohort');
  assert.equal(fighter.batch, batchFor(index), fighter.slug + ' has an invalid batch');
  const profileSlug = fighter.statsSlug ?? fighter.slug;
  assert(isSlug(profileSlug) && !profileSlugs.has(profileSlug), 'Duplicate or invalid profile slug');
  profileSlugs.add(profileSlug);
}
for (const cohort of knownCohorts) {
  assert.equal(roster.fighters.filter((fighter) => fighter.cohort === cohort).length, roster.counts[cohort]);
}
const batch = process.argv[2];
const batches = new Set(roster.fighters.map((fighter) => fighter.batch));
assert(process.argv.length <= 3 && (!batch || batches.has(batch)), 'Use no argument or a batch from 01 to 37');

const reviews = new Map();
const totals = Object.fromEntries(lanes.map((lane) => [lane, {
  reviewed: 0, verifiedAthletes: 0, seniorGamesAthletes: 0, seniorMedallists: 0, seniorMedals: 0,
  nationalRepresentatives: 0, noEvidence: 0, unresolved: 0,
}]));
for (const filename of readdirSync(new URL('reviews/', directory)).sort()) {
  assert(filename.endsWith('.json'), 'Unexpected review file ' + filename);
  const record = readJson('reviews/' + filename);
  const slug = filename.slice(0, -5);
  assert.equal(record.slug, slug, 'File and review slug differ');
  assert(rosterKeys.has(slug), slug + ' is outside the certificate snapshot');
  const identity = publicUrl(record.identity?.url, slug + ' identity');
  assert(['ufc.com', 'ufcstats.com'].some((domain) => identity.hostname === domain
    || identity.hostname.endsWith('.' + domain)), slug + ' needs a UFC identity source');
  assert(isText(record.identity.summary), slug + ' needs a short identity explanation');
  assert(Object.keys(record.lanes).every((lane) => lanes.includes(lane)), slug + ' has an invalid research lane');
  assert(Object.keys(record.lanes).length, slug + ' needs at least one lane review');
  for (const [lane, review] of Object.entries(record.lanes)) {
    const context = slug + ' / ' + lane;
    assert(states.includes(review.state), context + ' has an invalid state');
    assert.match(review.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    const checkedOn = new Date(review.checkedOn + 'T00:00:00Z');
    assert(!Number.isNaN(checkedOn.valueOf()) && checkedOn.toISOString().slice(0, 10) === review.checkedOn,
      context + ' has an invalid review date');
    assert(Array.isArray(review.checks) && review.checks.length, context + ' needs source checks');
    for (const check of review.checks) {
      assert(['index', 'federation_or_team', 'discovery'].includes(check.type), context + ' has an invalid check type');
      assert(['supports_claim', 'no_match', 'ambiguous', 'unavailable'].includes(check.outcome),
        context + ' has an invalid check outcome');
      assert(isText(check.name), context + ' needs a source name');
      publicUrl(check.url, context + ' source check');
    }
    if (review.state === 'reviewed') {
      for (const type of ['index', 'federation_or_team']) {
        assert(review.checks.some((check) => check.type === type && ['supports_claim', 'no_match'].includes(check.outcome)),
          context + ' needs a completed ' + type + ' check');
      }
      totals[lane].reviewed++;
    }
    if (review.state === 'needs_review') {
      assert(isText(review.note), context + ' needs an uncertainty note');
      totals[lane].unresolved++;
    }
    assert(Array.isArray(review.claims), context + ' needs a claims array');
    if (review.state === 'seed') assert(review.claims.length, context + ' seed needs at least one claim');
    const seenClaims = new Set();
    for (const claim of review.claims) {
      assert(claimKinds[lane].includes(claim.kind), context + ' has an invalid claim kind');
      for (const key of ['edition', 'sport', 'event', 'delegation', 'result']) {
        assert(isText(claim[key]), context + ' is missing claim field ' + key);
      }
      assert(categories.includes(claim.category), context + ' has an invalid age or team category');
      const key = JSON.stringify([claim.kind, claim.edition, claim.sport, claim.event, claim.delegation]);
      assert(!seenClaims.has(key), context + ' has duplicate claims for an event');
      seenClaims.add(key);
      const medalEvent = ['games_participation', 'youth_games', 'team_appearance'].includes(claim.kind);
      assert(claim.medal === null || (medalEvent && [...medalKinds, 'none'].includes(claim.medal)),
        context + ' has a medal outside a competition appearance');
      if (claim.kind === 'games_participation') assert.equal(claim.category, 'senior', context);
      if (claim.kind === 'youth_games') assert.equal(claim.category, 'youth', context);
      assert(Array.isArray(claim.sources) && claim.sources.length, context + ' needs primary claim evidence');
      for (const source of claim.sources) {
        assert(['games', 'federation', 'delegation'].includes(source.authority) && isText(source.name),
          context + ' needs a named sporting authority');
        publicUrl(source.url, context + ' claim evidence');
      }
    }
    if (review.claims.length) totals[lane].verifiedAthletes++;
    if (!review.claims.length && review.state === 'reviewed') totals[lane].noEvidence++;
    const starts = review.claims.filter((claim) => claim.kind === 'games_participation');
    const medals = starts.filter((claim) => medalKinds.includes(claim.medal)).length;
    if (starts.length) totals[lane].seniorGamesAthletes++;
    if (medals) totals[lane].seniorMedallists++;
    totals[lane].seniorMedals += medals;
    if (review.claims.some((claim) => claim.kind === 'team_appearance')) totals[lane].nationalRepresentatives++;
  }
  reviews.set(slug, record);
}

console.log('Certificate cohort: ' + roster.fighters.length + ' athletes, ' + batches.size + ' batches');
console.log('Athletes with at least one saved record: ' + reviews.size);
for (const lane of lanes) {
  const row = totals[lane];
  console.log(lane + ': ' + row.verifiedAthletes + ' with verified evidence, '
    + row.reviewed + ' full reviews, ' + (roster.fighters.length - row.reviewed)
    + ' pending, ' + row.noEvidence + ' no evidence found, ' + row.unresolved + ' unresolved');
  if (lane === 'national') {
    console.log('  ' + row.nationalRepresentatives + ' verified national-team competitors');
  } else {
    console.log('  ' + row.seniorGamesAthletes + ' senior Games competitors, '
      + row.seniorMedallists + ' senior medallists, ' + row.seniorMedals + ' senior medals');
  }
}

if (batch) {
  console.log('\nBatch ' + batch + ' — pending lanes by fighter');
  for (const fighter of roster.fighters.filter((row) => row.batch === batch)) {
    const record = reviews.get(fighter.slug);
    const pending = lanes.filter((lane) => record?.lanes[lane]?.state !== 'reviewed');
    if (!pending.length) continue;
    const alias = fighter.statsSlug ? ' (profile alias ' + fighter.statsSlug + ')' : '';
    const state = pending.map((lane) => lane + '=' + (record?.lanes[lane]?.state ?? 'unreviewed')).join(', ');
    console.log(fighter.slug + ' — ' + fighter.name + alias + ' [' + state + ']');
  }
}
