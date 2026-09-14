import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factSchema, sourceEvidenceSchema } from '../../src/catalog/evidence.js';
import { ruleSchema, conditionSchema } from '../../src/catalog/rule-schema.js';
import { evidence, fact, operand, rule } from './fixtures.js';

test('source page positions and printed labels are separate; zero-based pages fail', () => {
  assert.equal(sourceEvidenceSchema.parse(evidence).printedPageLabel, 'I');
  assert.equal(sourceEvidenceSchema.safeParse({ ...evidence, pageNumber: 0 }).success, false);
});
test('source boxes must fit on the page and have positive area', () => {
  for (const box of [{ x: .9, y: 0, width: .2, height: .1 }, { x: 0, y: 0, width: 0, height: .1 }]) {
    assert.equal(sourceEvidenceSchema.safeParse({ ...evidence, location: { kind: 'region', regionId: 'r', boundingBox: box } }).success, false);
  }
});
test('unknown, absent and conflict are not numeric zero', () => {
  const base = { id: 'f', confidence: 0, provenance: [evidence], extractionMethod: 'text', reviewStatus: 'unreviewed' };
  for (const state of ['unknown', 'absent']) assert.equal(factSchema.parse({ ...base, state, reason: 'Not supplied' }).state, state);
  const conflict = factSchema.parse({ ...base, state: 'conflict', candidates: [operand(30), operand(36)] });
  assert.equal(conflict.state, 'conflict');
  assert.equal(factSchema.safeParse({ ...base, state: 'unknown', reason: 'Not supplied', value: 0 }).success, false);
});
test('derived facts need a versioned derivation and cannot reference themselves', () => {
  const raw = { ...fact('f', 30), extractionMethod: 'derived' };
  assert.equal(factSchema.safeParse(raw).success, false);
  assert.equal(factSchema.safeParse({ ...raw, derivation: { ruleId: 'sku', ruleVersion: '1', inputFactIds: ['f'] } }).success, false);
  assert.equal(factSchema.safeParse({ ...raw, derivation: { ruleId: 'sku', ruleVersion: '1', inputFactIds: ['sku-fact'] } }).success, true);
});
test('strict schemas reject arbitrary fields, wrong operand types and empty conditions', () => {
  assert.equal(factSchema.safeParse({ ...fact('f', 1), surprise: true }).success, false);
  assert.equal(conditionSchema.safeParse({ kind: 'number', field: 'finish', op: 'gt', value: operand(3) }).success, false);
  assert.equal(conditionSchema.safeParse({ kind: 'text', field: 'finish', op: 'eq', value: operand(3) }).success, false);
  assert.equal(conditionSchema.safeParse({ kind: 'all', conditions: [] }).success, false);
});
test('rule operand evidence is required independently of rule-level evidence', () => {
  const r = rule({ type: 'allowed_values', field: 'finish', values: [operand('Frost')], outsideSet: 'invalid' });
  assert.equal(ruleSchema.safeParse({ ...r, constraint: { type: 'allowed_values', field: 'finish', values: [{ value: 'Frost', provenance: [] }], outsideSet: 'invalid' } }).success, false);
});
test('closed rule vocabulary rejects invented semantics and conditional rules without conditions', () => {
  const r = rule({ type: 'requires', target: { kind: 'product', id: operand('panel') } });
  for (const constraint of [{ type: 'custom_javascript', code: 'true' }, { type: 'conditional_availability', available: operand(true) }]) {
    assert.equal(ruleSchema.safeParse({ ...r, constraint }).success, false);
  }
});
test('dimension ranges reject inverted, empty and unbounded intervals', () => {
  const r = rule({ type: 'requires', target: { kind: 'product', id: operand('panel') } });
  for (const bounds of [{}, { minimum: operand(10), maximum: operand(9) }, { minimum: operand(10), maximum: operand(10), minimumInclusive: false }]) {
    assert.equal(ruleSchema.safeParse({ ...r, constraint: { type: 'dimension_range', field: 'widthIn', unit: 'in', ...bounds } }).success, false);
  }
});
