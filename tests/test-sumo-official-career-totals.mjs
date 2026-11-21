import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authoritativeCareerTotals} from '../scripts/sumo-official-career-totals.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const roster=read('data/sumo/rikishi-index.json');
const gather=id=>{
 const w=roster.rikishi.find(x=>x.sourceId===id);
 const raw=read('data/sumo/backfill/v1/rikishi/'+id+'.json');
 const official=read('data/sumo/backfill/v1/jsa-public/profiles/'+id+'.json');
 const matches=raw.data.matches.filter(m=>m.division!=='Mae-zumo'&&Number(m.day)<=15);
 const ledger={wins:matches.filter(x=>x.winnerId===id).length,
  losses:matches.filter(x=>x.winnerId!==id).length};
 return {w,raw,official,ledger};
};
test('JSA resolves Nishikigi 1-win API stats lag without source modification or certificate',()=>{
 const {w,raw,official,ledger}=gather(16);
 const before=JSON.stringify(raw);
 const result=authoritativeCareerTotals(w,raw,ledger,official);
 assert.equal(result.source,'official-JSA-public-record-verified-against-bout-ledger');
 assert.equal(result.selected.wins,677);
 assert.equal(result.selected.losses,716);
 assert.equal(result.originalApi.wins,676);
 assert.equal(result.independentlyResolvedSourceDifference,true);
 assert.equal(result.historicBashoCompared,97);
 assert.equal(result.certifiedCareer,false);
 assert.equal(JSON.stringify(raw),before);
});
test('JSA resolves Fujiseiun API loss lag with 30 historical-basho comparisons',()=>{
 const {w,raw,official,ledger}=gather(82);
 const result=authoritativeCareerTotals(w,raw,ledger,official);
 assert.deepEqual([result.selected.wins,result.selected.losses],[206,131]);
 assert.equal(result.originalApi.losses,130);
 assert.equal(result.historicBashoCompared,30);
 assert.equal(result.independentlyResolvedSourceDifference,true);
});
test('never use an official record when JSA identity or historic evidence disagrees',()=>{
 const {w,raw,official,ledger}=gather(16);
 const forged=structuredClone(official);
 forged.officialNskId=9999;
 assert.equal(authoritativeCareerTotals(w,raw,ledger,forged).source,'sumo-api-career-stats');
 forged.officialNskId=w.officialNskId;
 forged.bashoReconciliation.discrepantBasho=1;
 assert.equal(authoritativeCareerTotals(w,raw,ledger,forged).source,'sumo-api-career-stats');
 forged.bashoReconciliation.discrepantBasho=0;
 forged.career.wins++;
 assert.equal(authoritativeCareerTotals(w,raw,ledger,forged).source,'sumo-api-career-stats');
});

test('two-part JSA record never implies zero absences or an absence certificate',()=>{
 const {w,raw,official,ledger}=gather(16);
 const twoPart=structuredClone(official);
 twoPart.career.absences=null;
 twoPart.careerAbsencesPublished=false;
 const record=authoritativeCareerTotals(w,raw,ledger,twoPart);
 assert.equal(record.source,'official-JSA-public-WL-verified-absences-unpublished');
 assert.deepEqual([record.selected.wins,record.selected.losses],[677,716]);
 assert.equal(record.selected.absences,raw.data.stats.totalAbsences);
 assert.equal(record.officialAbsencesPublished,false);
 assert.equal(record.officialAbsencesVerified,false);
 assert.equal(record.certifiedCareer,false);
});
test('two-part JSA source still rejects unverified W-L and mismatched identities',()=>{
 const {w,raw,official,ledger}=gather(16);
 const twoPart=structuredClone(official);
 twoPart.career.absences=null;
 twoPart.career.losses++;
 assert.equal(authoritativeCareerTotals(w,raw,ledger,twoPart).source,'sumo-api-career-stats');
 twoPart.career.losses--;
 twoPart.url='https://www.sumo.or.jp/EnSumoDataRikishi/profile/999/';
 assert.equal(authoritativeCareerTotals(w,raw,ledger,twoPart).source,'sumo-api-career-stats');
});
