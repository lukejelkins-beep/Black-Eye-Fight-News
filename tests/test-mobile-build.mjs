import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('native build includes public policy pages but never private editions; missing input preserves prior build', () => {
  const root = mkdtempSync(join(tmpdir(), 'befn-mobile-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(new URL('../scripts/build-mobile.mjs', import.meta.url), join(root, 'scripts/build-mobile.mjs'));
    for (const name of ['index.html','manifest.webmanifest','sw.js','privacy.html','terms.html','data-deletion.html'])
      writeFileSync(join(root, name), name);
    for (const name of ['assets','data','push','editions']) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'fixture.txt'), name);
    }
    const build = () => spawnSync(process.execPath, ['scripts/build-mobile.mjs'], {cwd:root, encoding:'utf8'});
    assert.equal(build().status, 0);
    assert.equal(readFileSync(join(root, 'www/privacy.html'), 'utf8'), 'privacy.html');
    assert.ok(existsSync(join(root, 'www/push/fixture.txt')));
    assert.ok(!existsSync(join(root, 'www/editions')));
    rmSync(join(root, 'editions'), {recursive:true});
    assert.equal(build().status, 0, 'a private editions directory is not required');
    rmSync(join(root, 'index.html'));
    assert.notEqual(build().status, 0);
    assert.ok(existsSync(join(root, 'www/index.html')), 'previous output survives invalid input');
  } finally { rmSync(root, {recursive:true, force:true}); }
});
