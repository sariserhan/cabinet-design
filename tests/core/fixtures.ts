import { factSchema } from '../../src/catalog/evidence.js';
import type { SourceEvidence } from '../../src/catalog/evidence.js';
import { ruleSchema } from '../../src/catalog/rule-schema.js';
import type { RuleConstraint, EvaluationContext, CatalogRule } from '../../src/catalog/rule-schema.js';
import { candidateContentHash, candidateSchema } from '../../src/catalog/publication.js';
import type { CatalogCandidate } from '../../src/catalog/publication.js';

// Deliberately synthetic unit-test data. Never imported as Allure benchmark truth.
export const evidence: SourceEvidence = {
  id: 'synthetic-evidence-1', documentId: 'synthetic-doc', documentSha256: 'a'.repeat(64),
  pageNumber: 1, printedPageLabel: 'I', sourceText: 'Synthetic fixture text, not a manufacturer assertion',
  location: { kind: 'full_page', reason: 'Unit test source' },
};
export const operand = <T>(value: T) => ({ value, provenance: [evidence] });
export function fact(id: string, value: string | number | boolean) {
  return factSchema.parse({ id, state: 'known', value, confidence: 1, provenance: [evidence], extractionMethod: 'text', reviewStatus: 'auto_approved' });
}
export function rule(constraint: RuleConstraint, overrides: Partial<CatalogRule> = {}): CatalogRule {
  return ruleSchema.parse({ id: 'r1', catalogVersionId: 'v1', scope: { kind: 'products', targets: [operand('p1')] }, sourceText: 'Synthetic rule', provenance: [evidence], confidence: 1, reviewStatus: 'approved', modelingStatus: 'modeled', constraint, ...overrides });
}
export function context(values: EvaluationContext['values'] = {}, selection: EvaluationContext['selection'] = {}): EvaluationContext {
  return { catalogVersionId: 'v1', seriesId: 'series1', productId: 'p1', category: 'wall_cabinet', values, selection };
}
export function candidate(): CatalogCandidate {
  return candidateSchema.parse({ id: 'v1', revision: 1, status: 'review', seriesId: 'series1', compilerVersion: 'unit-test', schemaVersion: '1', promptVersion: 'unit-test', modelVersion: 'unit-test',
    documents: [{ id: evidence.documentId, sha256: evidence.documentSha256, pageCount: 2 }],
    coverage: { kind: 'subset', label: 'Synthetic unit-test subset', pages: [{ documentId: evidence.documentId, pageNumber: 1 }] },
    pages: [{ documentId: evidence.documentId, pageNumber: 1, status: 'processed', contentType: 'catalog' }],
    products: [{ id: 'p1', reviewStatus: 'auto_approved', fields: { sku: fact('sku', 'SYNTHETIC-W3018'), normalizedCategory: fact('cat', 'wall_cabinet'), widthIn: fact('width', 30), heightIn: fact('height', 18), depthIn: fact('depth', 12) } }],
    rules: [], findings: [], additionalCategoryProfiles: [],
  });
}
export function certify(c: CatalogCandidate): CatalogCandidate {
  const hash = candidateContentHash(c);
  return { ...c,
    benchmark: { runId: 'synthetic-benchmark', candidateRevision: c.revision, contentHash: hash, passed: true, fixtureRevision: 'synthetic-1', scope: c.coverage.kind === 'subset' ? 'milestone_1' : 'full_document', truthStatus: 'human_verified', productsPass: true, fieldsPass: true, rulesPass: true, footnotesPass: true },
    validation: { runId: 'synthetic-validation', candidateRevision: c.revision, contentHash: hash, passed: true },
  };
}
