import {
  fromObject,
  footprint,
  localToWorld,
  placementCollision,
  type Cabinet,
  type Design,
} from './model';
import { rectangleInside } from './room';
import { setupKitchen } from './setup';
function fits(d: Design, item: Cabinet, ignore: string[] = []) {
  const f = footprint(item);
  return (
    rectangleInside(d.room, item.x, item.y, f.width, f.depth) &&
    !d.items.some((i) => !ignore.includes(i.id) && placementCollision(item, i))
  );
}
function localPart(
  host: Cabinet,
  kind: 'countertop' | 'trim',
  x: number,
  y: number,
  width: number,
  depth: number,
  height: number,
  elevation: number,
): Cabinet {
  const part = {
    ...fromObject(kind),
    width,
    depth,
    height,
    elevation,
    rotation: host.rotation,
    assemblyId: host.assemblyId,
    finish: host.finish,
  };
  const center = localToWorld(host, x + width / 2, y + depth / 2),
    f = footprint(part);
  return { ...part, x: center.x - f.width / 2, y: center.y - f.depth / 2 };
}
export function switchLayout(design: Design, layout: string): Design {
  const architecture = design.items.filter((i) =>
    ['door', 'window', 'partition'].includes(i.kind),
  );
  const starter = setupKitchen(
    design.room.width,
    design.room.depth,
    design.room.height,
    layout,
    [],
  );
  let next = { ...design, items: architecture };
  for (const item of starter.items)
    if (fits(next, item)) next = { ...next, items: [...next.items, item] };
  if (next.items.length === architecture.length)
    throw Error(
      'No starter cabinets fit this room. Try another layout or adjust the partitions.',
    );
  return next;
}
export function completeRuns(design: Design, ids: string[]): Design {
  const hosts = design.items.filter(
    (i) =>
      ids.includes(i.id) &&
      ['cabinet', 'custom_cabinet'].includes(i.kind) &&
      i.elevation === 0,
  );
  if (!hosts.length)
    throw Error('Select one or more floor-level straight cabinets first.');
  const next = structuredClone(design);
  for (const original of hosts) {
    const host: Cabinet = {
      ...original,
      assemblyId: original.assemblyId ?? crypto.randomUUID(),
      details: {
        ...original.details,
        shelves: original.details?.shelves ?? 1,
        toeKick: 4,
        molding: original.details?.molding ?? false,
        interior: original.details?.interior ?? ('shelves' as const),
      },
    };
    next.items = next.items.map((i) => (i.id === host.id ? host : i));
    const top = localPart(
      host,
      'countertop',
      0,
      0,
      host.width,
      host.depth,
      1.5,
      host.height,
    );
    if (fits(next, top))
      next.items.push({
        ...top,
        countertop: design.appearance?.countertop ?? 'quartz',
      });
    for (const x of [-0.75, host.width]) {
      const panel = localPart(
        host,
        'trim',
        x,
        0,
        0.75,
        host.depth,
        host.height,
        0,
      );
      if (fits(next, panel)) next.items.push(panel);
    }
  }
  return next;
}
function freePosition(d: Design, item: Cabinet): Cabinet | null {
  for (let y = 0; y <= d.room.depth - item.depth; y += 6)
    for (let x = 0; x <= d.room.width - item.width; x += 6) {
      const placed = { ...item, x, y };
      if (fits(d, placed)) return placed;
    }
  return null;
}
export function appliancePackage(design: Design): Design {
  let next = structuredClone(design);
  const existing = ['refrigerator', 'range', 'hood', 'dishwasher', 'sink'];
  if (existing.every((kind) => next.items.some((i) => i.kind === kind)))
    throw Error(
      'This design already has a refrigerator, range, hood, dishwasher and sink.',
    );
  for (const kind of ['refrigerator', 'range', 'dishwasher'] as const) {
    if (next.items.some((i) => i.kind === kind)) continue;
    const preset = fromObject(kind);
    // Use open floor space; existing cabinets and custom arrangements are preserved.
    const placed = freePosition(next, preset);
    if (!placed)
      throw Error(
        `No clear space found for ${kind.replace('_', ' ')}. Make room before adding the package.`,
      );
    next.items.push(placed);
  }
  if (!next.items.some((i) => i.kind === 'hood')) {
    const range = next.items.find((i) => i.kind === 'range');
    if (range) {
      const hood = {
        ...fromObject('hood'),
        x: range.x,
        y: range.y,
        rotation: range.rotation,
        width: range.width,
        elevation: range.elevation + range.height + 30,
      };
      if (hood.elevation + hood.height > next.room.height || !fits(next, hood))
        throw Error('The range needs clear overhead space for its hood.');
      next.items.push(hood);
    }
  }
  if (!next.items.some((i) => i.kind === 'sink')) {
    let host = next.items.find(
      (i) =>
        i.kind === 'custom_cabinet' &&
        i.width >= 30 &&
        i.depth >= 24 &&
        i.elevation === 0,
    );
    if (!host) {
      const placed = freePosition(next, {
        ...fromObject('custom_cabinet'),
        width: 36,
      });
      if (!placed) throw Error('No clear space found for a sink cabinet.');
      host = placed;
      next.items.push(host);
    }
    host = {
      ...host,
      sku: 'DEMO-SB' + host.width,
      details: { shelves: 0, toeKick: 4, molding: false, interior: 'shelves' },
    };
    next.items = next.items.map((i) =>
      i.id === host?.id ? { ...i, ...host } : i,
    );
    next = completeRuns(next, [host.id]);
    host = next.items.find((i) => i.id === host?.id) ?? host;
    const sink = {
      ...fromObject('sink'),
      width: Math.min(30, host.width - 4),
      rotation: host.rotation,
      assemblyId: host.assemblyId,
    };
    const center = localToWorld(host, host.width / 2, host.depth / 2),
      f = footprint(sink);
    const placed = {
      ...sink,
      x: center.x - f.width / 2,
      y: center.y - f.depth / 2,
    };
    if (!fits(next, placed))
      throw Error(
        'The sink cabinet is obstructed. Move nearby objects and retry.',
      );
    next.items.push(placed);
  }
  return next;
}
export function cornerOption(
  design: Design,
  style: 'diagonal' | 'blind_left' | 'blind_right',
  corner: 'NW' | 'NE' | 'SW' | 'SE',
) {
  const item = {
    ...fromObject('corner'),
    details: {
      shelves: 1,
      toeKick: 4,
      molding: false,
      interior: 'lazy_susan' as const,
      corner: style,
    },
    x: corner.endsWith('E') ? design.room.width - 36 : 0,
    y: corner.startsWith('S') ? design.room.depth - 36 : 0,
    rotation: { NW: 0, NE: 90, SE: 180, SW: 270 }[corner],
  };
  if (!fits(design, item))
    throw Error(
      'This corner needs a clear 36 × 36 inch footprint. Move nearby cabinets or openings first.',
    );
  return { ...design, items: [...design.items, item] };
}
