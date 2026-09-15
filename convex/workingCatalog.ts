import { v } from 'convex/values';
import { ownedMutation, ownedVersion } from './access';
import {
  recordDataSchema,
  recordEvidence,
  setRecordStatus,
} from '../src/catalog/record-data';
import { upsertRecord } from './recordHelpers';

export const create = ownedMutation({
  args: {
    sourceVersionId: v.id('versions'),
    expectedRevision: v.number(),
    label: v.string(),
    additionsJson: v.string(),
  },
  returns: v.id('versions'),
  handler: async (ctx, args) => {
    const parent = await ownedVersion(ctx, args.sourceVersionId, ctx.userId);
    if (parent.revision !== args.expectedRevision)
      throw new Error('Source changed');
    if (!args.label.trim() || args.label.length > 120)
      throw new Error('Label required (max 120 characters)');
    const raw: unknown = JSON.parse(args.additionsJson);
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 250)
      throw new Error('Provide 1–250 additions');
    const additions = raw.map((p) =>
      setRecordStatus(recordDataSchema.parse(p), 'unreviewed'),
    );
    const source = await ctx.db.get(parent.documentId);
    const coverage = JSON.parse(parent.coverageJson) as {
      pages: { pageNumber: number }[];
    };
    if (!source) throw new Error('Source missing');
    for (const p of additions)
      if (
        !recordEvidence(p).length ||
        recordEvidence(p).some(
          (e) =>
            e.documentId !== source._id ||
            e.documentSha256 !== source.sha256 ||
            !coverage.pages.some((c) => c.pageNumber === e.pageNumber),
        )
      )
        throw new Error('Evidence must match source and coverage');
    const records = await ctx.db
      .query('records')
      .withIndex('by_versionId_and_entityKey', (q) =>
        q.eq('versionId', parent._id),
      )
      .take(501);
    const pages = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', parent._id),
      )
      .take(41);
    if (records.length > 500 || pages.length > 40)
      throw new Error('Subset limit exceeded');
    const keys = [
      ...records.map((r) => r.entityKey),
      ...additions.map((p) => p.data.id),
    ];
    if (new Set(keys).size !== keys.length)
      throw new Error('Duplicate identity');
    const jobs = await ctx.db
      .query('jobs')
      .withIndex('by_versionId', (q) => q.eq('versionId', parent._id))
      .take(101);
    if (
      jobs.length > 100 ||
      jobs.some((j) => j.status === 'running' || j.status === 'queued')
    )
      throw new Error('Source processing is active');
    const versionId = await ctx.db.insert('versions', {
      ownerId: ctx.userId,
      documentId: parent.documentId,
      label: args.label,
      status: 'review',
      revision: 0,
      coverageJson: parent.coverageJson,
      profilesJson: parent.profilesJson,
      origin: 'revision',
      stats: {
        products: 0,
        rules: 0,
        footnotes: 0,
        cases: 0,
        registries: 0,
        unreviewed: 0,
        approved: 0,
        rejected: 0,
        autoApproved: 0,
      },
      compilerVersion: 'direct-ai-review-v1',
      schemaVersion: parent.schemaVersion,
      parentVersionId: parent._id,
      createdAt: Date.now(),
    });
    for (const page of pages) {
      const { _id, _creationTime, ...copy } = page;
      void _id;
      void _creationTime;
      await ctx.db.insert('pages', { ...copy, versionId });
    }
    let version = await ctx.db.get(versionId);
    if (!version) throw new Error('Version missing');
    const entries = [
      ...records.map((row) => ({
        payload: setRecordStatus(
          recordDataSchema.parse(JSON.parse(row.payloadJson)),
          'unreviewed',
        ),
        blockers: row.blockers,
        sourceRecordId: row._id,
      })),
      ...additions.map((payload) => ({
        payload,
        blockers: [] as string[],
        sourceRecordId: null,
      })),
    ];
    for (const entry of entries) {
      if (entry.payload.kind === 'rule')
        entry.payload.data.catalogVersionId = versionId;
      const result = await upsertRecord(
        ctx,
        version,
        entry.payload,
        entry.blockers,
        false,
      );
      version = { ...version, stats: result.stats };
      await ctx.db.insert('audit', {
        ownerId: ctx.userId,
        versionId,
        recordId: result.id,
        actorId: ctx.userId,
        actorKind: 'automation',
        action: entry.sourceRecordId
          ? 'inherit_working_record'
          : 'ai_source_import',
        beforeJson: JSON.stringify({
          sourceVersionId: parent._id,
          sourceRecordId: entry.sourceRecordId,
        }),
        afterJson: JSON.stringify(entry.payload),
        reason:
          'User-authorized separate AI-assisted working catalog; all records remain unverified and require review.',
        at: Date.now(),
        candidateRevision: 1,
      });
    }
    await ctx.db.patch(versionId, { stats: version.stats, revision: 1 });
    return versionId;
  },
});
