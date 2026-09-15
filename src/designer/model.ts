import { storageProfileSchema, siteTasksSchema } from './decision-schema';
import { surveySchema } from './measurement-schema';
import { installationIssues, profileFor } from './installation';
import { z } from 'zod';
import {
  outlineIssue,
  rectangleInside,
  roomEdges,
  clockwise,
  polygonInside,
  roomOutline,
  ceilingAt,
} from './room';

const dimension = z.number().finite().positive().max(600);
export const itemSchema = z.object({
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  note: z.string().max(1000).optional(),
  surface: z
    .object({
      overhangs: z
        .object({
          front: z.number().min(0).max(18),
          back: z.number().min(0).max(18),
          left: z.number().min(0).max(18),
          right: z.number().min(0).max(18),
        })
        .optional(),
      waterfall: z.boolean().optional(),
      seating: z.enum(['none', 'north', 'south', 'east', 'west']).optional(),
    })
    .optional(),
  refrigeratorStyle: z
    .enum(['single', 'double', 'french', 'top_freezer'])
    .optional(),
  sinkMount: z
    .object({
      hostId: z.string().min(1).max(100),
      mount: z.enum(['undermount', 'drop_in', 'apron']),
      offset: z.number().finite().min(-300).max(300),
    })
    .optional(),
  sinkStyle: z.enum(['single', 'double', 'farmhouse', 'prep']).optional(),
  finish: z.enum(['linen', 'oak', 'slate']).optional(),
  countertop: z.enum(['quartz', 'marble', 'granite']).optional(),
  id: z.string().min(1).max(100),
  recordId: z.string().max(100),
  versionId: z.string().max(100),
  sku: z.string().min(1).max(100),
  category: z.string().max(100),
  kind: z
    .enum([
      'cabinet',
      'custom_cabinet',
      'door',
      'window',
      'sink',
      'refrigerator',
      'dishwasher',
      'washing_machine',
      'range',
      'hood',
      'island',
      'countertop',
      'corner',
      'filler',
      'trim',
      'molding',
      'toe_kick',
      'column',
      'beam',
      'partition',
    ])
    .default('cabinet'),
  wall: z.enum(['north', 'east', 'south', 'west']).nullable().default(null),
  assemblyId: z.string().max(100).nullable().default(null),
  frontStyle: z
    .enum(['auto', 'single', 'double', 'drawers', 'glass'])
    .default('auto'),
  wallSegment: z.number().int().min(0).max(23).nullable().default(null),
  width: dimension,
  depth: dimension,
  height: dimension,
  x: z.number().finite().min(-600).max(1200),
  y: z.number().finite().min(-600).max(1200),
  elevation: z.number().finite().min(0).max(600),
  mirrored: z.boolean().default(false),
  rotation: z.number().finite().min(0).max(359.999),
  details: z
    .object({
      shelves: z.number().int().min(0).max(8),
      toeKick: z.number().min(0).max(12),
      molding: z.boolean(),
      interior: z.enum(['shelves', 'pullouts', 'lazy_susan']),
      corner: z.enum(['diagonal', 'blind_left', 'blind_right']).optional(),
    })
    .optional(),
  clearance: z
    .object({
      front: z.number().min(0).max(120),
      rear: z.number().min(0).max(24),
      side: z.number().min(0).max(24),
      above: z.number().min(0).max(120),
    })
    .optional(),
  opening: z
    .object({
      hostId: z.string().min(1).max(100),
      offset: z.number().min(0).max(600),
      sill: z.number().min(0).max(600),
    })
    .optional(),
  installation: z
    .object({
      profile: z.string().max(80),
      voltage: z.number().min(0).max(500),
      circuitAmps: z.number().min(0).max(100),
      water: z.enum(['unknown', 'hot', 'cold', 'none']),
      drain: z.boolean(),
      vent: z.enum(['unknown', 'outside', 'recirculating', 'none']),
      ductDiameter: z.number().min(0).max(24),
      waterPressure: z.number().min(0).max(300).optional(),
      drainRise: z.number().min(0).max(120).optional(),
      serviceX: z.number().min(0).max(600).optional(),
      serviceY: z.number().min(0).max(600).optional(),
      serviceZ: z.number().min(0).max(600).optional(),
      ventCfm: z.number().min(0).max(3000).optional(),
      notes: z.string().max(1000),
    })
    .optional(),
  demoPrice: z.number().finite().min(0).max(1000000).optional(),
  pageNumber: z.number().int().positive(),
});
export const designSchema = z
  .object({
    format: z.literal('kitchen-studio-v1'),
    measurements: surveySchema.optional(),
    storageProfile: storageProfileSchema.optional(),
    siteTasks: siteTasksSchema.optional(),
    supplierBookId: z.string().max(100).optional(),
    sampleKey: z.enum(['apartment', 'family', 'premium']).optional(),
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    room: z.object({
      width: dimension.min(36),
      depth: dimension.min(36),
      height: dimension.min(36),
      ceiling: z
        .object({
          axis: z.enum(['x', 'y']),
          endHeight: dimension.min(36),
          kind: z.enum(['slope', 'vault']).optional(),
          ridge: z.number().min(0.1).max(0.9).optional(),
        })
        .optional(),
      curves: z
        .array(
          z.object({
            wall: z.number().int().min(0).max(23),
            bow: z.number().min(-120).max(120),
          }),
        )
        .max(24)
        .optional(),
      outline: z
        .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
        .max(24)
        .default([]),
      walls: z.object({
        north: z.boolean(),
        east: z.boolean(),
        south: z.boolean(),
        west: z.boolean(),
      }),
    }),
    views: z
      .array(
        z.object({
          id: z.string().max(100),
          name: z.string().min(1).max(50),
          position: z.tuple([
            z.number().finite(),
            z.number().finite(),
            z.number().finite(),
          ]),
          target: z.tuple([
            z.number().finite(),
            z.number().finite(),
            z.number().finite(),
          ]),
        }),
      )
      .max(8)
      .optional(),
    fabrication: z
      .object({
        thickness: z.number().min(0.25).max(1.5),
        back: z.number().min(0.125).max(0.75),
        gap: z.number().min(0.03125).max(0.25),
        joinery: z.enum(['butt', 'rabbet']).optional(),
        rebate: z.number().min(0).max(0.5).optional(),
        edgeBandMm: z.number().min(0).max(3).optional(),
        drilling: z.boolean().optional(),
        cupDiameterMm: z.number().min(20).max(40).optional(),
        cupEdgeMm: z.number().min(2).max(8).optional(),
        cupEndMm: z.number().min(50).max(200).optional(),
        drillDepthMm: z.number().min(2).max(15).optional(),
        shelfPitchMm: z.number().min(16).max(64).optional(),
        shelfSetbackMm: z.number().min(20).max(75).optional(),
        sheetWidth: z.number().min(12).max(120).optional(),
        sheetHeight: z.number().min(12).max(144).optional(),
        kerf: z.number().min(0.01).max(0.5).optional(),
        allowRotate: z.boolean().optional(),
      })
      .optional(),
    finish: z.enum(['linen', 'oak', 'slate']),
    appearance: z
      .object({
        backsplash: z
          .enum(['none', 'subway', 'slab', 'mosaic', 'stacked'])
          .optional(),
        lightingProfile: z.enum(['day', 'evening', 'task']).optional(),
        flooring: z.enum(['oak', 'walnut', 'tile', 'slate']).optional(),
        hardware: z.enum(['steel', 'brass', 'black']).optional(),
        pendants: z.boolean().optional(),
        pendantLevel: z.number().min(0).max(100).optional(),
        underCabinet: z.boolean().optional(),
        outlets: z.boolean().optional(),
        faucet: z.enum(['steel', 'brass', 'black']).optional(),
        handleStyle: z.enum(['bar', 'knob', 'none']).optional(),
        staging: z.boolean().optional(),
        countertop: z.enum(['quartz', 'marble', 'granite']),
        lighting: z.enum(['daylight', 'warm', 'studio']),
      })
      .optional(),
    quote: z
      .object({
        customer: z.string().max(200),
        tax: z.number().min(0).max(100),
        installation: z.number().min(0).max(1000000),
        delivery: z.number().min(0).max(1000000),
        discount: z.number().min(0).max(100),
      })
      .optional(),
    quoteDocument: z
      .object({
        company: z.string().max(160),
        contact: z.string().max(500),
        number: z.string().max(80),
        terms: z.string().max(4000),
        validUntil: z.string().max(10),
        logo: z
          .string()
          .max(45000)
          .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
          .optional(),
      })
      .optional(),
    orders: z
      .array(
        z.object({
          id: z.string().max(100),
          createdAt: z.string().max(50),
          customer: z.string().max(200),
          total: z.number().min(0),
          snapshot: z
            .string()
            .max(100000)
            .refine((value) => {
              try {
                return (
                  typeof JSON.parse(value) === 'object' &&
                  JSON.parse(value) !== null
                );
              } catch {
                return false;
              }
            }, 'Invalid order snapshot'),
        }),
      )
      .max(20)
      .optional(),
    items: z.array(itemSchema).max(100),
  })
  .superRefine((design, ctx) => {
    if (
      design.fabrication?.joinery === 'rabbet' &&
      (design.fabrication.rebate ?? 0.25) > design.fabrication.thickness / 2
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Rabbet depth must not exceed half the carcass stock thickness.',
      });
    if (JSON.stringify(design).length > 500000)
      ctx.addIssue({
        code: 'custom',
        message:
          'Design storage limit reached. Export your orders and start a new design.',
      });
    const issue = outlineIssue(
      design.room.outline,
      design.room.width,
      design.room.depth,
    );
    if (issue)
      ctx.addIssue({
        code: 'custom',
        path: ['room', 'outline'],
        message: issue,
      });
    if (design.room.curves?.length) {
      const curvedIssue = outlineIssue(
        roomOutline(design.room),
        design.room.width,
        design.room.depth,
        800,
      );
      if (curvedIssue)
        ctx.addIssue({
          code: 'custom',
          message: `Curved wall: ${curvedIssue}`,
        });
      if (
        new Set(design.room.curves.map((c) => c.wall)).size !==
        design.room.curves.length
      )
        ctx.addIssue({ code: 'custom', message: 'Only one curve per wall.' });
    }
    if (
      design.items.some(
        (i) =>
          isOpening(i) &&
          !i.opening &&
          roomEdges(design.room).some(
            (e) => e.index === i.wallSegment && e.curved,
          ),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Move perimeter openings to a straight wall before curving that wall.',
      });
    if (new Set(design.items.map((i) => i.id)).size !== design.items.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Each cabinet must have a unique ID',
      });
  });
export type Design = z.infer<typeof designSchema>;
export type Cabinet = z.infer<typeof itemSchema>;
export type Room = Design['room'];
export type Product = {
  _id: string;
  sku: string;
  category: string;
  width?: number | undefined;
  height?: number | undefined;
  depth?: number | undefined;
  pageNumber: number;
};
export const finishes = {
  linen: { top: '#f3eee3', front: '#e2d9c6', side: '#c5baa4' },
  oak: { top: '#e4cba4', front: '#cba878', side: '#aa8557' },
  slate: { top: '#859197', front: '#58686f', side: '#3c4c54' },
};
export function newDesign(): Design {
  return {
    format: 'kitchen-studio-v1',
    id: crypto.randomUUID(),
    name: 'My kitchen',
    room: {
      width: 144,
      depth: 120,
      height: 96,
      outline: [],
      walls: { north: true, east: true, south: true, west: true },
    },
    finish: 'oak',
    items: [],
  };
}
export function footprint(item: Cabinet) {
  const angle = (item.rotation * Math.PI) / 180,
    c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  return {
    width: Math.round((item.width * c + item.depth * s) * 1e8) / 1e8,
    depth: Math.round((item.width * s + item.depth * c) * 1e8) / 1e8,
  };
}
export function localToWorld(item: Cabinet, x: number, y: number) {
  const a = (item.rotation * Math.PI) / 180,
    f = footprint(item),
    dx = x - item.width / 2,
    dy = y - item.depth / 2;
  return {
    x: item.x + f.width / 2 + dx * Math.cos(a) - dy * Math.sin(a),
    y: item.y + f.depth / 2 + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
export function itemPolygon(item: Cabinet) {
  return [
    [0, 0],
    [item.width, 0],
    [item.width, item.depth],
    [0, item.depth],
  ].map(([x, y]) => localToWorld(item, x ?? 0, y ?? 0));
}
export function objectTransform(item: Cabinet) {
  const f = footprint(item);
  return `translate(${f.width / 2} ${f.depth / 2}) rotate(${item.rotation}) translate(${-item.width / 2} ${-item.depth / 2})`;
}

export function overlaps(a: Cabinet, b: Cabinet) {
  if (
    a.elevation + a.height <= b.elevation + 0.01 ||
    b.elevation + b.height <= a.elevation + 0.01
  )
    return false;
  const pa = itemPolygon(a),
    pb = itemPolygon(b);
  return [...pa, ...pb].every((p, i) => {
    const poly = i < 4 ? pa : pb,
      q = poly[((i % 4) + 1) % 4] ?? p,
      nx = -(q.y - p.y),
      ny = q.x - p.x;
    const aa = pa.map((v) => v.x * nx + v.y * ny),
      bb = pb.map((v) => v.x * nx + v.y * ny);
    return (
      Math.min(Math.max(...aa), Math.max(...bb)) -
        Math.max(Math.min(...aa), Math.min(...bb)) >
      0.01 * Math.hypot(nx, ny)
    );
  });
}
export function warnings(
  design: Design,
): { id: string; message: string; itemIds: string[] }[] {
  const result: ReturnType<typeof warnings> = [];
  design.items.forEach((item, index) => {
    if (
      isOpening(item) &&
      !item.opening &&
      (!item.wall || !design.room.walls[item.wall])
    )
      result.push({
        id: `wall-${item.id}`,
        message: `${item.sku} needs an enabled wall.`,
        itemIds: [item.id],
      });
    if (isOpening(item)) {
      const edge = roomEdges(design.room).find(
        (e) => e.index === item.wallSegment,
      );
      if (edge && item.width > edge.length + 0.01)
        result.push({
          id: `opening-size-${item.id}`,
          message: `${item.sku} is wider than its wall.`,
          itemIds: [item.id],
        });
    }
    if (
      item.kind === 'sink' &&
      !design.items.some(
        (host) =>
          (host.kind === 'countertop' || host.kind === 'island') &&
          containsFootprint(host, item) &&
          Math.abs(
            host.elevation + host.height - item.elevation - item.height,
          ) < 0.1,
      )
    )
      result.push({
        id: `sink-${item.id}`,
        message: 'Sink needs a supporting countertop at the same top height.',
        itemIds: [item.id],
      });
    if (item.kind === 'door') {
      const size = item.width,
        center = localToWorld(item, size / 2, item.depth + size / 2),
        f = footprint({ ...item, width: size, depth: size }),
        sw = {
          ...item,
          width: size,
          depth: size,
          x: center.x - f.width / 2,
          y: center.y - f.depth / 2,
        };
      const hit = design.items.find(
        (other) =>
          other.id !== item.id && !isOpening(other) && overlaps(sw, other),
      );
      if (hit)
        result.push({
          id: `swing-${item.id}`,
          message: `${item.sku} swing clearance may meet ${hit.sku}.`,
          itemIds: [item.id, hit.id],
        });
    }
    if (!polygonInside(itemPolygon(item), roomOutline(design.room)))
      result.push({
        id: `outside-${item.id}`,
        message: `${item.sku} extends beyond the room.`,
        itemIds: [item.id],
      });
    if (
      item.elevation + item.height + (item.details?.molding ? 2.65 : 0) >
      Math.min(
        ...itemPolygon(item).map((p) => ceilingAt(design.room, p.x, p.y)),
      ) +
        0.01
    )
      result.push({
        id: `ceiling-${item.id}`,
        message: `${item.sku} exceeds the ceiling height.`,
        itemIds: [item.id],
      });
    design.items.slice(index + 1).forEach((other) => {
      if (placementCollision(item, other))
        result.push({
          id: `overlap-${item.id}-${other.id}`,
          message: `${item.sku} overlaps ${other.sku}.`,
          itemIds: [item.id, other.id],
        });
    });
  });
  return [
    ...result,
    ...clearanceWarnings(design),
    ...installationIssues(design),
  ];
}
export function canPlace(
  product: Product,
): product is Product & { width: number; depth: number; height: number } {
  return (
    ['base_cabinet', 'wall_cabinet', 'pantry', 'oven_cabinet'].includes(
      product.category,
    ) &&
    [product.width, product.depth, product.height].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 600,
    )
  );
}
export function snapPosition(
  item: Cabinet,
  room: Room,
  x: number,
  y: number,
  snap: boolean,
) {
  if (item.opening) return { x, y };
  if (isOpening(item))
    return attachToWall(item, room, item.wall ?? 'north', x, y);
  const box = footprint(item);
  let nx = Math.round(x * 2) / 2,
    ny = Math.round(y * 2) / 2;
  if (snap) {
    for (const edge of roomEdges(room)) {
      if (!room.walls[edge.side] || edge.curved) continue;
      if (
        edge.a.y === edge.b.y &&
        nx >= Math.min(edge.a.x, edge.b.x) - 0.5 &&
        nx + box.width <= Math.max(edge.a.x, edge.b.x) + 0.5
      ) {
        const target = edge.a.y - (edge.side === 'south' ? box.depth : 0);
        if (Math.abs(ny - target) < 6) ny = target;
      }
      if (
        edge.a.x === edge.b.x &&
        ny >= Math.min(edge.a.y, edge.b.y) - 0.5 &&
        ny + box.depth <= Math.max(edge.a.y, edge.b.y) + 0.5
      ) {
        const target = edge.a.x - (edge.side === 'east' ? box.width : 0);
        if (Math.abs(nx - target) < 6) nx = target;
      }
    }
  }
  return {
    x: Math.min(Math.max(0, nx), Math.max(0, room.width - box.width)),
    y: Math.min(Math.max(0, ny), Math.max(0, room.depth - box.depth)),
  };
}
export function fromProduct(product: Product, versionId: string): Cabinet {
  if (!canPlace(product))
    throw Error(
      'This product needs known cabinet dimensions before it can be placed.',
    );
  return {
    id: crypto.randomUUID(),
    recordId: product._id,
    versionId,
    sku: product.sku,
    category: product.category,
    width: product.width,
    depth: product.depth,
    height: product.height,
    pageNumber: product.pageNumber,
    x: 0,
    y: 0,
    elevation: product.category === 'wall_cabinet' ? 54 : 0,
    rotation: 0,
    mirrored: false,
    kind: 'cabinet',
    assemblyId: null,
    frontStyle: 'auto',
    wallSegment: null,
    wall: null,
  };
}
export function findSpace(
  item: Cabinet,
  design: Design,
): { x: number; y: number } | null {
  const box = footprint(item);
  for (let y = 0; y <= design.room.depth - box.depth; y += 3) {
    for (let x = 0; x <= design.room.width - box.width; x += 3) {
      if (
        rectangleInside(design.room, x, y, box.width, box.depth) &&
        !design.items.some((other) =>
          placementCollision({ ...item, x, y }, other),
        )
      )
        return { x, y };
    }
  }
  return null;
}
export function parseDesign(text: string): Design {
  if (text.length > 500_000) throw Error('Design file is too large.');
  const design = designSchema.parse(JSON.parse(text));
  return {
    ...design,
    room: { ...design.room, outline: clockwise(design.room.outline) },
  };
}
export function csvBill(design: Design) {
  const groups = new Map<string, { item: Cabinet; quantity: number }>();
  design.items.forEach((item) => {
    const key = billKey(item);
    const existing = groups.get(key);
    if (existing) existing.quantity++;
    else groups.set(key, { item, quantity: 1 });
  });
  const quote = (s: string | number) =>
    `"${String(s)
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  return [
    ['SKU', 'Quantity', 'Width (in)', 'Depth (in)', 'Height (in)', 'PDF page'],
    ...Array.from(groups.values(), ({ item, quantity }) => [
      item.sku,
      quantity,
      item.width,
      item.depth,
      item.height,
      item.kind === 'cabinet' ? item.pageNumber : 'Demo object',
    ]),
  ]
    .map((row) => row.map(quote).join(','))
    .join('\n');
}

/** Door-front reflection changes handing, never the catalog envelope. */
export function mirrorCabinet(item: Cabinet): Cabinet {
  return { ...item, mirrored: !item.mirrored };
}
export function turnCabinet(item: Cabinet, degrees: 90 | 180): Cabinet {
  return {
    ...item,
    rotation: ((item.rotation + degrees) % 360) as Cabinet['rotation'],
  };
}
export function isUpperCabinet(item: Cabinet) {
  return (
    ['cabinet', 'custom_cabinet', 'corner'].includes(item.kind) &&
    (item.category === 'wall_cabinet' ||
      (item.elevation >= 40 && item.height <= 48))
  );
}
export function frontHandle(item: Cabinet): { x: number; y: number } {
  const along = item.width * (item.mirrored ? 0.2 : 0.8);
  switch (item.rotation) {
    case 90:
      return { x: 0, y: along };
    case 180:
      return { x: item.width - along, y: 0 };
    case 270:
      return { x: item.depth, y: item.width - along };
    default:
      return { x: along, y: item.depth };
  }
}

export type ObjectKind = Exclude<Cabinet['kind'], 'cabinet'>;
export type Wall = NonNullable<Cabinet['wall']>;
export const objectPresets: {
  kind: ObjectKind;
  name: string;
  width: number;
  depth: number;
  height: number;
  elevation: number;
}[] = [
  ...(
    [
      ['hood', 'Range hood', 30, 20, 12, 66],
      ['custom_cabinet', 'Custom cabinet', 24, 24, 34.5, 0],
      ['corner', 'Corner cabinet', 36, 36, 34.5, 0],
      ['filler', 'Filler', 3, 24, 34.5, 0],
      ['trim', 'Trim panel', 0.75, 24, 84, 0],
      ['molding', 'Crown molding', 60, 3, 3, 84],
      ['toe_kick', 'Toe kick', 60, 3, 4, 0],
      ['column', 'Column', 12, 12, 96, 0],
      ['beam', 'Ceiling beam', 120, 8, 10, 86],
      ['partition', 'Partition wall', 60, 4, 96, 0],
    ] as const
  ).map(([kind, name, width, depth, height, elevation]) => ({
    kind,
    name,
    width,
    depth,
    height,
    elevation,
  })),
  { kind: 'door', name: 'Door', width: 36, depth: 4, height: 80, elevation: 0 },
  {
    kind: 'window',
    name: 'Window',
    width: 48,
    depth: 4,
    height: 48,
    elevation: 36,
  },
  {
    kind: 'sink',
    name: 'Sink',
    width: 30,
    depth: 20,
    height: 8,
    elevation: 28,
  },
  {
    kind: 'refrigerator',
    name: 'Refrigerator',
    width: 36,
    depth: 30,
    height: 70,
    elevation: 0,
  },
  {
    kind: 'dishwasher',
    name: 'Dishwasher',
    width: 24,
    depth: 24,
    height: 34.5,
    elevation: 0,
  },
  {
    kind: 'washing_machine',
    name: 'Washing machine',
    width: 27,
    depth: 30,
    height: 39,
    elevation: 0,
  },
  {
    kind: 'range',
    name: 'Range',
    width: 30,
    depth: 26,
    height: 36,
    elevation: 0,
  },
  {
    kind: 'island',
    name: 'Island',
    width: 60,
    depth: 36,
    height: 36,
    elevation: 0,
  },
  {
    kind: 'countertop',
    name: 'Countertop',
    width: 60,
    depth: 25.5,
    height: 1.5,
    elevation: 34.5,
  },
];
export const objectOptions: {
  id: string;
  kind: ObjectKind;
  name: string;
  patch: Partial<Cabinet>;
}[] = [
  ...([24, 28, 30, 32, 36, 42] as const).map((width) => ({
    id: `door-${width}`,
    kind: 'door' as const,
    name: `Door ${width} × 80`,
    patch: { width, height: 80 },
  })),
  ...(
    [
      [24, 36],
      [36, 36],
      [48, 48],
      [60, 42],
      [72, 48],
    ] as const
  ).map(([width, height]) => ({
    id: `window-${width}`,
    kind: 'window' as const,
    name: `Window ${width} × ${height}`,
    patch: { width, height },
  })),
  ...(['single', 'double', 'french', 'top_freezer'] as const).map(
    (style, index) => ({
      id: `fridge-${style}`,
      kind: 'refrigerator' as const,
      name:
        [
          'Single-door refrigerator',
          'Two-door refrigerator',
          'French-door refrigerator',
          'Top-freezer refrigerator',
        ][index] ?? style,
      patch: {
        refrigeratorStyle: style,
        width: style === 'single' ? 28 : 36,
        height: 70,
      },
    }),
  ),
  ...(['single', 'double', 'farmhouse', 'prep'] as const).map(
    (style, index) => ({
      id: `sink-${style}`,
      kind: 'sink' as const,
      name:
        [
          'Single-bowl sink',
          'Double-bowl sink',
          'Farmhouse apron sink',
          'Compact prep sink',
        ][index] ?? style,
      patch: {
        sinkStyle: style,
        width: style === 'prep' ? 18 : style === 'single' ? 30 : 33,
        depth: style === 'prep' ? 16 : 22,
        height: style === 'farmhouse' ? 10 : 8,
      },
    }),
  ),
  ...(
    [
      [48, 30],
      [72, 36],
      [96, 42],
    ] as const
  ).map(([width, depth]) => ({
    id: `island-${width}`,
    kind: 'island' as const,
    name: `Island ${width} × ${depth}`,
    patch: {
      width,
      depth,
      surface: { seating: 'south' as const, waterfall: false },
    },
  })),
];
export function fromObject(kind: ObjectKind, option?: string): Cabinet {
  const preset = objectPresets.find((p) => p.kind === kind);
  if (!preset) throw Error('Unknown object');
  const choice = objectOptions.find((o) => o.id === option && o.kind === kind);
  return {
    id: crypto.randomUUID(),
    recordId: `demo-${kind}`,
    versionId: 'demo-objects',
    sku: preset.name,
    category: 'room_object',
    assemblyId: null,
    frontStyle: 'auto',
    wallSegment: null,
    kind,
    wall: kind === 'door' || kind === 'window' ? 'north' : null,
    width: preset.width,
    depth: preset.depth,
    height: preset.height,
    elevation: preset.elevation,
    pageNumber: 1,
    rotation: 0,
    mirrored: false,
    x: 0,
    y: 0,
    ...(choice?.patch ?? {}),
    ...(choice ? { sku: choice.name } : {}),
    ...(kind === 'sink' && choice
      ? { elevation: 36 - (choice.patch.height ?? 8) }
      : {}),
  };
}
export function objectOptionPatch(
  item: Cabinet,
  optionId: string,
): Partial<Cabinet> {
  const option = objectOptions.find(
    (o) => o.id === optionId && o.kind === item.kind,
  );
  if (!option) return {};
  return {
    ...option.patch,
    sku: option.name,
    ...(item.kind === 'sink'
      ? {
          elevation: Math.max(
            0,
            item.elevation + item.height - (option.patch.height ?? item.height),
          ),
        }
      : {}),
  };
}
export function isOpening(item: Cabinet) {
  return item.kind === 'door' || item.kind === 'window';
}
export function attachToWall(
  item: Cabinet,
  room: Room,
  wall: Wall,
  x = item.x,
  y = item.y,
) {
  const edges = roomEdges(room);
  const edge =
    edges.find((e) => e.index === item.wallSegment && e.side === wall) ??
    edges.find((e) => e.side === wall);
  if (!edge) return { x, y, rotation: item.rotation, wall, wallSegment: null };
  const dx = (edge.b.x - edge.a.x) / edge.length,
    dy = (edge.b.y - edge.a.y) / edge.length;
  const old = footprint(item),
    projection =
      (x + old.width / 2 - edge.a.x) * dx + (y + old.depth / 2 - edge.a.y) * dy;
  const t = Math.max(
    item.width / 2,
    Math.min(edge.length - item.width / 2, projection),
  );
  const rotation = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
    f = footprint({ ...item, rotation });
  return {
    wall,
    wallSegment: edge.index,
    rotation,
    x: edge.a.x + dx * t - (dy * item.depth) / 2 - f.width / 2,
    y: edge.a.y + dy * t + (dx * item.depth) / 2 - f.depth / 2,
  };
}

export function containsFootprint(host: Cabinet, item: Cabinet) {
  return polygonInside(itemPolygon(item), itemPolygon(host));
}

export function placementCollision(a: Cabinet, b: Cabinet) {
  if (a.opening?.hostId === b.id || b.opening?.hostId === a.id) return false;
  if (!overlaps(a, b)) return false;
  const sink = a.kind === 'sink' ? a : b.kind === 'sink' ? b : null,
    host = sink === a ? b : a;
  if (
    sink &&
    containsFootprint(host, sink) &&
    (host.kind === 'countertop' ||
      host.kind === 'island' ||
      ((host.kind === 'cabinet' || host.kind === 'custom_cabinet') &&
        host.sku.includes('SB')))
  )
    return false;
  return true;
}
export function billKey(item: Cabinet) {
  return item.kind === 'cabinet'
    ? `${item.versionId}:${item.recordId}`
    : `${item.kind}:${item.width}:${item.depth}:${item.height}`;
}
/** Tessellate a rectangle around rectangular holes, in local plane coordinates. */
export function cutPanels(
  width: number,
  height: number,
  holes: { x: number; y: number; width: number; height: number }[],
) {
  const xs = [
    ...new Set([
      0,
      width,
      ...holes.flatMap((h) => [
        Math.max(0, Math.min(width, h.x)),
        Math.max(0, Math.min(width, h.x + h.width)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      0,
      height,
      ...holes.flatMap((h) => [
        Math.max(0, Math.min(height, h.y)),
        Math.max(0, Math.min(height, h.y + h.height)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const panels: { x: number; y: number; width: number; height: number }[] = [];
  xs.slice(0, -1).forEach((x, i) =>
    ys.slice(0, -1).forEach((y, j) => {
      const w = (xs[i + 1] ?? x) - x,
        h = (ys[j + 1] ?? y) - y;
      if (
        w > 0 &&
        h > 0 &&
        !holes.some(
          (hole) =>
            x + w / 2 > hole.x &&
            x + w / 2 < hole.x + hole.width &&
            y + h / 2 > hole.y &&
            y + h / 2 < hole.y + hole.height,
        )
      )
        panels.push({ x, y, width: w, height: h });
    }),
  );
  return panels;
}
export function worldToLocal(item: Cabinet, x: number, y: number) {
  const f = footprint(item),
    a = (-item.rotation * Math.PI) / 180,
    dx = x - item.x - f.width / 2,
    dy = y - item.y - f.depth / 2;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + item.width / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + item.depth / 2,
  };
}

export function sinkHoles(host: Cabinet, items: Cabinet[]) {
  return items
    .filter(
      (s) =>
        s.kind === 'sink' &&
        containsFootprint(host, s) &&
        (s.sinkMount?.hostId === host.id ||
          Math.abs(s.elevation + s.height - host.elevation - host.height) <
            0.1),
    )
    .map((s) => {
      const points = itemPolygon(s).map((p) => worldToLocal(host, p.x, p.y)),
        a = {
          x: Math.min(...points.map((p) => p.x)),
          y: Math.min(...points.map((p) => p.y)),
        },
        b = {
          x: Math.max(...points.map((p) => p.x)),
          y: Math.max(...points.map((p) => p.y)),
        };
      const back =
        s.sinkMount?.mount === 'apron' &&
        Math.abs(((s.rotation - host.rotation + 360) % 360) - 180) < 0.1;
      return {
        x: Math.min(a.x, b.x),
        y: back ? 0 : Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height:
          s.sinkMount?.mount === 'apron'
            ? back
              ? Math.max(a.y, b.y)
              : host.depth - Math.min(a.y, b.y)
            : Math.abs(a.y - b.y),
      };
    });
}

export function resolvedFront(item: Cabinet) {
  return item.frontStyle !== 'auto'
    ? item.frontStyle
    : /^DB/.test(item.sku)
      ? 'drawers'
      : item.width >= 30
        ? 'double'
        : 'single';
}
export function updateAssembly(
  design: Design,
  id: string,
  patch: Partial<Cabinet>,
): Design {
  const original = design.items.find((i) => i.id === id);
  if (!original) return design;
  const updated = { ...original, ...patch };
  const angle =
    (((updated.rotation - original.rotation + 360) % 360) * Math.PI) / 180;
  const oldSize = footprint(original),
    newSize = footprint(updated);
  const oldCenter = {
      x: original.x + oldSize.width / 2,
      y: original.y + oldSize.depth / 2,
    },
    newCenter = {
      x: updated.x + newSize.width / 2,
      y: updated.y + newSize.depth / 2,
    };
  return {
    ...design,
    items: design.items.map((item) => {
      if (item.id === id) return updated;
      if (!original.assemblyId || item.assemblyId !== original.assemblyId)
        return item;
      const f = footprint(item),
        dx = item.x + f.width / 2 - oldCenter.x,
        dy = item.y + f.depth / 2 - oldCenter.y;
      const moved = {
        ...item,
        rotation: ((item.rotation +
          updated.rotation -
          original.rotation +
          360) %
          360) as Cabinet['rotation'],
        elevation: item.elevation + updated.elevation - original.elevation,
      };
      const size = footprint(moved);
      return {
        ...moved,
        x:
          Math.round(
            (newCenter.x +
              dx * Math.cos(angle) -
              dy * Math.sin(angle) -
              size.width / 2) *
              100,
          ) / 100,
        y:
          Math.round(
            (newCenter.y +
              dx * Math.sin(angle) +
              dy * Math.cos(angle) -
              size.depth / 2) *
              100,
          ) / 100,
      };
    }),
  };
}

/** User-adjustable demo envelopes; not manufacturer installation specifications. */
export function clearanceDefaults(item: Cabinet) {
  const appliance = [
    'refrigerator',
    'range',
    'dishwasher',
    'washing_machine',
  ].includes(item.kind);
  return {
    front: appliance
      ? 36
      : ['cabinet', 'custom_cabinet', 'corner', 'island'].includes(item.kind)
        ? resolvedFront(item) === 'drawers'
          ? 24
          : Math.min(
              item.width / (resolvedFront(item) === 'double' ? 2 : 1),
              30,
            )
        : 0,
    rear: appliance ? 1 : 0,
    side: appliance ? 1 : 0,
    above: item.kind === 'range' ? 30 : 0,
  };
}
export function clearanceWarnings(design: Design): ReturnType<typeof warnings> {
  const result: ReturnType<typeof warnings> = [];
  for (const item of design.items) {
    const selected = item.clearance ?? clearanceDefaults(item),
      profile = profileFor(item),
      c = profile
        ? {
            front: Math.max(selected.front, profile.clearance.front),
            rear: Math.max(selected.rear, profile.clearance.rear),
            side: Math.max(selected.side, profile.clearance.side),
            above: Math.max(selected.above, profile.clearance.above),
          }
        : selected,
      w = item.width,
      d = item.depth;
    const envelopes = [
      ['front', 0, d, w, c.front, 0, item.height],
      ['rear', 0, -c.rear, w, c.rear, 0, item.height],
      ['left', -c.side, 0, c.side, d, 0, item.height],
      ['right', w, 0, c.side, d, 0, item.height],
      ['above', 0, 0, w, d, item.height, c.above],
    ] as const;
    for (const [side, x, y, width, depth, z, height] of envelopes) {
      if (width <= 0 || depth <= 0 || height <= 0) continue;
      const center = localToWorld(item, x + width / 2, y + depth / 2),
        f = footprint({ ...item, width, depth }),
        probe = {
          ...item,
          width,
          depth,
          height,
          elevation: item.elevation + z,
          x: center.x - f.width / 2,
          y: center.y - f.depth / 2,
        };
      const hit = design.items.find(
        (other) =>
          other.id !== item.id && !isOpening(other) && overlaps(probe, other),
      );
      const outside = !polygonInside(
        itemPolygon(probe),
        roomOutline(design.room),
      );
      const ceiling =
        side === 'above' &&
        itemPolygon(probe).some(
          (p) => probe.elevation + height > ceilingAt(design.room, p.x, p.y),
        );
      if (hit || outside || ceiling)
        result.push({
          id: `clearance-${item.id}-${side}`,
          message: `${item.sku}: ${side} demo clearance ${hit ? `meets ${hit.sku}` : ceiling ? 'exceeds the ceiling' : 'extends past a room wall'}.`,
          itemIds: hit ? [item.id, hit.id] : [item.id],
        });
    }
    if (
      item.kind === 'dishwasher' &&
      !design.items.some(
        (s) =>
          s.kind === 'sink' && Math.hypot(s.x - item.x, s.y - item.y) <= 72,
      )
    )
      result.push({
        id: `service-${item.id}`,
        message: `${item.sku}: no sink within the 72″ demo service distance. Check plumbing and the installation manual.`,
        itemIds: [item.id],
      });
  }
  return result;
}

export function wallPanels(
  design: Design,
  edge: ReturnType<typeof roomEdges>[number],
) {
  const dx = (edge.b.x - edge.a.x) / edge.length,
    dy = (edge.b.y - edge.a.y) / edge.length;
  const openings = design.items
    .filter(
      (i) =>
        isOpening(i) &&
        !i.opening &&
        !edge.curved &&
        (i.wallSegment === edge.index ||
          (i.wallSegment === null && i.wall === edge.side)),
    )
    .map((i) => {
      const center = localToWorld(i, i.width / 2, 0);
      return {
        x:
          (center.x - edge.a.x) * dx + (center.y - edge.a.y) * dy - i.width / 2,
        y: i.elevation,
        width: i.width,
        height: i.height,
      };
    });
  const height = (x: number) =>
      ceilingAt(design.room, edge.a.x + dx * x, edge.a.y + dy * x),
    max = Math.max(
      height(0),
      height(edge.length),
      design.room.ceiling?.endHeight ?? 0,
    );
  if (design.room.ceiling?.kind === 'vault') {
    const c = design.room.ceiling,
      ridge =
        (c.axis === 'x' ? design.room.width : design.room.depth) *
        (c.ridge ?? 0.5),
      delta = c.axis === 'x' ? dx : dy;
    if (Math.abs(delta) > 1e-8) {
      const t = (ridge - edge.a[c.axis]) / delta;
      if (t > 0 && t < edge.length)
        openings.push({ x: t, y: 0, width: 0, height: 0 });
    }
  }
  return cutPanels(edge.length, max, openings)
    .map((r) => {
      const points = [
          { x: r.x, y: r.y },
          { x: r.x + r.width, y: r.y },
          { x: r.x + r.width, y: r.y + r.height },
          { x: r.x, y: r.y + r.height },
        ],
        out: { x: number; y: number }[] = [];
      points.forEach((a, i) => {
        const b = points[(i + 1) % 4] ?? a,
          fa = a.y - height(a.x),
          fb = b.y - height(b.x);
        if (fa <= 0) out.push(a);
        if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
          const t = fa / (fa - fb);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      });
      return out;
    })
    .filter((p) => p.length >= 3);
}

export function attachToPartition(item: Cabinet, host: Cabinet) {
  const opening = item.opening ?? {
      hostId: host.id,
      offset: 0,
      sill: item.kind === 'window' ? 36 : 0,
    },
    offset = Math.max(
      0,
      Math.min(opening.offset, Math.max(0, host.width - item.width)),
    );
  const rotation = host.rotation,
    depth = host.depth,
    f = footprint({ ...item, rotation, depth }),
    center = localToWorld(host, offset + item.width / 2, depth / 2);
  return {
    ...item,
    opening: { ...opening, offset },
    wall: null,
    wallSegment: null,
    rotation,
    depth,
    x: center.x - f.width / 2,
    y: center.y - f.depth / 2,
    elevation: host.elevation + opening.sill,
  };
}
export function normalizeOpenings(design: Design) {
  return {
    ...design,
    items: design.items.map((i) => {
      if (!isOpening(i)) return i;
      if (i.opening) {
        const host = design.items.find(
          (h) => h.id === i.opening?.hostId && h.kind === 'partition',
        );
        return host ? attachToPartition(i, host) : i;
      }
      return { ...i, ...attachToWall(i, design.room, i.wall ?? 'north') };
    }),
  };
}
export function partitionPanels(host: Cabinet, items: Cabinet[]) {
  return cutPanels(
    host.width,
    host.height,
    items
      .filter((i) => i.opening?.hostId === host.id)
      .map((i) => ({
        x: i.opening?.offset ?? 0,
        y: i.elevation - host.elevation,
        width: i.width,
        height: i.height,
      })),
  );
}
