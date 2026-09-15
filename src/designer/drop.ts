import { z } from 'zod';
import { canPlace, objectPresets, objectOptions } from './model';
import type { DropItem } from './editing';
const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('object'),
    object: z.string(),
    option: z.string().max(80).optional(),
  }),
  z.object({
    kind: z.literal('product'),
    versionId: z.string().min(1).max(100),
    product: z.object({
      _id: z.string().min(1).max(100),
      sku: z.string().min(1).max(100),
      category: z.string().max(100),
      width: z.number().positive().max(600),
      height: z.number().positive().max(600),
      depth: z.number().positive().max(600),
      pageNumber: z.number().int().positive(),
    }),
  }),
]);
export function parseDrop(text: string): DropItem | null {
  try {
    if (text.length > 5000) return null;
    const value = schema.parse(JSON.parse(text));
    if (value.kind === 'product') return canPlace(value.product) ? value : null;
    if (
      value.option &&
      !objectOptions.some(
        (o) => o.id === value.option && o.kind === value.object,
      )
    )
      return null;
    const preset = objectPresets.find((p) => p.kind === value.object);
    return preset
      ? { kind: 'object', object: preset.kind, option: value.option }
      : null;
  } catch {
    return null;
  }
}

// Native drag data is protected during dragover; retain this tab's validated payload.
let active: DropItem | null = null;
export function setActiveDrop(value: string | null) {
  active = value ? parseDrop(value) : null;
}
export function activeDrop() {
  return active;
}
