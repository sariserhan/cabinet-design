import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { ownedDocument, ownedVersion } from './access';
export const register = internalMutation({
  args: {
    ownerId: v.id('users'),
    storageId: v.id('_storage'),
    name: v.string(),
    manufacturer: v.string(),
    series: v.string(),
    documentVersion: v.string(),
    sha256: v.string(),
    byteLength: v.number(),
  },
  returns: v.id('documents'),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('documents')
      .withIndex('by_ownerId_and_sha256', (q) =>
        q.eq('ownerId', args.ownerId).eq('sha256', args.sha256),
      )
      .unique();
    if (existing) {
      await ctx.storage.delete(args.storageId);
      return existing._id;
    }
    return await ctx.db.insert('documents', {
      ...args,
      pageCount: 0,
      status: 'uploaded',
      createdAt: Date.now(),
    });
  },
});
export const locate = internalQuery({
  args: {
    ownerId: v.id('users'),
    documentId: v.optional(v.id('documents')),
    pageId: v.optional(v.id('pages')),
    versionId: v.optional(v.id('versions')),
  },
  returns: v.union(v.null(), v.id('_storage')),
  handler: async (ctx, args) => {
    if (args.documentId)
      return (await ownedDocument(ctx, args.documentId, args.ownerId))
        .storageId;
    if (args.pageId) {
      const page = await ctx.db.get(args.pageId);
      if (!page || page.ownerId !== args.ownerId)
        throw new Error('Page not found');
      return page.imageStorageId ?? null;
    }
    if (args.versionId)
      return (
        (await ownedVersion(ctx, args.versionId, args.ownerId))
          .exportStorageId ?? null
      );
    return null;
  },
});
