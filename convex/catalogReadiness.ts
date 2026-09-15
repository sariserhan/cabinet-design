import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { ownedQuery, ownedMutation, ownedVersion } from './access';
import { reviewState } from './schema';
const item = v.object({
  _id: v.id('records'),
  sku: v.string(),
  pageNumber: v.number(),
  reviewStatus: reviewState,
  blockers: v.array(v.string()),
  revision: v.number(),
  payloadJson: v.string(),
  evidenceJson: v.string(),
});
export const list = ownedQuery({
  args: {
    versionId: v.id('versions'),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(item),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await ownedVersion(ctx, args.versionId, ctx.userId);
    const rows = await ctx.db
      .query('records')
      .withIndex('by_versionId_and_kind', (q) =>
        q.eq('versionId', args.versionId).eq('kind', 'product'),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, Math.max(1, args.paginationOpts.numItems)),
      });
    // Paginate indexed products first; unresolved status is a compound application predicate.
    return {
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
      page: rows.page
        .filter(
          (r) =>
            r.blockers.length > 0 ||
            r.reviewStatus !== 'approved' ||
            !r.truthVerified,
        )
        .map(
          ({
            _id,
            sku,
            pageNumber,
            reviewStatus,
            blockers,
            revision,
            payloadJson,
            evidenceJson,
          }) => ({
            _id,
            sku,
            pageNumber,
            reviewStatus,
            blockers,
            revision,
            payloadJson,
            evidenceJson,
          }),
        ),
    };
  },
});
export const submitClarification = ownedMutation({
  args: {
    recordId: v.id('records'),
    expectedRevision: v.number(),
    evidenceReference: v.string(),
    evidenceText: v.string(),
  },
  returns: v.id('catalogClarifications'),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recordId);
    if (!row || row.ownerId !== ctx.userId) throw Error('Record not found');
    await ownedVersion(ctx, row.versionId, ctx.userId);
    if (row.revision !== args.expectedRevision)
      throw Error('Record changed. Reload before submitting evidence.');
    const evidenceReference = args.evidenceReference.trim(),
      evidenceText = args.evidenceText.trim();
    if (
      !evidenceReference ||
      evidenceReference.length > 1000 ||
      !evidenceText ||
      evidenceText.length > 10000
    )
      throw Error(
        'Provide a source reference (max 1000 characters) and evidence (max 10000 characters)',
      );
    const previous = await ctx.db
      .query('catalogClarifications')
      .withIndex('by_recordId', (q) => q.eq('recordId', row._id))
      .order('desc')
      .take(100);
    if (previous.length >= 100) throw Error('Clarification limit reached');
    if (previous[0] && Date.now() - previous[0].createdAt < 3000)
      throw Error('Please wait a few seconds before submitting again');
    return await ctx.db.insert('catalogClarifications', {
      ownerId: ctx.userId,
      recordId: row._id,
      versionId: row.versionId,
      recordRevision: row.revision,
      evidenceReference,
      evidenceText,
      status: 'pending',
      createdAt: Date.now(),
    });
  },
});
export const clarifications = ownedQuery({
  args: { recordId: v.id('records') },
  returns: v.array(
    v.object({
      _id: v.id('catalogClarifications'),
      recordRevision: v.number(),
      evidenceReference: v.string(),
      evidenceText: v.string(),
      status: v.literal('pending'),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recordId);
    if (!row || row.ownerId !== ctx.userId) throw Error('Record not found');
    return (
      await ctx.db
        .query('catalogClarifications')
        .withIndex('by_recordId', (q) => q.eq('recordId', row._id))
        .order('desc')
        .take(100)
    ).map(
      ({
        _id,
        recordRevision,
        evidenceReference,
        evidenceText,
        status,
        createdAt,
      }) => ({
        _id,
        recordRevision,
        evidenceReference,
        evidenceText,
        status,
        createdAt,
      }),
    );
  },
});
