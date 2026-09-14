import { z } from 'zod';
import { registryEntrySchema } from './registry';
import { productSchema } from './publication';
import { ruleSchema, ruleEvidence } from './rule-schema';
import {
  sourceEvidenceSchema,
  factEvidence,
  reviewStatusSchema,
} from './evidence';
import type { Fact } from './evidence';
import { factBlockers } from './approval';

const jsonText = z.string().refine((value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}, 'Valid JSON text required');
export const recordDataSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('registry'), data: registryEntrySchema }),
  z.strictObject({ kind: z.literal('product'), data: productSchema }),
  z.strictObject({ kind: z.literal('rule'), data: ruleSchema }),
  z.strictObject({
    kind: z.literal('footnote'),
    data: z.strictObject({
      id: z.string().min(1),
      sku: z.string().min(1),
      field: z.string().min(1),
      symbol: z.string().min(1),
      valueJson: jsonText,
      provenance: z.array(sourceEvidenceSchema).min(1),
      markerEvidence: z.array(sourceEvidenceSchema).min(1),
      reviewStatus: reviewStatusSchema,
    }),
  }),
  z.strictObject({
    kind: z.literal('case'),
    data: z.strictObject({
      id: z.string().min(1),
      description: z.string().min(1),
      sourceKind: z.enum([
        'source_ambiguity',
        'source_navigation_conflict',
        'source_rule',
        'synthetic_candidate_corruption',
        'synthetic_evidence_removal',
      ]),
      expectationJson: jsonText,
      provenance: z.array(sourceEvidenceSchema).min(1),
      reviewStatus: reviewStatusSchema,
    }),
  }),
]);
export type RecordData = z.infer<typeof recordDataSchema>;
export function recordEvidence(record: RecordData) {
  if (record.kind === 'registry')
    return [
      ...factEvidence(record.data.name),
      ...Object.values(record.data.attributes).flatMap(factEvidence),
      ...record.data.productIds.flatMap((p) => p.provenance),
    ];
  if (record.kind === 'product')
    return Object.values(record.data.fields).flatMap(factEvidence);
  if (record.kind === 'rule') return ruleEvidence(record.data);
  if (record.kind === 'footnote')
    return [...record.data.provenance, ...record.data.markerEvidence];
  return record.data.provenance;
}
export function recordKey(record: RecordData) {
  return record.data.id;
}
export function setRecordStatus(
  record: RecordData,
  status: z.infer<typeof reviewStatusSchema>,
): RecordData {
  const result = structuredClone(record);
  result.data.reviewStatus = status;
  if (result.kind === 'product')
    for (const fact of Object.values(result.data.fields))
      fact.reviewStatus = status;
  if (result.kind === 'registry') {
    result.data.name.reviewStatus = status;
    for (const fact of Object.values(result.data.attributes))
      fact.reviewStatus = status;
  }
  return result;
}
export function requiredFieldIssues(
  record: RecordData,
): { field: string; code: string }[] {
  if (record.kind !== 'product') return [];
  const fields = record.data.fields;
  const category =
    fields.normalizedCategory?.state === 'known'
      ? fields.normalizedCategory.value
      : '';
  const required = ['sku', 'normalizedCategory'];
  if (
    [
      'wall_cabinet',
      'base_cabinet',
      'tall_cabinet',
      'vanity',
      'corner_cabinet',
      'oven_cabinet',
      'refrigerator_cabinet',
      'pantry',
    ].includes(String(category))
  )
    required.push('widthIn', 'heightIn', 'depthIn');
  if (category === 'panel' || category === 'filler')
    required.push('widthIn', 'heightIn', 'thicknessIn');
  if (category === 'molding')
    required.push('lengthIn', 'profileWidthIn', 'profileHeightIn');
  return required.flatMap((field) =>
    factBlockers(fields[field], {
      required: true,
      valueType: ['sku', 'normalizedCategory'].includes(field)
        ? 'string'
        : 'number',
      positiveDimension: !['sku', 'normalizedCategory'].includes(field),
    }).map((code) => ({ field, code })),
  );
}

export function deterministicRecordBlockers(record: RecordData): string[] {
  const blockers = new Set<string>();
  if (record.kind === 'registry')
    for (const f of [
      record.data.name,
      ...Object.values(record.data.attributes),
    ])
      for (const b of factBlockers(f, {
        required: true,
        valueType: f.state === 'known' ? typeof f.value : 'string',
        positiveDimension: false,
      }))
        blockers.add(b);
  if (record.kind === 'product') {
    const fields = record.data.fields;
    for (const issue of requiredFieldIssues(record)) blockers.add(issue.code);
    for (const fact of Object.values(fields)) {
      if (!fact.provenance.length) blockers.add('missing_provenance');
      if (fact.extractionMethod === 'vision' && !fact.provenance.length)
        blockers.add('diagram_dependency_not_verified');
      if (fact.state === 'conflict') blockers.add('unresolved_conflict');
      if (fact.state === 'unknown') blockers.add('missing_required_field');
    }
  }
  if (
    record.kind === 'rule' &&
    record.data.modelingStatus === 'unmodeled' &&
    record.data.severity !== 'noncritical'
  )
    blockers.add('unmodeled_rule');
  if (!recordEvidence(record).length) blockers.add('missing_provenance');
  return [...blockers].sort();
}
export function recordSummary(record: RecordData) {
  const value = (f: Fact | undefined) =>
    f?.state === 'known' ? f.value : undefined;
  const fields = record.kind === 'product' ? record.data.fields : {};
  const sku =
    record.kind === 'product'
      ? String(value(fields.sku) ?? record.data.id)
      : record.kind === 'footnote'
        ? record.data.sku
        : record.data.id;
  const confidence =
    record.kind === 'product'
      ? Math.min(...Object.values(fields).map((f) => f.confidence), 1)
      : record.kind === 'rule'
        ? record.data.confidence
        : 0;
  return {
    sku,
    category: String(value(fields.normalizedCategory) ?? ''),
    family: String(value(fields.manufacturerCategory) ?? ''),
    width:
      typeof value(fields.widthIn) === 'number'
        ? (value(fields.widthIn) as number)
        : undefined,
    height:
      typeof value(fields.heightIn) === 'number'
        ? (value(fields.heightIn) as number)
        : undefined,
    depth:
      typeof value(fields.depthIn) === 'number'
        ? (value(fields.depthIn) as number)
        : undefined,
    confidence,
    pageNumber: recordEvidence(record)[0]?.pageNumber ?? 1,
  };
}
