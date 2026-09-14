import {
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
async function identify(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Sign in to access your catalog workspace');
  return { userId };
}
export const ownedQuery = customQuery(query, customCtx(identify));
export const ownedMutation = customMutation(mutation, customCtx(identify));
export async function ownedVersion(
  ctx: QueryCtx | MutationCtx,
  versionId: Id<'versions'>,
  userId: Id<'users'>,
  editable = false,
) {
  const version = await ctx.db.get(versionId);
  if (!version || version.ownerId !== userId)
    throw new Error('Catalog version not found');
  if (
    editable &&
    (version.status === 'published' || version.status === 'superseded')
  )
    throw new Error('Published versions are immutable; create a revision');
  return version;
}
export async function ownedDocument(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<'documents'>,
  userId: Id<'users'>,
) {
  const document = await ctx.db.get(documentId);
  if (!document || document.ownerId !== userId)
    throw new Error('Document not found');
  return document;
}
export async function actorKind(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
) {
  return (
    (
      await ctx.db
        .query('reviewerProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique()
    )?.actorKind ?? 'human'
  );
}
export function workerAuthorized(secret: string) {
  const configured = process.env.CATALOG_WORKER_SECRET;
  if (!configured || secret !== configured)
    throw new Error('Worker authorization failed');
}
