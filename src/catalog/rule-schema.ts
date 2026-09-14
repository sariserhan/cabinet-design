import { z } from 'zod';
import { confidenceSchema, evidenced, idSchema, reviewStatusSchema, sourceEvidenceSchema } from './evidence.js';

export const textFieldSchema = z.enum(['style', 'finish', 'sku', 'hostSku', 'hostConfiguration']);
export const numberFieldSchema = z.enum(['widthIn', 'heightIn', 'depthIn', 'resultDepthIn', 'ovenOpeningWidthIn', 'ovenOpeningHeightIn', 'ovenOverallHeightIn']);
export const booleanFieldSchema = z.enum(['exposedSide', 'cutDepthReductionApplied', 'hasRodAccessory']);
const stringOperand = evidenced(idSchema);
const numberOperand = evidenced(z.number());
const booleanOperand = evidenced(z.boolean());
const stringList = z.array(stringOperand).min(1).refine(xs => new Set(xs.map(x => x.value)).size === xs.length, 'Duplicate values');

const predicateSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), field: textFieldSchema, op: z.literal('eq'), value: stringOperand }),
  z.strictObject({ kind: z.literal('text_set'), field: textFieldSchema, op: z.literal('in'), values: stringList }),
  z.strictObject({ kind: z.literal('number'), field: numberFieldSchema, op: z.enum(['eq', 'gt', 'gte', 'lt', 'lte']), value: numberOperand }),
  z.strictObject({ kind: z.literal('boolean'), field: booleanFieldSchema, op: z.literal('eq'), value: booleanOperand }),
]);
type Predicate = z.infer<typeof predicateSchema>;
export type RuleCondition = Predicate | { kind: 'all' | 'any'; conditions: RuleCondition[] } | { kind: 'not'; condition: RuleCondition };
export const conditionSchema: z.ZodType<RuleCondition> = z.lazy(() => z.union([
  predicateSchema,
  z.strictObject({ kind: z.enum(['all', 'any']), conditions: z.array(conditionSchema).min(1) }),
  z.strictObject({ kind: z.literal('not'), condition: conditionSchema }),
]));
export const targetSchema = z.strictObject({
  kind: z.enum(['product', 'option', 'modification', 'accessory_role', 'document_role']),
  id: stringOperand,
});
const dimensionRangeSchema = z.strictObject({
  type: z.literal('dimension_range'), field: numberFieldSchema, unit: z.literal('in'),
  minimum: numberOperand.optional(), maximum: numberOperand.optional(),
  minimumInclusive: z.boolean().default(true), maximumInclusive: z.boolean().default(true),
}).superRefine((r, ctx) => {
  if (!r.minimum && !r.maximum) ctx.addIssue({ code: 'custom', message: 'At least one bound is required' });
  if (r.minimum && r.maximum && (r.minimum.value > r.maximum.value || (r.minimum.value === r.maximum.value && (!r.minimumInclusive || !r.maximumInclusive)))) {
    ctx.addIssue({ code: 'custom', message: 'Dimension range is empty or inverted' });
  }
});
export const constraintSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('allowed_values'), field: textFieldSchema, values: stringList, outsideSet: z.literal('invalid') }),
  z.strictObject({ type: z.literal('forbidden_values'), field: textFieldSchema, values: stringList }),
  z.strictObject({ type: z.enum(['requires', 'excludes', 'conditional_requirement']), target: targetSchema }),
  dimensionRangeSchema,
  z.strictObject({ type: z.literal('conditional_availability'), available: booleanOperand }),
  z.strictObject({ type: z.enum(['modification_allowed', 'modification_forbidden']), modificationId: stringOperand }),
]);
export const scopeSchema = z.strictObject({
  kind: z.enum(['series', 'products', 'families', 'categories', 'modifications']), targets: stringList,
});
const base = {
  id: idSchema, catalogVersionId: idSchema, scope: scopeSchema,
  sourceText: z.string().min(1), provenance: z.array(sourceEvidenceSchema).min(1),
  confidence: confidenceSchema, reviewStatus: reviewStatusSchema,
};
export const ruleSchema = z.discriminatedUnion('modelingStatus', [
  z.strictObject({ ...base, modelingStatus: z.literal('modeled'), when: conditionSchema.optional(), constraint: constraintSchema }),
  z.strictObject({ ...base, modelingStatus: z.literal('unmodeled'), code: z.literal('UNMODELED_RULE'), severity: z.enum(['critical', 'noncritical', 'unassessed']), reason: idSchema }),
]).superRefine((rule, ctx) => {
  if (rule.modelingStatus === 'modeled' && ['conditional_requirement', 'conditional_availability'].includes(rule.constraint.type) && !rule.when) {
    ctx.addIssue({ code: 'custom', message: 'Conditional constraints require a condition' });
  }
});
export type CatalogRule = z.infer<typeof ruleSchema>;
export type RuleConstraint = z.infer<typeof constraintSchema>;
export type RuleTarget = z.infer<typeof targetSchema>;

export const contextSchema = z.strictObject({
  catalogVersionId: idSchema, seriesId: idSchema.optional(), productId: idSchema.optional(),
  familyIds: z.array(idSchema).optional(), category: idSchema.optional(),
  values: z.strictObject({
    style: idSchema.optional(), finish: idSchema.optional(), sku: idSchema.optional(), hostSku: idSchema.optional(), hostConfiguration: idSchema.optional(),
    widthIn: z.number().optional(), heightIn: z.number().optional(), depthIn: z.number().optional(), resultDepthIn: z.number().optional(),
    ovenOpeningWidthIn: z.number().optional(), ovenOpeningHeightIn: z.number().optional(), ovenOverallHeightIn: z.number().optional(),
    exposedSide: z.boolean().optional(), cutDepthReductionApplied: z.boolean().optional(), hasRodAccessory: z.boolean().optional(),
  }),
  selection: z.strictObject({
    product: z.array(idSchema).optional(), option: z.array(idSchema).optional(), modification: z.array(idSchema).optional(),
    accessory_role: z.array(idSchema).optional(), document_role: z.array(idSchema).optional(),
  }),
});
export type EvaluationContext = z.infer<typeof contextSchema>;

export function ruleEvidence(rule: CatalogRule) {
  const result: z.infer<typeof sourceEvidenceSchema>[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if ('documentSha256' in v && 'pageNumber' in v) {
        const e = sourceEvidenceSchema.parse(v); result.push(e);
      } else Object.values(v).forEach(visit);
    }
  }
  visit(rule);
  return result;
}
