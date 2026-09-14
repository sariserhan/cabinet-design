import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePublication, preparePublishedSnapshot } from '../../src/catalog/publication.js';
import { candidate, certify, evidence, fact, operand, rule } from './fixtures.js';
import type { CatalogCandidate } from '../../src/catalog/publication.js';

function firstProduct(c: CatalogCandidate) { const p = c.products[0]; assert.ok(p); return p; }
function codes(c: CatalogCandidate) { return evaluatePublication(c).issues.map(i => i.code); }
const date = '2026-09-14T10:00:00.000Z';
test('valid synthetic subset passes only after content-bound benchmark and validation receipts', () => {
  assert.ok(codes(candidate()).includes('benchmark_gate_failed'));
  assert.equal(evaluatePublication(certify(candidate())).publishable, true);
});
test('draft benchmark truth cannot authorize publication despite reported success', () => {
  const c = certify(candidate()); assert.ok(c.benchmark); c.benchmark.truthStatus = 'draft';
  assert.ok(codes(c).includes('benchmark_gate_failed'));
});
test('each separate benchmark metric must pass', () => {
  for (const metric of ['productsPass', 'fieldsPass', 'rulesPass', 'footnotesPass'] as const) {
    const c = certify(candidate()); assert.ok(c.benchmark); c.benchmark[metric] = false;
    assert.ok(codes(c).includes('benchmark_gate_failed'));
  }
});
test('full document coverage cannot reuse a mini-catalog pass or omit pages', () => {
  const c = candidate(); c.coverage = { kind: 'full_document' };
  assert.ok(codes(certify(c)).includes('page_not_processed'));
  const certified = certify(c); assert.ok(certified.benchmark); certified.benchmark.scope = 'milestone_1';
  assert.ok(codes(certified).includes('benchmark_gate_failed'));
});
test('failed catalog pages cannot be hidden behind an ignore status', () => {
  const c = candidate(); const page = c.pages[0]; assert.ok(page);
  page.status = 'failed'; assert.ok(codes(certify(c)).includes('page_not_processed'));
  page.status = 'ignored'; page.ignoreAudit = { actorId: 'test-reviewer', at: date, reason: 'Test' };
  assert.ok(codes(certify(c)).includes('invalid_page_ignore'));
});
test('irrelevant non-catalog page can be ignored with audit, but cannot support a product fact', () => {
  const c = candidate(); assert.equal(c.coverage.kind, 'subset');
  if (c.coverage.kind !== 'subset') throw new Error('Expected subset');
  c.coverage.pages.push({ documentId: evidence.documentId, pageNumber: 2 });
  c.pages.push({ documentId: evidence.documentId, pageNumber: 2, status: 'ignored', contentType: 'non_catalog', ignoreAudit: { actorId: 'test-reviewer', at: date, reason: 'Warranty page' } });
  assert.equal(evaluatePublication(certify(c)).publishable, true);
  const depth = firstProduct(c).fields.depthIn; assert.ok(depth);
  depth.provenance = [{ ...evidence, id: 'e2', pageNumber: 2 }];
  assert.ok(codes(certify(c)).includes('unprocessed_evidence'));
});
test('cross-page evidence requires the dependency in declared coverage', () => {
  const c = candidate(), depth = firstProduct(c).fields.depthIn; assert.ok(depth);
  depth.provenance = [{ ...evidence, id: 'e2', pageNumber: 2 }];
  assert.ok(codes(certify(c)).includes('missing_dependency_page'));
});
test('wrong source hashes and reused evidence IDs are detected', () => {
  const c = candidate(), depth = firstProduct(c).fields.depthIn; assert.ok(depth);
  depth.provenance = [{ ...evidence, documentSha256: 'b'.repeat(64) }];
  const result = codes(certify(c)); assert.ok(result.includes('invalid_provenance')); assert.ok(result.includes('conflicting_evidence_identity'));
});
test('required dimensions remain mandatory despite high confidence and human approval', () => {
  const c = candidate(), p = firstProduct(c); p.reviewStatus = 'approved'; delete p.fields.depthIn;
  assert.ok(codes(certify(c)).includes('missing_required_field'));
  p.fields.depthIn = { ...fact('depth', -12), reviewStatus: 'approved' };
  assert.ok(codes(certify(c)).includes('invalid_dimension'));
});
test('optional approved attributes still require field provenance', () => {
  const c = candidate(); firstProduct(c).fields.optionalNote = { ...fact('note', 'test'), provenance: [], reviewStatus: 'approved' };
  assert.ok(codes(certify(c)).includes('missing_provenance'));
});
test('human approval cannot erase a conflict finding', () => {
  const c = candidate(); firstProduct(c).reviewStatus = 'approved';
  c.findings = [{ id: 'conflict', entityId: 'p1', code: 'unresolved_conflict', severity: 'blocking', provenance: [evidence] }];
  assert.ok(codes(certify(c)).includes('unresolved_conflict'));
});
test('finding resolutions from old revisions or unrelated validation runs are ineffective', () => {
  const c = candidate();
  c.findings = [{ id: 'conflict', entityId: 'p1', code: 'unresolved_conflict', severity: 'blocking', provenance: [evidence], resolution: { candidateRevision: 0, actorId: 'reviewer', resolvedAt: date, reason: 'Corrected', validationRunId: 'synthetic-validation' } }];
  assert.ok(codes(certify(c)).includes('unresolved_conflict'));
  const f = c.findings[0]; assert.ok(f?.resolution); f.resolution.candidateRevision = 1; f.resolution.validationRunId = 'old-run';
  assert.ok(codes(certify(c)).includes('uncertified_resolution'));
});
test('auto approval is checked for every field, including optional attributes', () => {
  const c = candidate(); firstProduct(c).fields.optionalNote = { ...fact('note', 'test'), confidence: .8 };
  assert.ok(codes(certify(c)).includes('ineligible_auto_approval'));
});
test('unknown optional facts do not silently become approved data', () => {
  const c = candidate(); firstProduct(c).fields.shelfCount = { id: 'shelf', state: 'unknown', reason: 'Ambiguous', confidence: 1, provenance: [evidence], extractionMethod: 'text', reviewStatus: 'approved' };
  assert.ok(codes(certify(c)).includes('unresolved_field'));
});
test('duplicate SKUs are blocked, even if all field IDs are different', () => {
  const c = candidate(); const p = structuredClone(firstProduct(c)); p.id = 'p2';
  for (const f of Object.values(p.fields)) f.id += '-2';
  c.products.push(p); assert.ok(codes(certify(c)).includes('duplicate_sku_conflict'));
});
test('derived facts must reference approved inputs and cannot form a cycle', () => {
  const c = candidate(), p = firstProduct(c); const width = p.fields.widthIn; assert.ok(width);
  width.extractionMethod = 'derived'; width.derivation = { ruleId: 'test', ruleVersion: '1', inputFactIds: ['missing'] };
  assert.ok(codes(certify(c)).includes('invalid_derivation'));
  width.derivation.inputFactIds = ['depth'];
  const depth = p.fields.depthIn; assert.ok(depth);
  depth.extractionMethod = 'derived'; depth.derivation = { ruleId: 'test', ruleVersion: '1', inputFactIds: ['width'] };
  assert.ok(codes(certify(c)).includes('invalid_derivation'));
});
test('critical or unassessed unmodeled rules block publication even when human approved', () => {
  for (const severity of ['critical', 'unassessed'] as const) {
    const c = candidate(); c.rules = [{ id: 'r1', catalogVersionId: 'v1', scope: { kind: 'products', targets: [operand('p1')] }, sourceText: 'Ambiguous source text', provenance: [evidence], confidence: 1, reviewStatus: 'approved', modelingStatus: 'unmodeled', code: 'UNMODELED_RULE', severity, reason: 'Unsupported' }];
    assert.ok(codes(certify(c)).includes('unmodeled_rule'));
  }
});
test('rule operands cannot hide conflicting evidence under a shared evidence ID', () => {
  const c = candidate(); c.rules = [rule({ type: 'allowed_values', field: 'finish', values: [{ value: 'Frost', provenance: [{ ...evidence, sourceText: 'different text' }] }], outsideSet: 'invalid' })];
  assert.ok(codes(certify(c)).includes('conflicting_evidence_identity'));
});
test('rule scopes must point to entities in the same catalog snapshot', () => {
  const c = candidate(); c.rules = [rule({ type: 'allowed_values', field: 'finish', values: [operand('Frost')], outsideSet: 'invalid' }, { scope: { kind: 'products', targets: [operand('missing')] } })];
  assert.ok(codes(certify(c)).includes('dangling_rule_scope'));
});
test('category profile cannot waive mandatory cabinet dimensions', () => {
  const c = candidate(); c.additionalCategoryProfiles = [{ category: 'wall_cabinet', version: 'test', audit: { actorId: 'reviewer', at: date, reason: 'Test invalid weakening' }, requirements: { widthIn: { required: false, valueType: 'number', positiveDimension: true } } }];
  assert.ok(codes(certify(c)).includes('invalid_category_profile'));
});
test('accessory geometry needs an explicit audited profile rather than cabinet defaults', () => {
  const c = candidate(), p = firstProduct(c); p.fields.normalizedCategory = fact('cat', 'accessory');
  assert.ok(codes(certify(c)).includes('category_profile_required'));
  c.additionalCategoryProfiles = [{ category: 'accessory', version: '1', audit: { actorId: 'reviewer', at: date, reason: 'Synthetic profile' }, requirements: { lengthIn: { required: true, valueType: 'number', positiveDimension: true } } }];
  p.fields.lengthIn = fact('length', 24);
  assert.equal(evaluatePublication(certify(c)).publishable, true);
});
test('candidate edits invalidate receipts and stale publication gates', () => {
  const c = certify(candidate()), gate = evaluatePublication(c);
  firstProduct(c).fields.widthIn = fact('width', 33);
  assert.ok(codes(c).includes('benchmark_gate_failed'));
  assert.throws(() => preparePublishedSnapshot(certify(c), gate, date), /stale/);
});
test('receipt changes invalidate the reviewed gate even if content is unchanged', () => {
  const c = certify(candidate()), gate = evaluatePublication(c); assert.ok(c.validation); c.validation.runId = 'different-run';
  assert.throws(() => preparePublishedSnapshot(c, gate, date), /stale/);
});
test('published snapshot does not mutate the candidate and cannot be republished', () => {
  const c = certify(candidate()), gate = evaluatePublication(c);
  const snapshot = preparePublishedSnapshot(c, gate, date);
  assert.equal(c.status, 'review'); assert.equal(snapshot.status, 'published');
  const { publishedAt: _at, gate: _gate, ...publishedCandidate } = snapshot; void _at; void _gate;
  assert.ok(codes(publishedCandidate).includes('immutable_version'));
  assert.throws(() => preparePublishedSnapshot(publishedCandidate, gate, date), /blocked/);
});

test('required product targets must exist in the snapshot', () => {
  const c = candidate(); c.rules = [rule({ type: 'requires', target: { kind: 'product', id: operand('missing-panel') } })];
  assert.ok(codes(certify(c)).includes('dangling_rule_target'));
});
test('published objects are deeply frozen in memory', () => {
  const c = certify(candidate()), snapshot = preparePublishedSnapshot(c, evaluatePublication(c), date);
  assert.equal(Object.isFrozen(snapshot), true);
  const product = snapshot.products[0]; assert.ok(product);
  assert.throws(() => { product.reviewStatus = 'rejected'; }, TypeError);
  assert.equal(Object.isFrozen(product.fields.widthIn), true);
});
