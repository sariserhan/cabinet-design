import {
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions';
import { getAuthUserId } from '@convex-dev/auth/server';
import { sha256 } from '@noble/hashes/sha2.js';
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
function constantTimeEqual(left: string, right: string) {
  // Compare fixed-length digests so neither the secret's length nor the
  // position of its first wrong byte is observable through response timing.
  const a = sha256(new TextEncoder().encode(left));
  const b = sha256(new TextEncoder().encode(right));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
export function workerAuthorized(secret: string) {
  const configured = process.env.CATALOG_WORKER_SECRET;
  if (!configured || !constantTimeEqual(secret, configured))
    throw new Error('Worker authorization failed');
}
