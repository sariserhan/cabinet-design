import type { MutationCtx, QueryCtx } from './_generated/server';
import { MAX_DESIGN_TEXT } from '../src/designer/model';

// Convex documents are limited to 1 MiB, so a design that outgrows a single row
// is split across `designChunks`. Small designs stay inline in their owning row,
// which keeps the common read a single document fetch.
const INLINE_LIMIT = 100_000;
const CHUNK_SIZE = 120_000;
export const MAX_DESIGN_BYTES = MAX_DESIGN_TEXT;
// 6 MB of UTF-8 cannot exceed 6M UTF-16 code units, so 50 parts always suffice.
const MAX_PARTS = 60;

export function designByteLength(designJson: string) {
  return new TextEncoder().encode(designJson).length;
}

export function assertDesignSize(designJson: string) {
  if (designByteLength(designJson) > MAX_DESIGN_BYTES)
    throw Error('Cloud designs are limited to 6 MB');
}

export async function clearDesign(ctx: MutationCtx, parentId: string) {
  const chunks = await ctx.db
    .query('designChunks')
    .withIndex('by_parentId_and_part', (q) => q.eq('parentId', parentId))
    .take(MAX_PARTS);
  for (const chunk of chunks) await ctx.db.delete(chunk._id);
}

/**
 * Persists `designJson` for `parentId` and returns the value to write into that
 * row's `designJson` field: the design itself when it fits inline, otherwise an
 * empty string marking the payload as chunked. A real design never serialises to
 * the empty string, so the marker is unambiguous.
 */
export async function storeDesign(
  ctx: MutationCtx,
  parentId: string,
  designJson: string,
) {
  assertDesignSize(designJson);
  await clearDesign(ctx, parentId);
  if (designByteLength(designJson) <= INLINE_LIMIT) return designJson;
  for (
    let start = 0, part = 0;
    start < designJson.length;
    start += CHUNK_SIZE, part++
  )
    await ctx.db.insert('designChunks', {
      parentId,
      part,
      content: designJson.slice(start, start + CHUNK_SIZE),
    });
  return '';
}

export async function loadDesign(
  ctx: QueryCtx | MutationCtx,
  parentId: string,
  inline: string,
) {
  if (inline) return inline;
  const chunks = await ctx.db
    .query('designChunks')
    .withIndex('by_parentId_and_part', (q) => q.eq('parentId', parentId))
    .take(MAX_PARTS);
  return chunks.map((chunk) => chunk.content).join('');
}
