import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Research-only fail-closed regression. The two original NC bouts have independent
// official evidence, but no matching numeric native bout with measured rounds.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const rich=read('ufcalendar-rich-progress.json');
const inventory=read('ufc-official-career-bout-inventory.json');
const certified=read('ufc-independent-full-career-verification.json').fighters;
const cases=[
  {slug:'mason-jones',opponent:'alan-patrick',date:'2021-06-05',id:'9cdfcd164b48f55e'},
  {slug:'roosevelt-roberts',opponent:'kevin-croom',date:'2020-09-12',id:'e1bb0b615c02d715'}
];
test('Mason Jones and Roosevelt Roberts are certified with their original no-contests as saved-history-gap bouts, no native NC fabricated',()=>{
 for(const {slug,opponent,date,id} of cases){
  const entry=certified[slug];
  assert.ok(entry,slug+' has an independent register entry');
  assert.equal(inventory.fighters[slug],undefined,slug+' is no longer a source-only inventory gap');
  const source=entry.bouts.find(b=>b.fightUrl==='https://ufcstats.com/fight-details/'+id);
  assert.ok(source,slug+' original no-contest must remain in official history');
  assert.equal(source.date,date);
  assert.equal(source.result,'no_contest');
  assert.equal(source.savedHistoryGap,true);
  assert.ok(source.opponent.toLowerCase().includes(opponent.split('-')[0]));
  const matches=Object.entries(rich.bouts).filter(([numeric,b])=>
   /^\d+$/.test(numeric)&&b.org==='ufc'&&b.status==='completed'&&
   [b.a?.slug,b.b?.slug].includes(slug)&&
   [b.a?.slug,b.b?.slug].includes(opponent)&&
   b.eventDate===date);
  assert.equal(matches.length,0,'source-only NC cannot be silently substituted with an unrelated native fight: '+slug);
  for(const forbidden of ['nativeBoutId','cachedNativeBoutId','nativeFighterId','roundStats','measuredRounds']){
   assert.equal(Object.hasOwn(source,forbidden),false,'do not fabricate '+forbidden+': '+slug);
  }
 }
});
