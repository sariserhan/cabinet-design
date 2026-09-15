import { z } from 'zod';
import {
  type Design,
  type Cabinet,
  designSchema,
  itemSchema,
  isOpening,
  itemPolygon,
  warnings,
} from './model';
import { canonical } from './installer-handoff';
export const assemblyTemplateSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(120),
    notes: z.string().max(2000),
    createdAt: z.string().datetime(),
    items: z.array(itemSchema).min(1).max(40),
  })
  .superRefine((t, ctx) => {
    const ids = new Set(t.items.map((i) => i.id));
    if (ids.size !== t.items.length || t.items.some((i) => isOpening(i)))
      ctx.addIssue({
        code: 'custom',
        message: 'Templates require unique non-opening items.',
      });
    if (
      t.items.some(
        (i) =>
          (i.sinkMount && !ids.has(i.sinkMount.hostId)) ||
          (i.opening && !ids.has(i.opening.hostId)),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Include all linked hosts in the assembly.',
      });
  });
export type AssemblyTemplate = z.infer<typeof assemblyTemplateSchema>;
export const assemblyLibrarySchema = z
  .object({
    format: z.literal('kitchen-assembly-library-v1'),
    templates: z.array(assemblyTemplateSchema).max(20),
  })
  .refine(
    (l) => new Set(l.templates.map((t) => t.id)).size === l.templates.length,
    'Duplicate assembly template IDs.',
  );
export function parseAssemblyLibrary(raw: string) {
  if (raw.length > 1500000) throw Error('Assembly library exceeds 1.5 MB.');
  return assemblyLibrarySchema.parse(JSON.parse(raw));
}
export function captureAssembly(
  d: Design,
  ids: string[],
  name: string,
  notes: string,
): AssemblyTemplate {
  const included = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of d.items) {
      if (included.has(i.id)) {
        for (const other of d.items)
          if (
            (i.assemblyId && i.assemblyId === other.assemblyId) ||
            other.id === i.sinkMount?.hostId ||
            other.id === i.opening?.hostId ||
            other.sinkMount?.hostId === i.id
          ) {
            if (!included.has(other.id)) {
              included.add(other.id);
              changed = true;
            }
          }
      }
    }
  }
  const members = d.items.filter((i) => included.has(i.id));
  if (!members.length) throw Error('Select at least one item.');
  const points = members.flatMap(itemPolygon),
    minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  const items = members.map((i) => {
    const installation = i.installation ? { ...i.installation } : undefined;
    if (installation) {
      delete installation.serviceX;
      delete installation.serviceY;
      delete installation.serviceZ;
    }
    return {
      ...i,
      x: i.x - minX,
      y: i.y - minY,
      finish: i.finish ?? d.finish,
      ...(i.kind === 'countertop'
        ? { countertop: i.countertop ?? d.appearance?.countertop ?? 'quartz' }
        : {}),
      ...(installation ? { installation } : {}),
      locked: false,
      wall: null,
      wallSegment: null,
    };
  });
  return assemblyTemplateSchema.parse({
    id: crypto.randomUUID(),
    name,
    notes,
    createdAt: new Date().toISOString(),
    items,
  });
}
export function placeAssembly(
  d: Design,
  template: AssemblyTemplate,
  x: number,
  y: number,
): Design {
  const t = assemblyTemplateSchema.parse(template);
  if (d.items.length + t.items.length > 100)
    throw Error('This assembly would exceed the 100-item design limit.');
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw Error('Enter valid placement coordinates.');
  const ids = new Map(t.items.map((i) => [i.id, crypto.randomUUID()])),
    assemblyId = crypto.randomUUID();
  const items: Cabinet[] = t.items.map((i) => {
    const id = ids.get(i.id);
    if (!id) throw Error('Missing item identity.');
    return {
      ...i,
      id,
      assemblyId,
      locked: false,
      x: i.x + x,
      y: i.y + y,
      wall: null,
      wallSegment: null,
      ...(i.sinkMount
        ? {
            sinkMount: {
              ...i.sinkMount,
              hostId: ids.get(i.sinkMount.hostId) ?? '',
            },
          }
        : {}),
      ...(i.opening
        ? { opening: { ...i.opening, hostId: ids.get(i.opening.hostId) ?? '' } }
        : {}),
    };
  });
  return designSchema.parse({ ...d, items: [...d.items, ...items] });
}
export function assemblyPlacementIssues(before: Design, after: Design) {
  const original = new Set(warnings(before).map((w) => canonical(w)));
  const ids = new Set(
    after.items
      .filter((i) => !before.items.some((o) => o.id === i.id))
      .map((i) => i.id),
  );
  return warnings(after).filter(
    (w) => w.itemIds.some((id) => ids.has(id)) && !original.has(canonical(w)),
  );
}

export function assemblyPlacementBlock(before: Design, after: Design) {
  return (
    assemblyPlacementIssues(before, after).find((w) =>
      /^(outside|overlap|ceiling|sink)-/.test(w.id),
    )?.message ?? null
  );
}
