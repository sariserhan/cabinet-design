import { z } from 'zod';
import type { Trade, TradeInput } from './trade-estimates';

const spec = z.number().finite().positive().max(1000000);
export const materialProfileSchema = z.object({
  id: z.string().min(1).max(100),
  trade: z.enum(['countertops', 'flooring', 'painting', 'tile']),
  manufacturer: z.string().max(100),
  name: z.string().max(160),
  source: z
    .url()
    .max(500)
    .refine((s) => s.startsWith('https://')),
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(1500),
  wallOnly: z.boolean().optional(),
  specs: z.object({
    slabWidth: spec.optional(),
    slabDepth: spec.optional(),
    boxCoverage: spec.optional(),
    coverage: spec.optional(),
    tileWidth: spec.optional(),
    tileHeight: spec.optional(),
    tilesPerBox: spec.int().optional(),
  }),
});
export type MaterialProfile = z.infer<typeof materialProfileSchema>;
const checkedAt = '2026-09-15';
export const tradeMaterials: MaterialProfile[] = [
  ...['Carrick', 'Brittanicca'].map((name): MaterialProfile => ({
    id: `cambria-${name.toLowerCase()}`,
    trade: 'countertops',
    manufacturer: 'Cambria',
    name,
    source: `https://www.cambriausa.com/quartz-countertops/quartz-colors/designs/${name.toLowerCase()}`,
    checkedAt,
    specs: { slabWidth: 132, slabDepth: 65.5 },
    note: 'Nominal jumbo slab dimensions. Confirm usable area, thickness, finish and vein direction with the fabricator. Slab layout is a rectangular planning estimate.',
  })),
  {
    id: 'coretec-butterscotch-oak',
    trade: 'flooring',
    manufacturer: 'COREtec',
    name: 'Butterscotch Oak · CR504_04069',
    checkedAt,
    source:
      'https://coretecfloors.com/en-us/products/coretec-originals/butterscotch-oak-cr504-04069',
    specs: { boxCoverage: 17.8 },
    note: 'Published carton coverage. Confirm the exact SKU and carton label with your supplier; set waste for the installation pattern.',
  },
  {
    id: 'coretec-calypso-oak',
    trade: 'flooring',
    manufacturer: 'COREtec',
    name: 'Calypso Oak · VV012_00761',
    checkedAt,
    source:
      'https://coretecfloors.com/en-us/products/coretec-originals-enhanced/calypso-oak-vv012-00761',
    specs: { boxCoverage: 23.64 },
    note: 'Published carton coverage for this SKU. Confirm carton label and installation requirements before ordering.',
  },
  {
    id: 'benjamin-moore-regal-matte',
    trade: 'painting',
    manufacturer: 'Benjamin Moore',
    name: 'Regal Select Interior Matte · N548',
    checkedAt,
    source:
      'https://www.benjaminmoore.com/en-us/product/regal-select-waterborne-interior-paint-matte-1-quart-elemental-af-400/N548/ZWB100000002133009',
    specs: { coverage: 400 },
    note: 'Uses the lower end of published 400–450 sq ft per gallon coverage. Color and base are not selected. Coverage depends on substrate and application; confirm coats and primer separately. Enter price per gallon.',
  },
  {
    id: 'daltile-rittenhouse-3x6',
    trade: 'tile',
    manufacturer: 'Daltile',
    name: 'Rittenhouse Square · plain 3 × 6 wall tile',
    checkedAt,
    source:
      'https://digitalassets.daltile.com/content/dam/Daltile/website/resources/products/sales-sheets/rittenhouse-square/DAL_RittenhouseSquare_SS.pdf',
    specs: { tileWidth: 3, tileHeight: 6, tilesPerBox: 100 },
    wallOnly: true,
    note: 'Plain wall tile: 100 pieces / 12.5 sq ft per carton. Does not cover bevel or mosaic packaging. Source sheet dated 2019; confirm current color, finish, stock and packaging. Wall / backsplash use only.',
  },
];

export function materialMatches(input: TradeInput): boolean {
  const m = input.materialCatalog;
  return (
    !!m &&
    input.product === `${m.manufacturer} · ${m.name}` &&
    Object.entries(m.specs).every(
      ([key, value]) => input[key as keyof TradeInput] === value,
    )
  );
}
export function applyTradeMaterial(
  trade: Trade,
  input: TradeInput,
  profile: MaterialProfile,
): TradeInput {
  const m = materialProfileSchema.parse(profile);
  if (m.trade !== trade)
    throw new Error('Material belongs to a different trade.');
  return {
    ...input,
    slabWidth: m.specs.slabWidth ?? input.slabWidth,
    slabDepth: m.specs.slabDepth ?? input.slabDepth,
    boxCoverage: m.specs.boxCoverage ?? input.boxCoverage,
    coverage: m.specs.coverage ?? input.coverage,
    tileWidth: m.specs.tileWidth ?? input.tileWidth,
    tileHeight: m.specs.tileHeight ?? input.tileHeight,
    tilesPerBox: m.specs.tilesPerBox ?? input.tilesPerBox,
    product: `${m.manufacturer} · ${m.name}`,
    materialPrice: null,
    reference: '',
    materialCatalog: m,
  };
}
