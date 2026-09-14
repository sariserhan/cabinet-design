import { draftCaseDefinition } from './draft-case-definitions';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { contentHash } from '../catalog/canonical.js';
import { recordDataSchema } from '../catalog/record-data.js';
import type { RecordData } from '../catalog/record-data.js';
import type { SourceEvidence, Fact } from '../catalog/evidence.js';
import { ruleSchema } from '../catalog/rule-schema.js';

const sourceSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  printedPageLabel: z.string(),
  sourceText: z.string(),
  boundingBoxes: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
});
const draftFact = z.object({
  value: z.json(),
  evidenceIds: z.array(z.string()),
  derivationNote: z.string().optional(),
});
const productDraft = z.object({
  id: z.string(),
  sku: z.string(),
  pageNumber: z.number(),
  fields: z.record(z.string(), draftFact),
  expectedBlockers: z.array(z.string()).optional(),
});
const footDraft = z.object({
  id: z.string(),
  sku: z.string(),
  field: z.string(),
  symbol: z.string(),
  expected: draftFact,
  markerEvidenceIds: z.array(z.string()),
});
const ruleDraft = z.object({
  id: z.string(),
  scope: z.object({
    skus: z.array(z.string()).optional(),
    modification: z.string().optional(),
    series: z.string().optional(),
  }),
  sourceText: z.string(),
  evidenceIds: z.array(z.string()),
  constraint: z.record(z.string(), z.json()),
  when: z.json().optional(),
});
const caseDraft = z
  .object({
    id: z.string(),
    kind: z.enum([
      'source_ambiguity',
      'source_navigation_conflict',
      'source_rule',
      'synthetic_candidate_corruption',
      'synthetic_evidence_removal',
    ]),
    pageNumber: z.number(),
    expected: z.string().optional(),
  })
  .passthrough();
async function load(root: string, file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}
export async function importBenchmarkDraft(
  root: string,
  documentId: string,
  sha256: string,
  versionId: string,
): Promise<RecordData[]> {
  const rawEvidence = z
    .record(z.string(), sourceSchema)
    .parse(await load(root, 'draft-evidence.json'));
  const evidence = new Map<string, SourceEvidence>();
  for (const [id, e] of Object.entries(rawEvidence)) {
    const b = e.boundingBoxes.length === 1 ? e.boundingBoxes[0] : undefined;
    evidence.set(id, {
      id,
      documentId,
      documentSha256: sha256,
      pageNumber: e.pageNumber,
      printedPageLabel: e.printedPageLabel,
      sourceText: e.sourceText,
      location: b
        ? { kind: 'region', regionId: id, boundingBox: b }
        : {
            kind: 'full_page',
            reason:
              'Draft has repeated or multiline matches; reviewer must verify exact scope',
          },
    });
  }
  const refs = (ids: string[]) =>
    ids.map((id) => {
      const e = evidence.get(id);
      if (!e) throw new Error('Missing draft evidence ' + id);
      return e;
    });
  const fact = (
    id: string,
    f: z.infer<typeof draftFact>,
    method: 'text' | 'derived' = 'text',
    inputId?: string,
  ): Fact => {
    if (
      typeof f.value !== 'string' &&
      typeof f.value !== 'number' &&
      typeof f.value !== 'boolean'
    )
      throw new Error('Expected scalar product field');
    return {
      id,
      state: 'known',
      value: f.value,
      confidence: 0,
      provenance: refs(f.evidenceIds),
      extractionMethod: method,
      reviewStatus: 'unreviewed',
      ...(method === 'derived' && inputId
        ? {
            derivation: {
              ruleId: 'benchmark-draft-sku-or-heading',
              ruleVersion: '1',
              inputFactIds: [inputId],
            },
          }
        : {}),
    };
  };
  const result: RecordData[] = [];
  for (const p of z
    .array(productDraft)
    .parse(await load(root, 'draft-products.json'))) {
    const fields: Record<string, Fact> = {};
    for (const [key, f] of Object.entries(p.fields))
      fields[key] = fact(
        `${p.id}:${key}`,
        f,
        key !== 'sku' && f.derivationNote ? 'derived' : 'text',
        `${p.id}:sku`,
      );
    result.push(
      recordDataSchema.parse({
        kind: 'product',
        data: { id: p.id, reviewStatus: 'unreviewed', fields },
      }),
    );
  }
  for (const f of z
    .array(footDraft)
    .parse(await load(root, 'draft-footnotes.json')))
    result.push({
      kind: 'footnote',
      data: {
        id: f.id,
        sku: f.sku,
        field: f.field,
        symbol: f.symbol,
        valueJson: JSON.stringify(f.expected.value),
        provenance: refs(f.expected.evidenceIds),
        markerEvidence: refs(f.markerEvidenceIds),
        reviewStatus: 'unreviewed',
      },
    });
  for (const r of z
    .array(ruleDraft)
    .parse(await load(root, 'draft-rules.json'))) {
    const provenance = refs(r.evidenceIds),
      operand = (value: unknown) => ({ value, provenance });
    const scope = r.scope.skus
      ? {
          kind: 'products',
          targets: r.scope.skus.map((s) => operand('product:' + s)),
        }
      : r.scope.modification
        ? { kind: 'modifications', targets: [operand(r.scope.modification)] }
        : { kind: 'series', targets: [operand('Allure')] };
    const c = r.constraint;
    let constraint: unknown;
    if (c.type === 'allowed_values' || c.type === 'forbidden_values')
      constraint = {
        type: c.type,
        field: c.field,
        values: (c.values as unknown[]).map(operand),
        ...(c.type === 'allowed_values' ? { outsideSet: 'invalid' } : {}),
      };
    else if (c.type === 'dimension_range')
      constraint = {
        type: c.type,
        field: c.field,
        unit: 'in',
        ...(c.minimum !== null ? { minimum: operand(c.minimum) } : {}),
        ...(c.maximum !== null ? { maximum: operand(c.maximum) } : {}),
        minimumInclusive: true,
        maximumInclusive: true,
      };
    else if (c.type === 'requires' || c.type === 'conditional_requirement') {
      const target = c.target as { kind: string; value: string };
      constraint = {
        type: c.type,
        target: {
          kind:
            target.kind === 'accessoryRole'
              ? 'accessory_role'
              : target.kind === 'documentRole'
                ? 'document_role'
                : target.kind,
          id: operand(target.value),
        },
      };
    } else throw new Error('Unsupported draft rule: ' + String(c.type));
    const when = r.when
      ? {
          kind: 'all',
          conditions: (
            r.when as { all: { field: string; op: string; value: boolean }[] }
          ).all.map((p) => ({
            kind: 'boolean',
            field: p.field,
            op: p.op,
            value: operand(p.value),
          })),
        }
      : undefined;
    result.push({
      kind: 'rule',
      data: ruleSchema.parse({
        id: r.id,
        catalogVersionId: versionId,
        scope,
        sourceText: r.sourceText,
        provenance,
        confidence: 0,
        reviewStatus: 'unreviewed',
        modelingStatus: 'modeled',
        constraint,
        ...(when ? { when } : {}),
      }),
    });
  }
  for (const c of z
    .array(caseDraft)
    .parse(await load(root, 'draft-cases.json'))) {
    const e = [...evidence.values()].find(
      (e) => e.pageNumber === c.pageNumber,
    ) ?? {
      id: 'case-page-' + c.pageNumber,
      documentId,
      documentSha256: sha256,
      pageNumber: c.pageNumber,
      sourceText: await readFile(
        path.join(
          root,
          'pages',
          String(c.pageNumber).padStart(3, '0') + '.txt',
        ),
        'utf8',
      ),
      location: {
        kind: 'full_page' as const,
        reason: 'Source navigation case requires inspecting the full page',
      },
    };
    result.push({
      kind: 'case',
      data: {
        id: 'case:' + c.id,
        sourceKind: c.kind,
        description: c.expected ?? c.id,
        expectationJson: JSON.stringify({
          originalDraft: c,
          ...(draftCaseDefinition(c.id, result) as object),
        }),
        provenance: [
          {
            ...e,
            id: 'case-evidence-' + contentHash(c.id),
            location: {
              kind: 'full_page',
              reason: 'Inspect the whole source page for this case',
            },
          },
        ],
        reviewStatus: 'unreviewed',
      },
    });
  }
  return result.map((r) => recordDataSchema.parse(r));
}
