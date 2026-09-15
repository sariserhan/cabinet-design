import { replacementSchema, type Replacement } from './replacement-schema';
import { parseDesign } from './model';
import { type Purchase, purchaseLines } from './purchasing';
import { changeImpact } from './design-decisions';
import { overlaps, itemPolygon } from './model';
export function compareReplacement(
  p: Purchase,
  lineId: string,
  replacement: Replacement,
) {
  const r = replacementSchema.parse(replacement),
    before = parseDesign(p.designJson),
    line = purchaseLines(before, p.book).find((l) => l.id === lineId);
  if (!line) throw Error('Purchase line not found.');
  const selected = new Set(line.itemIds);
  const after = {
    ...before,
    items: before.items.map((i) =>
      selected.has(i.id)
        ? { ...i, sku: r.sku, width: r.width, depth: r.depth, height: r.height }
        : i,
    ),
  };
  const impact = changeImpact(before, after);
  const nearby = new Set(impact.affected);
  for (const i of after.items.filter((i) => selected.has(i.id))) {
    const a = itemPolygon(i);
    for (const other of after.items.filter((i) => !selected.has(i.id))) {
      const b = itemPolygon(other);
      const close = a.some((p) =>
        b.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= 24),
      );
      if (close || overlaps(i, other)) nearby.add(other.id);
    }
  }
  const rows = [
    ['SKU', line.sku, r.sku],
    ['Width (in)', line.width, r.width],
    ['Depth (in)', line.depth, r.depth],
    ['Height (in)', line.height, r.height],
    ['Finish', line.finish, r.finish],
    ['Configuration', line.configuration, r.configuration],
  ];
  return {
    before,
    after,
    line,
    rows,
    impact,
    affected: before.items.filter(
      (i) => nearby.has(i.id) && !selected.has(i.id),
    ),
    delta:
      line.unitCents !== null && r.unitPrice !== undefined
        ? (Math.round(r.unitPrice * 100) - line.unitCents) * line.quantity
        : null,
    configurationChanged: line.configuration !== r.configuration,
  };
}
