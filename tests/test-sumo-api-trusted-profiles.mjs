import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSumoPreviewReadiness,wrestlerQuality} from '../assets/sumo-verification.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/sumo/rikishi-index.json');
const method=read('data/sumo/api-trusted-status.json');
const career=read('data/sumo/career-history.json');
const brief=read('data/sumo/research-h2h-summary.json');
const opponents=read('data/sumo/research-h2h-opponents.json');
const detail=read('data/sumo/research-h2h-history.json');
const photos=read('data/sumo/approved-photos.json');
const validBasho=v=>{
 const s=String(v);
 return s.length===6&&Number.isInteger(Number(s))&&Number(s.slice(0,4))>=1800&&
  ['01','03','05','07','09','11'].includes(s.slice(-2));
};

test('sumo: 190 API-trusted previews are not falsely called fully certified',()=>{
 assert.equal(validateSumoPreviewReadiness(method,roster),true);
 assert.equal(method.strictCareerResultsCertified,182);
 const flagged=roster.rikishi.filter(w=>wrestlerQuality(w,method)?.historicalReview).map(w=>w.sourceId).sort((a,b)=>a-b);
 assert.deepEqual(flagged,[16,82]);
 const pending=roster.rikishi.filter(w=>wrestlerQuality(w,method)?.careerResultsStatus.includes('incomplete'));
 assert.equal(pending.length,8);
 assert.equal(method.fullProfilesCertified,0);
 assert.equal(method.productionApproved,false);
});
test('sumo: complete source profiles, weight and rank timelines and opponent indices for all 190',()=>{
 assert.equal(roster.count,190);
 assert.equal(brief.schemaVersion,1);
 assert.equal(brief.profileCount,190);
 assert.equal(brief.certified,false);
 assert.equal(opponents.profileCount,190);
 assert.equal(opponents.certified,false);
 assert.equal(detail.cohortSize,190);
 assert.equal(detail.certified,false);
 assert.equal(career.cohortSize,190);
 assert.equal(career.certified,false);
 const ids=new Set();
 for(const w of roster.rikishi){
  const id=String(w.sourceId);
  assert.ok(!ids.has(id),'no repeated source ID '+id);
  ids.add(id);
  const c=career.bySourceId?.[id];
  const b=brief.profiles?.[id];
  const o=opponents.profiles?.[id];
  assert.ok(c,'missing career graph profile '+id);
  assert.equal(Number(c.sumoApiId),w.sourceId);
  assert.equal(Number(c.officialNskId),w.officialNskId);
  assert.ok(Array.isArray(c.rank)&&c.rank.length>0,'missing rank history '+id);
  assert.ok(Array.isArray(c.weight),'historical weights must be explicitly represented '+id);
  assert.ok(c.rank.every(x=>validBasho(x.basho)&&typeof x.rank==='string'),
   'rank dates must be authentic '+id);
  assert.ok(c.weight.every(x=>validBasho(x.basho)&&
    Number.isFinite(x.kg)&&x.kg>0&&String(x.source).startsWith('https://')),
    'weight dots must retain dated source proof '+id);
  if(c.currentListedWeight)assert.equal(c.currentListedWeight.datedMeasurement,false,
   'current listed weight is never an invented tournament weigh-in '+id);
  assert.ok(b,'missing career history summary '+id);
  assert.ok(Number.isSafeInteger(b.careerWins)&&b.careerWins>=0,'career wins '+id);
  assert.ok(Number.isSafeInteger(b.careerLosses)&&b.careerLosses>=0,'career losses '+id);
  assert.ok(Array.isArray(o),'missing all-opponent index '+id);
 }
 assert.equal(ids.size,190);
});
test('sumo: no full H2H is misleadingly called a separate JSA verification',()=>{
 assert.equal(detail.schemaVersion,1);
 assert.ok(detail.pairs&&typeof detail.pairs==='object');
 for(const [key,p] of Object.entries(detail.pairs)){
  assert.ok(Array.isArray(p.regular),'pair must contain source-ordered regular meetings '+key);
  assert.equal(p.regular.length,p.winsA+p.winsB,'all regular H2H meetings represented '+key);
  assert.ok(p.regular.every(m=>Array.isArray(m)&&m.length>=6),'each H2H meeting has a dated result '+key);
 }
});
test('sumo: licensed photo manifest remains separate from API and certification decisions',()=>{
 const approved=Object.values(photos.bySourceId||{}).filter(x=>x?.approved===true);
 assert.ok(approved.length>=1,'locally licensed test photos are available');
 assert.ok(approved.every(x=>{
  const p=String(x.path||'');
  const name=p.slice('assets/sumo-photos/'.length);
  return p.startsWith('assets/sumo-photos/')&&name.length>5&&
   !name.includes('/')&&!name.includes('..')&&
   ['.jpg','.jpeg','.png','.webp'].some(ext=>name.endsWith(ext))&&
   !!x.license&&!!x.credit;
 }), 'never silently show unlicensed photographs');
 assert.equal(method.sourceRedistributionPermissionConfirmed,false);
});
test('sumo: fail closed on a data-integrity regression',()=>{
 const wrong=structuredClone(method);
 wrong.strictCareerResultsPendingSourceIds=[...wrong.strictCareerResultsPendingSourceIds,999999];
 assert.throws(()=>validateSumoPreviewReadiness(wrong,roster),/inconsistent or out of date/);
 const missing=structuredClone(method);
 missing.apiTrustedPreviewReady=189;
 assert.throws(()=>validateSumoPreviewReadiness(missing,roster),/inconsistent or out of date/);
});
