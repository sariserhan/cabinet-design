import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { RecordData } from '../src/catalog/record-data';
async function checkEvidence(
  ctx: MutationCtx,
  version: Doc<'versions'>,
  payload: RecordData,
) {
  const doc = await ctx.db.get(version.documentId);
  if (!doc) throw new Error('Source missing');
  const coverage = JSON.parse(version.coverageJson) as {
    pages: { pageNumber: number }[];
  };
  for (const e of recordEvidence(payload))
    if (
      e.documentId !== doc._id ||
      e.documentSha256 !== doc.sha256 ||
      !coverage.pages.some((p) => p.pageNumber === e.pageNumber)
    )
      throw new Error('Evidence must match the source and declared scope');
}
import { ownedMutation, ownedVersion, actorKind } from './access';
import {
  recordDataSchema,
  setRecordStatus,
  deterministicRecordBlockers,
  recordKey,
  recordEvidence,
} from '../src/catalog/record-data';
import { saveReviewed, upsertRecord } from './recordHelpers';
export const decide = ownedMutation({
  args: {
    recordId: v.id('records'),
    expectedRevision: v.number(),
    action: v.union(
      v.literal('approve'),
      v.literal('edit'),
      v.literal('reject'),
      v.literal('ambiguous'),
      v.literal('resolve'),
    ),
    payloadJson: v.optional(v.string()),
    reason: v.string(),
    attestWholeRecord: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record || record.ownerId !== ctx.userId)
      throw new Error('Record not found');
    const version = await ownedVersion(ctx, record.versionId, ctx.userId, true);
    if (record.revision !== args.expectedRevision)
      throw new Error('This record changed. Reload before reviewing.');
    if (
      !args.reason.trim() &&
      ['edit', 'ambiguous', 'resolve', 'reject'].includes(args.action)
    )
      throw new Error('A reason is required');
    if (args.payloadJson && args.action !== 'edit')
      throw new Error('Save payload changes as an audited edit first');
    let payload = recordDataSchema.parse(
      JSON.parse(args.payloadJson ?? record.payloadJson),
    );
    if (recordKey(payload) !== record.entityKey || payload.kind !== record.kind)
      throw new Error('Use split/merge to change record identity');
    const structural = deterministicRecordBlockers(payload);
    let blockers = [...record.blockers];
    const kind = await actorKind(ctx, ctx.userId);
    if (args.action === 'edit') {
      payload = setRecordStatus(payload, 'unreviewed');
      blockers = [...new Set([...record.blockers, ...structural])];
    }
    if (args.action === 'resolve') {
      if (!args.attestWholeRecord) throw new Error('Confirm source inspection');
      blockers = structural;
      payload = setRecordStatus(payload, 'unreviewed');
    }
    if (args.action === 'approve') {
      if (!args.attestWholeRecord)
        throw new Error('Confirm that every field and source was checked');
      if (structural.length || blockers.length)
        throw new Error('Resolve all blockers before approval');
      payload = setRecordStatus(payload, 'approved');
    }
    if (args.action === 'reject')
      payload = setRecordStatus(payload, 'rejected');
    if (args.action === 'ambiguous') {
      payload = setRecordStatus(payload, 'unreviewed');
      blockers = [...new Set([...structural, 'unresolved_conflict'])];
    }
    const doc = await ctx.db.get(version.documentId);
    if (!doc) throw new Error('Source document missing');
    const coverage = JSON.parse(version.coverageJson) as {
      pages: { documentId: string; pageNumber: number }[];
    };
    for (const e of recordEvidence(payload))
      if (
        e.documentId !== doc._id ||
        e.documentSha256 !== doc.sha256 ||
        !coverage.pages.some((p) => p.pageNumber === e.pageNumber)
      )
        throw new Error(
          'Evidence must reference this source and declared coverage',
        );
    const truthVerified =
      kind === 'human' &&
      args.attestWholeRecord &&
      (args.action === 'approve' || args.action === 'ambiguous');
    const revision = await saveReviewed(
      ctx,
      version,
      record,
      payload,
      blockers,
      truthVerified,
    );
    await ctx.db.insert('audit', {
      ownerId: ctx.userId,
      versionId: version._id,
      recordId: record._id,
      actorId: ctx.userId,
      actorKind: kind,
      action: args.action,
      beforeJson: record.payloadJson,
      afterJson: JSON.stringify(payload),
      reason: args.reason,
      at: Date.now(),
      candidateRevision: revision,
    });
    return null;
  },
});
export const split = ownedMutation({
  args: {
    recordId: v.id('records'),
    expectedRevision: v.number(),
    payloadsJson: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record || record.ownerId !== ctx.userId)
      throw new Error('Record not found');
    let version = await ownedVersion(ctx, record.versionId, ctx.userId, true);
    if (record.revision !== args.expectedRevision)
      throw new Error('Record changed');
    if (!args.reason.trim()) throw new Error('Reason required');
    const raw: unknown = JSON.parse(args.payloadsJson);
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 10)
      throw new Error('Split into 2–10 records');
    const payloads = raw.map((x) =>
      setRecordStatus(recordDataSchema.parse(x), 'unreviewed'),
    );
    if (
      new Set(payloads.map(recordKey)).size !== payloads.length ||
      payloads.some(
        (p) => recordKey(p) === record.entityKey || p.kind !== record.kind,
      )
    )
      throw new Error('Use unique new identities of the same kind');
    for (const p of payloads) {
      await checkEvidence(ctx, version, p);
      const found = await ctx.db
        .query('records')
        .withIndex('by_versionId_and_entityKey', (q) =>
          q.eq('versionId', version._id).eq('entityKey', recordKey(p)),
        )
        .unique();
      if (found) throw new Error('A split identity already exists');
      const result = await upsertRecord(ctx, version, p, [], false);
      version = { ...version, stats: result.stats };
      await ctx.db.patch(version._id, { stats: result.stats });
      await ctx.db.insert('audit', {
        ownerId: ctx.userId,
        versionId: version._id,
        recordId: result.id,
        actorId: ctx.userId,
        actorKind: await actorKind(ctx, ctx.userId),
        action: 'split_from',
        beforeJson: record.payloadJson,
        afterJson: JSON.stringify(p),
        reason: args.reason,
        at: Date.now(),
        candidateRevision: version.revision + 1,
      });
    }
    const rejected = setRecordStatus(
      recordDataSchema.parse(JSON.parse(record.payloadJson)),
      'rejected',
    );
    const revision = await saveReviewed(
      ctx,
      version,
      record,
      rejected,
      [],
      false,
    );
    await ctx.db.insert('audit', {
      ownerId: ctx.userId,
      versionId: version._id,
      recordId: record._id,
      actorId: ctx.userId,
      actorKind: await actorKind(ctx, ctx.userId),
      action: 'split',
      beforeJson: record.payloadJson,
      afterJson: JSON.stringify(payloads),
      reason: args.reason,
      at: Date.now(),
      candidateRevision: revision,
    });
    return null;
  },
});
export const merge = ownedMutation({
  args: {
    recordIds: v.array(v.id('records')),
    expectedRevisions: v.array(v.number()),
    payloadJson: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      args.recordIds.length < 2 ||
      args.recordIds.length > 10 ||
      new Set(args.recordIds).size !== args.recordIds.length ||
      args.expectedRevisions.length !== args.recordIds.length
    )
      throw new Error('Select 2–10 distinct records');
    if (!args.reason.trim()) throw new Error('Reason required');
    const records = await Promise.all(
      args.recordIds.map((id) => ctx.db.get(id)),
    );
    const first = records[0];
    if (!first || first.ownerId !== ctx.userId)
      throw new Error('Record not found');
    let version = await ownedVersion(ctx, first.versionId, ctx.userId, true);
    const payload = setRecordStatus(
      recordDataSchema.parse(JSON.parse(args.payloadJson)),
      'unreviewed',
    );
    if (payload.kind !== first.kind) throw new Error('Merged kind must match');
    await checkEvidence(ctx, version, payload);
    const prior = await ctx.db
      .query('records')
      .withIndex('by_versionId_and_entityKey', (q) =>
        q.eq('versionId', version._id).eq('entityKey', recordKey(payload)),
      )
      .unique();
    if (prior && !args.recordIds.includes(prior._id))
      throw new Error('Merged identity already exists');
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (
        !r ||
        r.ownerId !== ctx.userId ||
        r.versionId !== version._id ||
        r.kind !== first.kind ||
        r.revision !== args.expectedRevisions[i]
      )
        throw new Error('Selected records changed or do not match');
      const rejected = setRecordStatus(
        recordDataSchema.parse(JSON.parse(r.payloadJson)),
        'rejected',
      );
      await saveReviewed(ctx, version, r, rejected, [], false);
      const current = await ctx.db.get(version._id);
      if (!current) throw new Error('Version missing');
      version = current;
      await ctx.db.insert('audit', {
        ownerId: ctx.userId,
        versionId: version._id,
        recordId: r._id,
        actorId: ctx.userId,
        actorKind: await actorKind(ctx, ctx.userId),
        action: 'merge_into',
        beforeJson: r.payloadJson,
        afterJson: JSON.stringify({ mergedEntityId: recordKey(payload) }),
        reason: args.reason,
        at: Date.now(),
        candidateRevision: version.revision,
      });
    }
    const result = await upsertRecord(ctx, version, payload, [], false);
    await ctx.db.patch(version._id, {
      stats: result.stats,
      revision: version.revision + 1,
    });
    await ctx.db.insert('audit', {
      ownerId: ctx.userId,
      versionId: version._id,
      recordId: result.id,
      actorId: ctx.userId,
      actorKind: await actorKind(ctx, ctx.userId),
      action: 'merge',
      beforeJson: JSON.stringify(records.map((r) => r?.payloadJson)),
      afterJson: JSON.stringify(payload),
      reason: args.reason,
      at: Date.now(),
      candidateRevision: version.revision + 1,
    });
    return null;
  },
});
