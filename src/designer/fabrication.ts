import type { Design } from './model';
import { itemPolygon } from './model';
import { roomOutline } from './room';
export const shopDefaults = { thickness: 0.75, back: 0.25, gap: 0.125 };
export type PanelPart = {
  itemId: string;
  sku: string;
  part: string;
  quantity: number;
  width: number;
  height: number;
  thickness: number;
  note: string;
};
export function panelParts(design: Design) {
  const { thickness: t, back: b, gap: g } = design.fabrication ?? shopDefaults;
  const parts: PanelPart[] = [];
  const excluded: string[] = [];
  for (const item of design.items) {
    if (item.kind !== 'custom_cabinet') continue;
    const w = item.width,
      h =
        item.height - (item.elevation === 0 ? (item.details?.toeKick ?? 4) : 0),
      d = item.depth - b;
    if (w <= 2 * t + 2 * g || h <= 2 * t + 2 * g || d <= t) {
      excluded.push(`${item.sku}: dimensions too small for stock thickness.`);
      continue;
    }
    const add = (
      part: string,
      quantity: number,
      width: number,
      height: number,
      thickness: number,
      note: string,
    ) =>
      parts.push({
        itemId: item.id,
        sku: item.sku,
        part,
        quantity,
        width,
        height,
        thickness,
        note,
      });
    add('Side', 2, d, h, t, 'Grain along height; full-height sides.');
    add(
      'Top / bottom',
      2,
      w - 2 * t,
      d,
      t,
      'Butt joints between sides; no dado allowance.',
    );
    add(
      'Applied back',
      1,
      w,
      h,
      b,
      'Full overlay back; fastener pattern by shop.',
    );
    if (
      (item.details?.interior ?? 'shelves') === 'shelves' &&
      (item.details?.shelves ?? 2) > 0
    )
      add(
        'Adjustable shelf',
        item.details?.shelves ?? 2,
        w - 2 * t - 2 * g,
        d - t,
        t,
        'Shelf support drilling excluded.',
      );
    else if (item.details?.interior !== 'shelves')
      excluded.push(
        `${item.sku}: purchased pull-out / Lazy Susan hardware and trays excluded.`,
      );
    if (item.frontStyle === 'drawers')
      excluded.push(
        `${item.sku}: drawer fronts/boxes require hardware and reveal schedule; excluded.`,
      );
    else {
      const count =
        item.frontStyle === 'single'
          ? 1
          : item.width >= 30 || item.frontStyle === 'double'
            ? 2
            : 1;
      add(
        'Slab door blank',
        count,
        (w - (count + 1) * g) / count,
        h - 2 * g,
        t,
        'Full-overlay slab front; hinge boring, edge treatment and handles excluded.',
      );
    }
    const toe = item.elevation === 0 ? (item.details?.toeKick ?? 4) : 0;
    if (toe > 0)
      add(
        'Toe fascia',
        1,
        w,
        toe,
        t,
        'Separate support platform required; platform framing excluded.',
      );
    if (item.details?.molding)
      excluded.push(
        `${item.sku}: decorative molding profile/miter schedule excluded.`,
      );
  }
  return { parts, excluded };
}
function escaped(value: string | number) {
  return `"${String(value)
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""')}"`;
}
export function panelCsv(design: Design) {
  const { parts } = panelParts(design);
  return [
    ['CUSTOM CABINET PANEL SCHEDULE — SHOP REVIEW REQUIRED'],
    [
      'Units: mm; butt-joint carcass; no machining/drilling or edge-banding allowance',
    ],
    [
      'Item ID',
      'SKU',
      'Part',
      'Quantity',
      'Width mm',
      'Height mm',
      'Thickness mm',
      'Notes',
    ],
    ...parts.map((p) => [
      p.itemId,
      p.sku,
      p.part,
      p.quantity,
      +(p.width * 25.4).toFixed(3),
      +(p.height * 25.4).toFixed(3),
      +(p.thickness * 25.4).toFixed(3),
      p.note,
    ]),
  ]
    .map((row) => row.map(escaped).join(','))
    .join('\r\n');
}
function dxfFile(entities: string[]) {
  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
  ].join('\n');
}
function polyline(points: { x: number; y: number }[], layer: string) {
  return [
    '0',
    'LWPOLYLINE',
    '100',
    'AcDbEntity',
    '8',
    layer,
    '100',
    'AcDbPolyline',
    '90',
    String(points.length),
    '70',
    '1',
    ...points.flatMap((p) => [
      '10',
      (p.x * 25.4).toFixed(3),
      '20',
      (p.y * 25.4).toFixed(3),
    ]),
  ];
}
function text(x: number, y: number, label: string) {
  return [
    '0',
    'TEXT',
    '100',
    'AcDbEntity',
    '8',
    'LABELS',
    '100',
    'AcDbText',
    '10',
    String(x * 25.4),
    '20',
    String(y * 25.4),
    '30',
    '0',
    '40',
    '25.4',
    '1',
    label.replace(/[^a-zA-Z0-9 ._:/-]/g, '_').slice(0, 200),
    '100',
    'AcDbText',
  ];
}
export function planDxf(design: Design) {
  return dxfFile([
    ...text(
      0,
      design.room.depth + 12,
      'LAYOUT ONLY / mm / site and shop verification required',
    ),
    ...polyline(
      roomOutline(design.room).map((p) => ({
        x: p.x,
        y: design.room.depth - p.y,
      })),
      'ROOM',
    ),
    ...design.items.flatMap((item, index) => [
      ...polyline(
        itemPolygon(item).map((p) => ({ x: p.x, y: design.room.depth - p.y })),
        item.kind.toUpperCase(),
      ),
      ...text(item.x, design.room.depth - item.y, `${index + 1} ${item.sku}`),
    ]),
  ]);
}
export function partsDxf(design: Design) {
  let y = 0;
  const entities = [
    ...text(
      0,
      -4,
      'CUSTOM PANEL BLANKS / mm / no holes, joints, edge-banding or toolpaths',
    ),
  ];
  for (const part of panelParts(design).parts) {
    for (let n = 0; n < part.quantity; n++) {
      entities.push(
        ...polyline(
          [
            { x: 0, y },
            { x: part.width, y },
            { x: part.width, y: y + part.height },
            { x: 0, y: y + part.height },
          ],
          'CUT_OUTLINE',
        ),
        ...text(
          0,
          y + part.height + 1,
          `${part.sku} ${part.part} ${n + 1}/${part.quantity} thickness ${part.thickness * 25.4}mm`,
        ),
      );
      y += part.height + 5;
    }
  }
  return dxfFile(entities);
}
export function installationSchedule(design: Design) {
  return {
    format: 'kitchen-studio-installation-v1',
    units: 'inches',
    status:
      'Coordination drawings — verify on site; not a certified installation or CNC program',
    room: design.room,
    items: design.items.map((item, index) => ({
      number: index + 1,
      id: item.id,
      sku: item.sku,
      position: {
        x: item.x,
        y: item.y,
        elevation: item.elevation,
        rotation: item.rotation,
      },
      dimensions: { width: item.width, depth: item.depth, height: item.height },
      opening: item.opening,
      installation: item.installation,
    })),
    construction: { ...shopDefaults, ...design.fabrication },
    ...panelParts(design),
  };
}
