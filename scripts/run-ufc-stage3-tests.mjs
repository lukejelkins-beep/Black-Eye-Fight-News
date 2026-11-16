/** Run every offline Stage 3 research regression in the existing central audit. */
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const patterns=[
 /^test-ufc-unified-.*\.mjs$/,
 /^test-ufc-independent-wave-.*\.mjs$/,
 // New three-career source/corner/outcome negative tests must run in the strict audit.
 /^test-ufc-three-11-bout-career-source-gates-20261115\.mjs$/,
 /^test-ufc-stage3-frozen-cohort-.*\.mjs$/,
 /^test-ufc-stage3-revised-.*\.mjs$/,
 /^test-ufc-36-month-stage3-progress\.mjs$/,
 /^test-ufc-v4-stage3-import\.mjs$/
];

export function stage3TestFiles(names){
 return names.filter(name=>patterns.some(pattern=>pattern.test(name))).sort();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files=stage3TestFiles(readdirSync(path.join(root,'tests')));
 if(files.length===0)throw Error('No UFC Stage 3 research tests discovered');
 console.log(`Running ${files.length} offline UFC Stage 3 test files`);
 const run=spawnSync(process.execPath,['--test','--test-concurrency=1',
  ...files.map(name=>path.join('tests',name))],{cwd:root,stdio:'inherit'});
 if(run.error)throw run.error;
 process.exitCode=run.status??1;
}
