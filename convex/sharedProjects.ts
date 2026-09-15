import { v } from 'convex/values';
import { ownedQuery, ownedMutation } from './access';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { parseProjectBackup } from '../src/designer/project-backup';
const role = v.union(
  v.literal('owner'),
  v.literal('editor'),
  v.literal('viewer'),
);
const summary = v.object({
  id: v.id('sharedProjects'),
  name: v.string(),
  designId: v.string(),
  revision: v.number(),
  updatedAt: v.number(),
  role,
});
async function lookupAccess(
  ctx: QueryCtx | MutationCtx,
  sharedId: Id<'sharedProjects'>,
  userId: Id<'users'>,
) {
  const project = await ctx.db.get(sharedId);
  if (!project) return null;
  const member =
    project.ownerId === userId
      ? null
      : await ctx.db
          .query('sharedProjectMembers')
          .withIndex('by_sharedId_and_userId', (q) =>
            q.eq('sharedId', sharedId).eq('userId', userId),
          )
          .unique();
  const role = project.ownerId === userId ? ('owner' as const) : member?.role;
  if (!role) return null;
  return { project, role };
}
async function access(
  ctx: QueryCtx | MutationCtx,
  sharedId: Id<'sharedProjects'>,
  userId: Id<'users'>,
) {
  const result = await lookupAccess(ctx, sharedId, userId);
  if (!result) throw Error('Shared project not found');
  return result;
}
export const list = ownedQuery({
  args: {},
  returns: v.array(summary),
  handler: async (ctx) => {
    const own = await ctx.db
      .query('sharedProjects')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
      .take(20);
    const memberships = await ctx.db
      .query('sharedProjectMembers')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .take(100);
    const others = await Promise.all(
      memberships.map(async (m) => ({
        project: await ctx.db.get(m.sharedId),
        role: m.role,
      })),
    );
    return [
      ...own.map((project) => ({ project, role: 'owner' as const })),
      ...others,
    ].flatMap(({ project: p, role }) =>
      p
        ? [
            {
              id: p._id,
              name: p.name,
              designId: p.designId,
              revision: p.revision,
              updatedAt: p.updatedAt,
              role,
            },
          ]
        : [],
    );
  },
});
export const get = ownedQuery({
  args: { sharedId: v.id('sharedProjects') },
  returns: v.object({
    revision: v.number(),
    role,
    backupJson: v.string(),
    updatedBy: v.id('users'),
  }),
  handler: async (ctx, args) => {
    const { project, role } = await access(ctx, args.sharedId, ctx.userId);
    const chunks = await ctx.db
      .query('sharedProjectChunks')
      .withIndex('by_sharedId_and_part', (q) => q.eq('sharedId', args.sharedId))
      .take(60);
    return {
      revision: project.revision,
      role,
      backupJson: chunks.map((c) => c.content).join(''),
      updatedBy: project.updatedBy,
    };
  },
});
export const publish = ownedMutation({
  args: {
    sharedId: v.optional(v.id('sharedProjects')),
    expectedRevision: v.number(),
    backupJson: v.string(),
  },
  returns: v.union(
    v.object({ sharedId: v.id('sharedProjects'), revision: v.number() }),
    v.object({ error: v.string() }),
  ),
  handler: async (ctx, args) => {
    if (new TextEncoder().encode(args.backupJson).length > 6000000)
      throw Error('Shared projects are limited to 6 MB.');
    // Cross-account data never creates verified source, approval or completion attestations.
    const backup = parseProjectBackup(args.backupJson),
      content = JSON.stringify(backup);
    let sharedId = args.sharedId,
      revision = 1;
    if (sharedId) {
      const membership = await lookupAccess(ctx, sharedId, ctx.userId);
      if (!membership) return { error: 'Shared project not found' };
      const { project, role } = membership;
      if (role === 'viewer') return { error: 'Viewers cannot publish changes' };
      if (project.revision !== args.expectedRevision)
        return {
          error:
            'Shared project changed. Load the latest revision before publishing.',
        };
      if (project.designId !== backup.design.id)
        return { error: 'Design identity does not match the shared project' };
      revision = project.revision + 1;
      await ctx.db.patch(sharedId, {
        name: backup.design.name,
        revision,
        updatedAt: Date.now(),
        updatedBy: ctx.userId,
      });
      const chunks = await ctx.db
        .query('sharedProjectChunks')
        .withIndex('by_sharedId_and_part', (q) => q.eq('sharedId', project._id))
        .take(60);
      for (const c of chunks) await ctx.db.delete(c._id);
    } else {
      if (args.expectedRevision !== 0)
        throw Error('New shared projects start at revision zero');
      if (
        (
          await ctx.db
            .query('sharedProjects')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ctx.userId))
            .take(20)
        ).length >= 20
      )
        throw Error('Shared project limit reached (20)');
      sharedId = await ctx.db.insert('sharedProjects', {
        ownerId: ctx.userId,
        designId: backup.design.id,
        name: backup.design.name,
        revision,
        updatedAt: Date.now(),
        updatedBy: ctx.userId,
      });
    }
    // Bound each document well below Convex's 1 MiB limit, including non-ASCII text.
    for (
      let start = 0, part = 0;
      start < content.length;
      start += 120000, part++
    )
      await ctx.db.insert('sharedProjectChunks', {
        sharedId,
        part,
        content: content.slice(start, start + 120000),
      });
    return { sharedId, revision };
  },
});
export const members = ownedQuery({
  args: { sharedId: v.id('sharedProjects') },
  returns: v.array(v.object({ userId: v.id('users'), role })),
  handler: async (ctx, args) => {
    const { project, role } = await access(ctx, args.sharedId, ctx.userId);
    if (role !== 'owner') throw Error('Only the owner can manage members');
    const members = await ctx.db
      .query('sharedProjectMembers')
      .withIndex('by_sharedId_and_userId', (q) =>
        q.eq('sharedId', args.sharedId),
      )
      .take(20);
    return [
      { userId: project.ownerId, role: 'owner' as const },
      ...members.map((m) => ({ userId: m.userId, role: m.role })),
    ];
  },
});
export const setMember = ownedMutation({
  args: {
    sharedId: v.id('sharedProjects'),
    userId: v.id('users'),
    role: v.union(
      v.literal('editor'),
      v.literal('viewer'),
      v.literal('remove'),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project, role } = await access(ctx, args.sharedId, ctx.userId);
    if (role !== 'owner') throw Error('Only the owner can manage members');
    if (args.userId === project.ownerId)
      throw Error('Owner access cannot be changed');
    if (!(await ctx.db.get(args.userId))) throw Error('Account not found');
    const old = await ctx.db
      .query('sharedProjectMembers')
      .withIndex('by_sharedId_and_userId', (q) =>
        q.eq('sharedId', args.sharedId).eq('userId', args.userId),
      )
      .unique();
    if (args.role === 'remove') {
      if (old) await ctx.db.delete(old._id);
      return null;
    }
    if (old) await ctx.db.patch(old._id, { role: args.role });
    else {
      if (
        (
          await ctx.db
            .query('sharedProjectMembers')
            .withIndex('by_sharedId_and_userId', (q) =>
              q.eq('sharedId', args.sharedId),
            )
            .take(20)
        ).length >= 20
      )
        throw Error('Member limit reached (20)');
      if (
        (
          await ctx.db
            .query('sharedProjectMembers')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .take(100)
        ).length >= 100
      )
        throw Error('Account shared-project limit reached');
      await ctx.db.insert('sharedProjectMembers', {
        sharedId: args.sharedId,
        userId: args.userId,
        role: args.role,
      });
    }
    return null;
  },
});
