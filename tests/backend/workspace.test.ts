import { test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api, internal } from '../../convex/_generated/api';
import { importBenchmarkDraft } from '../../src/ingestion/benchmark-draft';
import { upsertRecord } from '../../convex/recordHelpers';
const modules = import.meta.glob('../../convex/**/*.{ts,js}');
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', {
        email: 'qa@catalog-qa.invalid',
      }),
      other = await ctx.db.insert('users', {
        email: 'other@catalog-qa.invalid',
      });
    await ctx.db.insert('reviewerProfiles', {
      userId: owner,
      actorKind: 'automation',
    });
    const storageId = await ctx.storage.store(new Blob(['%PDF-test']));
    const documentId = await ctx.db.insert('documents', {
      ownerId: owner,
      name: 'Synthetic test document',
      manufacturer: 'Test',
      series: 'Allure',
      documentVersion: 'test',
      sha256:
        '18424d5f3fc49f84d7a5095bc6d2a169a8d417a16e5d9ca1ee8fd7db1c2bc530',
      storageId,
      byteLength: 9,
      pageCount: 139,
      status: 'processed',
      createdAt: 0,
    });
    const versionId = await ctx.db.insert('versions', {
      ownerId: owner,
      documentId,
      label: 'Test',
      status: 'review',
      revision: 0,
      coverageJson: JSON.stringify({
        kind: 'subset',
        label: 'Test',
        pages: [{ documentId, pageNumber: 22 }],
      }),
      origin: 'benchmark_draft',
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
      compilerVersion: 'test',
      schemaVersion: '1',
      createdAt: 0,
    });
    return { owner, other, documentId, versionId };
  });
  const drafts = await importBenchmarkDraft(
    'tests/fixtures/fabuwood-allure',
    ids.documentId,
    '18424d5f3fc49f84d7a5095bc6d2a169a8d417a16e5d9ca1ee8fd7db1c2bc530',
    ids.versionId,
  );
  const payload = drafts.find((r) => r.data.id === 'product:W2421');
  if (!payload) throw new Error('Fixture missing');
  const recordId = await t.run(async (ctx) => {
    const version = await ctx.db.get(ids.versionId);
    if (!version) throw new Error('Missing version');
    const result = await upsertRecord(ctx, version, payload);
    await ctx.db.patch(version._id, { stats: result.stats });
    return result.id;
  });
  return {
    t,
    ...ids,
    recordId,
    payload,
    ownerClient: t.withIdentity({ subject: ids.owner + '|test-session' }),
    otherClient: t.withIdentity({ subject: ids.other + '|other-session' }),
  };
}
test('private records require the owning authenticated identity', async () => {
  const s = await setup();
  await expect(
    s.t.query(api.workspace.record, { recordId: s.recordId }),
  ).rejects.toThrow('Sign in');
  await expect(
    s.otherClient.query(api.workspace.record, { recordId: s.recordId }),
  ).rejects.toThrow('Record not found');
  expect(
    JSON.parse(
      await s.ownerClient.query(api.workspace.record, { recordId: s.recordId }),
    ).record.entityKey,
  ).toBe('product:W2421');
});
test('review uses compare-and-swap, preserves audit, and automation never verifies truth', async () => {
  const s = await setup();
  await s.ownerClient.mutation(api.review.decide, {
    recordId: s.recordId,
    expectedRevision: 0,
    action: 'approve',
    reason: 'Automated test only',
    attestWholeRecord: true,
  });
  const result = JSON.parse(
    await s.ownerClient.query(api.workspace.record, { recordId: s.recordId }),
  );
  expect(result.record.reviewStatus).toBe('approved');
  expect(result.record.truthVerified).toBe(false);
  expect(result.audit[0].actorKind).toBe('automation');
  await expect(
    s.ownerClient.mutation(api.review.decide, {
      recordId: s.recordId,
      expectedRevision: 0,
      action: 'reject',
      reason: 'Stale action',
      attestWholeRecord: false,
    }),
  ).rejects.toThrow('changed');
});
test('published versions cannot be changed through review or reprocessing', async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch(s.versionId, { status: 'published' }));
  await expect(
    s.ownerClient.mutation(api.review.decide, {
      recordId: s.recordId,
      expectedRevision: 0,
      action: 'reject',
      reason: 'Attempt mutation',
      attestWholeRecord: false,
    }),
  ).rejects.toThrow('immutable');
  await expect(
    s.ownerClient.mutation(api.workspace.reprocess, {
      versionId: s.versionId,
      pages: [22],
    }),
  ).rejects.toThrow('immutable');
});
test('review edits retain blockers, and reprocessing preserves an audited correction', async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.recordId, { blockers: ['ambiguous_footnote_scope'] }),
  );
  await s.ownerClient.mutation(api.review.decide, {
    recordId: s.recordId,
    expectedRevision: 0,
    action: 'edit',
    payloadJson: JSON.stringify(s.payload),
    reason: 'Inspect source scope',
    attestWholeRecord: false,
  });
  let row = await s.t.run((ctx) => ctx.db.get(s.recordId));
  expect(row?.blockers).toContain('ambiguous_footnote_scope');
  await s.t.run(async (ctx) => {
    const version = await ctx.db.get(s.versionId);
    if (!version) throw new Error('Missing version');
    const result = await upsertRecord(ctx, version, s.payload);
    expect(result.skipped).toBe(true);
  });
  row = await s.t.run((ctx) => ctx.db.get(s.recordId));
  expect(row?.revision).toBe(1);
});
test('unverified source cannot publish and invalid worker credentials cannot claim jobs', async () => {
  const s = await setup();
  await expect(
    s.ownerClient.action(api.versions.publish, { versionId: s.versionId }),
  ).rejects.toThrow('Publication blocked');
  await expect(
    s.t.mutation(api.worker.claim, {
      secret: 'invalid',
      leaseToken: '123456789012345678901234',
    }),
  ).rejects.toThrow('authorization');
});

test('split/merge cannot smuggle foreign-document evidence into an owned catalog', async () => {
  const s = await setup();
  const one = structuredClone(s.payload),
    two = structuredClone(s.payload);
  one.data.id = 'new-one';
  two.data.id = 'new-two';
  if (one.kind === 'product')
    for (const field of Object.values(one.data.fields))
      for (const evidence of field.provenance)
        evidence.documentId = 'foreign-document';
  await expect(
    s.ownerClient.mutation(api.review.split, {
      recordId: s.recordId,
      expectedRevision: 0,
      payloadsJson: JSON.stringify([one, two]),
      reason: 'Synthetic evidence isolation test',
    }),
  ).rejects.toThrow('Evidence must match');
  const existing = await s.t.run((ctx) => ctx.db.get(s.recordId));
  expect(existing?.reviewStatus).toBe('unreviewed');
});

test('delegated bulk approval preserves blockers and never verifies human truth', async () => {
  const s = await setup();
  const args = {
    versionId: s.versionId,
    expectedRevision: 0,
    reason: 'User requested provisional approval',
  };
  await expect(
    s.otherClient.mutation(api.bulkReview.approveUnverified, args),
  ).rejects.toThrow('not found');
  await s.t.run((ctx) =>
    ctx.db.patch(s.recordId, { blockers: ['unresolved_conflict'] }),
  );
  expect(
    await s.ownerClient.mutation(api.bulkReview.approveUnverified, args),
  ).toMatchObject({ approved: 0, blocked: 1 });
  await s.t.run((ctx) => ctx.db.patch(s.recordId, { blockers: [] }));
  expect(
    await s.ownerClient.mutation(api.bulkReview.approveUnverified, args),
  ).toMatchObject({ approved: 1, revision: 1 });
  const result = JSON.parse(
    await s.ownerClient.query(api.workspace.record, { recordId: s.recordId }),
  );
  expect(result.record.truthVerified).toBe(false);
  expect(result.audit[0].action).toBe('bulk_approve_unverified');
  expect(result.audit[0].actorKind).toBe('automation');
  await expect(
    s.ownerClient.mutation(api.bulkReview.approveUnverified, args),
  ).rejects.toThrow('changed');
  await s.t.run((ctx) => ctx.db.patch(s.recordId, { truthVerified: true }));
  expect(
    await s.ownerClient.mutation(api.bulkReview.approveUnverified, {
      ...args,
      expectedRevision: 1,
    }),
  ).toMatchObject({ approved: 0, unchanged: 1 });
  expect((await s.t.run((ctx) => ctx.db.get(s.recordId)))?.truthVerified).toBe(
    true,
  );
  await s.t.run((ctx) => ctx.db.patch(s.versionId, { status: 'published' }));
  await expect(
    s.ownerClient.mutation(api.bulkReview.approveUnverified, {
      ...args,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('immutable');
});

test('AI source edits enforce ownership and provenance without human attestation', async () => {
  const s = await setup();
  const change = {
    recordId: s.recordId,
    expectedRevision: 0,
    payloadJson: JSON.stringify(s.payload),
  };
  const args = { changes: [change], reason: 'Direct AI source review' };
  await expect(
    s.otherClient.mutation(api.aiReview.apply, args),
  ).rejects.toThrow('not found');
  const foreign = structuredClone(s.payload);
  if (foreign.kind === 'product')
    for (const f of Object.values(foreign.data.fields))
      for (const e of f.provenance) e.documentId = 'foreign';
  await expect(
    s.ownerClient.mutation(api.aiReview.apply, {
      ...args,
      changes: [{ ...change, payloadJson: JSON.stringify(foreign) }],
    }),
  ).rejects.toThrow('Evidence');
  await s.t.run((ctx) =>
    ctx.db.patch(s.recordId, { blockers: ['unresolved_conflict'] }),
  );
  expect(await s.ownerClient.mutation(api.aiReview.apply, args)).toBe(1);
  const result = JSON.parse(
    await s.ownerClient.query(api.workspace.record, { recordId: s.recordId }),
  );
  expect(result.record.truthVerified).toBe(false);
  expect(result.record.blockers).toContain('unresolved_conflict');
  expect(result.audit[0].actorKind).toBe('automation');
  expect(result.audit[0].action).toBe('ai_source_review');
  await expect(
    s.ownerClient.mutation(api.aiReview.apply, args),
  ).rejects.toThrow('changed');
  await s.t.run((ctx) => ctx.db.patch(s.recordId, { truthVerified: true }));
  await expect(
    s.ownerClient.mutation(api.aiReview.apply, {
      ...args,
      changes: [{ ...change, expectedRevision: 1 }],
    }),
  ).rejects.toThrow('human-verified');
});

test('working catalog expansion preserves source and resets inherited verification', async () => {
  const s = await setup();
  const addition = structuredClone(s.payload);
  addition.data.id = 'product:extra';
  if (
    addition.kind === 'product' &&
    addition.data.fields.sku?.state === 'known'
  )
    addition.data.fields.sku.value = 'extra';
  const args = {
    sourceVersionId: s.versionId,
    expectedRevision: 0,
    label: 'Working catalog',
    additionsJson: JSON.stringify([addition]),
  };
  await expect(
    s.otherClient.mutation(api.workingCatalog.create, args),
  ).rejects.toThrow('not found');
  await expect(
    s.ownerClient.mutation(api.workingCatalog.create, {
      ...args,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('changed');
  await expect(
    s.ownerClient.mutation(api.workingCatalog.create, {
      ...args,
      additionsJson: JSON.stringify([s.payload]),
    }),
  ).rejects.toThrow('Duplicate');
  const foreign = structuredClone(addition);
  if (foreign.kind === 'product')
    for (const f of Object.values(foreign.data.fields))
      for (const e of f.provenance) e.documentId = 'foreign';
  await expect(
    s.ownerClient.mutation(api.workingCatalog.create, {
      ...args,
      additionsJson: JSON.stringify([foreign]),
    }),
  ).rejects.toThrow('Evidence');
  await s.t.run((ctx) => ctx.db.patch(s.recordId, { truthVerified: true }));
  const newId = await s.ownerClient.mutation(api.workingCatalog.create, args);
  const result = await s.t.run(async (ctx) => ({
    parent: await ctx.db.get(s.versionId),
    original: await ctx.db.get(s.recordId),
    version: await ctx.db.get(newId),
    rows: await ctx.db
      .query('records')
      .withIndex('by_versionId_and_entityKey', (q) => q.eq('versionId', newId))
      .take(10),
  }));
  expect(result.parent?.revision).toBe(0);
  expect(result.original?.truthVerified).toBe(true);
  expect(result.version?.stats.products).toBe(2);
  expect(result.version?.parentVersionId).toBe(s.versionId);
  expect(
    result.rows.every(
      (r) => !r.truthVerified && r.reviewStatus === 'unreviewed',
    ),
  ).toBe(true);
});

test('registry imports preserve ownership, uniqueness and unverified status', async () => {
  const s = await setup();
  if (s.payload.kind !== 'product' || !s.payload.data.fields.sku)
    throw new Error('Fixture missing');
  const name = {
    ...structuredClone(s.payload.data.fields.sku),
    id: 'TEST-MOD:name',
    state: 'known',
    value: 'TEST-MOD',
  };
  const record = {
    kind: 'registry',
    data: {
      id: 'TEST-MOD',
      entityKind: 'modification',
      name,
      attributes: {},
      productIds: [],
      reviewStatus: 'approved',
    },
  };
  const args = {
    versionId: s.versionId,
    expectedRevision: 0,
    recordsJson: JSON.stringify([record]),
    reason: 'Synthetic registry test',
  };
  await expect(
    s.otherClient.mutation(api.aiReview.addRegistries, args),
  ).rejects.toThrow('not found');
  await expect(
    s.ownerClient.mutation(api.aiReview.addRegistries, {
      ...args,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('changed');
  expect(await s.ownerClient.mutation(api.aiReview.addRegistries, args)).toBe(
    1,
  );
  const rows = await s.t.run((ctx) =>
    ctx.db
      .query('records')
      .withIndex('by_versionId_and_entityKey', (q) =>
        q.eq('versionId', s.versionId).eq('entityKey', 'TEST-MOD'),
      )
      .take(2),
  );
  expect(rows[0]?.truthVerified).toBe(false);
  expect(rows[0]?.reviewStatus).toBe('unreviewed');
  await expect(
    s.ownerClient.mutation(api.aiReview.addRegistries, {
      ...args,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('already exists');
});

test('AI geometry policy is audited as automation and invalidates benchmark', async () => {
  const s = await setup();
  await s.ownerClient.mutation(api.versions.setProfiles, {
    versionId: s.versionId,
    automation: true,
    reason: 'AI conservative installation geometry: require width height depth',
    profilesJson: JSON.stringify([
      {
        category: 'accessory',
        requirements: {
          widthIn: {
            required: true,
            valueType: 'number',
            positiveDimension: true,
          },
          heightIn: {
            required: true,
            valueType: 'number',
            positiveDimension: true,
          },
          depthIn: {
            required: true,
            valueType: 'number',
            positiveDimension: true,
          },
        },
      },
    ]),
  });
  const result = await s.t.run(async (ctx) => ({
    version: await ctx.db.get(s.versionId),
    audit: await ctx.db
      .query('audit')
      .withIndex('by_versionId', (q) => q.eq('versionId', s.versionId))
      .first(),
  }));
  expect(result.audit?.actorKind).toBe('automation');
  expect(result.version?.revision).toBe(1);
  expect(
    JSON.parse(result.version?.profilesJson ?? '[]')[0].requirements.depthIn
      .required,
  ).toBe(true);
});

test('benchmark action batches inputs and rejects unauthorized or stale results', async () => {
  const s = await setup();
  const candidate = await s.t.run(async (ctx) => {
    const original = await ctx.db.get(s.versionId),
      record = await ctx.db.get(s.recordId);
    if (!original || !record) throw Error('fixture missing');
    const { _id, _creationTime, ...version } = original;
    void _id;
    void _creationTime;
    const id = await ctx.db.insert('versions', {
      ...version,
      origin: 'compiler',
    });
    const { _id: rid, _creationTime: rt, ...row } = record;
    void rid;
    void rt;
    for (let i = 0; i < 105; i++) {
      const payload = structuredClone(s.payload);
      payload.data.id = 'product:fixture-' + i;
      const copy = {
        ...row,
        entityKey: payload.data.id,
        payloadJson: JSON.stringify(payload),
      };
      await ctx.db.insert('records', { ...copy, versionId: id });
      await ctx.db.insert('records', { ...copy, versionId: s.versionId });
    }
    return id;
  });
  const batch = JSON.parse(
    await s.t.query(internal.versions.benchmarkInput, {
      userId: s.owner,
      versionId: candidate,
      paginationOpts: { numItems: 100, cursor: null },
    }),
  );
  expect(batch.records).toHaveLength(100);
  expect(batch.isDone).toBe(false);
  await expect(
    s.otherClient.action(api.versions.benchmark, {
      versionId: candidate,
      truthVersionId: s.versionId,
    }),
  ).rejects.toThrow('not found');
  await expect(
    s.t.action(api.versions.benchmark, {
      versionId: candidate,
      truthVersionId: s.versionId,
    }),
  ).rejects.toThrow('Sign in');
  const report = await s.ownerClient.action(api.versions.benchmark, {
    versionId: candidate,
    truthVersionId: s.versionId,
  });
  expect(JSON.parse(report).truthVersionId).toBe(s.versionId);
  expect(
    await s.t.run(async (ctx) => (await ctx.db.get(candidate))?.benchmarkJson),
  ).toBe(report);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.versionId, { revision: 1 });
  });
  await expect(
    s.t.mutation(internal.versions.commitBenchmark, {
      userId: s.owner,
      versionId: candidate,
      truthVersionId: s.versionId,
      revision: 0,
      truthRevision: 0,
      reportJson: report,
    }),
  ).rejects.toThrow('stale');
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.versionId, { revision: 0 });
    await ctx.db.patch(candidate, { revision: 1 });
  });
  await expect(
    s.t.mutation(internal.versions.commitBenchmark, {
      userId: s.owner,
      versionId: candidate,
      truthVersionId: s.versionId,
      revision: 0,
      truthRevision: 0,
      reportJson: report,
    }),
  ).rejects.toThrow('stale');
});
