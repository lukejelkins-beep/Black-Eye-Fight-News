import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedPortrait,webpageReadinessRow,summarizeWebpageReadiness,buildApiTrustedReadiness}
 from '../scripts/sumo-webpage-readiness-190.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/sumo/rikishi-index.json');
const ura=read('data/sumo/backfill/v1/profile-ready/28.json');
const w=roster.rikishi.find(x=>x.sourceId===28);
test('Ura profile core research fields are filled without pretending it is certified',()=>{
 const row=webpageReadinessRow(w,ura,null,null);
 assert.equal(row.dataFieldsReady,true);
 assert.equal(row.fields.historicalWeightGraph,true);
 assert.equal(row.fields.careerRankGraph,true);
 assert.equal(row.fields.tournamentResults,true);
 assert.equal(row.fields.opponentHeadToHead,true);
 assert.equal(row.fields.countryFlag,true);
 assert.equal(row.fields.officialCurrentListing,true);
 assert.equal(row.fields.authorisedPortrait,false);
 assert.equal(row.fields.officiallyPublishedCareerTotals,false);
 assert.equal(row.fields.fullCareerCertified,false);
 assert.equal(row.certification,'not-started');
});
test('approved local portraits need a valid local asset, credit and licence',()=>{
 assert.equal(approvedPortrait({approved:true,path:'assets/sumo-photos/ura.webp',
   license:'permission-granted',credit:'Photographer'}),true);
 assert.equal(approvedPortrait({approved:true,path:'https://other.example/ura.jpg',
   license:'unknown',credit:'Photographer'}),false);
 assert.equal(approvedPortrait({approved:true,path:'assets/sumo-photos/ura.webp',
   credit:'Photographer'}),false);
 assert.equal(approvedPortrait({approved:false,path:'assets/sumo-photos/ura.webp',
   license:'permission-granted',credit:'Photographer'}),false);
});
test('country and graph gaps remain visible rather than inventing flags or weights',()=>{
 const altered=structuredClone(ura);
 altered.identity.birthplace='Unspecified location';
 altered.measurements=[];
 const row=webpageReadinessRow(w,altered,null,null);
 assert.equal(row.fields.countryFlag,false);
 assert.equal(row.fields.historicalWeightGraph,false);
 assert.ok(row.missingDataFields.includes('countryFlag'));
 assert.ok(row.missingDataFields.includes('historicalWeightGraph'));
});
test('frozen 190-profile audit counts missing publication permission separately',()=>{
 const base=webpageReadinessRow(w,ura,null,null);
 const entries=Array.from({length:190},(_,i)=>({...base,sourceId:1000+i}));
 const report=summarizeWebpageReadiness(entries);
 assert.equal(report.cohort,190);
 assert.equal(report.completeDataFields,190);
 assert.equal(report.fieldCounts.authorisedPortrait,0);
 assert.equal(report.fieldCounts.fullCareerCertified,0);
 assert.equal(report.missingByField.authorisedPortrait.length,190);
 assert.equal(report.approvedForProduction,false);
 assert.equal(report.certifiedProfiles,0);
 assert.throws(()=>summarizeWebpageReadiness([...entries,entries[0]]),/190/);
});

test('API-trusted methodology accepts completed source ledgers without inflating certifications',()=>{
 const web=read('data/sumo/backfill/v1/webpage-readiness.json');
 const audit=read('data/sumo/backfill/v1/audit.json');
 const strict=read('data/sumo/backfill/v1/career-certification-strict.json');
 const spotchecks=read('data/sumo/backfill/v1/jsa-reconciliation.json');
 const result=buildApiTrustedReadiness(web,audit,strict,spotchecks);
 assert.equal(result.apiTrustedReadyForNonProductionPreview,190);
 assert.equal(result.strictCareerResultsCertified,strict.strictCareerResultsCertified);
 assert.equal(result.fullProfilesCertified,0);
 assert.equal(result.productionReleaseApproved,false);
 assert.equal(result.rows.filter(r=>r.strictCareerResultsCertified).length,
   strict.strictCareerResultsCertified);
 assert.equal(result.rows.some(r=>r.reviewFlags.includes('legacy-JSA-spotcheck-needs-current-cutoff-review')),true);
});
test('API-trusted readiness blocks genuine missing data or source integrity failures',()=>{
 const web=read('data/sumo/backfill/v1/webpage-readiness.json');
 const audit=read('data/sumo/backfill/v1/audit.json');
 const strict=read('data/sumo/backfill/v1/career-certification-strict.json');
 const bad=structuredClone(web);
 bad.rows[0].dataFieldsReady=false;
 bad.rows[0].missingDataFields=['careerRecord'];
 const result=buildApiTrustedReadiness(bad,audit,strict);
 assert.equal(result.apiTrustedReadyForNonProductionPreview,189);
 assert.ok(result.rows[0].blockers.includes('missing-core-display-fields'));
 const badSource=structuredClone(audit);
 badSource.cases[0].boutLedger.missingWinner=1;
 const sourceResult=buildApiTrustedReadiness(web,badSource,strict);
 assert.equal(sourceResult.apiTrustedReadyForNonProductionPreview,189);
 assert.ok(sourceResult.rows[0].blockers.includes('source-integrity-review'));
 const mismatched=structuredClone(audit);
 mismatched.cases[0].sourceId=999999;
 assert.throws(()=>buildApiTrustedReadiness(web,mismatched,strict),/identity/);
});
