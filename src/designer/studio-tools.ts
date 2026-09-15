import {
  footprint,
  localToWorld,
  worldToLocal,
  containsFootprint,
  warnings,
  type Cabinet,
  type Design,
} from './model';
import { fitSink } from './refinements';
import { roomEdges } from './room';
export function lockViolation(before: Design, after: Design) {
  if (before.id !== after.id) return null;
  for (const item of before.items.filter((i) => i.locked)) {
    const next = after.items.find((i) => i.id === item.id);
    if (
      !next ||
      (
        ['x', 'y', 'width', 'depth', 'height', 'rotation', 'elevation'] as const
      ).some((k) => item[k] !== next[k])
    )
      return item.sku;
  }
  return null;
}
export function resizeFromPoint(item: Cabinet, x: number, y: number) {
  const p = worldToLocal(item, x, y),
    width = Math.max(3, Math.min(240, Math.round(p.x * 4) / 4)),
    depth = Math.max(3, Math.min(120, Math.round(p.y * 4) / 4));
  const center = localToWorld(item, width / 2, depth / 2),
    f = footprint({ ...item, width, depth });
  return { width, depth, x: center.x - f.width / 2, y: center.y - f.depth / 2 };
}
export function overhang(
  design: Design,
  id: string,
  inches: number | { front: number; back: number; left: number; right: number },
): Design {
  const edges =
    typeof inches === 'number'
      ? { front: inches, back: inches, left: inches, right: inches }
      : inches;
  const top = design.items.find(
    (i) => i.id === id && ['countertop', 'island'].includes(i.kind),
  );
  if (!top) throw Error('Select a countertop.');
  if (Object.values(edges).some((v) => !Number.isFinite(v) || v < 0 || v > 18))
    throw Error('Overhang must be between 0 and 18 inches.');
  if (top.kind === 'island')
    return {
      ...design,
      items: design.items.map((i) =>
        i.id === id ? { ...i, surface: { ...i.surface, overhangs: edges } } : i,
      ),
    };
  const hosts = design.items.filter(
    (i) =>
      i.assemblyId &&
      i.assemblyId === top.assemblyId &&
      ['cabinet', 'custom_cabinet'].includes(i.kind) &&
      i.elevation === 0,
  );
  if (!hosts.length)
    throw Error('Link this countertop to its base cabinets first.');
  if (hosts.some((h) => h.rotation % 180 !== top.rotation % 180))
    throw Error('Overhang editing needs a straight cabinet run.');
  const pts = hosts.flatMap((h) =>
    [
      [0, 0],
      [h.width, 0],
      [h.width, h.depth],
      [0, h.depth],
    ].map(([x, y]) =>
      worldToLocal(
        top,
        ...(Object.values(localToWorld(h, x ?? 0, y ?? 0)) as [number, number]),
      ),
    ),
  );
  const x = Math.min(...pts.map((p) => p.x)) - edges.left,
    y = Math.min(...pts.map((p) => p.y)) - edges.back,
    w = Math.max(...pts.map((p) => p.x)) - x + edges.right,
    d = Math.max(...pts.map((p) => p.y)) - y + edges.front;
  const center = localToWorld(top, x + w / 2, y + d / 2),
    f = footprint({ ...top, width: w, depth: d });
  let next: Design = {
    ...design,
    items: design.items.map((i) =>
      i.id === id
        ? {
            ...i,
            surface: { ...i.surface, overhangs: edges },
            width: w,
            depth: d,
            x: center.x - f.width / 2,
            y: center.y - f.depth / 2,
          }
        : i,
    ),
  };
  for (const sink of design.items.filter((i) => i.sinkMount?.hostId === id)) {
    if (sink.sinkMount)
      next = fitSink(
        next,
        sink.id,
        id,
        sink.sinkMount.mount,
        sink.sinkMount.offset,
      );
  }
  return next;
}
export function connectCountertops(design: Design, ids: string[]): Design {
  const tops = design.items.filter(
    (i) => ids.includes(i.id) && i.kind === 'countertop',
  );
  if (tops.length < 2) throw Error('Select at least two countertop sections.');
  const base = tops[0];
  if (!base) throw Error('No countertop selected.');
  if (
    tops.some(
      (t) =>
        t.locked ||
        t.rotation !== base.rotation ||
        t.elevation !== base.elevation ||
        t.depth !== base.depth ||
        t.height !== base.height,
    )
  )
    throw Error(
      'Sections must be unlocked and share rotation, depth, height and elevation.',
    );
  const local = tops
    .map((t) => ({
      t,
      p: worldToLocal(
        base,
        ...(Object.values(localToWorld(t, 0, 0)) as [number, number]),
      ),
    }))
    .sort((a, b) => a.p.x - b.p.x);
  let end = local[0]?.p.x ?? 0;
  for (const row of local) {
    if (Math.abs(row.p.y) > 0.01 || Math.abs(row.p.x - end) > 0.05)
      throw Error('Sections must meet end to end in a straight run.');
    end = row.p.x + row.t.width;
  }
  const start = local[0]?.p.x ?? 0,
    width = end - start,
    center = localToWorld(base, start + width / 2, base.depth / 2),
    f = footprint({ ...base, width });
  const assemblyId = base.assemblyId ?? crypto.randomUUID(),
    oldGroups = new Set(tops.map((t) => t.assemblyId).filter(Boolean));
  const next: Design = {
    ...design,
    items: design.items
      .filter(
        (i) =>
          !ids.includes(i.id) || i.id === base.id || i.kind !== 'countertop',
      )
      .map((i) =>
        i.id === base.id
          ? {
              ...i,
              width,
              x: center.x - f.width / 2,
              y: center.y - f.depth / 2,
              assemblyId,
            }
          : i.assemblyId && oldGroups.has(i.assemblyId)
            ? { ...i, assemblyId }
            : i,
      ),
  };
  const host = next.items.find((i) => i.id === base.id);
  if (!host) return next;
  return {
    ...next,
    items: next.items.map((i) =>
      i.sinkMount && ids.includes(i.sinkMount.hostId)
        ? {
            ...i,
            sinkMount: {
              ...i.sinkMount,
              hostId: host.id,
              offset:
                worldToLocal(
                  host,
                  i.x + footprint(i).width / 2,
                  i.y + footprint(i).depth / 2,
                ).x -
                host.width / 2,
            },
          }
        : i,
    ),
  };
}
export function readiness(design: Design) {
  const notes: { id: string; message: string; itemId?: string | undefined }[] =
    [];
  for (const kind of ['refrigerator', 'range', 'hood', 'dishwasher', 'sink'])
    if (!design.items.some((i) => i.kind === kind))
      notes.push({ id: 'missing-' + kind, message: 'Missing ' + kind + '.' });
  for (const i of design.items) {
    if (
      ['cabinet', 'custom_cabinet'].includes(i.kind) &&
      i.elevation === 0 &&
      i.height < 48 &&
      !design.items.some(
        (t) =>
          t.kind === 'countertop' &&
          containsFootprint(t, i) &&
          Math.abs(t.elevation - i.height) < 3,
      )
    )
      notes.push({
        id: 'top-' + i.id,
        message: i.sku + ' has no countertop coverage.',
        itemId: i.id,
      });
    if (i.note)
      notes.push({
        id: 'note-' + i.id,
        message: i.sku + ': ' + i.note,
        itemId: i.id,
      });
  }
  notes.push(
    ...warnings(design).map((w) => ({
      id: w.id,
      message: w.message,
      itemId: w.itemIds[0],
    })),
  );
  return notes;
}
export function elevationRows(design: Design, index: number) {
  const edge = roomEdges(design.room)[index];
  if (!edge || edge.curved) return [];
  const dx = (edge.b.x - edge.a.x) / edge.length,
    dy = (edge.b.y - edge.a.y) / edge.length;
  return design.items
    .filter((i) => !i.hidden)
    .flatMap((item) => {
      const back = localToWorld(item, item.width / 2, 0),
        distance = (back.x - edge.a.x) * -dy + (back.y - edge.a.y) * dx;
      const along = (back.x - edge.a.x) * dx + (back.y - edge.a.y) * dy;
      if (distance < -4 || distance > 36) return [];
      const projected = footprint({
        ...item,
        rotation:
          (item.rotation - (Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
      }).width;
      return [{ item, x: along - projected / 2, width: projected }];
    });
}
