import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockerCodeSchema, evaluateApproval, factBlockers } from '../../src/catalog/approval.js';
import { fact, evidence, operand } from './fixtures.js';

for (const blocker of blockerCodeSchema.options) {
  test(`${blocker} blocks auto approval even at confidence 1`, () => {
    assert.equal(evaluateApproval({ confidence: 1, blockers: [blocker], reviewStatus: 'unreviewed' }).eligibleForAutoApproval, false);
  });
}
test('threshold is inclusive, and human approval cannot override blockers', () => {
  assert.equal(evaluateApproval({ confidence: .98, blockers: [], reviewStatus: 'unreviewed' }).eligibleForAutoApproval, true);
  assert.equal(evaluateApproval({ confidence: .97999, blockers: [], reviewStatus: 'unreviewed' }).eligibleForAutoApproval, false);
  assert.equal(evaluateApproval({ confidence: 1, blockers: ['invalid_dimension'], reviewStatus: 'approved' }).eligibleForAutoApproval, false);
  assert.equal(evaluateApproval({ confidence: 1, blockers: [], reviewStatus: 'rejected' }).eligibleForAutoApproval, false);
});
test('required unknown, absent and conflicting dimensions are blocked', () => {
  const requirement = { required: true, valueType: 'number', positiveDimension: true };
  assert.deepEqual(factBlockers(undefined, requirement), ['missing_required_field']);
  const base = { id: 'f', provenance: [evidence], confidence: 1, extractionMethod: 'text', reviewStatus: 'approved' };
  for (const state of ['unknown', 'absent']) assert.ok(factBlockers({ ...base, state, reason: 'Not specified' }, requirement).includes('missing_required_field'));
  assert.ok(factBlockers({ ...base, state: 'conflict', candidates: [operand(30), operand(36)] }, requirement).includes('unresolved_conflict'));
  for (const width of [0, -3]) assert.ok(factBlockers(fact('f', width), requirement).includes('invalid_dimension'));
});
test('missing provenance and wrong dimension types block even human-approved fields', () => {
  const f = { ...fact('f', '30'), reviewStatus: 'approved', provenance: [] };
  const result = factBlockers(f, { required: true, valueType: 'number', positiveDimension: true });
  assert.ok(result.includes('missing_provenance')); assert.ok(result.includes('invalid_dimension'));
});
