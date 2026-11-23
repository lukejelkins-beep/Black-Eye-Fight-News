#!/usr/bin/env node
/* Build the public site into dist/ so Render publishes reader files only.
 *
 * Render used to publish the repository root, which made research archives,
 * provider caches, workflows and internal docs downloadable from the live site.
 * This script copies an allowlist instead:
 *   - root pages and app files (HTML, manifest, service worker, robots.txt)
 *   - assets/ and push/
 *   - only the data/*.json files that the pages or scripts actually request
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
/* Internal research files are never published, even if an older script still names them. */
const NEVER_PUBLISH = /^data\/(ufc-research-archive\.json|ufcalendar-fighter-research\.json|ufc-research-workers\/)/;
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
    for (const match of text.matchAll(DATA_REF)) if (!NEVER_PUBLISH.test(match[1])) found.add(match[1]);
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

  const missing = [];
  const data = [];
  for (const ref of referencedDataFiles(root)) {
    const src = join(root, ref);
    if (!existsSync(src)) { missing.push(ref); continue; }
    mkdirSync(dirname(join(out, ref)), { recursive: true });
    cpSync(src, join(out, ref));
    data.push(ref);
  }

  const bytes = walk(out).reduce((sum, file) => sum + statSync(file).size, 0);
  return { out: relative(root, out) || '.', files: copied, data, missing, megabytes: +(bytes / 1048576).toFixed(1) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = build();
  console.log(`Built ${report.out}: ${report.files.length} root items, ${report.data.length} data files, ${report.megabytes} MB`);
  if (report.missing.length) console.log('Referenced but not in the repo (skipped): ' + report.missing.join(', '));
}
