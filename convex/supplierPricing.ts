import { v } from 'convex/values';
import { ownedQuery, ownedMutation } from './access';
import { parsePriceBook } from '../src/designer/supplier-pricing';
export const get = ownedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ priceBookJson: v.string(), revision: v.number() }),
  ),
  handler: async (ctx) => {
    const row = await ctx.db
      .query('supplierPriceBooks')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
      .order('asc')
      .first();
    return row
      ? { priceBookJson: row.priceBookJson, revision: row.revision }
      : null;
  },
});
export const list = ownedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('supplierPriceBooks'),
      priceBookJson: v.string(),
      revision: v.number(),
    }),
  ),
  handler: async (ctx) =>
    (
      await ctx.db
        .query('supplierPriceBooks')
        .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
        .order('asc')
        .take(10)
    ).map(({ _id, priceBookJson, revision }) => ({
      _id,
      priceBookJson,
      revision,
    })),
});
export const save = ownedMutation({
  args: {
    priceBookJson: v.string(),
    expectedRevision: v.optional(v.number()),
    priceBookId: v.optional(v.id('supplierPriceBooks')),
    createNew: v.optional(v.boolean()),
  },
  returns: v.object({
    revision: v.number(),
    priceBookId: v.id('supplierPriceBooks'),
  }),
  handler: async (ctx, args) => {
    if (args.createNew && args.priceBookId)
      throw Error('Choose a new price book or an existing price book');
    if (new TextEncoder().encode(args.priceBookJson).length > 400_000)
      throw Error('Price book exceeds 400 KB');
    const priceBookJson = JSON.stringify(parsePriceBook(args.priceBookJson));
    const row = args.priceBookId
      ? await ctx.db.get(args.priceBookId)
      : args.createNew
        ? null
        : await ctx.db
            .query('supplierPriceBooks')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
            .order('asc')
            .first();
    if (args.priceBookId && (!row || row.ownerId !== ctx.userId))
      throw Error('Price book not found');
    if (row && row.revision !== args.expectedRevision)
      throw Error(
        'Price book changed on another device. Reload before saving.',
      );
    const revision = (row?.revision ?? 0) + 1;
    if (row) {
      await ctx.db.patch(row._id, { priceBookJson, revision });
      return { revision, priceBookId: row._id };
    }
    if (
      (
        await ctx.db
          .query('supplierPriceBooks')
          .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
          .take(10)
      ).length >= 10
    )
      throw Error('Supplier price book limit reached (10)');
    const priceBookId = await ctx.db.insert('supplierPriceBooks', {
      ownerId: ctx.userId,
      priceBookJson,
      revision,
    });
    return { revision, priceBookId };
  },
});
