import { z } from 'zod';
import {
  recordDataSchema,
  deterministicRecordBlockers,
  type RecordData,
} from './record-data';
import { contextSchema } from './rule-schema';
import { evaluateRules } from './rules';
import { evaluateApproval } from './approval';
import { crossSourceConflicts, sourceMarkers } from './cross-source';
export type BenchmarkPage = {
  pageNumber: number;
  printedLabel: string;
  text: string;
};
const executableCaseSchema = z.discriminatedUnion('test', [
  z.object({
    test: z.literal('record_blockers'),
    entityId: z.string(),
    expectedBlockers: z.array(z.string()).min(1),
    candidateOverride: recordDataSchema.optional(),
  }),
  z.object({
    test: z.literal('rules'),
    ruleIds: z.array(z.string()).default([]),
    ruleSourceTexts: z.array(z.string()).default([]),
    context: contextSchema,
    expected: z.enum(['valid', 'invalid', 'unknown', 'not_applicable']),
  }),
  z.object({
    test: z.literal('navigation'),
    pageNumber: z.number(),
    expectedPrintedLabel: z.string(),
    indexPage: z.number(),
    indexText: z.string(),
  }),
  z.object({
    test: z.literal('corrupt_dimension'),
    sku: z.string(),
    field: z.string(),
    value: z.number(),
  }),
  z.object({
    test: z.literal('remove_diagram_evidence'),
    sku: z.string(),
    field: z.string(),
  }),
  z.object({
    test: z.literal('footnote_scope'),
    sku: z.string(),
    pageNumber: z.number(),
    injectedSymbol: z.string(),
    expectedEligible: z.boolean(),
  }),
]);
export function executeBenchmarkCase(
  definition: unknown,
  records: RecordData[],
  pages: BenchmarkPage[] = [],
  depth = 0,
): { passed: boolean; reason: string } {
  if (depth > 3) return { passed: false, reason: 'Case nesting exceeds limit' };
  if (definition && typeof definition === 'object' && 'checks' in definition) {
    const checks = (definition as { checks: unknown }).checks;
    if (!Array.isArray(checks) || !checks.length || checks.length > 20)
      return { passed: false, reason: 'Case suite needs 1–20 checks' };
    const results = checks.map((c) =>
      executeBenchmarkCase(c, records, pages, depth + 1),
    );
    return {
      passed: results.every((r) => r.passed),
      reason: JSON.stringify(results),
    };
  }
  const parsed = executableCaseSchema.safeParse(definition);
  if (!parsed.success)
    return {
      passed: false,
      reason: 'Case needs a reviewed executable definition',
    };
  const c = parsed.data;
  if (c.test === 'navigation') {
    const page = pages.find((p) => p.pageNumber === c.pageNumber),
      index = pages.find((p) => p.pageNumber === c.indexPage);
    return {
      passed:
        page?.printedLabel === c.expectedPrintedLabel &&
        Boolean(index?.text.includes(c.indexText)),
      reason:
        'Physical page / printed label and index text checked independently',
    };
  }
  if (c.test === 'footnote_scope') {
    const page = pages.find((p) => p.pageNumber === c.pageNumber);
    if (!page) return { passed: false, reason: 'Source page missing' };
    const markers = sourceMarkers(page.text, c.sku);
    if (!markers.length)
      return { passed: false, reason: 'Row marker could not be resolved' };
    const eligible = markers.every((m) => m.includes(c.injectedSymbol));
    return {
      passed: eligible === c.expectedEligible,
      reason: JSON.stringify({ markers, eligible }),
    };
  }
  if (c.test === 'corrupt_dimension' || c.test === 'remove_diagram_evidence') {
    const copy = structuredClone(records);
    const product = copy.find(
      (r) =>
        r.kind === 'product' &&
        r.data.fields.sku?.state === 'known' &&
        r.data.fields.sku.value === c.sku,
    );
    if (product?.kind !== 'product')
      return { passed: false, reason: 'Required candidate product missing' };
    const field = product.data.fields[c.field];
    if (field?.state !== 'known')
      return { passed: false, reason: 'Required candidate dimension missing' };
    if (c.test === 'corrupt_dimension') {
      field.value = c.value;
      const conflicts = crossSourceConflicts(copy);
      return {
        passed: conflicts.some((f) => f.entityId === product.data.id),
        reason: JSON.stringify(conflicts),
      };
    }
    field.provenance = [];
    field.extractionMethod = 'vision';
    delete field.derivation;
    const blockers = deterministicRecordBlockers(product);
    return {
      passed:
        blockers.includes('missing_provenance') &&
        blockers.includes('diagram_dependency_not_verified'),
      reason: JSON.stringify(blockers),
    };
  }
  if (c.test === 'record_blockers') {
    const actual = records.find((r) => r.data.id === c.entityId);
    if (!actual)
      return { passed: false, reason: 'Required candidate entity is missing' };
    const blockers = deterministicRecordBlockers(c.candidateOverride ?? actual);
    const approval = evaluateApproval({
      confidence: 1,
      blockers,
      reviewStatus: 'unreviewed',
    });
    return {
      passed:
        c.expectedBlockers.every((b) => blockers.includes(b)) &&
        !approval.eligibleForAutoApproval,
      reason: JSON.stringify({ blockers, approval }),
    };
  }
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const rules = records.flatMap((r) =>
    r.kind === 'rule' &&
    (c.ruleIds.includes(r.data.id) ||
      c.ruleSourceTexts.some(
        (t) => normalize(t) === normalize(r.data.sourceText),
      ))
      ? [r.data]
      : [],
  );
  if (
    !rules.length ||
    c.ruleIds.some((id) => !rules.some((r) => r.id === id)) ||
    c.ruleSourceTexts.some(
      (t) => !rules.some((r) => normalize(t) === normalize(r.sourceText)),
    )
  )
    return { passed: false, reason: 'Required candidate rule is missing' };
  const version = rules[0]?.catalogVersionId;
  if (!version) return { passed: false, reason: 'Rule version missing' };
  const result = evaluateRules(rules, {
    ...c.context,
    catalogVersionId: version,
  });
  return {
    passed: result.outcome === c.expected,
    reason: JSON.stringify(result),
  };
}
