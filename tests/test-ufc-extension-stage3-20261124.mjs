import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditExtension,validateExtensionApproval,cohortHash} from '../scripts/ufc-extension-stage3-audit.mjs';
import {buildExtension} from '../scripts/build-ufc-v4-certified-careers.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=read('data/ufc-extension-cohort-approval-20261124.json');
const base=read('data/ufc-36-month-roster-approval.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const register=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const stats=slug=>{const u=new URL('../data/ufc-stats/fighters/'+slug+'.json',import.meta.url);
 return fs.existsSync(u)?JSON.parse(fs.readFileSync(u,'utf8')):null;};
const inputs=(over={})=>({approval,base,research,progress,register,feeder,stats,...over});
const withEntry=(slug,change)=>({...register,fighters:{...register.fighters,[slug]:change(structuredClone(register.fighters[slug]))}});
const lane=(r,slug)=>r.lanes.certified.some(c=>c.slug===slug)?'certified':'exception';

test('extension cohort is owner-approved, anchored to the frozen 783 and disjoint from it',()=>{
 const slugs=validateExtensionApproval(approval,base);
 assert.equal(slugs.length,141);
 assert.equal(approval.approvedBy,'user');
 assert.equal(approval.baseCohortSha256,base.approvedRosterSha256);
 assert.equal(base.approvedFighters.length,783,'the 783 cohort itself is unchanged');
 assert.ok(slugs.every(s=>!base.approvedFighters.includes(s)));
 assert.throws(()=>validateExtensionApproval({...approval,approvedFighters:[...approval.approvedFighters.slice(1),'jon-jones']},base));
 assert.throws(()=>validateExtensionApproval({...approval,approvedFighters:[...approval.approvedFighters,'someone-new'],approvedCount:142},base),/hash/);
 const overlap=[...approval.approvedFighters.slice(1),'jon-jones'];
 assert.throws(()=>validateExtensionApproval({...approval,approvedFighters:overlap,approvedRosterSha256:cohortHash(overlap)},base),/overlaps/);
});

test('every extension fighter is certified, in exactly one lane, and the lanes total the cohort',()=>{
 const r=auditExtension(inputs());
 assert.deepEqual(r.totals,{approved:141,certified:141,exceptions:0});
 assert.equal(new Set(r.lanes.certified.map(c=>c.slug)).size,141);
 for(const c of r.lanes.certified)assert.equal(c.knownUfcBouts,register.fighters[c.slug].bouts.length,c.slug);
});

test('the gate fails closed on a tampered register entry',()=>{
 const slug='jose-aldo';
 const cases={
  'a bout dropped':e=>{e.bouts.pop();return e;},
  'a result flipped':e=>{e.bouts[0].result=e.bouts[0].result==='win'?'loss':'win';return e;},
  'a bout invented':e=>{e.bouts.push({date:'2012-01-01',opponent:'Invented Person',result:'win',fightUrl:'https://ufcstats.com/fight-details/ffffffffffffffff'});return e;},
  'an invented win flagged as a saved-history gap':e=>{e.bouts.push({date:'2012-01-01',opponent:'Invented Person',
   result:'win',savedHistoryGap:true,officialUfcSourceUrl:'https://www.ufc.com/athlete/jose-aldo'});return e;},
  'another cohort':e=>{e.cohort='ufc-36-month-roster';return e;},
  'no UFCStats fighter page':e=>{delete e.fighterUrl;return e;},
 };
 for(const [name,change] of Object.entries(cases)){
  const r=auditExtension(inputs({register:withEntry(slug,change)}));
  assert.equal(lane(r,slug),'exception',name);
 }
 const missing={...register,fighters:{...register.fighters}};delete missing.fighters[slug];
 assert.equal(lane(auditExtension(inputs({register:missing})),slug),'exception','no entry');
});

test('a Contender Series row is excluded only with its UFC.com evidence',()=>{
 const slug='marina-rodriguez';
 assert.equal(lane(auditExtension(inputs()),slug),'certified');
 const without={...feeder,bouts:feeder.bouts.filter(b=>b.fighterSlug!==slug)};
 assert.equal(lane(auditExtension(inputs({feeder:without})),slug),'exception');
 const row=feeder.bouts.find(b=>b.fighterSlug===slug&&b.date==='2018-08-11');
 assert.match(row.sourceUrl,/^https:\/\/www\.ufc\.com\//);
 assert.ok(row.sourceQuote.includes('Maria Oliveira'));
});

test('a profile fight missing from the register blocks certification',()=>{
 const slug='samuel-sanches';
 const file=stats(slug);
 const extra={...file,fights:[...file.fights,{...file.fights[0],boutId:'x',date:'2026-11-20',opponent:'Somebody Else'}]};
 const r=auditExtension(inputs({stats:s=>s===slug?extra:stats(s)}));
 assert.equal(lane(r,slug),'exception');
});

test('the certified list carries the extension in its own block with its own cutoff',()=>{
 const careers=read('data/ufc-v4-certified-careers.json');
 assert.equal(careers.approved,783);
 assert.equal(careers.certifiedThrough,'2026-11-14','the 783 cutoff is unchanged');
 assert.equal(careers.extension.approved,141);
 assert.equal(careers.extension.certifiedThrough,'2026-11-24');
 assert.equal(careers.extension.approvalHash,approval.approvedRosterSha256);
 assert.ok(Object.keys(careers.extension.certified).every(s=>careers.certified[s]==null));
 const audit=auditExtension(inputs());
 assert.throws(()=>buildExtension(audit,{...approval,cohort:'other'},careers));
 assert.throws(()=>buildExtension(audit,approval,{certified:{'jose-aldo':1}}),/both cohorts/);
});

test('a fight only the results importer holds needs its Wikipedia second source',()=>{
 const slug='alik-lorenz';
 const bout=register.fighters[slug].bouts.find(b=>b.date==='2026-11-21');
 assert.match(bout.secondSourceUrl,/^https:\/\/en\.wikipedia\.org\/wiki\//);
 assert.equal(lane(auditExtension(inputs()),slug),'certified');
 const stripped=withEntry(slug,e=>{for(const b of e.bouts){delete b.secondSource;delete b.secondSourceUrl;}return e;});
 const r=auditExtension(inputs({register:stripped}));
 assert.equal(lane(r,slug),'exception');
 assert.ok(r.lanes.exceptions.find(x=>x.slug===slug).reasons.includes('new_fight_without_second_source'));
});
