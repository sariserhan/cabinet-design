import {
  type Design,
  designSchema,
  warnings,
  isOpening,
  itemPolygon,
} from './model';
import { captureAssembly, placeAssembly } from './assembly-library';
import { canonical } from './installer-handoff';
export type EditRequest =
  | { kind: 'move'; x: number; y: number }
  | {
      kind: 'repeat';
      direction: 'right' | 'left' | 'down' | 'up';
      count: number;
      gap: number;
    }
  | { kind: 'finish'; finish: Design['finish'] };
export function selectionMembers(d: Design, selected: string[]) {
  const ids = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of d.items)
      if (ids.has(i.id))
        for (const peer of d.items)
          if (
            (i.assemblyId && i.assemblyId === peer.assemblyId) ||
            i.sinkMount?.hostId === peer.id ||
            peer.sinkMount?.hostId === i.id ||
            i.opening?.hostId === peer.id ||
            peer.opening?.hostId === i.id
          ) {
            if (!ids.has(peer.id)) {
              ids.add(peer.id);
              changed = true;
            }
          }
  }
  return d.items.filter((i) => ids.has(i.id));
}
export function previewEverydayEdit(
  d: Design,
  selected: string[],
  request: EditRequest,
) {
  const members = selectionMembers(d, selected);
  if (!members.length) throw Error('Select at least one item.');
  if (members.some((i) => i.locked))
    throw Error('Unlock every selected or linked item first.');
  if (members.some(isOpening) && request.kind !== 'finish')
    throw Error('Use the room tools to move wall openings.');
  const ids = new Set(members.map((i) => i.id));
  let next: Design;
  if (request.kind === 'move') {
    if (
      !Number.isFinite(request.x) ||
      !Number.isFinite(request.y) ||
      Math.abs(request.x) > 600 ||
      Math.abs(request.y) > 600
    )
      throw Error('Use move offsets between -600 and 600 inches.');
    next = designSchema.parse({
      ...d,
      items: d.items.map((i) =>
        ids.has(i.id)
          ? {
              ...i,
              x: i.x + request.x,
              y: i.y + request.y,
              wall: null,
              wallSegment: null,
            }
          : i,
      ),
    });
  } else if (request.kind === 'repeat') {
    if (
      !Number.isInteger(request.count) ||
      request.count < 1 ||
      request.count > 8 ||
      !Number.isFinite(request.gap) ||
      request.gap < 0 ||
      request.gap > 120
    )
      throw Error('Choose 1–8 copies and a gap from 0 to 120 inches.');
    if (members.some((i) => ['column', 'beam', 'partition'].includes(i.kind)))
      throw Error(
        'Repeat cabinets or furniture; use room tools for architecture.',
      );
    const template = captureAssembly(d, [...ids], 'Repeated selection', '');
    const points = members.flatMap(itemPolygon),
      x = Math.min(...points.map((p) => p.x)),
      y = Math.min(...points.map((p) => p.y)),
      width = Math.max(...points.map((p) => p.x)) - x,
      depth = Math.max(...points.map((p) => p.y)) - y;
    const dx =
        request.direction === 'right'
          ? width + request.gap
          : request.direction === 'left'
            ? -(width + request.gap)
            : 0,
      dy =
        request.direction === 'down'
          ? depth + request.gap
          : request.direction === 'up'
            ? -(depth + request.gap)
            : 0;
    next = d;
    for (let n = 1; n <= request.count; n++)
      next = placeAssembly(next, template, x + n * dx, y + n * dy);
  } else {
    const eligible = new Set(
      members
        .filter((i) =>
          [
            'cabinet',
            'custom_cabinet',
            'corner',
            'island',
            'trim',
            'filler',
            'molding',
            'toe_kick',
          ].includes(i.kind),
        )
        .map((i) => i.id),
    );
    if (!eligible.size)
      throw Error('Select cabinetry or matching finishing parts.');
    next = designSchema.parse({
      ...d,
      items: d.items.map((i) =>
        eligible.has(i.id) ? { ...i, finish: request.finish } : i,
      ),
    });
  }
  const original = new Set(warnings(d).map((w) => canonical(w)));
  const added = warnings(next).filter((w) => !original.has(canonical(w)));
  return {
    design: next,
    added,
    blocked: added.some((w) => /^(outside|overlap|ceiling|sink)-/.test(w.id)),
    members: members.length,
    addedItems: next.items.length - d.items.length,
  };
}
