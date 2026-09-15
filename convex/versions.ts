import { v } from 'convex/values';
import { crossSourceConflicts } from '../src/catalog/cross-source';
import { getAuthUserId } from '@convex-dev/auth/server';
import { action, internalQuery, internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { ownedVersion, ownedQuery, ownedMutation, actorKind } from './access';
import { recordDataSchema, recordEvidence } from '../src/catalog/record-data';
import {
  candidateSchema,
  candidateContentHash,
  evaluatePublication,
  preparePublishedSnapshot,
} from '../src/catalog/publication';
import type { CatalogCandidate } from '../src/catalog/publication';
import { canonicalJson, contentHash } from '../src/catalog/canonical';
import { blockerCodeSchema } from '../src/catalog/approval';
import { measureBenchmark, diffRecords } from '../src/catalog/benchmark';
async function materialize(
  ctx: QueryCtx | MutationCtx,
  version: Doc<'versions'>,
) {
  const document = await ctx.db.get(version.documentId);
  if (!document) throw new Error('Source missing');
  const records = await ctx.db
    .query('records')
    .withIndex('by_versionId_and_entityKey', (q) =>
      q.eq('versionId', version._id),
    )
    .take(2001);
  if (records.length > 2000)
    throw new Error('Subset exceeds the reviewed snapshot limit');
  const pages = await ctx.db
    .query('pages')
    .withIndex('by_versionId_and_pageNumber', (q) =>
      q.eq('versionId', version._id),
    )
    .take(41);
  if (pages.length > 40)
    throw new Error('Full-book compilation requires the completed milestone');
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_versionId', (q) => q.eq('versionId', version._id))
    .order('desc')
    .take(10);
  const parsed = records.map((r) => ({
    row: r,
    payload: recordDataSchema.parse(JSON.parse(r.payloadJson)),
  }));
  const live = parsed.filter((r) => r.row.reviewStatus !== 'rejected');
  const findings = live.flatMap(({ row, payload }) =>
    [
      ...row.blockers,
      ...((payload.kind === 'footnote' || payload.kind === 'case') &&
      row.reviewStatus === 'unreviewed'
        ? ['page_processing_warning_affecting_record']
        : []),
    ].map((code, i) => ({
      id: row.entityKey + ':finding:' + i,
      code: blockerCodeSchema.parse(code),
      entityId: row.entityKey,
      severity: 'blocking' as const,
      provenance: recordEvidence(payload),
    })),
  );
  for (const conflict of crossSourceConflicts(live.map((r) => r.payload)))
    findings.push({
      id: 'cross-source:' + conflict.entityId + ':' + findings.length,
      code: conflict.code,
      entityId: conflict.entityId,
      severity: 'blocking',
      provenance: [],
    });
  for (const job of jobs)
    if (['queued', 'running'].includes(job.status))
      findings.push({
        id: 'job:' + job._id,
        code: 'page_processing_warning_affecting_record',
        entityId: job._id,
        severity: 'blocking',
        provenance: [],
      });
  const candidate: CatalogCandidate = candidateSchema.parse({
    id: version._id,
    revision: version.revision,
    status:
      version.status === 'published' || version.status === 'superseded'
        ? 'published'
        : 'review',
    seriesId: document.series,
    compilerVersion: version.compilerVersion,
    schemaVersion: version.schemaVersion,
    promptVersion: jobs[0]?.promptVersion ?? 'none',
    modelVersion: jobs[0]?.model ?? 'none',
    documents: [
      {
        id: document._id,
        sha256: document.sha256,
        pageCount: document.pageCount,
      },
    ],
    coverage: JSON.parse(version.coverageJson),
    pages: pages.map((p) => ({
      documentId: p.documentId,
      pageNumber: p.pageNumber,
      status: p.status,
      contentType:
        p.status === 'ignored'
          ? 'non_catalog'
          : p.classification === 'other'
            ? 'unknown'
            : 'catalog',
      ...(p.ignoredBy && p.ignoreReason && p.ignoredAt
        ? {
            ignoreAudit: {
              actorId: p.ignoredBy,
              reason: p.ignoreReason,
              at: new Date(p.ignoredAt).toISOString(),
            },
          }
        : {}),
    })),
    registries: live
      .flatMap((r) => (r.payload.kind === 'registry' ? [r.payload.data] : []))
      .sort((a, b) => a.id.localeCompare(b.id)),
    products: live
      .flatMap((r) => (r.payload.kind === 'product' ? [r.payload.data] : []))
      .sort((a, b) => a.id.localeCompare(b.id)),
    rules: live
      .flatMap((r) => (r.payload.kind === 'rule' ? [r.payload.data] : []))
      .sort((a, b) => a.id.localeCompare(b.id)),
    findings,
    additionalCategoryProfiles: JSON.parse(version.profilesJson ?? '[]'),
  });
  const hash = candidateContentHash(candidate);
  const preliminary = evaluatePublication(candidate);
  candidate.validation = {
    runId: 'validation:' + hash,
    candidateRevision: version.revision,
    contentHash: hash,
    passed: preliminary.issues.every((i) =>
      ['benchmark_gate_failed', 'validation_gate_failed'].includes(i.code),
    ),
  };
  if (version.benchmarkJson && version.benchmarkRevision === version.revision) {
    const report = JSON.parse(version.benchmarkJson);
    const truth = await ctx.db.get(report.truthVersionId as Id<'versions'>);
    if (truth?.revision === report.truthRevision)
      candidate.benchmark = {
        runId: report.runId,
        candidateRevision: version.revision,
        contentHash: hash,
        passed: report.passed,
        fixtureRevision: report.truthHash,
        scope: 'milestone_1',
        truthStatus: report.truthVerified ? 'human_verified' : 'draft',
        productsPass: report.productsPass,
        fieldsPass: report.fieldsPass,
        rulesPass: report.rulesPass,
        footnotesPass: report.footnotesPass,
      };
  }
  return {
    candidate,
    sourcePages: pages.map((p) => ({
      pageNumber: p.pageNumber,
      printedLabel: p.printedLabel,
      text: p.text,
    })),
    records,
    parsed,
    document,
    gate: evaluatePublication(candidate),
  };
}
export const inspect = ownedQuery({
  args: { versionId: v.id('versions') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, ctx.userId);
    const source = await ctx.db.get(version.documentId);
    if (!source?.pageCount)
      return JSON.stringify({
        gate: {
          candidateId: version._id,
          revision: version.revision,
          contentHash: contentHash([version._id, version.revision]),
          receiptHash: contentHash(null),
          publishable: false,
          issues: [
            {
              code: 'page_not_processed',
              detail: 'Source page extraction has not completed',
            },
          ],
        },
        benchmark: null,
        verified: 0,
        total: 0,
        pages: [],
      });
    const data = await materialize(ctx, version);
    return JSON.stringify({
      gate: data.gate,
      benchmark: version.benchmarkJson
        ? JSON.parse(version.benchmarkJson)
        : null,
      verified: data.records.filter((r) => r.truthVerified).length,
      total: data.records.length,
      pages: data.candidate.pages,
    });
  },
});
export const benchmark = ownedMutation({
  args: { versionId: v.id('versions'), truthVersionId: v.id('versions') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, ctx.userId, true),
      truth = await ownedVersion(ctx, args.truthVersionId, ctx.userId);
    if (
      version._id === truth._id ||
      version.origin === 'benchmark_draft' ||
      truth.origin !== 'benchmark_draft'
    )
      throw new Error(
        'Compare an independent compiler run against the reviewed benchmark draft',
      );
    const a = await materialize(ctx, version),
      b = await materialize(ctx, truth);
    if (
      a.document.sha256 !== b.document.sha256 ||
      canonicalJson(a.candidate.coverage) !==
        canonicalJson(b.candidate.coverage)
    )
      throw new Error('Benchmark source and coverage must match');
    const rows = (data: typeof a) =>
      data.parsed.map((r) => ({
        payload: r.payload,
        truthVerified: r.row.truthVerified,
        blockers: r.row.blockers,
      }));
    const report = {
      ...measureBenchmark(rows(a), rows(b), a.sourcePages),
      runId:
        'benchmark:' +
        contentHash([version._id, version.revision, truth._id, truth.revision]),
      truthVersionId: truth._id,
      truthRevision: truth.revision,
      truthHash: contentHash(rows(b)),
      at: Date.now(),
    };
    await ctx.db.patch(version._id, {
      benchmarkJson: JSON.stringify(report),
      benchmarkRevision: version.revision,
      gateJson: undefined,
      gateRevision: undefined,
      gateContentHash: undefined,
    });
    return JSON.stringify(report);
  },
});
export const publicationSource = internalQuery({
  args: { userId: v.id('users'), versionId: v.id('versions') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, args.userId, true);
    const data = await materialize(ctx, version);
    if (!data.gate.publishable)
      throw new Error(
        'Publication blocked: ' +
          data.gate.issues
            .slice(0, 5)
            .map((i) => i.code)
            .join(', '),
      );
    return canonicalJson({
      snapshot: preparePublishedSnapshot(
        data.candidate,
        data.gate,
        new Date().toISOString(),
      ),
      manufacturer: data.document.manufacturer,
      series: data.document.series,
      footnotes: data.parsed
        .flatMap((r) =>
          r.payload.kind === 'footnote' && r.row.reviewStatus !== 'rejected'
            ? [r.payload.data]
            : [],
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
  },
});
export const commitPublication = internalMutation({
  args: {
    userId: v.id('users'),
    versionId: v.id('versions'),
    revision: v.number(),
    hash: v.string(),
    storageId: v.id('_storage'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, args.userId, true);
    const { gate } = await materialize(ctx, version);
    if (
      version.revision !== args.revision ||
      gate.contentHash !== args.hash ||
      !gate.publishable
    )
      throw new Error('Publication became stale. Re-run checks.');
    await ctx.db.patch(version._id, {
      status: 'published',
      publishedAt: Date.now(),
      exportStorageId: args.storageId,
      gateJson: JSON.stringify(gate),
      gateRevision: version.revision,
      gateContentHash: gate.contentHash,
    });
    await ctx.db.insert('audit', {
      ownerId: args.userId,
      versionId: version._id,
      actorId: args.userId,
      actorKind: await actorKind(ctx, args.userId),
      action: 'publish',
      beforeJson: JSON.stringify({ status: version.status }),
      afterJson: JSON.stringify(gate),
      reason: 'Exact revision passed publication gates',
      at: Date.now(),
      candidateRevision: version.revision,
    });
    return null;
  },
});
export const publish = action({
  args: { versionId: v.id('versions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Sign in required');
    const json = await ctx.runQuery(internal.versions.publicationSource, {
      ...args,
      userId,
    });
    const data = JSON.parse(json);
    const storageId = await ctx.storage.store(
      new Blob([json], { type: 'application/json' }),
    );
    try {
      await ctx.runMutation(internal.versions.commitPublication, {
        ...args,
        userId,
        revision: data.snapshot.revision,
        hash: data.snapshot.gate.contentHash,
        storageId,
      });
    } catch (e) {
      await ctx.storage.delete(storageId);
      throw e;
    }
    return null;
  },
});
export const diff = ownedQuery({
  args: { beforeId: v.id('versions'), afterId: v.id('versions') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const a = await materialize(
        ctx,
        await ownedVersion(ctx, args.beforeId, ctx.userId),
      ),
      b = await materialize(
        ctx,
        await ownedVersion(ctx, args.afterId, ctx.userId),
      );
    return JSON.stringify(
      diffRecords(
        a.parsed
          .filter((r) => r.row.reviewStatus !== 'rejected')
          .map((r) => r.payload),
        b.parsed
          .filter((r) => r.row.reviewStatus !== 'rejected')
          .map((r) => r.payload),
      ),
    );
  },
});
export const ignorePage = ownedMutation({
  args: {
    versionId: v.id('versions'),
    pageNumber: v.number(),
    reason: v.string(),
    attestNonCatalog: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, ctx.userId, true);
    if (!args.attestNonCatalog || args.reason.trim().length < 10)
      throw new Error(
        'Confirm non-catalog content and provide a specific reason',
      );
    const page = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', version._id).eq('pageNumber', args.pageNumber),
      )
      .unique();
    if (!page) throw new Error('Page not found');
    const records = await ctx.db
      .query('records')
      .withIndex('by_versionId_and_entityKey', (q) =>
        q.eq('versionId', version._id),
      )
      .take(2001);
    if (
      records.length > 2000 ||
      records.some(
        (r) =>
          r.reviewStatus !== 'rejected' &&
          recordEvidence(
            recordDataSchema.parse(JSON.parse(r.payloadJson)),
          ).some((e) => e.pageNumber === args.pageNumber),
      )
    )
      throw new Error(
        'Page contains live catalog evidence and cannot be ignored',
      );
    if (!['other', 'index', 'table_of_contents'].includes(page.classification))
      throw new Error('Catalog content cannot be ignored');
    await ctx.db.patch(page._id, {
      status: 'ignored',
      ignoreReason: args.reason,
      ignoredBy: ctx.userId,
      ignoredAt: Date.now(),
    });
    await ctx.db.patch(version._id, {
      revision: version.revision + 1,
      benchmarkJson: undefined,
      benchmarkRevision: undefined,
      gateJson: undefined,
    });
    await ctx.db.insert('audit', {
      ownerId: ctx.userId,
      versionId: version._id,
      actorId: ctx.userId,
      actorKind: await actorKind(ctx, ctx.userId),
      action: 'ignore_non_catalog_page',
      beforeJson: JSON.stringify({
        pageNumber: page.pageNumber,
        status: page.status,
      }),
      afterJson: JSON.stringify({ status: 'ignored' }),
      reason: args.reason,
      at: Date.now(),
      candidateRevision: version.revision + 1,
    });
    return null;
  },
});
export const setProfiles = ownedMutation({
  args: {
    versionId: v.id('versions'),
    profilesJson: v.string(),
    reason: v.string(),
    automation: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const version = await ownedVersion(ctx, args.versionId, ctx.userId, true);
    if (args.reason.trim().length < 10)
      throw new Error('Explain the required geometry policy');
    const raw: unknown = JSON.parse(args.profilesJson);
    if (!Array.isArray(raw)) throw new Error('Profiles must be an array');
    const profiles = candidateSchema.shape.additionalCategoryProfiles.parse(
      raw.map((p) => ({
        ...p,
        version: String(version.revision + 1),
        audit: {
          actorId: ctx.userId,
          at: new Date().toISOString(),
          reason: args.reason,
        },
      })),
    );
    const profilesJson = JSON.stringify(profiles);
    await ctx.db.patch(version._id, {
      profilesJson,
      revision: version.revision + 1,
      benchmarkJson: undefined,
      benchmarkRevision: undefined,
      gateJson: undefined,
    });
    await ctx.db.insert('audit', {
      ownerId: ctx.userId,
      versionId: version._id,
      actorId: ctx.userId,
      actorKind: args.automation
        ? 'automation'
        : await actorKind(ctx, ctx.userId),
      action: 'geometry_policy',
      beforeJson: version.profilesJson ?? '[]',
      afterJson: profilesJson,
      reason: args.reason,
      at: Date.now(),
      candidateRevision: version.revision + 1,
    });
    return null;
  },
});
export const createRevision = ownedMutation({
  args: { versionId: v.id('versions') },
  returns: v.id('versions'),
  handler: async (ctx, args) => {
    const parent = await ownedVersion(ctx, args.versionId, ctx.userId);
    if (parent.status !== 'published')
      throw new Error('Create revisions from a published version');
    const { records } = await materialize(ctx, parent);
    const pages = await ctx.db
      .query('pages')
      .withIndex('by_versionId_and_pageNumber', (q) =>
        q.eq('versionId', parent._id),
      )
      .take(40);
    const versionId = await ctx.db.insert('versions', {
      ownerId: ctx.userId,
      documentId: parent.documentId,
      label: parent.label + ' revision',
      status: 'review',
      revision: 0,
      coverageJson: parent.coverageJson,
      profilesJson: parent.profilesJson,
      origin: 'revision',
      stats: parent.stats,
      compilerVersion: parent.compilerVersion,
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
    for (const row of records) {
      const { _id, _creationTime, ...copy } = row;
      void _creationTime;
      const payload = recordDataSchema.parse(JSON.parse(row.payloadJson));
      if (payload.kind === 'rule') payload.data.catalogVersionId = versionId;
      const id = await ctx.db.insert('records', {
        ...copy,
        versionId,
        payloadJson: JSON.stringify(payload),
        truthVerified: false,
        revision: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert('audit', {
        ownerId: ctx.userId,
        versionId,
        recordId: id,
        actorId: ctx.userId,
        actorKind: await actorKind(ctx, ctx.userId),
        action: 'inherit_published_record',
        beforeJson: JSON.stringify({ versionId: parent._id, recordId: _id }),
        afterJson: JSON.stringify(payload),
        reason: 'Create editable revision from immutable publication',
        at: Date.now(),
        candidateRevision: 0,
      });
    }
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_versionId', (q) => q.eq('versionId', parent._id))
      .order('desc')
      .first();
    if (job)
      await ctx.db.insert('jobs', {
        ownerId: ctx.userId,
        versionId,
        documentId: parent.documentId,
        mode: job.mode,
        status: 'completed',
        selectedPages: pages.map((p) => p.pageNumber),
        processedPages: pages
          .filter((p) => p.status === 'processed')
          .map((p) => p.pageNumber),
        failedPages: [],
        provider: job.provider,
        model: job.model,
        promptVersion: job.promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        visionCalls: 0,
        createdAt: Date.now(),
        finishedAt: Date.now(),
      });
    return versionId;
  },
});
