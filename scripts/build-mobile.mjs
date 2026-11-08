/** Copies the existing static website into Capacitor's isolated web assets folder.
 * Render continues publishing the repository root, not /www.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'www');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const path of ['index.html','manifest.webmanifest','sw.js','assets','data','editions']){
  const source = resolve(root,path);
  if(!existsSync(source)) throw new Error('Expected site asset missing: '+path);
  cpSync(source,resolve(output,path),{recursive:true});
}
console.log('Capacitor web assets copied to www/');
