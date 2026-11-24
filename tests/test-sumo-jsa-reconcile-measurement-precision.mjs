import test from 'node:test';
import assert from 'node:assert/strict';
import {precisionReconcileJsaSnapshot} from '../scripts/sumo-jsa-reconcile-measurement-precision.mjs';
const w={sourceId:8860,officialNskId:4350,heightCm:191.5,weightKg:161.6};
const jsa={
 sourceId:8860,officialNskId:4350,status:'field-disagreement',
 heightCm:192,weightKg:162,career:{wins:70,losses:46,absences:null},
 fieldComparisons:{name:true,stable:true,rankGrade:true,height:false,weight:false},
 officialBashoRecords:[{bashoId:'202609',wins:5,losses:2}],
 capturedAt:'2026-11-15T03:44:48.515Z',certification:'not-started'
};
test('rounding-compatible JSA display clears false mismatches but retains original values',()=>{
 const output=precisionReconcileJsaSnapshot(w,jsa);
 assert.equal(output.status,'basic-fields-parsed');
 assert.equal(output.fieldComparisons.height,true);
 assert.equal(output.fieldComparisons.weight,true);
 assert.equal(output.measurementComparisonDetails.height.method,'integer-display-rounding-compatible');
 assert.equal(output.measurementComparisonDetails.weight.method,'integer-display-rounding-compatible');
 assert.equal(output.heightCm,192);
 assert.equal(output.weightKg,162);
 assert.equal(w.heightCm,191.5);
 assert.equal(w.weightKg,161.6);
 assert.deepEqual(output.officialBashoRecords,jsa.officialBashoRecords);
 assert.equal(output.certification,'not-started');
 assert.equal(output.historicMeasurementsChanged,false);
});
test('true one-kilogram JSA/API difference stays reviewable, never overwritten',()=>{
 const out=precisionReconcileJsaSnapshot({...w,weightKg:172},
   {...jsa,weightKg:173,fieldComparisons:{...jsa.fieldComparisons,height:true}});
 assert.equal(out.status,'field-disagreement');
 assert.equal(out.fieldComparisons.weight,false);
 assert.equal(out.measurementComparisonDetails.weight.method,'disagreement');
 assert.equal(out.measurementComparisonDetails.weight.published,173);
 assert.equal(out.measurementComparisonDetails.weight.api,172);
 assert.equal(out.certification,'not-started');
});
test('missing career record remains parse-review even if measurements agree',()=>{
 const out=precisionReconcileJsaSnapshot(w,{...jsa,career:null,status:'parse-review'});
 assert.equal(out.status,'parse-review');
 assert.equal(out.certification,'not-started');
});
test('source identity mismatch is rejected before comparison',()=>{
 assert.throws(()=>precisionReconcileJsaSnapshot({...w,officialNskId:1},jsa),
  /identity/);
});
test('repeated offline reconciliation is idempotent, preserving historical source observations',()=>{
 const first=precisionReconcileJsaSnapshot(w,jsa);
 const twice=precisionReconcileJsaSnapshot(w,first);
 assert.deepEqual(twice,first);
});
