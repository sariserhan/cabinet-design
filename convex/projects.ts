import { v } from 'convex/values';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ownedQuery, ownedMutation } from './access';
import { query, mutation, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { projectStage } from './schema';
import {
  assertDesignSize,
  clearDesign,
  loadDesign,
  storeDesign,
} from './designBlob';
import { parseDesign } from '../src/designer/model';

const summary = {
  clientName: v.string(),
  workflowStatus: projectStage,
  metadataRevision: v.number(),
  _id: v.id('projects'),
  name: v.string(),
  revision: v.number(),
  updatedAt: v.number(),
};
const responseKind = v.union(v.literal('comment'), v.literal('approval'));
async function ownedProject(
  ctx: QueryCtx | MutationCtx,
  id: Id<'projects'>,
  userId: Id<'users'>,
) {
  const project = await ctx.db.get(id);
  if (!project || project.ownerId !== userId) throw Error('Project not found');
  return project;
}
function hashToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid review token');
  return bytesToHex(sha256(new TextEncoder().encode(token)));
}
async function activeReview(ctx: QueryCtx | MutationCtx, token: string) {
  const review = await ctx.db
    .query('projectReviews')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hashToken(token)))
    .unique();
  return review && !review.revoked && review.expiresAt > Date.now()
    ? review
    : null;
}
export const list = ownedQuery({
  args: {},
  returns: v.array(v.object(summary)),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
      .order('desc')
      .take(50);
    return rows.map(
      ({
        _id,
        name,
        revision,
        updatedAt,
        clientName,
        workflowStatus,
        metadataRevision,
      }) => ({
        clientName: clientName ?? '',
        workflowStatus: workflowStatus ?? 'draft',
        metadataRevision: metadataRevision ?? 0,
        _id,
        name,
        revision,
        updatedAt,
      }),
    );
  },
});
export const get = ownedQuery({
  args: { projectId: v.id('projects') },
  returns: v.object({ ...summary, designJson: v.string() }),
  handler: async (ctx, args) => {
    const {
      _id,
      name,
      revision,
      updatedAt,
      designJson,
      clientName,
      workflowStatus,
      metadataRevision,
    } = await ownedProject(ctx, args.projectId, ctx.userId);
    return {
      _id,
      name,
      revision,
      updatedAt,
      designJson: await loadDesign(ctx, _id, designJson),
      clientName: clientName ?? '',
      workflowStatus: workflowStatus ?? 'draft',
      metadataRevision: metadataRevision ?? 0,
    };
  },
});
export const save = ownedMutation({
  args: {
    projectId: v.optional(v.id('projects')),
    expectedRevision: v.optional(v.number()),
    name: v.string(),
    designJson: v.string(),
  },
  returns: v.object({ projectId: v.id('projects'), revision: v.number() }),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name || name.length > 120)
      throw Error('Project name required (max 120 characters)');
    assertDesignSize(args.designJson);
    const designJson = JSON.stringify(parseDesign(args.designJson));
    const now = Date.now();
    if (!args.projectId) {
      if (
        (
          await ctx.db
            .query('projects')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
            .take(50)
        ).length >= 50
      )
        throw Error('Project limit reached (50)');
      const projectId = await ctx.db.insert('projects', {
        ownerId: ctx.userId,
        name,
        designJson: '',
        revision: 1,
        updatedAt: now,
      });
      await ctx.db.patch(projectId, {
        designJson: await storeDesign(ctx, projectId, designJson),
      });
      return { projectId, revision: 1 };
    }
    const project = await ownedProject(ctx, args.projectId, ctx.userId);
    if (args.expectedRevision !== project.revision)
      throw Error('Project changed on another device. Reload before saving.');
    const previousJson = await loadDesign(ctx, project._id, project.designJson);
    if (name === project.name && designJson === previousJson)
      return { projectId: project._id, revision: project.revision };
    const backups = await ctx.db
      .query('projectBackups')
      .withIndex('by_projectId', (q) => q.eq('projectId', project._id))
      .order('asc')
      .take(20);
    if (backups.length >= 20 && backups[0]) {
      await clearDesign(ctx, backups[0]._id);
      await ctx.db.delete(backups[0]._id);
    }
    const backupId = await ctx.db.insert('projectBackups', {
      ownerId: ctx.userId,
      projectId: project._id,
      name: project.name,
      designJson: '',
      revision: project.revision,
      createdAt: now,
    });
    await ctx.db.patch(backupId, {
      designJson: await storeDesign(ctx, backupId, previousJson),
    });
    await ctx.db.patch(project._id, {
      name,
      designJson: await storeDesign(ctx, project._id, designJson),
      revision: project.revision + 1,
      ...(project.workflowStatus === 'approved' ||
      project.workflowStatus === 'ordered'
        ? {
            workflowStatus: 'draft' as const,
            metadataRevision: (project.metadataRevision ?? 0) + 1,
          }
        : {}),
      updatedAt: now,
    });
    return { projectId: project._id, revision: project.revision + 1 };
  },
});
export const history = ownedQuery({
  args: { projectId: v.id('projects') },
  returns: v.array(
    v.object({
      _id: v.id('projectBackups'),
      revision: v.number(),
      name: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await ownedProject(ctx, args.projectId, ctx.userId);
    return (
      await ctx.db
        .query('projectBackups')
        .withIndex('by_projectId', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(20)
    ).map(({ _id, revision, name, createdAt }) => ({
      _id,
      revision,
      name,
      createdAt,
    }));
  },
});
export const getBackup = ownedQuery({
  args: { backupId: v.id('projectBackups') },
  returns: v.object({
    designJson: v.string(),
    name: v.string(),
    revision: v.number(),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.backupId);
    if (!row || row.ownerId !== ctx.userId) throw Error('Backup not found');
    return {
      designJson: await loadDesign(ctx, row._id, row.designJson),
      name: row.name,
      revision: row.revision,
    };
  },
});
export const createReview = ownedMutation({
  args: {
    projectId: v.id('projects'),
    token: v.string(),
    expiresInDays: v.number(),
    expectedRevision: v.number(),
  },
  returns: v.object({
    reviewId: v.id('projectReviews'),
    expiresAt: v.number(),
    revision: v.number(),
  }),
  handler: async (ctx, args) => {
    const p = await ownedProject(ctx, args.projectId, ctx.userId);
    if (p.revision !== args.expectedRevision)
      throw Error('Project changed on another device. Reload before sharing.');
    if (
      !Number.isInteger(args.expiresInDays) ||
      args.expiresInDays < 1 ||
      args.expiresInDays > 90
    )
      throw Error('Review expiry must be 1–90 days');
    const tokenHash = hashToken(args.token);
    if (
      await ctx.db
        .query('projectReviews')
        .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
        .unique()
    )
      throw Error('Use a fresh review token');
    if (
      (
        await ctx.db
          .query('projectReviews')
          .withIndex('by_projectId', (q) => q.eq('projectId', p._id))
          .take(100)
      ).length >= 100
    )
      throw Error('Review link limit reached (100)');
    const expiresAt = Date.now() + args.expiresInDays * 86400000;
    const reviewId = await ctx.db.insert('projectReviews', {
      ownerId: ctx.userId,
      projectId: p._id,
      tokenHash,
      name: p.name,
      revision: p.revision,
      expiresAt,
      revoked: false,
      createdAt: Date.now(),
      responseCount: 0,
    });
    const snapshotId = await ctx.db.insert('reviewSnapshots', {
      reviewId,
      designJson: '',
    });
    await ctx.db.patch(snapshotId, {
      designJson: await storeDesign(
        ctx,
        snapshotId,
        await loadDesign(ctx, p._id, p.designJson),
      ),
    });
    if (!p.workflowStatus || p.workflowStatus === 'draft')
      await ctx.db.patch(p._id, {
        workflowStatus: 'awaiting_feedback',
        metadataRevision: (p.metadataRevision ?? 0) + 1,
      });
    await ctx.scheduler.runAt(expiresAt, internal.projects.expireReview, {
      reviewId,
    });
    return { reviewId, expiresAt, revision: p.revision };
  },
});
export const listReviews = ownedQuery({
  args: { projectId: v.id('projects') },
  returns: v.array(
    v.object({
      _id: v.id('projectReviews'),
      revision: v.number(),
      expiresAt: v.number(),
      revoked: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await ownedProject(ctx, args.projectId, ctx.userId);
    return (
      await ctx.db
        .query('projectReviews')
        .withIndex('by_projectId', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(100)
    ).map(({ _id, revision, expiresAt, revoked, createdAt }) => ({
      _id,
      revision,
      expiresAt,
      revoked,
      createdAt,
    }));
  },
});
export const revokeReview = ownedMutation({
  args: { reviewId: v.id('projectReviews') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reviewId);
    if (!row || row.ownerId !== ctx.userId) throw Error('Review not found');
    await ctx.db.patch(row._id, { revoked: true });
    return null;
  },
});
export const getReview = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      designJson: v.string(),
      revision: v.number(),
      expiresAt: v.number(),
      approvalNotice: v.string(),
      comments: v.array(
        v.object({
          name: v.string(),
          text: v.string(),
          kind: responseKind,
          itemId: v.optional(v.string()),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await activeReview(ctx, args.token);
    if (!row) return null;
    const comments = (
      await ctx.db
        .query('projectResponses')
        .withIndex('by_reviewId', (q) => q.eq('reviewId', row._id))
        .take(100)
    ).map(({ name, text, kind, createdAt, itemId }) => ({
      ...(itemId === undefined ? {} : { itemId }),
      name,
      text,
      kind,
      createdAt,
    }));
    const snapshot = await ctx.db
      .query('reviewSnapshots')
      .withIndex('by_reviewId', (q) => q.eq('reviewId', row._id))
      .unique();
    if (!snapshot) return null;
    return {
      name: row.name,
      designJson: await loadDesign(ctx, snapshot._id, snapshot.designJson),
      revision: row.revision,
      expiresAt: row.expiresAt,
      comments,
      approvalNotice:
        'Approval records the entered name and this shared revision. Identity is not verified; this is not a signed contract.',
    };
  },
});
export const addReviewResponse = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    text: v.string(),
    kind: responseKind,
    itemId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await activeReview(ctx, args.token);
    if (!row) throw Error('Review link expired or revoked');
    if (args.itemId !== undefined) {
      if (args.kind !== 'comment')
        throw Error('Approvals apply to the entire shared design');
      const snapshot = await ctx.db
        .query('reviewSnapshots')
        .withIndex('by_reviewId', (q) => q.eq('reviewId', row._id))
        .unique();
      if (
        !snapshot ||
        !parseDesign(
          await loadDesign(ctx, snapshot._id, snapshot.designJson),
        ).items.some((item) => item.id === args.itemId)
      )
        throw Error('Pinned item is not in this shared revision');
    }
    const name = args.name.trim(),
      text = args.text.trim();
    if (
      !name ||
      name.length > 100 ||
      text.length > 2000 ||
      (!text && args.kind === 'comment')
    )
      throw Error('Enter a name and comment (max 2000 characters)');
    const now = Date.now();
    if (row.responseCount >= 100) throw Error('Review response limit reached');
    if (row.lastResponseAt !== undefined && now - row.lastResponseAt < 3000)
      throw Error('Please wait a few seconds before responding again');
    await ctx.db.insert('projectResponses', {
      reviewId: row._id,
      name,
      text,
      kind: args.kind,
      ...(args.itemId === undefined ? {} : { itemId: args.itemId }),
      createdAt: now,
      revision: row.revision,
    });
    await ctx.db.patch(row._id, {
      responseCount: row.responseCount + 1,
      lastResponseAt: now,
    });
    return null;
  },
});
export const reviewFeedback = ownedQuery({
  args: { reviewId: v.id('projectReviews') },
  returns: v.object({
    revision: v.number(),
    comments: v.array(
      v.object({
        name: v.string(),
        text: v.string(),
        kind: responseKind,
        itemId: v.optional(v.string()),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reviewId);
    if (!row || row.ownerId !== ctx.userId) throw Error('Review not found');
    const comments = (
      await ctx.db
        .query('projectResponses')
        .withIndex('by_reviewId', (q) => q.eq('reviewId', row._id))
        .take(100)
    ).map(({ name, text, kind, createdAt, itemId }) => ({
      ...(itemId === undefined ? {} : { itemId }),
      name,
      text,
      kind,
      createdAt,
    }));
    return { revision: row.revision, comments };
  },
});

// Writing the review invalidates cached queries when the expiry time arrives.
export const expireReview = internalMutation({
  args: { reviewId: v.id('projectReviews') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reviewId);
    if (row && !row.revoked && row.expiresAt <= Date.now()) {
      await ctx.db.patch(row._id, { revoked: true });
    }
    return null;
  },
});

export const updateMetadata = ownedMutation({
  args: {
    projectId: v.id('projects'),
    expectedMetadataRevision: v.number(),
    clientName: v.string(),
    workflowStatus: projectStage,
  },
  returns: v.object({ metadataRevision: v.number() }),
  handler: async (ctx, args) => {
    const row = await ownedProject(ctx, args.projectId, ctx.userId);
    if ((row.metadataRevision ?? 0) !== args.expectedMetadataRevision)
      throw Error('Project details changed. Reload before updating.');
    const clientName = args.clientName.trim();
    if (clientName.length > 160)
      throw Error('Client name must be at most 160 characters');
    const metadataRevision = (row.metadataRevision ?? 0) + 1;
    await ctx.db.patch(row._id, {
      clientName,
      workflowStatus: args.workflowStatus,
      metadataRevision,
    });
    return { metadataRevision };
  },
});
