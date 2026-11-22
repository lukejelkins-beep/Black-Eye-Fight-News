/**
 * One entry point for the scheduled Sumo preview update, so the scheduler on
 * main stays tiny and the sequence is versioned with the code it runs.
 *   node scripts/sumo-run-update.mjs refresh   live basho: results + next-day torikumi + career/H2H
 *     (torikumi: the Sumo API's next-day torikumi for each tracked division)
 *   node scripts/sumo-run-update.mjs rebuild   roster, rankings, then the same daily refresh, new wrestlers, career/H2H
 */
import { spawnSync } from 'node:child_process';

const PLANS = {
  refresh: [
    ['--test', 'tests/test-sumo-daily.mjs', 'tests/test-sumo-api-source.mjs'],
    ['scripts/sumo-refresh-daily.mjs'],
    ['scripts/sumo-apply-live-bouts.mjs'],
    ['scripts/sumo-facts-rollup.mjs']
  ],
  rebuild: [
    ['--test', 'tests/test-sumo-api-source.mjs'],
    ['scripts/sumo-build-preview.mjs'],
    ['scripts/sumo-refresh-daily.mjs'],
    ['scripts/sumo-onboard-rikishi.mjs'],
    ['scripts/sumo-apply-live-bouts.mjs'],
    ['scripts/sumo-facts-rollup.mjs']
  ]
};
const mode = process.argv[2];
if (!PLANS[mode]) { console.error('Usage: sumo-run-update.mjs refresh|rebuild'); process.exit(2); }
for (const args of PLANS[mode]) {
  console.log('\n$ node ' + args.join(' '));
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error('Step failed: node ' + args.join(' ')); process.exit(r.status || 1); }
}
