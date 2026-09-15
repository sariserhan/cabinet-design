import type { Design } from './model';
import {
  panelParts,
  shopDefaults,
  dxfFile,
  polyline,
  text as label,
} from './fabrication';
export const machiningDefaults = {
  ...shopDefaults,
  joinery: 'butt' as const,
  rebate: 0.25,
  edgeBandMm: 0,
  drilling: false,
  cupDiameterMm: 35,
  cupEdgeMm: 3,
  cupEndMm: 100,
  drillDepthMm: 12,
  shelfPitchMm: 32,
  shelfSetbackMm: 37,
  sheetWidth: 48,
  sheetHeight: 96,
  kerf: 0.125,
  allowRotate: false,
};
export function machiningSettings(design: Design) {
  return {
    thickness: design.fabrication?.thickness ?? machiningDefaults.thickness,
    back: design.fabrication?.back ?? machiningDefaults.back,
    gap: design.fabrication?.gap ?? machiningDefaults.gap,
    joinery: design.fabrication?.joinery ?? machiningDefaults.joinery,
    rebate: design.fabrication?.rebate ?? machiningDefaults.rebate,
    edgeBandMm: design.fabrication?.edgeBandMm ?? machiningDefaults.edgeBandMm,
    drilling: design.fabrication?.drilling ?? machiningDefaults.drilling,
    cupDiameterMm:
      design.fabrication?.cupDiameterMm ?? machiningDefaults.cupDiameterMm,
    cupEdgeMm: design.fabrication?.cupEdgeMm ?? machiningDefaults.cupEdgeMm,
    cupEndMm: design.fabrication?.cupEndMm ?? machiningDefaults.cupEndMm,
    drillDepthMm:
      design.fabrication?.drillDepthMm ?? machiningDefaults.drillDepthMm,
    shelfPitchMm:
      design.fabrication?.shelfPitchMm ?? machiningDefaults.shelfPitchMm,
    shelfSetbackMm:
      design.fabrication?.shelfSetbackMm ?? machiningDefaults.shelfSetbackMm,
    sheetWidth: design.fabrication?.sheetWidth ?? machiningDefaults.sheetWidth,
    sheetHeight:
      design.fabrication?.sheetHeight ?? machiningDefaults.sheetHeight,
    kerf: design.fabrication?.kerf ?? machiningDefaults.kerf,
    allowRotate:
      design.fabrication?.allowRotate ?? machiningDefaults.allowRotate,
  };
}
export type Hole = { x: number; y: number; diameter: number; depth: number };
export type Pocket = {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};
export type MachinedPanel = {
  id: string;
  sku: string;
  part: string;
  width: number;
  height: number;
  finishedWidth: number;
  finishedHeight: number;
  thickness: number;
  material: string;
  holes: Hole[];
  pockets: Pocket[];
  edgeBand: string;
  face: string;
};
export function machiningParts(design: Design) {
  const s = machiningSettings(design),
    result: MachinedPanel[] = [],
    issues = [...panelParts(design).excluded];
  panelParts(design).parts.forEach((part, index) => {
    for (let n = 0; n < part.quantity; n++) {
      const door = part.part === 'Slab door blank',
        side = part.part === 'Side',
        frontY =
          part.part === 'Top / bottom' || part.part === 'Adjustable shelf',
        e = s.edgeBandMm / 25.4,
        shiftX = door || side ? e : 0,
        shiftY = door || frontY ? e : 0,
        width = part.width - (door ? 2 * e : side ? e : 0),
        height = part.height - (door ? 2 * e : frontY ? e : 0);
      if (width <= 0 || height <= 0) {
        issues.push(`${part.sku} ${part.part}: banding leaves no blank.`);
        continue;
      }
      const panel: MachinedPanel = {
        id: `P${index + 1}-${n + 1}`,
        sku: part.sku,
        part: part.part,
        width,
        height,
        finishedWidth: part.width,
        finishedHeight: part.height,
        thickness: part.thickness,
        material: door ? 'door-stock' : 'plywood',
        holes: [],
        pockets: [],
        edgeBand: s.edgeBandMm
          ? door
            ? 'all four edges'
            : side
              ? 'front (X min)'
              : frontY
                ? 'front (Y min)'
                : 'none'
          : 'none',
        face: door ? 'back' : 'inside',
      };
      const hole = (x: number, y: number, diameter: number, depth: number) => {
        const h = { x: x - shiftX, y: y - shiftY, diameter, depth };
        if (
          depth >= part.thickness ||
          h.x - diameter / 2 < 0 ||
          h.y - diameter / 2 < 0 ||
          h.x + diameter / 2 > width ||
          h.y + diameter / 2 > height
        ) {
          issues.push(
            `${panel.id}: drilling omitted because depth or edge distance is invalid.`,
          );
          return;
        }
        panel.holes.push(h);
      };
      if (s.drilling && door) {
        const diameter = s.cupDiameterMm / 25.4,
          offset = (s.cupEdgeMm + s.cupDiameterMm / 2) / 25.4,
          x = part.quantity === 2 && n === 1 ? part.width - offset : offset,
          end = s.cupEndMm / 25.4;
        if (part.height <= end * 2)
          issues.push(
            `${panel.id}: door too short for configured hinge spacing.`,
          );
        else {
          hole(x, end, diameter, s.drillDepthMm / 25.4);
          hole(x, part.height - end, diameter, s.drillDepthMm / 25.4);
        }
      }
      if (s.drilling && side) {
        const setback = s.shelfSetbackMm / 25.4,
          pitch = s.shelfPitchMm / 25.4,
          rows = Math.floor((part.height - 2 * setback) / pitch) + 1;
        if (rows > 200)
          issues.push(
            `${panel.id}: shelf pattern exceeds 200 rows; increase spacing.`,
          );
        else
          for (let i = 0; i < rows; i++) {
            hole(setback, setback + i * pitch, 5 / 25.4, s.drillDepthMm / 25.4);
            hole(
              part.width - setback,
              setback + i * pitch,
              5 / 25.4,
              s.drillDepthMm / 25.4,
            );
          }
      }
      if (s.joinery === 'rabbet' && side) {
        const depth = s.rebate;
        if (depth > 0 && depth <= part.thickness / 2)
          for (const y of [0, part.height - s.thickness])
            panel.pockets.push({ x: 0, y, width, height: s.thickness, depth });
        else issues.push(`${panel.id}: invalid rabbet depth.`);
      }
      result.push(panel);
    }
  });
  return { panels: result, issues: [...new Set(issues)] };
}
export type NestedSheet = {
  id: number;
  material: string;
  thickness: number;
  placements: {
    panel: MachinedPanel;
    x: number;
    y: number;
    rotated: boolean;
    width: number;
    height: number;
  }[];
  rows: { y: number; height: number; x: number }[];
};
export function nestPanels(design: Design) {
  const s = machiningSettings(design),
    sheets: NestedSheet[] = [],
    unplaced: MachinedPanel[] = [];
  const panels = [...machiningParts(design).panels].sort(
    (a, b) => b.height - a.height || b.width - a.width,
  );
  for (const panel of panels) {
    const orientations = [
      { width: panel.width, height: panel.height, rotated: false },
      ...(s.allowRotate
        ? [{ width: panel.height, height: panel.width, rotated: true }]
        : []),
    ];
    const fits = orientations.filter(
      (o) => o.width <= s.sheetWidth && o.height <= s.sheetHeight,
    );
    if (!fits.length) {
      unplaced.push(panel);
      continue;
    }
    let placed = false;
    for (const sheet of sheets.filter(
      (sheet) =>
        sheet.material === panel.material &&
        Math.abs(sheet.thickness - panel.thickness) < 1e-6,
    )) {
      for (const o of fits) {
        const row = sheet.rows.find(
          (r) => r.height >= o.height && r.x + o.width <= s.sheetWidth,
        );
        if (row) {
          sheet.placements.push({ panel, x: row.x, y: row.y, ...o });
          row.x += o.width + s.kerf;
          placed = true;
          break;
        }
        const y = sheet.rows.reduce(
          (max, r) => Math.max(max, r.y + r.height + s.kerf),
          0,
        );
        if (y + o.height <= s.sheetHeight) {
          sheet.rows.push({ y, height: o.height, x: o.width + s.kerf });
          sheet.placements.push({ panel, x: 0, y, ...o });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const o = fits[0];
      if (!o) continue;
      const sheet: NestedSheet = {
        id: sheets.length + 1,
        material: panel.material,
        thickness: panel.thickness,
        rows: [{ y: 0, height: o.height, x: o.width + s.kerf }],
        placements: [{ panel, x: 0, y: 0, ...o }],
      };
      sheets.push(sheet);
    }
  }
  const used = sheets.reduce(
    (n, sheet) =>
      n + sheet.placements.reduce((n, p) => n + p.width * p.height, 0),
    0,
  );
  return {
    sheets,
    unplaced,
    utilization: sheets.length
      ? used / (sheets.length * s.sheetWidth * s.sheetHeight)
      : 0,
  };
}
function circle(h: Hole, offsetX = 0, offsetY = 0) {
  return [
    '0',
    'CIRCLE',
    '100',
    'AcDbEntity',
    '8',
    `BORE_DEPTH_${(h.depth * 25.4).toFixed(2).replace('.', '_')}`,
    '100',
    'AcDbCircle',
    '10',
    String((h.x + offsetX) * 25.4),
    '20',
    String((h.y + offsetY) * 25.4),
    '30',
    '0',
    '40',
    String((h.diameter * 25.4) / 2),
  ];
}
export function machiningDxf(design: Design) {
  let y = 0;
  const entities = [
    ...label(
      0,
      -4,
      'USER TEMPLATE / mm / labeled inside or back face / verify hardware before machining',
    ),
  ];
  for (const p of machiningParts(design).panels) {
    entities.push(
      ...polyline(
        [
          { x: 0, y },
          { x: p.width, y },
          { x: p.width, y: y + p.height },
          { x: 0, y: y + p.height },
        ],
        'BLANK',
      ),
      ...label(
        0,
        y + p.height + 1,
        `${p.id} ${p.sku} ${p.part} FACE ${p.face}`,
      ),
      ...p.holes.flatMap((h) => circle(h, 0, y)),
      ...p.pockets.flatMap((r) =>
        polyline(
          [
            { x: r.x, y: y + r.y },
            { x: r.x + r.width, y: y + r.y },
            { x: r.x + r.width, y: y + r.y + r.height },
            { x: r.x, y: y + r.y + r.height },
          ],
          `RABBET_DEPTH_${(r.depth * 25.4).toFixed(2).replace('.', '_')}`,
        ),
      ),
    );
    y += p.height + 5;
  }
  return dxfFile(entities);
}
export function nestingDxf(design: Design) {
  const s = machiningSettings(design),
    entities: string[] = [
      ...label(
        0,
        -7,
        `${nestPanels(design).unplaced.length} oversized blanks omitted; see manufacturing report`,
      ),
    ];
  for (const sheet of nestPanels(design).sheets) {
    const offset = (sheet.id - 1) * (s.sheetWidth + 8);
    entities.push(
      ...polyline(
        [
          { x: offset, y: 0 },
          { x: offset + s.sheetWidth, y: 0 },
          { x: offset + s.sheetWidth, y: s.sheetHeight },
          { x: offset, y: s.sheetHeight },
        ],
        'SHEET',
      ),
      ...label(
        offset,
        -3,
        `Sheet ${sheet.id} ${sheet.material} ${sheet.thickness * 25.4}mm / outlines only; machining in separate file`,
      ),
    );
    for (const p of sheet.placements)
      entities.push(
        ...polyline(
          [
            { x: offset + p.x, y: p.y },
            { x: offset + p.x + p.width, y: p.y },
            { x: offset + p.x + p.width, y: p.y + p.height },
            { x: offset + p.x, y: p.y + p.height },
          ],
          'BLANK',
        ),
        ...label(
          offset + p.x + 0.5,
          p.y + 1.5,
          `${p.panel.id}${p.rotated ? ' ROTATED90' : ''}`,
        ),
      );
  }
  return dxfFile(entities);
}
export function manufacturingCsv(design: Design) {
  const rows = [
    [
      'Panel',
      'SKU',
      'Part',
      'Blank W mm',
      'Blank H mm',
      'Finished W mm',
      'Finished H mm',
      'Stock mm',
      'Band edges',
      'Face',
      'Bores',
      'Rabbets',
    ],
    ...machiningParts(design).panels.map((p) => [
      p.id,
      p.sku,
      p.part,
      ...[
        p.width,
        p.height,
        p.finishedWidth,
        p.finishedHeight,
        p.thickness,
      ].map((n) => (n * 25.4).toFixed(3)),
      p.edgeBand,
      p.face,
      p.holes.length,
      p.pockets.length,
    ]),
  ];
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            `"${String(v)
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""')}"`,
        )
        .join(','),
    )
    .join('\r\n');
}
