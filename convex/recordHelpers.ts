import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  recordDataSchema,
  recordSummary,
  recordKey,
  recordEvidence,
  deterministicRecordBlockers,
} from '../src/catalog/record-data';
import type { RecordData } from '../src/catalog/record-data';
export function countDelta(
  stats: Doc<'versions'>['stats'],
  kind: Doc<'records'>['kind'],
  status: Doc<'records'>['reviewStatus'],
  amount: number,
) {
  const next = { ...stats };
  const kindKey = {
    product: 'products',
    rule: 'rules',
    footnote: 'footnotes',
    case: 'cases',
    registry: 'registries',
  } as const;
  const statusKey = {
    unreviewed: 'unreviewed',
    approved: 'approved',
    rejected: 'rejected',
    auto_approved: 'autoApproved',
  } as const;
  next[kindKey[kind]] = (next[kindKey[kind]] ?? 0) + amount;
  next[statusKey[status]] += amount;
  return next;
}
export async function upsertRecord(
  ctx: MutationCtx,
  version: Doc<'versions'>,
  raw: unknown,
  extraBlockers: string[] = [],
  preserveReviewed = true,
) {
  let payload = recordDataSchema.parse(raw);
  const entityKey = recordKey(payload);
  let summary = recordSummary(payload);
  const existing = await ctx.db
    .query('records')
    .withIndex('by_versionId_and_entityKey', (q) =>
      q.eq('versionId', version._id).eq('entityKey', entityKey),
    )
    .unique();
  if (existing && existing.kind !== payload.kind)
    throw new Error('Record identity is already used by another entity kind');
  const reviewed =
    existing && preserveReviewed
      ? await ctx.db
          .query('audit')
          .withIndex('by_recordId', (q) => q.eq('recordId', existing._id))
          .first()
      : null;
  if (
    existing &&
    preserveReviewed &&
    (existing.reviewStatus !== 'unreviewed' || reviewed)
  )
    return { stats: version.stats, id: existing._id, skipped: true };
  if (existing && preserveReviewed && payload.kind === 'product') {
    const prior = recordDataSchema.parse(JSON.parse(existing.payloadJson));
    if (prior.kind === 'product') {
      payload = structuredClone(payload);
      for (const [name, old] of Object.entries(prior.data.fields)) {
        const incoming = payload.data.fields[name];
        if (!incoming) payload.data.fields[name] = old;
        else if (
          old.state === 'known' &&
          incoming.state === 'known' &&
          old.value !== incoming.value
        ) {
          payload.data.fields[name] = {
            ...incoming,
            state: 'conflict',
            candidates: [
              { value: old.value, provenance: old.provenance },
              { value: incoming.value, provenance: incoming.provenance },
            ],
          };
          delete (payload.data.fields[name] as unknown as { value?: unknown })
            .value;
          extraBlockers.push('unresolved_conflict');
        }
      }
    }
  }
  summary = recordSummary(payload);
  const evidence = recordEvidence(payload);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const row = {
    ownerId: version.ownerId,
    versionId: version._id,
    entityKey,
    kind: payload.kind,
    ...summary,
    payloadJson: JSON.stringify(payload),
    evidenceJson: JSON.stringify([...byId.values()]),
    reviewStatus: payload.data.reviewStatus,
    blockers: [
      ...new Set([...extraBlockers, ...deterministicRecordBlockers(payload)]),
    ],
    revision: (existing?.revision ?? -1) + 1,
    truthVerified: false,
    searchText: [summary.sku, summary.category, summary.family, entityKey].join(
      ' ',
    ),
    updatedAt: Date.now(),
  };
  let stats = version.stats;
  if (existing)
    stats = countDelta(stats, existing.kind, existing.reviewStatus, -1);
  stats = countDelta(stats, payload.kind, payload.data.reviewStatus, 1);
  let id: Id<'records'>;
  if (existing) {
    await ctx.db.patch(existing._id, row);
    id = existing._id;
  } else id = await ctx.db.insert('records', { ...row, createdAt: Date.now() });
  return { stats, id, skipped: false };
}
export async function saveReviewed(
  ctx: MutationCtx,
  version: Doc<'versions'>,
  record: Doc<'records'>,
  payload: RecordData,
  blockers: string[],
  truthVerified: boolean,
) {
  const summary = recordSummary(payload),
    revision = version.revision + 1;
  let stats = countDelta(version.stats, record.kind, record.reviewStatus, -1);
  stats = countDelta(stats, payload.kind, payload.data.reviewStatus, 1);
  await ctx.db.patch(record._id, {
    ...summary,
    payloadJson: JSON.stringify(payload),
    evidenceJson: JSON.stringify(recordEvidence(payload)),
    reviewStatus: payload.data.reviewStatus,
    blockers,
    truthVerified,
    revision: record.revision + 1,
    updatedAt: Date.now(),
    searchText: [
      summary.sku,
      summary.category,
      summary.family,
      record.entityKey,
    ].join(' '),
  });
  await ctx.db.patch(version._id, {
    stats,
    revision,
    gateJson: undefined,
    gateRevision: undefined,
    gateContentHash: undefined,
    benchmarkJson: undefined,
    benchmarkRevision: undefined,
  });
  return revision;
}
