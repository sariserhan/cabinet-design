import {
  overlaps,
  itemPolygon,
  partitionPanels,
  resolvedFront,
  footprint,
  localToWorld,
  type Design,
} from './model';
import { roomEdges, roomOutline, inside, ceilingAt } from './room';
export function presentationViews(
  design: Design,
): NonNullable<Design['views']> {
  const { width: w, depth: d, height: h } = design.room;
  const island =
    design.items.find((i) => i.kind === 'island') ??
    design.items.find(
      (i) => i.kind === 'countertop' && i.y > 30 && i.width > 48,
    );
  const sink = design.items.find((i) => i.kind === 'sink');
  const center = (i: NonNullable<typeof island>) => {
    const f = footprint(i);
    return [
      i.x + f.width / 2,
      i.elevation + i.height,
      i.y + f.depth / 2,
    ] as const;
  };
  const target = island ? center(island) : ([w / 2, 36, d / 2] as const);
  const detail = sink ? center(sink) : target;
  const standing = walkPosition(design, w * 0.5, d * 0.88);
  return [
    ...(standing
      ? [
          {
            id: 'preset-level',
            name: 'Level interior · straight verticals',
            position: standing,
            target: [w * 0.5, standing[1], d * 0.15] as [
              number,
              number,
              number,
            ],
          },
        ]
      : []),
    {
      id: 'preset-entrance',
      name: 'Entrance view',
      position: [w * 0.52, Math.min(64, h - 6), d * 0.88],
      target: [w * 0.5, 48, d * 0.12],
    },
    {
      id: 'preset-island',
      name: 'Island view',
      position: [target[0] + 65, 85, target[2] + 95],
      target: [target[0], target[1], target[2]],
    },
    {
      id: 'preset-sink',
      name: sink ? 'Sink detail' : 'Countertop detail',
      position: [detail[0] + 38, detail[1] + 35, detail[2] + 65],
      target: [...detail],
    },
    {
      id: 'preset-overhead',
      name: 'Overhead plan',
      position: [w / 2, Math.max(w, d) * 1.5, d / 2 + 0.01],
      target: [w / 2, 0, d / 2],
    },
  ];
}
// A small body radius keeps eye-level navigation away from solid geometry.
function nearPolygon(
  x: number,
  z: number,
  polygon: { x: number; y: number }[],
  radius = 8,
) {
  if (inside({ x, y: z }, polygon)) return true;
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (!b) return false;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(x - a.x - t * dx, z - a.y - t * dy) < radius;
  });
}
/**
 * What stands in the way of a person at eye height.
 *
 * Doors and windows are holes rather than obstacles, and anything wholly
 * above the head or below the knee is walked under or over.
 */
function* blockerPolygons(design: Design, eye: number) {
  for (const item of design.items) {
    if (
      ['door', 'window'].includes(item.kind) ||
      item.elevation > eye + 4 ||
      item.elevation + item.height < 4
    )
      continue;
    if (item.kind === 'partition') {
      for (const panel of partitionPanels(item, design.items)) {
        if (
          item.elevation + panel.y > eye + 4 ||
          item.elevation + panel.y + panel.height < 4
        )
          continue;
        yield (
          [
            [panel.x, 0],
            [panel.x + panel.width, 0],
            [panel.x + panel.width, item.depth],
            [panel.x, item.depth],
          ] as const
        ).map(([px, py]) => localToWorld(item, px, py));
      }
    } else yield itemPolygon(item);
  }
}

/** How far a point is from the nearest edge of a ring. */
function edgeDistance(
  x: number,
  z: number,
  polygon: { x: number; y: number }[],
) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.y - t * dy));
  }
  return best;
}

export function walkPosition(design: Design, x: number, z: number) {
  const outline = roomOutline(design.room);
  if (
    !(
      [
        [-8, -8],
        [-8, 8],
        [8, -8],
        [8, 8],
      ] as const
    ).every(([dx, dz]) => inside({ x: x + dx, y: z + dz }, outline))
  )
    return null;
  const eye = Math.min(64, ceilingAt(design.room, x, z) - 6);
  if (eye < 36) return null;
  for (const polygon of blockerPolygons(design, eye))
    if (nearPolygon(x, z, polygon)) return null;
  return [x, eye, z] as [number, number, number];
}

/**
 * Where to stand for a 360 panorama.
 *
 * A panorama is worth looking at from inside the kitchen, not from the
 * orbit camera's seat out in the garden, so this hunts for the most open
 * floor a person could actually stand on: the spot with the most clear
 * space around it, and the one nearest the middle of the room where two
 * are equally open. Past five feet of clearance more space stops
 * improving the picture, so ties there fall to the centre.
 *
 * Null where nothing in the room is standable - a plan with no walls yet,
 * or a room packed wall to wall - and the caller then keeps its own camera.
 */
export function panoramaViewpoint(design: Design) {
  const { width: w, depth: d } = design.room;
  const step = Math.max(4, Math.min(w, d) / 20);
  const cx = w / 2,
    cz = d / 2;
  let best: {
    point: [number, number, number];
    open: number;
    pull: number;
  } | null = null;
  const outline = roomOutline(design.room);
  for (let x = step; x < w; x += step)
    for (let z = step; z < d; z += step) {
      const point = walkPosition(design, x, z);
      if (!point) continue;
      let clear = edgeDistance(x, z, outline);
      for (const polygon of blockerPolygons(design, point[1]))
        clear = Math.min(clear, edgeDistance(x, z, polygon));
      const open = Math.min(clear, 60),
        pull = Math.hypot(x - cx, z - cz);
      if (
        !best ||
        open > best.open + 0.5 ||
        (open > best.open - 0.5 && pull < best.pull)
      )
        best = { point, open, pull };
    }
  return best?.point ?? null;
}

export function walkEntry(design: Design) {
  const preferred = presentationViews(design)[0]?.position ?? [
    design.room.width / 2,
    64,
    design.room.depth / 2,
  ];
  const entry = walkPosition(design, preferred[0], preferred[2]);
  if (entry) return entry;
  for (let z = design.room.depth - 12; z >= 12; z -= 12)
    for (let x = 12; x < design.room.width; x += 12) {
      const point = walkPosition(design, x, z);
      if (point) return point;
    }
  return null;
}
export function materialVariant(design: Design, variant: string): Design {
  if (variant === 'original') return design;
  const finish =
    variant === 'white' ? 'linen' : variant === 'dark' ? 'slate' : 'oak';
  const countertop = variant === 'dark' ? 'marble' : 'quartz';
  return {
    ...design,
    finish,
    appearance: {
      ...design.appearance,
      lighting: design.appearance?.lighting ?? 'daylight',
      countertop,
    },
    items: design.items.map((item) => ({
      ...item,
      finish: ['cabinet', 'custom_cabinet', 'island'].includes(item.kind)
        ? finish
        : item.finish,
      countertop:
        item.kind === 'countertop' || item.kind === 'island'
          ? countertop
          : item.countertop,
    })),
  };
}
export function backsplashRuns(design: Design) {
  const edges = roomEdges(design.room).filter(
    (e) => !e.curved && design.room.walls[e.side],
  );
  return design.items.flatMap((item) => {
    if (
      item.elevation !== 0 ||
      !['cabinet', 'custom_cabinet', 'range', 'dishwasher'].includes(item.kind)
    )
      return [];
    const a = localToWorld(item, 0, 0),
      b = localToWorld(item, item.width, 0),
      mid = localToWorld(item, item.width / 2, 0),
      front = localToWorld(item, item.width / 2, item.depth);
    const edge = edges.find((e) => {
      const dx = (e.b.x - e.a.x) / e.length,
        dy = (e.b.y - e.a.y) / e.length;
      return (
        Math.abs((mid.x - e.a.x) * -dy + (mid.y - e.a.y) * dx) <= 3 &&
        (front.x - mid.x) * -dy + (front.y - mid.y) * dx > item.depth * 0.95
      );
    });
    if (!edge) return [];
    const dx = (edge.b.x - edge.a.x) / edge.length,
      dy = (edge.b.y - edge.a.y) / edge.length;
    const project = (p: { x: number; y: number }) =>
      (p.x - edge.a.x) * dx + (p.y - edge.a.y) * dy;
    const start = Math.max(0, Math.min(project(a), project(b))),
      end = Math.min(edge.length, Math.max(project(a), project(b)));
    if (end <= start) return [];
    const bottom = ['range', 'dishwasher'].includes(item.kind)
      ? 36
      : item.height + 1.5;
    const holes = design.items
      .filter(
        (i) =>
          (i.kind === 'door' || i.kind === 'window') &&
          !i.opening &&
          (i.wallSegment === edge.index ||
            (i.wallSegment === null && i.wall === edge.side)),
      )
      .map((i) => {
        const x0 = project(localToWorld(i, 0, 0)),
          x1 = project(localToWorld(i, i.width, 0));
        return {
          x: Math.min(x0, x1) - start,
          y: i.elevation - bottom,
          width: Math.abs(x1 - x0),
          height: i.height,
        };
      });
    return [
      {
        x: edge.a.x + dx * start,
        z: edge.a.y + dy * start,
        rotation: -Math.atan2(dy, dx),
        width: end - start,
        bottom,
        height: 18,
        holes,
      },
    ];
  });
}

export function openingConflicts(
  design: Design,
  amount: number,
  selected?: string | null,
) {
  if (amount <= 0) return [];
  return design.items.flatMap((item) => {
    if (
      (selected && item.id !== selected) ||
      !['cabinet', 'custom_cabinet', 'island', 'refrigerator'].includes(
        item.kind,
      )
    )
      return [];
    const style =
        item.kind === 'refrigerator'
          ? ['double', 'french'].includes(item.refrigeratorStyle ?? '')
            ? 'double'
            : 'single'
          : resolvedFront(item),
      doorReach =
        style === 'drawers'
          ? (Math.max(1, item.depth - 4) * 0.75 * amount) / 100
          : (style === 'double' ? item.width / 2 : item.width) *
            Math.sin(((amount / 100) * Math.PI) / 2),
      reach =
        item.kind === 'refrigerator' && item.refrigeratorStyle === 'french'
          ? Math.max(
              doorReach,
              (Math.max(1, item.depth - 4) * 0.75 * amount) / 100,
            )
          : doorReach;
    const center = localToWorld(item, item.width / 2, item.depth + reach / 2),
      size = footprint({ ...item, depth: reach });
    const zone = {
      ...item,
      depth: reach,
      x: center.x - size.width / 2,
      y: center.y - size.depth / 2,
    };
    const hits = design.items.filter(
      (other) => other.id !== item.id && overlaps(zone, other),
    );
    return hits.map(
      (other) => item.sku + ' open front may meet ' + other.sku + '.',
    );
  });
}
