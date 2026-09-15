import { v } from 'convex/values';
import { ownedMutation, ownedVersion } from './access';
import { saveReviewed, upsertRecord } from './recordHelpers';
import {
  recordDataSchema,
  recordEvidence,
  recordKey,
  setRecordStatus,
  deterministicRecordBlockers,
} from '../src/catalog/record-data';

/** Authenticated AI-assisted edits never become human benchmark truth. */
export const apply = ownedMutation({
  args: {
    changes: v.array(
      v.object({
        recordId: v.id('records'),
        expectedRevision: v.number(),
        payloadJson: v.string(),
      }),
    ),
    reason: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (
      !args.reason.trim() ||
      args.changes.length < 1 ||
      args.changes.length > 20
    )
      throw new Error('Provide a reason and 1–20 changes');
    if (
      new Set(args.changes.map((c) => c.recordId)).size !== args.changes.length
    )
      throw new Error('Duplicate record');
    for (const change of args.changes) {
      const row = await ctx.db.get(change.recordId);
      if (!row || row.ownerId !== ctx.userId)
        throw new Error('Record not found');
      const version = await ownedVersion(ctx, row.versionId, ctx.userId, true);
      if (row.revision !== change.expectedRevision)
        throw new Error('Record changed');
      if (row.truthVerified)
        throw new Error(
          'Preserve human-verified records; use individual review for corrections',
        );
      const payload = setRecordStatus(
        recordDataSchema.parse(JSON.parse(change.payloadJson)),
        'unreviewed',
      );
      if (payload.kind !== row.kind || recordKey(payload) !== row.entityKey)
        throw new Error('Record identity must match');
      const source = await ctx.db.get(version.documentId);
      const coverage = JSON.parse(version.coverageJson) as {
        pages: { pageNumber: number }[];
      };
      if (
        !source ||
        recordEvidence(payload).some(
          (e) =>
            e.documentId !== source._id ||
            e.documentSha256 !== source.sha256 ||
            !coverage.pages.some((p) => p.pageNumber === e.pageNumber),
        )
      )
        throw new Error('Evidence must match source and coverage');
      const blockers = [
        ...new Set([
          ...row.blockers.filter(
            (b) =>
              ![
                'missing_required_field',
                'missing_provenance',
                'diagram_dependency_not_verified',
              ].includes(b),
          ),
          ...deterministicRecordBlockers(payload),
        ]),
      ];
      const revision = await saveReviewed(
        ctx,
        version,
        row,
        payload,
        blockers,
        false,
      );
      await ctx.db.insert('audit', {
        ownerId: ctx.userId,
        versionId: version._id,
        recordId: row._id,
        actorId: ctx.userId,
        actorKind: 'automation',
        action: 'ai_source_review',
        beforeJson: row.payloadJson,
        afterJson: JSON.stringify(payload),
        reason: args.reason,
        at: Date.now(),
        candidateRevision: revision,
      });
    }
    return args.changes.length;
  },
});

/** Add source-backed registry entries without overwriting reviewed records. */
export const addRegistries = ownedMutation({
  args: {
    versionId: v.id('versions'),
    expectedRevision: v.number(),
    recordsJson: v.string(),
    reason: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let version = await ownedVersion(ctx, args.versionId, ctx.userId, true);
    if (version.revision !== args.expectedRevision)
      throw new Error('Version changed');
    if (!args.reason.trim()) throw new Error('Reason required');
    const raw: unknown = JSON.parse(args.recordsJson);
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40)
      throw new Error('Provide 1–40 entries');
    const records = raw.map((r) =>
      setRecordStatus(recordDataSchema.parse(r), 'unreviewed'),
    );
    if (
      records.some((r) => r.kind !== 'registry') ||
      new Set(records.map(recordKey)).size !== records.length
    )
      throw new Error('Unique registry entries required');
    const source = await ctx.db.get(version.documentId);
    if (!source) throw new Error('Source missing');
    const coverage = JSON.parse(version.coverageJson) as {
      pages: { pageNumber: number }[];
    };
    for (const record of records) {
      if (
        deterministicRecordBlockers(record).length ||
        recordEvidence(record).some(
          (e) =>
            e.documentId !== source._id ||
            e.documentSha256 !== source.sha256 ||
            !coverage.pages.some((p) => p.pageNumber === e.pageNumber),
        )
      )
        throw new Error('Valid source-backed entries required');
      const existing = await ctx.db
        .query('records')
        .withIndex('by_versionId_and_entityKey', (q) =>
          q.eq('versionId', version._id).eq('entityKey', recordKey(record)),
        )
        .unique();
      if (existing) throw new Error('Registry identity already exists');
      if (record.kind === 'registry')
        for (const target of record.data.productIds) {
          const product = await ctx.db
            .query('records')
            .withIndex('by_versionId_and_entityKey', (q) =>
              q.eq('versionId', version._id).eq('entityKey', target.value),
            )
            .unique();
          if (product?.kind !== 'product')
            throw new Error('Product link missing');
        }
    }
    const revision = version.revision + 1;
    for (const record of records) {
      const result = await upsertRecord(ctx, version, record, [], false);
      version = { ...version, stats: result.stats };
      await ctx.db.insert('audit', {
        ownerId: ctx.userId,
        versionId: version._id,
        recordId: result.id,
        actorId: ctx.userId,
        actorKind: 'automation',
        action: 'ai_registry_import',
        beforeJson: 'null',
        afterJson: JSON.stringify(record),
        reason: args.reason,
        at: Date.now(),
        candidateRevision: revision,
      });
    }
    await ctx.db.patch(version._id, {
      stats: version.stats,
      revision,
      gateJson: undefined,
      gateRevision: undefined,
      gateContentHash: undefined,
      benchmarkJson: undefined,
      benchmarkRevision: undefined,
    });
    return records.length;
  },
});
