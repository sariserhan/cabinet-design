import { z } from 'zod';

export const idSchema = z.string().trim().min(1);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const confidenceSchema = z.number().min(0).max(1);
export const reviewStatusSchema = z.enum(['unreviewed', 'auto_approved', 'approved', 'rejected']);
export const methodSchema = z.enum(['table', 'text', 'vision', 'derived', 'human']);
const boxSchema = z.strictObject({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).refine(b => b.x + b.width <= 1 && b.y + b.height <= 1, 'Box must fit inside displayed page');

export const sourceEvidenceSchema = z.strictObject({
  id: idSchema,
  documentId: idSchema,
  documentSha256: sha256Schema,
  pageNumber: z.number().int().positive(),
  printedPageLabel: idSchema.optional(),
  sourceText: z.string().min(1).optional(),
  location: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('region'), regionId: idSchema, boundingBox: boxSchema }),
    z.strictObject({ kind: z.literal('full_page'), reason: idSchema }),
  ]),
});
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;

/** Atomic rule operands may share evidence, but each operand must carry it. */
export function evidenced<T extends z.ZodType>(value: T) {
  return z.strictObject({ value, provenance: z.array(sourceEvidenceSchema).min(1) });
}
export const derivationSchema = z.strictObject({
  ruleId: idSchema, ruleVersion: idSchema, inputFactIds: z.array(idSchema).min(1),
});
export const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const factBase = {
  id: idSchema, confidence: confidenceSchema,
  provenance: z.array(sourceEvidenceSchema), extractionMethod: methodSchema,
  reviewStatus: reviewStatusSchema, derivation: derivationSchema.optional(),
};

/** Candidate facts may lack evidence. Approval validation must reject that omission. */
export const factSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...factBase, state: z.literal('known'), value: scalarSchema }),
  z.strictObject({ ...factBase, state: z.literal('unknown'), reason: idSchema }),
  z.strictObject({ ...factBase, state: z.literal('absent'), reason: idSchema }),
  z.strictObject({ ...factBase, state: z.literal('conflict'), candidates: z.array(evidenced(scalarSchema)).min(2) }),
]).superRefine((fact, ctx) => {
  if (fact.extractionMethod === 'derived' && !fact.derivation) {
    ctx.addIssue({ code: 'custom', message: 'Derived facts require versioned derivation and input fact IDs' });
  }
  if (fact.derivation?.inputFactIds.includes(fact.id)) {
    ctx.addIssue({ code: 'custom', message: 'A fact cannot derive from itself' });
  }
});
export type Fact = z.infer<typeof factSchema>;

export function factEvidence(fact: Fact): SourceEvidence[] {
  return [...fact.provenance, ...(fact.state === 'conflict' ? fact.candidates.flatMap(c => c.provenance) : [])];
}
