#!/usr/bin/env node
/* Build the public site into dist/ so Render publishes reader files only.
 *
 * Render used to publish the repository root, which made research archives,
 * provider caches, workflows and internal docs downloadable from the live site.
 * This script copies an allowlist instead:
 *   - root pages and app files (HTML, manifest, service worker, robots.txt)
 *   - assets/ and push/
 *   - only the data/*.json files that the pages or scripts actually request
 *   - whole derived-data folders in DATA_DIRS, whose files are requested by a
 *     computed path (e.g. data/ufc-stats/fighters/<slug>.json), JSON only
 *
 * A data file the code references but the repo lacks FAILS the build (exit 1),
 * unless it is listed in OPTIONAL_DATA with a reason. A silently missing feed
 * used to ship as a green build and only show up as a broken page.
 *
 * Usage: node scripts/build-site.mjs [--out dist]
 * Render: build command `node scripts/build-site.mjs`, publish directory `dist`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = resolve(ROOT, outArg > -1 ? process.argv[outArg + 1] : 'dist');

const ROOT_FILE = /^(.+\.html|manifest\.webmanifest|sw\.js|robots\.txt)$/;
const COPY_DIRS = ['assets', 'push'];
// Public, derived statistics loaded per fighter at runtime. Never add raw
// research or provider caches here.
// data/sumo/basho-archive and data/sumo/banzuke-release hold one saved tournament or banzuke per
// file, loaded by the Sumo Basho review and Banzuke changes pages; published with the provider's
// permission (owner, 24 Nov 2026; docs/design/DECISIONS.md).
export const DATA_DIRS = ['data/ufc-stats', 'data/sumo/basho-archive', 'data/sumo/banzuke-release'];
// Referenced data files that may legitimately be absent. Each needs a reason.
export const OPTIONAL_DATA = new Map([
  // Placeholders in code comments, not real requests.
  ['data/sumo/banzuke-release/YYYYMM.json', 'path template in a comment (assets/sumo.js)'],
  ['data/sumo/basho-archive/YYYYMM.json', 'path template in a comment (assets/sumo-review-data.mjs)'],
  // fighter-insights.js loads reviewed cohorts tolerantly (a 404 becomes null);
  // the ranked cohort has not been published yet.
  ['data/ufc-ranked-profiles.json', 'unpublished reviewed cohort, fetched with a null fallback'],
]);
const DATA_REF = /(?:^|[^A-Za-z0-9_-])\/?(data\/[A-Za-z0-9_./-]+?\.json)/g;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

export function rootFiles(root = ROOT) {
  return readdirSync(root).filter(name => ROOT_FILE.test(name) && statSync(join(root, name)).isFile());
}

/* Every data/*.json path named in a root page, the service worker or a script under assets/. */
export function referencedDataFiles(root = ROOT) {
  const sources = rootFiles(root).map(name => join(root, name));
  if (existsSync(join(root, 'assets'))) {
    sources.push(...walk(join(root, 'assets')).filter(file => /\.(m?js|html)$/.test(file)));
  }
  const found = new Set();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(DATA_REF)) found.add(match[1]);
  }
  return [...found].sort();
}

export function build(root = ROOT, out = OUT) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const copied = [];
  for (const name of rootFiles(root)) {
    cpSync(join(root, name), join(out, name));
    copied.push(name);
  }
  for (const dir of COPY_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    cpSync(join(root, dir), join(out, dir), {
      recursive: true,
      filter: src => !/(^|\/)(__pycache__|\.DS_Store)(\/|$)/.test(src),
    });
    copied.push(dir + '/');
  }

  const dataDirs = [];
  for (const dir of DATA_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    cpSync(join(root, dir), join(out, dir), {
      recursive: true,
      filter: src => statSync(src).isDirectory() || src.endsWith('.json'),
    });
    dataDirs.push(dir + '/');
  }

  const missing = [];
  const optionalMissing = [];
  const data = [];
  for (const ref of referencedDataFiles(root)) {
    const src = join(root, ref);
    if (!existsSync(src)) { (OPTIONAL_DATA.has(ref) ? optionalMissing : missing).push(ref); continue; }
    mkdirSync(dirname(join(out, ref)), { recursive: true });
    cpSync(src, join(out, ref));
    data.push(ref);
  }

  const bytes = walk(out).reduce((sum, file) => sum + statSync(file).size, 0);
  return { out: relative(root, out) || '.', files: copied, data, dataDirs, missing, optionalMissing, megabytes: +(bytes / 1048576).toFixed(1) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = build();
  console.log(`Built ${report.out}: ${report.files.length} root items, ${report.data.length} data files, ` +
    `${report.dataDirs.length} data folders, ${report.megabytes} MB`);
  if (report.optionalMissing.length) console.log('Optional, not in the repo: ' + report.optionalMissing.join(', '));
  if (report.missing.length) {
    console.error('BUILD FAILED. Referenced by the site but missing from the repo: ' + report.missing.join(', ') +
      '\nRestore the file, remove the reference, or add it to OPTIONAL_DATA in scripts/build-site.mjs with a reason.');
    process.exit(1);
  }
}
