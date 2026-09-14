import { z } from 'zod';
import { confidenceSchema, factSchema, idSchema, reviewStatusSchema, sourceEvidenceSchema } from './evidence.js';
import type { Fact } from './evidence.js';

export const AUTO_APPROVE_THRESHOLD = 0.98;
export const blockerCodeSchema = z.enum([
  'unresolved_conflict', 'missing_required_field', 'missing_provenance',
  'ambiguous_footnote_scope', 'unmodeled_rule', 'failed_cross_source_validation',
  'diagram_dependency_not_verified', 'page_processing_warning_affecting_record',
  'duplicate_sku_conflict', 'invalid_dimension',
]);
export type ApprovalBlocker = z.infer<typeof blockerCodeSchema>;
export const approvalInputSchema = z.strictObject({
  confidence: confidenceSchema, blockers: z.array(blockerCodeSchema), reviewStatus: reviewStatusSchema,
});
export function evaluateApproval(raw: unknown) {
  const input = approvalInputSchema.parse(raw);
  const blockers = [...new Set(input.blockers)].sort();
  return { confidence: input.confidence, blockers,
    eligibleForAutoApproval: input.confidence >= AUTO_APPROVE_THRESHOLD && blockers.length === 0 && input.reviewStatus !== 'rejected' };
}
export const factRequirementSchema = z.strictObject({
  required: z.boolean(), valueType: z.enum(['string', 'number', 'boolean']),
  positiveDimension: z.boolean().default(false),
});
export type FactRequirement = z.infer<typeof factRequirementSchema>;
export function factBlockers(rawFact: unknown, rawRequirement: unknown): ApprovalBlocker[] {
  const requirement = factRequirementSchema.parse(rawRequirement);
  if (rawFact === undefined) return requirement.required ? ['missing_required_field'] : [];
  const fact = factSchema.parse(rawFact);
  const blockers: ApprovalBlocker[] = [];
  if (!fact.provenance.length) blockers.push('missing_provenance');
  if (fact.state === 'conflict') blockers.push('unresolved_conflict');
  if (requirement.required && (fact.state !== 'known' || fact.reviewStatus === 'rejected')) blockers.push('missing_required_field');
  if (fact.state === 'known') {
    if (typeof fact.value !== requirement.valueType || (typeof fact.value === 'string' && !fact.value.trim())) blockers.push('missing_required_field');
    if (requirement.positiveDimension && (typeof fact.value !== 'number' || fact.value <= 0)) blockers.push('invalid_dimension');
  }
  return [...new Set(blockers)];
}
export const findingSchema = z.strictObject({
  id: idSchema, code: blockerCodeSchema, entityId: idSchema, factId: idSchema.optional(),
  severity: z.enum(['blocking', 'noncritical']), provenance: z.array(sourceEvidenceSchema),
  resolution: z.strictObject({
    candidateRevision: z.number().int().nonnegative(), actorId: idSchema,
    resolvedAt: z.iso.datetime(), reason: idSchema, validationRunId: idSchema,
  }).optional(),
});
export type Finding = z.infer<typeof findingSchema>;
export function unresolvedFindings(findings: Finding[], revision: number): Finding[] {
  return findings.filter(f => f.resolution?.candidateRevision !== revision);
}
export function approvedFact(fact: Fact): boolean {
  return fact.reviewStatus === 'approved' || fact.reviewStatus === 'auto_approved';
}
