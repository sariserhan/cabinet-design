import { test, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { newDesign } from '../../src/designer/model';
const modules = import.meta.glob('../../convex/**/*.{ts,js}');
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    owner: await ctx.db.insert('users', { email: 'owner@example.test' }),
    other: await ctx.db.insert('users', { email: 'other@example.test' }),
  }));
  return {
    t,
    owner: t.withIdentity({ subject: ids.owner + '|test' }),
    other: t.withIdentity({ subject: ids.other + '|test' }),
  };
}
const draft = () => ({
  name: 'Test kitchen',
  designJson: JSON.stringify(newDesign()),
});
test('cloud projects enforce ownership and revision conflicts, retain bounded restorable backups', async () => {
  const s = await setup(),
    input = draft();
  await expect(s.t.mutation(api.projects.save, input)).rejects.toThrow(
    'Sign in',
  );
  const saved = await s.owner.mutation(api.projects.save, input);
  expect(await s.other.query(api.projects.list, {})).toEqual([]);
  await expect(
    s.other.query(api.projects.get, { projectId: saved.projectId }),
  ).rejects.toThrow('Project not found');
  await expect(
    s.other.mutation(api.projects.save, {
      ...input,
      projectId: saved.projectId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow();
  await expect(
    s.owner.mutation(api.projects.save, {
      ...input,
      projectId: saved.projectId,
      expectedRevision: 0,
    }),
  ).rejects.toThrow('another device');
  for (let revision = 1; revision <= 22; revision++)
    await s.owner.mutation(api.projects.save, {
      ...input,
      name: 'Kitchen ' + revision,
      projectId: saved.projectId,
      expectedRevision: revision,
    });
  const history = await s.owner.query(api.projects.history, {
    projectId: saved.projectId,
  });
  expect(history).toHaveLength(20);
  const backupId = history[0]!._id;
  await expect(
    s.other.query(api.projects.getBackup, { backupId }),
  ).rejects.toThrow('Backup not found');
  const backup = await s.owner.query(api.projects.getBackup, { backupId });
  expect(backup.name).toBe('Kitchen 21');
  const restored = await s.owner.mutation(api.projects.save, {
    name: backup.name,
    designJson: backup.designJson,
    projectId: saved.projectId,
    expectedRevision: 23,
  });
  expect(restored.revision).toBe(24);
});
test('review approvals bind immutable snapshot and expire or revoke for everyone', async () => {
  const s = await setup(),
    input = draft(),
    token = 'a'.repeat(64);
  const saved = await s.owner.mutation(api.projects.save, input);
  const link = await s.owner.mutation(api.projects.createReview, {
    projectId: saved.projectId,
    token,
    expiresInDays: 7,
    expectedRevision: 1,
  });
  await s.owner.mutation(api.projects.save, {
    ...input,
    name: 'Changed kitchen',
    projectId: saved.projectId,
    expectedRevision: 1,
  });
  await expect(
    s.owner.mutation(api.projects.createReview, {
      projectId: saved.projectId,
      token: 'd'.repeat(64),
      expiresInDays: 7,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('Reload before sharing');

  await s.t.mutation(api.projects.addReviewResponse, {
    token,
    name: 'Client',
    text: 'Approved this revision',
    kind: 'approval',
  });
  const review = await s.t.query(api.projects.getReview, { token });
  expect(review?.revision).toBe(1);
  expect(review?.name).toBe('Test kitchen');
  expect(review?.comments[0]?.kind).toBe('approval');
  expect(review?.approvalNotice).toContain('not verified');
  await expect(
    s.t.mutation(api.projects.addReviewResponse, {
      token,
      name: 'Client',
      text: 'Spam',
      kind: 'comment',
    }),
  ).rejects.toThrow('wait');
  await expect(
    s.other.mutation(api.projects.revokeReview, { reviewId: link.reviewId }),
  ).rejects.toThrow('Review not found');
  await expect(
    s.other.query(api.projects.reviewFeedback, { reviewId: link.reviewId }),
  ).rejects.toThrow('Review not found');
  expect(
    (
      await s.owner.query(api.projects.reviewFeedback, {
        reviewId: link.reviewId,
      })
    ).comments,
  ).toHaveLength(1);
  const stored = await s.t.run((ctx) => ctx.db.get(link.reviewId));
  expect(stored?.tokenHash).not.toBe(token);
  await s.owner.mutation(api.projects.revokeReview, {
    reviewId: link.reviewId,
  });
  expect(await s.t.query(api.projects.getReview, { token })).toBeNull();
  await expect(
    s.t.mutation(api.projects.addReviewResponse, {
      token,
      name: 'Client',
      text: 'Late',
      kind: 'comment',
    }),
  ).rejects.toThrow('expired or revoked');
  const secondToken = 'b'.repeat(64),
    second = await s.owner.mutation(api.projects.createReview, {
      projectId: saved.projectId,
      token: secondToken,
      expiresInDays: 1,
      expectedRevision: 2,
    });
  await s.t.run((ctx) =>
    ctx.db.patch(second.reviewId, { expiresAt: Date.now() - 1 }),
  );
  expect(
    await s.t.query(api.projects.getReview, { token: secondToken }),
  ).toBeNull();
});
test('cloud saves reject malformed design and supplier books remain private with conflict checks', async () => {
  const s = await setup();
  await expect(
    s.owner.mutation(api.projects.save, { name: 'Invalid', designJson: '{}' }),
  ).rejects.toThrow();
  const priceBookJson = JSON.stringify({
    supplier: 'Supplier',
    reference: 'Document 123',
    currency: 'USD',
    validUntil: '2026-12-31',
    lines: [
      {
        sku: 'W24',
        finish: 'linen',
        width: 24,
        height: 30,
        depth: 12,
        unitPrice: 123.45,
      },
    ],
  });
  await s.owner.mutation(api.supplierPricing.save, { priceBookJson });
  expect(await s.other.query(api.supplierPricing.get, {})).toBeNull();
  await expect(
    s.owner.mutation(api.supplierPricing.save, {
      priceBookJson,
      expectedRevision: 0,
    }),
  ).rejects.toThrow('another device');
  expect((await s.owner.query(api.supplierPricing.get, {}))?.revision).toBe(1);
  await expect(
    s.owner.mutation(api.supplierPricing.save, {
      priceBookJson: '{}',
      expectedRevision: 1,
    }),
  ).rejects.toThrow();
});
test('catalog evidence stays pending, requires ownership and revision, and cannot approve records', async () => {
  const s = await setup();
  const project = await s.owner.mutation(api.projects.save, draft());
  const ids = await s.t.run(async (ctx) => {
    const ownerId = (await ctx.db.get(project.projectId))!.ownerId;
    const storageId = await ctx.storage.store(new Blob(['test']));
    const documentId = await ctx.db.insert('documents', {
      ownerId,
      name: 'Test',
      manufacturer: 'Test',
      series: 'Test',
      documentVersion: '1',
      storageId,
      sha256: 'test',
      byteLength: 4,
      pageCount: 1,
      status: 'processed',
      createdAt: 0,
    });
    const versionId = await ctx.db.insert('versions', {
      ownerId,
      documentId,
      label: 'Test',
      status: 'review',
      revision: 1,
      coverageJson: '{}',
      origin: 'revision',
      stats: {
        products: 1,
        rules: 0,
        footnotes: 0,
        cases: 0,
        unreviewed: 1,
        approved: 0,
        rejected: 0,
        autoApproved: 0,
      },
      compilerVersion: 'test',
      schemaVersion: '1',
      createdAt: 0,
    });
    const recordId = await ctx.db.insert('records', {
      ownerId,
      versionId,
      entityKey: 'product:W24',
      kind: 'product',
      sku: 'W24',
      category: 'wall',
      family: 'wall',
      pageNumber: 1,
      payloadJson: '{}',
      evidenceJson: '[]',
      confidence: 0.5,
      reviewStatus: 'unreviewed',
      blockers: ['Missing source dimensions'],
      revision: 1,
      truthVerified: false,
      searchText: 'W24',
      createdAt: 0,
      updatedAt: 0,
    });
    return { recordId, versionId };
  });
  const submission = {
    recordId: ids.recordId,
    expectedRevision: 1,
    evidenceReference: 'Supplier PDF page 1',
    evidenceText: 'Width is 24 inches.',
  };
  await expect(
    s.other.mutation(api.catalogReadiness.submitClarification, submission),
  ).rejects.toThrow('Record not found');
  await expect(
    s.owner.mutation(api.catalogReadiness.submitClarification, {
      ...submission,
      expectedRevision: 0,
    }),
  ).rejects.toThrow('Record changed');
  await s.owner.mutation(api.catalogReadiness.submitClarification, submission);
  expect(
    (
      await s.owner.query(api.catalogReadiness.clarifications, {
        recordId: ids.recordId,
      })
    )[0]?.status,
  ).toBe('pending');
  const record = await s.t.run((ctx) => ctx.db.get(ids.recordId));
  expect(record?.reviewStatus).toBe('unreviewed');
  expect(record?.revision).toBe(1);
  expect(record?.truthVerified).toBe(false);
  expect(
    (
      await s.owner.query(api.catalogReadiness.list, {
        versionId: ids.versionId,
        paginationOpts: { numItems: 25, cursor: null },
      })
    ).page[0]?._id,
  ).toBe(ids.recordId);
});

test('scheduled expiry changes review state so public subscriptions are invalidated', async () => {
  vi.useFakeTimers();
  try {
    const s = await setup();
    const saved = await s.owner.mutation(api.projects.save, draft());
    const token = 'c'.repeat(64);
    const link = await s.owner.mutation(api.projects.createReview, {
      projectId: saved.projectId,
      token,
      expiresInDays: 1,
      expectedRevision: 1,
    });
    expect((await s.t.query(api.projects.getReview, { token }))?.revision).toBe(
      1,
    );
    await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await s.t.run((ctx) => ctx.db.get(link.reviewId)))?.revoked).toBe(
      true,
    );
    expect(await s.t.query(api.projects.getReview, { token })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
test('project details have independent optimistic revision and changed designs reset completed stages', async () => {
  const s = await setup(),
    input = draft();
  const { projectId } = await s.owner.mutation(api.projects.save, input);
  const metadata = {
    projectId,
    expectedMetadataRevision: 0,
    clientName: 'Client A',
    workflowStatus: 'approved' as const,
  };
  await expect(
    s.other.mutation(api.projects.updateMetadata, metadata),
  ).rejects.toThrow('Project not found');
  await s.owner.mutation(api.projects.updateMetadata, metadata);
  const before = await s.owner.query(api.projects.get, { projectId });
  expect(before.revision).toBe(1);
  expect(before.metadataRevision).toBe(1);
  expect(before.workflowStatus).toBe('approved');
  await expect(
    s.owner.mutation(api.projects.updateMetadata, metadata),
  ).rejects.toThrow('details changed');
  await s.owner.mutation(api.projects.save, {
    ...input,
    projectId,
    expectedRevision: 1,
  });
  expect(
    (await s.owner.query(api.projects.get, { projectId })).workflowStatus,
  ).toBe('approved');
  await s.owner.mutation(api.projects.save, {
    ...input,
    name: 'Changed',
    projectId,
    expectedRevision: 1,
  });
  const after = await s.owner.query(api.projects.get, { projectId });
  expect(after.revision).toBe(2);
  expect(after.metadataRevision).toBe(2);
  expect(after.workflowStatus).toBe('draft');
  expect(after.clientName).toBe('Client A');
  await s.owner.mutation(api.projects.createReview, {
    projectId,
    expectedRevision: 2,
    expiresInDays: 7,
    token: 'e'.repeat(64),
  });
  const shared = await s.owner.query(api.projects.get, { projectId });
  expect(shared.revision).toBe(2);
  expect(shared.metadataRevision).toBe(3);
  expect(shared.workflowStatus).toBe('awaiting_feedback');
});
test('pinned comments validate immutable snapshot items and approvals stay global', async () => {
  const s = await setup(),
    design = newDesign();
  const { fromObject } = await import('../../src/designer/model');
  const item = fromObject('refrigerator');
  design.items = [item];
  const { projectId } = await s.owner.mutation(api.projects.save, {
    name: 'Pinned',
    designJson: JSON.stringify(design),
  });
  const token = 'f'.repeat(64);
  const { reviewId } = await s.owner.mutation(api.projects.createReview, {
    projectId,
    token,
    expectedRevision: 1,
    expiresInDays: 7,
  });
  await s.owner.mutation(api.projects.save, {
    projectId,
    expectedRevision: 1,
    name: 'Removed refrigerator',
    designJson: JSON.stringify({ ...design, items: [] }),
  });
  const response = {
    token,
    name: 'Reviewer',
    text: 'Move this refrigerator',
    kind: 'comment' as const,
    itemId: item.id,
  };
  await expect(
    s.owner.mutation(api.projects.addReviewResponse, {
      ...response,
      itemId: 'not-in-snapshot',
    }),
  ).rejects.toThrow('not in this shared revision');
  await expect(
    s.t.mutation(api.projects.addReviewResponse, {
      ...response,
      kind: 'approval',
    }),
  ).rejects.toThrow('entire shared design');
  await s.t.mutation(api.projects.addReviewResponse, response);
  expect(
    (await s.t.query(api.projects.getReview, { token }))?.comments[0]?.itemId,
  ).toBe(item.id);
  expect(
    (await s.owner.query(api.projects.reviewFeedback, { reviewId })).comments[0]
      ?.itemId,
  ).toBe(item.id);
});
test('supplier books support independent updates and enforce owner isolation and limits', async () => {
  const s = await setup();
  const priceBookJson = JSON.stringify({
    supplier: 'Supplier',
    reference: 'Doc',
    currency: 'USD',
    validUntil: '2026-12-31',
    lines: [
      {
        sku: 'W24',
        finish: 'linen',
        width: 24,
        height: 30,
        depth: 12,
        unitPrice: 123,
      },
    ],
  });
  const first = await s.owner.mutation(api.supplierPricing.save, {
    priceBookJson,
  });
  const second = await s.owner.mutation(api.supplierPricing.save, {
    priceBookJson,
    createNew: true,
  });
  expect(await s.owner.query(api.supplierPricing.list, {})).toHaveLength(2);
  expect(await s.other.query(api.supplierPricing.list, {})).toEqual([]);
  await expect(
    s.other.mutation(api.supplierPricing.save, {
      priceBookJson,
      priceBookId: second.priceBookId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('not found');
  await s.owner.mutation(api.supplierPricing.save, {
    priceBookJson,
    priceBookId: second.priceBookId,
    expectedRevision: 1,
  });
  expect((await s.owner.query(api.supplierPricing.get, {}))?.revision).toBe(1);
  await s.owner.mutation(api.supplierPricing.save, {
    priceBookJson,
    expectedRevision: 1,
  });
  const books = await s.owner.query(api.supplierPricing.list, {});
  expect(books.find((b) => b._id === first.priceBookId)?.revision).toBe(2);
  for (let i = 0; i < 8; i++)
    await s.owner.mutation(api.supplierPricing.save, {
      priceBookJson,
      createNew: true,
    });
  await expect(
    s.owner.mutation(api.supplierPricing.save, {
      priceBookJson,
      createNew: true,
    }),
  ).rejects.toThrow('limit');
});

test('cloud snapshots preserve household preferences and installer tasks through save and reopen', async () => {
  const s = await setup();
  const design = {
    ...newDesign(),
    selectionBoard: {
      clientName: 'QA client',
      cards: [
        {
          id: 'look',
          name: 'Warm',
          cabinet: 'oak',
          countertop: 'quartz',
          flooring: 'tile',
          hardware: 'brass',
          favorite: true,
          reason: 'Warm finish',
        },
      ],
    },
    storageProfile: {
      household: 4,
      cookware: 'extensive',
      pantry: 'bulk',
      reach: 'low',
      priority: 'drawers',
    },
    siteTasks: [
      {
        id: 'site-1',
        wall: 0,
        title: 'Confirm outlet',
        notes: 'Measured on site',
        status: 'resolved',
        assignee: 'Installer',
        updatedAt: '2026-09-15',
      },
    ],
  };
  const saved = await s.owner.mutation(api.projects.save, {
    name: design.name,
    designJson: JSON.stringify(design),
  });
  const restored = JSON.parse(
    (await s.owner.query(api.projects.get, { projectId: saved.projectId }))
      .designJson,
  );
  expect(restored.storageProfile).toEqual(design.storageProfile);
  expect(restored.siteTasks).toEqual(design.siteTasks);
  expect(restored.selectionBoard).toEqual(design.selectionBoard);
});
