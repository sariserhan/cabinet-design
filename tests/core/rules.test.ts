import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule, evaluateRules } from '../../src/catalog/rules.js';
import { ruleSchema } from '../../src/catalog/rule-schema.js';
import { context, operand, rule } from './fixtures.js';

const allowed = () => rule({ type: 'allowed_values', field: 'finish', values: [operand('Frost'), operand('Dove')], outsideSet: 'invalid' });
test('allowed_values excludes outside values; missing input remains unknown', () => {
  assert.equal(evaluateRule(allowed(), context({ finish: 'Frost' })).outcome, 'valid');
  assert.equal(evaluateRule(allowed(), context({ finish: 'Indigo' })).outcome, 'invalid');
  assert.equal(evaluateRule(allowed(), context()).outcome, 'unknown');
});
test('style and finish constraints combine without allowing another style in the same finish', () => {
  const style = rule({ type: 'allowed_values', field: 'style', values: [operand('Galaxy')], outsideSet: 'invalid' }, { id: 'style' });
  assert.equal(evaluateRules([allowed(), style], context({ style: 'Luna', finish: 'Frost' })).outcome, 'invalid');
  assert.equal(evaluateRules([allowed(), style], context({ style: 'Galaxy', finish: 'Frost' })).outcome, 'valid');
});
test('forbidden_values only validates its own constraint, not global availability', () => {
  const r = rule({ type: 'forbidden_values', field: 'finish', values: [operand('Frost')] });
  assert.equal(evaluateRule(r, context({ finish: 'Frost' })).outcome, 'invalid');
  assert.equal(evaluateRules([], context({ finish: 'Dove' })).outcome, 'not_applicable');
});
test('requires distinguishes unknown selection from known empty selection', () => {
  const r = rule({ type: 'requires', target: { kind: 'product', id: operand('panel') } });
  assert.equal(evaluateRule(r, context()).outcome, 'unknown');
  assert.equal(evaluateRule(r, context({}, { product: [] })).outcome, 'invalid');
  assert.equal(evaluateRule(r, context({}, { product: ['panel'] })).outcome, 'valid');
});
test('excludes rejects selected targets and preserves unknown selections', () => {
  const r = rule({ type: 'excludes', target: { kind: 'option', id: operand('glass') } });
  assert.equal(evaluateRule(r, context({}, { option: ['glass'] })).outcome, 'invalid');
  assert.equal(evaluateRule(r, context({}, { option: [] })).outcome, 'valid');
  assert.equal(evaluateRule(r, context()).outcome, 'unknown');
});
test('range inclusivity and omitted limits are respected', () => {
  const r = rule({ type: 'dimension_range', field: 'widthIn', unit: 'in', minimum: operand(12), maximum: operand(36), minimumInclusive: true, maximumInclusive: false });
  for (const [width, expected] of [[12, 'valid'], [36, 'invalid'], [11.5, 'invalid']] as const) assert.equal(evaluateRule(r, context({ widthIn: width })).outcome, expected);
  assert.equal(evaluateRule(r, context()).outcome, 'unknown');
});
test('conditional requirement models CUT-ROD dependency and does not guess missing conditions', () => {
  const r = ruleSchema.parse({ ...rule({ type: 'requires', target: { kind: 'modification', id: operand('CUT-ROD') } }),
    constraint: { type: 'conditional_requirement', target: { kind: 'modification', id: operand('CUT-ROD') } },
    when: { kind: 'all', conditions: [{ kind: 'boolean', field: 'cutDepthReductionApplied', op: 'eq', value: operand(true) }, { kind: 'boolean', field: 'hasRodAccessory', op: 'eq', value: operand(true) }] } });
  assert.equal(evaluateRule(r, context({ cutDepthReductionApplied: true, hasRodAccessory: true }, { modification: [] })).outcome, 'invalid');
  assert.equal(evaluateRule(r, context({ cutDepthReductionApplied: true, hasRodAccessory: true }, { modification: ['CUT-ROD'] })).outcome, 'valid');
  assert.equal(evaluateRule(r, context({ cutDepthReductionApplied: true })).outcome, 'unknown');
  assert.equal(evaluateRule(r, context({ cutDepthReductionApplied: false })).outcome, 'not_applicable');
});
test('conditional availability can explicitly invalidate an over-wide configuration', () => {
  const r = ruleSchema.parse({ ...allowed(), constraint: { type: 'conditional_availability', available: operand(false) }, when: { kind: 'number', field: 'widthIn', op: 'gt', value: operand(36) } });
  assert.equal(evaluateRule(r, context({ widthIn: 39 })).outcome, 'invalid');
  assert.equal(evaluateRule(r, context({ widthIn: 30 })).outcome, 'not_applicable');
  assert.equal(evaluateRule(r, context()).outcome, 'unknown');
});
test('not of unknown remains unknown; any can short-circuit on established truth', () => {
  const predicate = { kind: 'text' as const, field: 'finish' as const, op: 'eq' as const, value: operand('Frost') };
  const r = ruleSchema.parse({ ...allowed(), when: { kind: 'not', condition: predicate } });
  assert.equal(evaluateRule(r, context()).outcome, 'unknown');
  const any = ruleSchema.parse({ ...allowed(), when: { kind: 'any', conditions: [predicate, { kind: 'boolean', field: 'exposedSide', op: 'eq', value: operand(true) }] } });
  assert.equal(evaluateRule(any, context({ finish: 'Frost' })).outcome, 'valid');
});
test('scope and catalog version prevent applying unrelated rules', () => {
  assert.equal(evaluateRule(allowed(), { ...context({ finish: 'Frost' }), productId: 'other' }).outcome, 'not_applicable');
  assert.equal(evaluateRule(allowed(), { ...context({ finish: 'Frost' }), catalogVersionId: 'v2' }).outcome, 'unknown');
  const c = context(); delete c.productId;
  assert.equal(evaluateRule(allowed(), c).outcome, 'unknown');
});
test('unapproved and unmodeled rules never silently produce valid', () => {
  assert.equal(evaluateRule({ ...allowed(), reviewStatus: 'unreviewed' }, context({ finish: 'Frost' })).outcome, 'unknown');
  const { constraint: _constraint, ...base } = allowed() as ReturnType<typeof allowed> & { constraint: unknown }; void _constraint;
  const unmodeled = { ...base, modelingStatus: 'unmodeled', code: 'UNMODELED_RULE', severity: 'critical', reason: 'Not modeled' };
  assert.equal(evaluateRule(unmodeled, context()).outcome, 'unknown');
});
test('permission and prohibition conflict without silently choosing precedence', () => {
  const allow = rule({ type: 'modification_allowed', modificationId: operand('CUT') }, { id: 'allow' });
  const deny = rule({ type: 'modification_forbidden', modificationId: operand('CUT') }, { id: 'deny' });
  const result = evaluateRules([allow, deny], context({}, { modification: ['CUT'] }));
  assert.equal(result.outcome, 'invalid');
  assert.deepEqual(result.conflicts[0]?.ruleIds, ['allow', 'deny']);
  assert.equal(evaluateRules([allow, deny], context({}, { modification: [] })).outcome, 'unknown');
});
test('no broad approval when constraints are all inapplicable; invalid retains unknown diagnostics', () => {
  const unknown = rule({ type: 'requires', target: { kind: 'product', id: operand('panel') } }, { id: 'unknown' });
  const result = evaluateRules([allowed(), unknown], context({ finish: 'outside' }));
  assert.equal(result.outcome, 'invalid');
  assert.ok(result.results.some(r => r.outcome === 'unknown'));
});

test('low-confidence auto-approved rule labels cannot bypass evaluation eligibility', () => {
  assert.equal(evaluateRule({ ...allowed(), confidence: .5, reviewStatus: 'auto_approved' }, context({ finish: 'Frost' })).outcome, 'unknown');
});
