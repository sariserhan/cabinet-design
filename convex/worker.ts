import { v } from 'convex/values';
import { mutation, internalQuery, internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { workerAuthorized } from './access';
import {
  recordDataSchema,
  setRecordStatus,
  recordEvidence,
} from '../src/catalog/record-data';
import { upsertRecord } from './recordHelpers';
const leaseArgs = {
  secret: v.string(),
  jobId: v.id('jobs'),
  leaseToken: v.string(),
};
async function leased(
  ctx: MutationCtx | QueryCtx,
  args: { secret: string; jobId: Id<'jobs'>; leaseToken: string },
) {
  workerAuthorized(args.secret);
  const job = await ctx.db.get(args.jobId);
  if (
    !job ||
    job.status !== 'running' ||
    job.leaseToken !== args.leaseToken ||
    (job.leaseUntil ?? 0) < Date.now()
  )
    throw new Error('Worker lease expired');
  const version = await ctx.db.get(job.versionId);
  if (!version || ['published', 'superseded'].includes(version.status))
    throw new Error('Version is immutable');
  return { job, version };
}
export const claim = mutation({
  args: { secret: v.string(), leaseToken: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    workerAuthorized(args.secret);
    if (args.leaseToken.length < 20) throw new Error('Invalid lease token');
    let job = await ctx.db
      .query('jobs')
      .withIndex('by_status', (q) => q.eq('status', 'queued'))
      .first();
    if (!job) {
      const running = await ctx.db
        .query('jobs')
        .withIndex('by_status', (q) => q.eq('status', 'running'))
        .take(50);
      job = running.find((j) => (j.leaseUntil ?? 0) < Date.now()) ?? null;
    }
    if (!job) return null;
    const document = await ctx.db.get(job.documentId);
    if (!document) throw new Error('Source missing');
    await ctx.db.patch(job._id, {
      status: 'running',
      leaseToken: args.leaseToken,
      leaseUntil: Date.now() + 180000,
      startedAt: job.startedAt ?? Date.now(),
    });
    return JSON.stringify({
      ...job,
      status: 'running',
      document,
      leaseToken: args.leaseToken,
    });
  },
});
export const heartbeat = mutation({
  args: leaseArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await leased(ctx, args);
    await ctx.db.patch(args.jobId, { leaseUntil: Date.now() + 180000 });
    return null;
  },
});
export const source = internalQuery({
  args: leaseArgs,
  returns: v.id('_storage'),
  handler: async (ctx, args) => {
    const { job } = await leased(ctx, args);
    const doc = await ctx.db.get(job.documentId);
    if (!doc) throw new Error('Source missing');
    return doc.storageId;
  },
});
export const image = internalMutation({
  args: { ...leaseArgs, pageNumber: v.number(), storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { job } = await leased(ctx, args);
    if (!job.selectedPages.includes(args.pageNumber))
      throw new Error('Page outside job');
    const existing = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', job.versionId).eq('pageNumber', args.pageNumber),
      )
      .unique();
    if (existing) {
      /* Earlier versions may reference the previous immutable image. */ await ctx.db.patch(
        existing._id,
        { imageStorageId: args.storageId },
      );
    } else
      await ctx.db.insert('pages', {
        ownerId: job.ownerId,
        versionId: job.versionId,
        documentId: job.documentId,
        pageNumber: args.pageNumber,
        printedLabel: String(args.pageNumber),
        text: '',
        layoutJson: '{}',
        classification: 'other',
        classificationConfidence: 0,
        imageStorageId: args.storageId,
        status: 'pending',
      });
    return null;
  },
});
export const page = mutation({
  args: {
    ...leaseArgs,
    pageNumber: v.number(),
    printedLabel: v.string(),
    text: v.string(),
    layoutJson: v.string(),
    classification: v.string(),
    classificationConfidence: v.number(),
    pageCount: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { job, version } = await leased(ctx, args);
    if (
      !job.selectedPages.includes(args.pageNumber) ||
      args.pageCount < args.pageNumber ||
      args.pageCount > 2000
    )
      throw new Error('Invalid page');
    if (args.text.length > 500000 || args.layoutJson.length > 500000)
      throw new Error('Page payload too large');
    JSON.parse(args.layoutJson);
    const data = {
      ownerId: job.ownerId,
      versionId: job.versionId,
      documentId: job.documentId,
      pageNumber: args.pageNumber,
      printedLabel: args.printedLabel,
      text: args.text,
      layoutJson: args.layoutJson,
      classification: args.classification,
      classificationConfidence: args.classificationConfidence,
      status: args.error ? ('failed' as const) : ('processed' as const),
      ...(args.error ? { error: args.error } : {}),
    };
    const existing = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', job.versionId).eq('pageNumber', args.pageNumber),
      )
      .unique();
    if (existing)
      await ctx.db.patch(existing._id, {
        ...data,
        ...(!args.error ? { error: undefined } : {}),
      });
    else await ctx.db.insert('pages', data);
    await ctx.db.patch(job.documentId, { pageCount: args.pageCount });
    await ctx.db.patch(version._id, {
      revision: version.revision + 1,
      gateJson: undefined,
      gateRevision: undefined,
      gateContentHash: undefined,
      benchmarkJson: undefined,
      benchmarkRevision: undefined,
    });
    return null;
  },
});
export const records = mutation({
  args: {
    ...leaseArgs,
    recordsJson: v.string(),
    blockersJson: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const lease = await leased(ctx, args);
    let version = lease.version;
    const source = await ctx.db.get(lease.job.documentId);
    if (!source) throw new Error('Source document missing');
    const coverage = JSON.parse(version.coverageJson) as {
      pages: { pageNumber: number }[];
    };
    const raw: unknown = JSON.parse(args.recordsJson);
    if (!Array.isArray(raw) || raw.length > 30)
      throw new Error('Use batches of at most 30 records');
    let count = 0;
    const extra = JSON.parse(args.blockersJson ?? '{}') as Record<
      string,
      string[]
    >;
    for (const item of raw) {
      const payload = setRecordStatus(
        recordDataSchema.parse(item),
        'unreviewed',
      );
      for (const evidence of recordEvidence(payload))
        if (
          evidence.documentId !== source._id ||
          evidence.documentSha256 !== source.sha256 ||
          !coverage.pages.some((p) => p.pageNumber === evidence.pageNumber)
        )
          throw new Error(
            'Worker evidence is outside the authenticated source scope',
          );
      const result = await upsertRecord(
        ctx,
        version,
        payload,
        extra[payload.data.id] ?? [],
        true,
      );
      version = { ...version, stats: result.stats };
      if (!result.skipped) count++;
    }
    await ctx.db.patch(version._id, {
      stats: version.stats,
      revision: version.revision + 1,
      gateJson: undefined,
      gateRevision: undefined,
      gateContentHash: undefined,
      benchmarkJson: undefined,
      benchmarkRevision: undefined,
    });
    return count;
  },
});
export const finishPage = mutation({
  args: {
    ...leaseArgs,
    pageNumber: v.number(),
    failed: v.boolean(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    visionCalls: v.number(),
    estimatedCost: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { job } = await leased(ctx, args);
    if (!job.selectedPages.includes(args.pageNumber))
      throw new Error('Page outside job');
    if (
      job.processedPages.includes(args.pageNumber) ||
      job.failedPages.includes(args.pageNumber)
    )
      return null;
    await ctx.db.patch(job._id, {
      processedPages: args.failed
        ? job.processedPages
        : [...job.processedPages, args.pageNumber],
      failedPages: args.failed
        ? [...job.failedPages, args.pageNumber]
        : job.failedPages,
      inputTokens: job.inputTokens + Math.max(0, args.inputTokens),
      outputTokens: job.outputTokens + Math.max(0, args.outputTokens),
      visionCalls: job.visionCalls + Math.max(0, args.visionCalls),
      ...(args.estimatedCost !== undefined
        ? {
            estimatedCost:
              (job.estimatedCost ?? 0) + Math.max(0, args.estimatedCost),
          }
        : {}),
      leaseUntil: Date.now() + 180000,
    });
    return null;
  },
});
export const finish = mutation({
  args: { ...leaseArgs, error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { job, version } = await leased(ctx, args);
    if (
      !args.error &&
      job.processedPages.length + job.failedPages.length !==
        job.selectedPages.length
    )
      throw new Error('Pages remain unprocessed');
    await ctx.db.patch(job._id, {
      status: args.error ? 'failed' : 'completed',
      ...(args.error ? { error: args.error } : {}),
      finishedAt: Date.now(),
      leaseUntil: 0,
    });
    await ctx.db.patch(version._id, {
      status: 'review',
      revision: version.revision + 1,
    });
    await ctx.db.patch(job.documentId, {
      status: args.error ? 'failed' : 'processed',
    });
    return null;
  },
});
