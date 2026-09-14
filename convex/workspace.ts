import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import {
  ownedQuery,
  ownedMutation,
  ownedVersion,
  ownedDocument,
} from './access';
import { recordKind, reviewState } from './schema';
export const viewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ id: v.id('users'), name: v.string(), email: v.string() }),
  ),
  handler: async (ctx) => {
    const id = await getAuthUserId(ctx);
    if (!id) return null;
    const user = await ctx.db.get(id);
    return user
      ? {
          id,
          name: user.name ?? user.email ?? 'Reviewer',
          email: user.email ?? '',
        }
      : null;
  },
});
export const overview = ownedQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const [documents, versions, jobs] = await Promise.all([
      ctx.db
        .query('documents')
        .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
        .order('desc')
        .take(100),
      ctx.db
        .query('versions')
        .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
        .order('desc')
        .take(100),
      ctx.db
        .query('jobs')
        .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
        .order('desc')
        .take(20),
    ]);
    return JSON.stringify({ documents, versions, jobs });
  },
});
export const version = ownedQuery({
  args: { versionId: v.id('versions') },
  returns: v.string(),
  handler: async (ctx, args) =>
    JSON.stringify(await ownedVersion(ctx, args.versionId, ctx.userId)),
});
export const listRecords = ownedQuery({
  args: {
    versionId: v.id('versions'),
    kind: recordKind,
    status: v.optional(reviewState),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ownedVersion(ctx, args.versionId, ctx.userId);
    if (args.paginationOpts.numItems > 100)
      throw new Error('Page size exceeds 100');
    const search = args.search?.trim();
    const result = search
      ? await ctx.db
          .query('records')
          .withSearchIndex('search_records', (q) => {
            let query = q
              .search('searchText', search)
              .eq('ownerId', ctx.userId)
              .eq('versionId', args.versionId)
              .eq('kind', args.kind);
            if (args.status) query = query.eq('reviewStatus', args.status);
            return query;
          })
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('records')
          .withIndex('by_versionId_and_kind', (q) =>
            q.eq('versionId', args.versionId).eq('kind', args.kind),
          )
          .paginate(args.paginationOpts);
    return JSON.stringify({
      ...result,
      page: result.page
        .filter((r) => !args.status || r.reviewStatus === args.status)
        .map(({ payloadJson: _p, evidenceJson: _e, ...row }) => {
          void _p;
          void _e;
          return row;
        }),
    });
  },
});
export const record = ownedQuery({
  args: { recordId: v.id('records') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record || record.ownerId !== ctx.userId)
      throw new Error('Record not found');
    const audit = await ctx.db
      .query('audit')
      .withIndex('by_recordId', (q) => q.eq('recordId', record._id))
      .order('desc')
      .take(30);
    return JSON.stringify({ record, audit });
  },
});
export const page = ownedQuery({
  args: { versionId: v.id('versions'), pageNumber: v.number() },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ownedVersion(ctx, args.versionId, ctx.userId);
    const page = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', args.versionId).eq('pageNumber', args.pageNumber),
      )
      .unique();
    return JSON.stringify(page);
  },
});
export const pages = ownedQuery({
  args: {
    versionId: v.id('versions'),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ownedVersion(ctx, args.versionId, ctx.userId);
    if (args.paginationOpts.numItems > 100)
      throw new Error('Page size exceeds 100');
    const result = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', args.versionId),
      )
      .paginate(args.paginationOpts);
    return JSON.stringify({
      ...result,
      page: result.page.map(({ text: _t, layoutJson: _l, ...p }) => {
        void _t;
        void _l;
        return p;
      }),
    });
  },
});
export const enqueue = ownedMutation({
  args: {
    documentId: v.id('documents'),
    mode: v.union(v.literal('benchmark_draft'), v.literal('compile')),
    pages: v.array(v.number()),
    provider: v.string(),
    model: v.string(),
  },
  returns: v.id('versions'),
  handler: async (ctx, args) => {
    const document = await ownedDocument(ctx, args.documentId, ctx.userId);
    const selected = [...new Set(args.pages)].sort((a, b) => a - b);
    if (
      !selected.length ||
      selected.some((n) => !Number.isInteger(n) || n < 1) ||
      selected.length > 40
    )
      throw new Error('Select 1–40 pages for the representative subset');
    if (
      args.mode === 'benchmark_draft' &&
      document.sha256 !==
        '18424d5f3fc49f84d7a5095bc6d2a169a8d417a16e5d9ca1ee8fd7db1c2bc530'
    )
      throw new Error(
        'The draft benchmark requires the exact Allure V.02.26.26 source',
      );
    if (
      args.mode === 'compile' &&
      !['openai', 'anthropic'].includes(args.provider)
    )
      throw new Error('Choose OpenAI or Anthropic');
    if (args.mode === 'compile' && !args.model.trim())
      throw new Error('Model is required');
    const versionId = await ctx.db.insert('versions', {
      ownerId: ctx.userId,
      documentId: document._id,
      label: document.documentVersion + ' subset',
      status: 'draft',
      revision: 0,
      coverageJson: JSON.stringify({
        kind: 'subset',
        label: 'Representative source subset',
        pages: selected.map((pageNumber) => ({
          documentId: document._id,
          pageNumber,
        })),
      }),
      origin: args.mode === 'compile' ? 'compiler' : 'benchmark_draft',
      stats: {
        products: 0,
        rules: 0,
        footnotes: 0,
        cases: 0,
        unreviewed: 0,
        approved: 0,
        rejected: 0,
        autoApproved: 0,
      },
      compilerVersion: '0.1.0',
      schemaVersion: '1',
      createdAt: Date.now(),
    });
    await ctx.db.insert('jobs', {
      ownerId: ctx.userId,
      versionId,
      documentId: document._id,
      mode: args.mode,
      status: 'queued',
      selectedPages: selected,
      processedPages: [],
      failedPages: [],
      provider: args.provider,
      model: args.model,
      promptVersion: 'catalog-v1',
      inputTokens: 0,
      outputTokens: 0,
      visionCalls: 0,
      createdAt: Date.now(),
    });
    await ctx.db.patch(document._id, { status: 'processing' });
    return versionId;
  },
});
export const reprocess = ownedMutation({
  args: { versionId: v.id('versions'), pages: v.array(v.number()) },
  returns: v.id('jobs'),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, ctx.userId, true);
    const previous = await ctx.db
      .query('jobs')
      .withIndex('by_versionId', (q) => q.eq('versionId', args.versionId))
      .order('desc')
      .first();
    if (!previous) throw new Error('No compilation exists');
    if (previous.status === 'running' || previous.status === 'queued')
      throw new Error('A job is already active');
    const coverage = JSON.parse(version.coverageJson) as {
      pages: { pageNumber: number }[];
    };
    const selected = [...new Set(args.pages)];
    if (
      !selected.length ||
      selected.some((p) => !coverage.pages.some((c) => c.pageNumber === p))
    )
      throw new Error('Choose pages within this version');
    await ctx.db.patch(version._id, {
      revision: version.revision + 1,
      status: 'draft',
      gateJson: undefined,
      gateRevision: undefined,
      gateContentHash: undefined,
      benchmarkJson: undefined,
      benchmarkRevision: undefined,
    });
    return await ctx.db.insert('jobs', {
      ownerId: ctx.userId,
      versionId: version._id,
      documentId: version.documentId,
      mode: previous.mode,
      status: 'queued',
      selectedPages: selected,
      processedPages: [],
      failedPages: [],
      provider: previous.provider,
      model: previous.model,
      promptVersion: previous.promptVersion,
      inputTokens: 0,
      outputTokens: 0,
      visionCalls: 0,
      createdAt: Date.now(),
    });
  },
});

export const browseCatalog = ownedQuery({
  args: {
    versionId: v.id('versions'),
    query: v.optional(v.string()),
    category: v.optional(v.string()),
    family: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    depth: v.optional(v.number()),
    status: v.optional(reviewState),
    minConfidence: v.optional(v.number()),
    offset: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ownedVersion(ctx, args.versionId, ctx.userId);
    if (!Number.isInteger(args.offset) || args.offset < 0)
      throw new Error('Invalid page offset');
    const rows = await ctx.db
      .query('records')
      .withIndex('by_versionId_and_kind', (q) =>
        q.eq('versionId', args.versionId).eq('kind', 'product'),
      )
      .take(2001);
    if (rows.length > 2000) throw new Error('Subset browser limit exceeded');
    const matches = rows
      .filter(
        (r) =>
          (!args.query ||
            r.sku.toLowerCase().includes(args.query.toLowerCase())) &&
          (!args.category || r.category === args.category) &&
          (!args.family ||
            r.family.toLowerCase().includes(args.family.toLowerCase())) &&
          (args.width === undefined || r.width === args.width) &&
          (args.height === undefined || r.height === args.height) &&
          (args.depth === undefined || r.depth === args.depth) &&
          (!args.status || r.reviewStatus === args.status) &&
          (args.minConfidence === undefined ||
            r.confidence >= args.minConfidence),
      )
      .sort((a, b) => a.sku.localeCompare(b.sku));
    return JSON.stringify({
      total: matches.length,
      records: matches
        .slice(args.offset, args.offset + 100)
        .map(({ payloadJson, evidenceJson, ...row }) => {
          void payloadJson;
          void evidenceJson;
          return row;
        }),
    });
  },
});
