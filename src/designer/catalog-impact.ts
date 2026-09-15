import { z } from 'zod';
import { type Design } from './model';
import { canonical } from './installer-handoff';
export const catalogSnapshotSchema = z
  .object({
    format: z.literal('kitchen-catalog-snapshot-v1'),
    catalogKey: z.string().trim().min(1).max(160),
    versionId: z.string().min(1).max(100),
    revision: z.string().trim().min(1).max(120),
    source: z.string().trim().min(1).max(1000),
    complete: z.boolean(),
    products: z
      .array(
        z.object({
          sku: z.string().min(1).max(100),
          width: z.number().positive().max(600),
          depth: z.number().positive().max(600),
          height: z.number().positive().max(600),
          compatibility: z.string().max(2000),
        }),
      )
      .max(2000),
  })
  .refine(
    (s) => new Set(s.products.map((p) => p.sku)).size === s.products.length,
    'Each SKU must be unique within the snapshot.',
  );
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export function parseCatalogSnapshot(raw: string) {
  if (raw.length > 600000) throw Error('Catalog snapshot exceeds 600 KB.');
  return catalogSnapshotSchema.parse(JSON.parse(raw));
}
export function catalogImpact(
  before: CatalogSnapshot,
  after: CatalogSnapshot,
  projects: Design[],
) {
  if (before.catalogKey !== after.catalogKey)
    throw Error(
      'Snapshots must identify the same manufacturer and catalog series.',
    );
  const changes = before.products.flatMap((old) => {
    const next = after.products.find((p) => p.sku === old.sku);
    const fields = next
      ? (['width', 'depth', 'height', 'compatibility'] as const).filter(
          (k) => old[k] !== next[k],
        )
      : [after.complete ? 'removed' : 'missing from partial snapshot'];
    return fields.length
      ? [{ sku: old.sku, fields, before: old, after: next ?? null }]
      : [];
  });
  const affected = projects.flatMap((d) =>
    d.items.flatMap((i) => {
      if (i.versionId !== before.versionId) return [];
      const change = changes.find((c) => c.sku === i.sku);
      return change
        ? [
            {
              projectId: d.id,
              project: d.name,
              itemId: i.id,
              sku: i.sku,
              fields: change.fields,
              designDimensions: {
                width: i.width,
                depth: i.depth,
                height: i.height,
              },
            },
          ]
        : [];
    }),
  );
  return {
    beforeSource: before.source,
    afterSource: after.source,
    beforeRevision: before.revision,
    afterRevision: after.revision,
    changes,
    affected,
    scannedProjects: projects.length,
    signature: canonical(projects),
    notice:
      'Imported source records require human verification. No design, approval or compatibility rule is changed by this report.',
  };
}
