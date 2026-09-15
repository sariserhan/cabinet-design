import {
  type Design,
  designSchema,
  warnings,
  isOpening,
  itemPolygon,
} from './model';
import { canonical } from './installer-handoff';
export function suggestedMoves(d: Design, warningId: string) {
  const issues = warnings(d),
    issue = issues.find((w) => w.id === warningId);
  if (!issue || !/^(outside|overlap)-/.test(issue.id)) return [];
  const original = new Set(issues.map((w) => canonical(w)));
  const results: {
    label: string;
    design: Design;
    resolved: number;
    ids: string[];
  }[] = [];
  for (const itemId of issue.itemIds) {
    const ids = new Set([itemId]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const i of d.items)
        if (ids.has(i.id))
          for (const peer of d.items)
            if (
              (i.assemblyId && i.assemblyId === peer.assemblyId) ||
              i.sinkMount?.hostId === peer.id ||
              peer.sinkMount?.hostId === i.id ||
              peer.opening?.hostId === i.id
            ) {
              if (!ids.has(peer.id)) {
                ids.add(peer.id);
                expanded = true;
              }
            }
    }
    const members = d.items.filter((i) => ids.has(i.id));
    if (
      members.some(
        (i) =>
          i.locked ||
          isOpening(i) ||
          i.kind === 'partition' ||
          i.kind === 'column' ||
          i.kind === 'beam',
      )
    )
      continue;
    // Small bounded search, nearest translation first. No dimensions or service coordinates are invented.
    const points = members.flatMap(itemPolygon),
      offsets: [number, number][] = [];
    offsets.push(
      [-Math.min(...points.map((p) => p.x)), 0],
      [d.room.width - Math.max(...points.map((p) => p.x)), 0],
      [0, -Math.min(...points.map((p) => p.y))],
      [0, d.room.depth - Math.max(...points.map((p) => p.y))],
    );
    for (const n of [0.5, 1, 2, 3, 6, 12, 18, 24, 36, 48])
      offsets.push([n, 0], [-n, 0], [0, n], [0, -n]);
    offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [dx, dy] of offsets) {
      if (Math.abs(dx) + Math.abs(dy) < 0.001) continue;
      const candidate = designSchema.safeParse({
        ...d,
        items: d.items.map((i) =>
          ids.has(i.id)
            ? { ...i, x: i.x + dx, y: i.y + dy, wall: null, wallSegment: null }
            : i,
        ),
      });
      if (!candidate.success) continue;
      const remaining = warnings(candidate.data);
      if (
        remaining.some((w) => w.id === warningId) ||
        remaining.some((w) => !original.has(canonical(w)))
      )
        continue;
      results.push({
        label: `Move ${members.map((i) => i.sku).join(' + ')} by ${dx.toFixed(2)} in X, ${dy.toFixed(2)} in Y`,
        design: candidate.data,
        resolved: issues.length - remaining.length,
        ids: [...ids],
      });
      break;
    }
  }
  return results;
}
