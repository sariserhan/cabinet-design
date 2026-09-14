import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseInches,normalizeSku,normalizeCategory} from '../../src/catalog/normalization';
import {importBenchmarkDraft} from '../../src/ingestion/benchmark-draft';
import {recordEvidence} from '../../src/catalog/record-data';
import {measureBenchmark,diffRecords} from '../../src/catalog/benchmark';
test('inch fractions preserve actual geometry and reject ambiguous inputs',()=>{for(const [input,value] of [['2½',2.5],['3/4"',.75],['30-1/8 in',30.125],['30.5',30.5],['⅝',.625]] as const)assert.equal(parseInches(input),value);for(const bad of ['30–36','3/0','1/2 mm','-3','30 x 12'])assert.throws(()=>parseInches(bad));});
test('SKU normalization preserves internal identity and refuses footnote symbols',()=>{assert.equal(normalizeSku(' sk   w39 '),'SK W39');assert.throws(()=>normalizeSku('W2421♦'));assert.equal(normalizeCategory('Wall Cabinets'),'wall_cabinet');assert.equal(normalizeCategory('Unknown shape'),'other');});
test('draft import preserves counts, provenance and unverified state; self agreement cannot establish accuracy',async()=>{
 const records=await importBenchmarkDraft('tests/fixtures/fabuwood-allure','source','18424d5f3fc49f84d7a5095bc6d2a169a8d417a16e5d9ca1ee8fd7db1c2bc530','candidate');assert.equal(records.length,287);assert.equal(records.filter(r=>r.kind==='product').length,189);
 for(const r of records){assert.equal(r.data.reviewStatus,'unreviewed');assert.ok(recordEvidence(r).length);}
 const rows=records.map(payload=>({payload,truthVerified:false,blockers:[]}));const report=measureBenchmark(rows,rows);assert.equal(report.passed,false);assert.equal(report.truthVerified,false);assert.equal(report.reliabilityClaimSupported,false);
 const removed=records.filter(r=>!(r.kind==='product'&&r.data.id==='product:W2421'));assert.equal(measureBenchmark(removed.map(payload=>({payload,truthVerified:false,blockers:[]})),rows).productsPass,false);
 assert.deepEqual(diffRecords(records,[...records].reverse()),{added:[],removed:[],changed:[]});
});

test('missing candidate fields reduce metrics without crashing or disappearing from denominators',async()=>{
 const records=await importBenchmarkDraft('tests/fixtures/fabuwood-allure','source','18424d5f3fc49f84d7a5095bc6d2a169a8d417a16e5d9ca1ee8fd7db1c2bc530','candidate');const changed=structuredClone(records);const p=changed.find(r=>r.kind==='product');if(!p||p.kind!=='product')throw new Error('Product missing');delete p.data.fields.widthIn;
 const wrap=(payload:typeof records[number])=>({payload,truthVerified:false,blockers:[]});const report=measureBenchmark(changed.map(wrap),records.map(wrap));assert.ok(report.metrics.dimensionAccuracy<1);assert.equal(report.counts.rules,32);assert.equal(report.unique,true);
});

test('representative source marker check rejects a neighboring SKU diamond restriction',async()=>{
 const {sourceMarkers}=await import('../../src/catalog/cross-source');const {readFile}=await import('node:fs/promises');const text=await readFile('tests/fixtures/fabuwood-allure/pages/022.txt','utf8');assert.deepEqual(sourceMarkers(text,'W2421'),['**♦']);assert.deepEqual(sourceMarkers(text,'W3021'),['**']);
});
