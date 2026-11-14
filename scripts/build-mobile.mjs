/** Copies the existing static website into Capacitor's isolated web assets folder.
 * Render continues publishing the repository root, not /www.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Explicit public assets only: private editions must never enter a native bundle.
const publicAssets = ['index.html','manifest.webmanifest','sw.js','assets','data',
  'privacy.html','terms.html','data-deletion.html','push'];
// Validate before replacing a previous successful build.
for (const asset of publicAssets) {
  if (!existsSync(resolve(root, asset))) throw new Error('Expected site asset missing: '+asset);
}
const output = resolve(root, 'www');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const path of publicAssets){
  const source = resolve(root,path);
  if(!existsSync(source)) throw new Error('Expected site asset missing: '+path);
  cpSync(source,resolve(output,path),{recursive:true});
}
console.log('Capacitor web assets copied to www/');
