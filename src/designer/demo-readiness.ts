import {
  fromObject,
  footprint,
  itemPolygon,
  placementCollision,
  updateAssembly,
  warnings,
  type Cabinet,
  type Design,
} from './model';
import { roomEdges, roomOutline, polygonInside } from './room';
import { completeRuns } from './kitchen-actions';
import { placementBlock } from './refinements';
export function fillWallRun(
  design: Design,
  wallIndex: number,
  finish = true,
): Design {
  const edge = roomEdges(design.room).find(
    (e) => e.index === wallIndex && !e.curved && design.room.walls[e.side],
  );
  if (!edge) throw Error('Choose an enabled straight wall.');
  const dx = (edge.b.x - edge.a.x) / edge.length,
    dy = (edge.b.y - edge.a.y) / edge.length,
    rotation = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const openings = design.items
    .filter(
      (i) =>
        ['door', 'window'].includes(i.kind) &&
        !i.opening &&
        (i.wallSegment === edge.index ||
          (i.wallSegment === null && i.wall === edge.side)),
    )
    .map((i) => {
      const values = itemPolygon(i).map(
        (p) => (p.x - edge.a.x) * dx + (p.y - edge.a.y) * dy,
      );
      return [Math.min(...values) - 1, Math.max(...values) + 1] as const;
    });
  let next = structuredClone(design),
    offset = 0;
  const ids: string[] = [],
    limit = Math.floor((100 - design.items.length) / (finish ? 4 : 1));
  while (offset <= edge.length - 9 && ids.length < limit) {
    let added = false;
    for (const width of [36, 30, 24, 18, 15, 12, 9]) {
      if (
        offset + width > edge.length ||
        openings.some(([a, b]) => offset < b && offset + width > a)
      )
        continue;
      const item = {
        ...fromObject('custom_cabinet'),
        sku: `DEMO-RUN${width}`,
        category: 'base_cabinet',
        width,
        rotation,
        finish: design.finish,
      };
      const f = footprint(item),
        center = {
          x: edge.a.x + dx * (offset + width / 2) - dy * 12,
          y: edge.a.y + dy * (offset + width / 2) + dx * 12,
        };
      item.x = center.x - f.width / 2;
      item.y = center.y - f.depth / 2;
      if (
        !polygonInside(itemPolygon(item), roomOutline(design.room)) ||
        next.items.some((i) => placementCollision(item, i))
      )
        continue;
      next.items.push(item);
      ids.push(item.id);
      offset += width;
      added = true;
      break;
    }
    if (!added) offset += 1;
  }
  if (!ids.length)
    throw Error(
      'No usable cabinet space on this wall. Choose another wall or move existing objects.',
    );
  if (finish) next = completeRuns(next, ids);
  if (next.items.length > 100)
    throw Error(
      'This run exceeds the demo object limit. Try without finish parts.',
    );
  return next;
}
export function placementFeedback(
  design: Design,
  candidate: Cabinet,
  isNew: boolean,
  moveTogether: boolean,
) {
  const preview = isNew
    ? { ...design, items: [...design.items, candidate] }
    : moveTogether
      ? updateAssembly(design, candidate.id, { x: candidate.x, y: candidate.y })
      : {
          ...design,
          items: design.items.map((i) =>
            i.id === candidate.id ? candidate : i,
          ),
        };
  const blocking = placementBlock(design, preview);
  const ids = new Set(
    preview.items
      .filter(
        (i) =>
          i.id === candidate.id ||
          (moveTogether &&
            candidate.assemblyId &&
            i.assemblyId === candidate.assemblyId),
      )
      .map((i) => i.id),
  );
  const issue = warnings(preview).find(
    (i) =>
      i.itemIds.some((id) => ids.has(id)) &&
      /^(outside|overlap|ceiling|swing|sink|opening|wall|clearance)-/.test(
        i.id,
      ),
  );
  return {
    state: blocking ? 'blocked' : issue ? 'review' : 'ready',
    message: blocking
      ? `Blocked: ${blocking}`
      : issue
        ? `Review: ${issue.message}`
        : 'Ready to place · edges snap to nearby cabinets.',
  } as const;
}
export function lightingVariants(design: Design) {
  return (
    [
      ['day', 'Daytime'],
      ['evening', 'Evening'],
      ['task', 'Under-cabinet lighting'],
    ] as const
  ).map(([profile, name]) => ({
    name,
    design: {
      ...design,
      appearance: {
        countertop: 'quartz' as const,
        ...design.appearance,
        lighting: profile === 'day' ? ('daylight' as const) : ('warm' as const),
        lightingProfile: profile,
        underCabinet: profile !== 'day',
        pendants: profile === 'evening',
        pendantLevel: profile === 'evening' ? 80 : 0,
      },
    },
  }));
}
