import { z } from 'zod';
export const directoryEntrySchema = z.object({
  client: z.string().max(160).default(''),
  room: z.string().max(100).default(''),
  tags: z.string().max(300).default(''),
  status: z
    .enum(['draft', 'review', 'approved', 'ordering', 'installed'])
    .default('draft'),
  archived: z.boolean().default(false),
  skus: z.array(z.string().max(100)).max(100).default([]),
  indexedRevision: z.number().int().nonnegative().optional(),
});
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;
export const directorySchema = z
  .record(z.string().min(1).max(100), directoryEntrySchema)
  .refine(
    (d) => Object.keys(d).length <= 500,
    'Directory is limited to 500 projects.',
  );
export function matchesProject(
  name: string,
  entry: DirectoryEntry,
  query: string,
  archived: boolean,
  status: string,
) {
  const haystack = [
    name,
    entry.client,
    entry.room,
    entry.tags,
    entry.status,
    ...entry.skus,
  ]
    .join(' ')
    .toLowerCase();
  return (
    entry.archived === archived &&
    (!status || entry.status === status) &&
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((term) => haystack.includes(term))
  );
}
