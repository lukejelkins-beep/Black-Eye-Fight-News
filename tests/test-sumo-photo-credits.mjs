import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const approved=JSON.parse(read('data/sumo/approved-photos.json').toString());
const credits=read('sumo-photo-credits.html').toString();
const page=read('sumo.html').toString();
const roster=JSON.parse(read('data/sumo/rikishi-index.json').toString());
test('photo credits are available from Sumo; only approved local images may display',()=>{
 assert.match(page,/href="sumo-photo-credits\.html"/);
 assert.match(credits,/Sumo photograph credits/i);
 assert.equal(approved.schemaVersion,1);
 for(const [id,p] of Object.entries(approved.bySourceId||{})){
  assert.equal(p.approved,true,'manifest may contain only explicitly approved files');
  const w=roster.rikishi.find(x=>String(x.sourceId)===String(id));
  assert.ok(w,'unknown wrestler image ID '+id);
  assert.equal(p.officialNskId,w.officialNskId);
  assert.match(p.path,/^assets\/sumo-photos\/[a-z0-9_-]+\.jpg$/);
  assert.match(p.license,/^Official JSA portrait — permission attested by BEFN operator, 2026-11-16$/);
  assert.match(p.sourceUrl,/^https:\/\/www\.sumo\.or\.jp\/img\/sumo_data\/rikishi\/270x474\/[a-zA-Z0-9_-]+\.jpg$/);
  assert.match(p.profileUrl,/^https:\/\/www\.sumo\.or\.jp\/EnSumoDataRikishi\/profile\/\d+\/$/);
  assert.equal(p.credit,'Japan Sumo Association');
  assert.ok(existsSync(new URL('../'+p.path,import.meta.url)));
  const bytes=read(p.path);
  assert.ok(bytes.length>30000&&bytes.length<8000000);
  assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
  assert.equal(bytes.at(-2),0xff);assert.equal(bytes.at(-1),0xd9);
  const sha=createHash('sha256').update(bytes).digest('hex');
  assert.equal(p.sha256,sha,'the approved JPEG differs from its exact source snapshot');
  assert.match(credits,/Japan Sumo Association/);
  assert.match(credits,/permission attested by the BEFN operator/);
 }
});
test('unlicensed, external, or unreviewed photos cannot appear in approved manifest',()=>{
 assert.ok(Object.keys(approved.bySourceId||{}).length<=190);
 assert.match(credits,/placeholder/i);
 assert.ok(!Object.values(approved.bySourceId||{}).some(
  p=>p.path.startsWith('https://')||!p.license||p.approved!==true));
});
