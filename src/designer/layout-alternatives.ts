import {
  designSchema,
  itemPolygon,
  placementCollision,
  updateAssembly,
  warnings,
  type Cabinet,
  type Design,
} from './model';
import { roomEdges, roomOutline, polygonInside, ceilingAt } from './room';

// Whole assemblies move together. Plumbing, appliances, openings and locked parts stay fixed.
export function layoutAlternatives(design: Design) {
  const groups: Cabinet[][] = [],
    seen = new Set<string>();
  for (const item of design.items) {
    if (seen.has(item.id) || !['cabinet', 'custom_cabinet'].includes(item.kind))
      continue;
    const group = item.assemblyId
      ? design.items.filter((i) => i.assemblyId === item.assemblyId)
      : [item];
    group.forEach((i) => seen.add(i.id));
    if (
      group.some(
        (i) =>
          i.locked ||
          ![
            'cabinet',
            'custom_cabinet',
            'countertop',
            'toe_kick',
            'filler',
            'trim',
            'molding',
          ].includes(i.kind),
      )
    )
      continue;
    groups.push([item, ...group.filter((i) => i.id !== item.id)]);
  }
  if (!groups.length)
    throw Error(
      'Add unlocked cabinets to generate alternatives. Assemblies with sinks, appliances or locked parts remain fixed.',
    );
  const movable = new Set(groups.flat().map((i) => i.id));
  const fixed = design.items.filter((i) => !movable.has(i.id));
  const edges = roomEdges(design.room).filter(
    (e) => !e.curved && design.room.walls[e.side],
  );
  const boundary = roomOutline(design.room);
  const results: {
    name: string;
    design: Design;
    moved: number;
    warnings: number;
  }[] = [];
  const signature = (d: Design) =>
    JSON.stringify(d.items.map((i) => [i.id, i.x, i.y, i.rotation]));
  const signatures = new Set([signature(design)]);
  for (
    let trial = 0;
    trial < Math.min(edges.length * 2, 24) && results.length < 3;
    trial++
  ) {
    let placed = [...fixed];
    const order = trial % 2 ? [...groups].reverse() : groups;
    let success = true;
    for (const group of order) {
      let found: Cabinet[] | null = null;
      for (let e = 0; e < edges.length && !found; e++) {
        const edge = edges[(Math.floor(trial / 2) + e) % edges.length];
        if (!edge) continue;
        const dx = (edge.b.x - edge.a.x) / edge.length,
          dy = (edge.b.y - edge.a.y) / edge.length;
        const rotation = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const item = group[0];
        if (!item) continue;
        const rotated = updateAssembly({ ...design, items: group }, item.id, {
          x: 0,
          y: 0,
          rotation,
        }).items;
        const points = rotated.flatMap((i) => itemPolygon(i));
        const u = points.map((p) => p.x * dx + p.y * dy),
          v = points.map((p) => -p.x * dy + p.y * dx);
        const minU = Math.min(...u),
          maxU = Math.max(...u),
          minV = Math.min(...v);
        for (
          let offset = 0;
          offset <= edge.length - (maxU - minU) && !found;
          offset += 3
        ) {
          const x = edge.a.x + dx * (offset - minU) + dy * minV;
          const y = edge.a.y + dy * (offset - minU) - dx * minV;
          const moved = updateAssembly({ ...design, items: group }, item.id, {
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            rotation,
          }).items;
          if (
            moved.every(
              (i) =>
                polygonInside(itemPolygon(i), boundary) &&
                i.elevation + i.height <=
                  Math.min(
                    ...itemPolygon(i).map((p) =>
                      ceilingAt(design.room, p.x, p.y),
                    ),
                  ) &&
                placed.every((p) => !placementCollision(i, p)),
            )
          )
            found = moved;
        }
      }
      if (!found) {
        success = false;
        break;
      }
      placed = [...placed, ...found];
    }
    if (!success) continue;
    const byId = new Map(placed.map((i) => [i.id, i]));
    const candidate = designSchema.parse({
      ...design,
      items: design.items.map((i) => byId.get(i.id) ?? i),
    });
    const key = signature(candidate);
    if (signatures.has(key)) continue;
    signatures.add(key);
    results.push({
      name: `Option ${results.length + 1}`,
      design: candidate,
      moved: candidate.items.filter(
        (i, index) =>
          JSON.stringify([i.x, i.y, i.rotation]) !==
          JSON.stringify([
            design.items[index]?.x,
            design.items[index]?.y,
            design.items[index]?.rotation,
          ]),
      ).length,
      warnings: warnings(candidate).length,
    });
  }
  if (!results.length)
    throw Error(
      'No different layout fits while preserving fixed objects and cabinet sizes. Try unlocking cabinets or freeing wall space.',
    );
  return results;
}
