import type { Cabinet, Design } from './model';
import {
  footprint,
  placementCollision,
  snapPosition,
  updateAssembly,
  localToWorld,
  clearanceDefaults,
  isOpening,
  itemPolygon,
} from './model';
import { roomEdges } from './room';
import { attachToWall } from './model';
import { profileFor } from './installation';
export function snapPlacement(
  item: Cabinet,
  design: Design,
  x: number,
  y: number,
  enabled: boolean,
) {
  const position = snapPosition(item, design.room, x, y, enabled);
  if (
    !enabled ||
    item.opening ||
    item.kind === 'door' ||
    item.kind === 'window'
  )
    return position;
  const f = footprint(item);
  let dx = 4,
    dy = 4,
    nx = position.x,
    ny = position.y;
  for (const other of design.items) {
    if (
      other.id === item.id ||
      (item.assemblyId && other.assemblyId === item.assemblyId) ||
      other.elevation + other.height <= item.elevation ||
      other.elevation >= item.elevation + item.height
    )
      continue;
    const b = footprint(other);
    if (
      position.y + f.depth >= other.y - 4 &&
      position.y <= other.y + b.depth + 4
    )
      for (const target of [
        other.x - f.width,
        other.x + b.width,
        other.x,
        other.x + b.width - f.width,
      ])
        if (Math.abs(target - position.x) < dx) {
          dx = Math.abs(target - position.x);
          nx = target;
        }
    if (
      position.x + f.width >= other.x - 4 &&
      position.x <= other.x + b.width + 4
    )
      for (const target of [
        other.y - f.depth,
        other.y + b.depth,
        other.y,
        other.y + b.depth - f.depth,
      ])
        if (Math.abs(target - position.y) < dy) {
          dy = Math.abs(target - position.y);
          ny = target;
        }
  }
  if (
    item.elevation >= 40 &&
    item.rotation % 90 === 0 &&
    ['cabinet', 'custom_cabinet'].includes(item.kind)
  ) {
    for (const base of design.items.filter(
      (i) =>
        i.elevation === 0 &&
        ['cabinet', 'custom_cabinet'].includes(i.kind) &&
        i.rotation === item.rotation,
    )) {
      const b = footprint(base);
      if (item.rotation % 180 === 0 && Math.abs(position.y - base.y) < 24) {
        for (const target of [
          base.x,
          base.x + (b.width - f.width) / 2,
          base.x + b.width - f.width,
        ])
          if (Math.abs(target - position.x) < dx) {
            dx = Math.abs(target - position.x);
            nx = target;
          }
      } else if (
        item.rotation % 180 !== 0 &&
        Math.abs(position.x - base.x) < 24
      ) {
        for (const target of [
          base.y,
          base.y + (b.depth - f.depth) / 2,
          base.y + b.depth - f.depth,
        ])
          if (Math.abs(target - position.y) < dy) {
            dy = Math.abs(target - position.y);
            ny = target;
          }
      }
    }
  }
  const candidates = [
    { x: nx, y: ny },
    { x: nx, y: position.y },
    { x: position.x, y: ny },
    position,
  ];
  return (
    candidates.find(
      (p) =>
        !design.items.some(
          (other) =>
            other.id !== item.id &&
            (!item.assemblyId || item.assemblyId !== other.assemblyId) &&
            placementCollision({ ...item, ...p }, other),
        ),
    ) ?? position
  );
}
export function alignSelection(
  design: Design,
  ids: string[],
  operation: 'left' | 'right' | 'top' | 'bottom' | 'horizontal' | 'vertical',
) {
  const units: {
    item: Cabinet;
    x: number;
    y: number;
    width: number;
    depth: number;
  }[] = [];
  const seen = new Set<string>();
  for (const item of design.items.filter(
    (i) =>
      ids.includes(i.id) &&
      !i.opening &&
      i.kind !== 'door' &&
      i.kind !== 'window',
  )) {
    const key = item.assemblyId ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const members = item.assemblyId
        ? design.items.filter((i) => i.assemblyId === item.assemblyId)
        : [item],
      x = Math.min(...members.map((i) => i.x)),
      y = Math.min(...members.map((i) => i.y));
    units.push({
      item,
      x,
      y,
      width: Math.max(...members.map((i) => i.x + footprint(i).width)) - x,
      depth: Math.max(...members.map((i) => i.y + footprint(i).depth)) - y,
    });
  }
  if (units.length < 2) return design;
  const axis =
      operation === 'left' ||
      operation === 'right' ||
      operation === 'horizontal'
        ? 'x'
        : 'y',
    dimension = axis === 'x' ? 'width' : 'depth';
  const min = Math.min(...units.map((u) => u[axis])),
    max = Math.max(...units.map((u) => u[axis] + u[dimension]));
  let result = design;
  if (operation === 'horizontal' || operation === 'vertical') {
    units.sort((a, b) => a[axis] - b[axis]);
    const gap =
      (max - min - units.reduce((n, u) => n + u[dimension], 0)) /
      (units.length - 1);
    if (gap < 0) return design;
    let cursor = min;
    for (const u of units) {
      result = updateAssembly(result, u.item.id, {
        [axis]: u.item[axis] + cursor - u[axis],
      });
      cursor += u[dimension] + gap;
    }
  } else
    for (const u of units) {
      const target =
        operation === 'left' || operation === 'top' ? min : max - u[dimension];
      result = updateAssembly(result, u.item.id, {
        [axis]: u.item[axis] + target - u[axis],
      });
    }
  return result;
}
export function clearanceZones(item: Cabinet) {
  const defaults = item.clearance ?? clearanceDefaults(item),
    profile = profileFor(item),
    c = { ...defaults };
  if (profile)
    for (const key of ['front', 'rear', 'side', 'above'] as const)
      c[key] = Math.max(c[key], profile.clearance[key]);
  return [
    { name: 'front', x: 0, y: item.depth, w: item.width, d: c.front },
    { name: 'rear', x: 0, y: -c.rear, w: item.width, d: c.rear },
    { name: 'left', x: -c.side, y: 0, w: c.side, d: item.depth },
    { name: 'right', x: item.width, y: 0, w: c.side, d: item.depth },
  ]
    .filter((z) => z.w > 0 && z.d > 0)
    .map((z) => ({
      ...z,
      points: [
        [z.x, z.y],
        [z.x + z.w, z.y],
        [z.x + z.w, z.y + z.d],
        [z.x, z.y + z.d],
      ].map(([x, y]) => localToWorld(item, x ?? 0, y ?? 0)),
    }));
}
export function duplicateOption(design: Design, name: string): Design {
  return {
    ...structuredClone(design),
    id: crypto.randomUUID(),
    name,
    orders: [],
  };
}

export type DropItem =
  | {
      kind: 'object';
      object: Exclude<Cabinet['kind'], 'cabinet'>;
      option?: string | undefined;
    }
  | { kind: 'product'; product: import('./model').Product; versionId: string };

export function placementAt(
  item: Cabinet,
  design: Design,
  point: { x: number; y: number },
  snap: boolean,
): Cabinet | null {
  if (item.kind === 'door' || item.kind === 'window') {
    const edge = roomEdges(design.room)
      .filter((e) => !e.curved && design.room.walls[e.side])
      .sort(
        (a, b) =>
          Math.hypot(
            point.x - (a.a.x + a.b.x) / 2,
            point.y - (a.a.y + a.b.y) / 2,
          ) -
          Math.hypot(
            point.x - (b.a.x + b.b.x) / 2,
            point.y - (b.a.y + b.b.y) / 2,
          ),
      )[0];
    return edge
      ? {
          ...item,
          ...attachToWall(
            { ...item, wallSegment: edge.index },
            design.room,
            edge.side,
            point.x,
            point.y,
          ),
        }
      : null;
  }
  return {
    ...item,
    ...snapPlacement(
      item,
      design,
      point.x - item.width / 2,
      point.y - item.depth / 2,
      snap,
    ),
  };
}

export function assemblyMembers(design: Design, id: string) {
  const item = design.items.find((i) => i.id === id);
  return item
    ? design.items
        .filter(
          (i) =>
            i.id === id ||
            (item.assemblyId && i.assemblyId === item.assemblyId),
        )
        .map((i) => i.id)
    : [];
}
export function finishAssembly(
  design: Design,
  id: string,
  finish: Design['finish'],
): Design {
  const ids = new Set(assemblyMembers(design, id));
  return {
    ...design,
    items: design.items.map((i) =>
      ids.has(i.id) &&
      [
        'cabinet',
        'custom_cabinet',
        'corner',
        'island',
        'filler',
        'trim',
        'molding',
        'toe_kick',
      ].includes(i.kind)
        ? { ...i, finish }
        : i,
    ),
  };
}

/**
 * Do two convex polygons share any area?
 *
 * The separating-axis test: if any edge normal of either shape separates
 * their projections, they are apart. Touching edges count as a hit, which is
 * what a selection band should do - a cabinet the band just reaches is one
 * the person meant to catch.
 */
function convexOverlap(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
) {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      if (!p || !q) continue;
      const nx = -(q.y - p.y),
        ny = q.x - p.x;
      const pa = a.map((v) => v.x * nx + v.y * ny),
        pb = b.map((v) => v.x * nx + v.y * ny);
      if (
        Math.min(...pa) > Math.max(...pb) ||
        Math.min(...pb) > Math.max(...pa)
      )
        return false;
    }
  return true;
}

/**
 * The items a rubber-band rectangle picks up, in plan inches.
 *
 * Anything the band touches counts, rather than only what it encloses, so a
 * sweep across a run of cabinets takes the whole run. Two kinds stay out of
 * it: hidden items, which are not on screen to be aimed at, and wall
 * openings, which belong to their wall - dragging a band along a wall should
 * collect the cabinets in front of it, not the window behind them.
 */
export function marqueeSelection(
  design: Design,
  rect: { x: number; y: number; width: number; depth: number },
) {
  const band = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.depth },
    { x: rect.x, y: rect.y + rect.depth },
  ];
  return design.items
    .filter(
      (i) => !i.hidden && !isOpening(i) && convexOverlap(itemPolygon(i), band),
    )
    .map((i) => i.id);
}
