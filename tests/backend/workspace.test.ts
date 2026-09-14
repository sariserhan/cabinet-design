import { test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
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
