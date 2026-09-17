import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  type Design,
  type Cabinet,
  itemPolygon,
  isOpening,
  warnings,
} from './model';
import { roomOutline, roomEdges, ceilingAt } from './room';
import { canonical } from './installer-handoff';
import { measurementStatus } from './project-workflow';
import { itemConfiguration } from './supplier-pricing';
import { annotationLabel, onLayer } from './annotations';
import { servicePoints } from './services';
export const drawingOptionsSchema = z.object({
  company: z.string().trim().max(160),
  client: z.string().max(160),
  reference: z.string().trim().min(1).max(80),
  revision: z.string().trim().min(1).max(40),
  preparedBy: z.string().trim().min(1).max(120),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (s) =>
        Number.isFinite(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
    ),
  purpose: z.enum([
    'Client review',
    'Dealer review',
    'Installation coordination',
  ]),
  unit: z.enum(['in', 'mm']),
  /** Which annotations this issue carries; see `annotations.ts`. */
  layer: z.enum(['all', 'design', 'installation', 'client']).default('all'),
  /** Which sheets to issue. A set is composed, not fixed. */
  sheets: z
    .object({
      plan: z.boolean().default(true),
      upper: z.boolean().default(true),
      elevations: z.boolean().default(true),
      schedules: z.boolean().default(true),
    })
    .default({ plan: true, upper: true, elevations: true, schedules: true }),
  scale: z.union([
    z.literal(20),
    z.literal(24),
    z.literal(25),
    z.literal(48),
    z.literal(50),
    z.literal(100),
  ]),
  notes: z.string().max(3000),
});
/**
 * What a caller passes. The defaulted fields - the annotation layer and
 * which sheets to issue - may be left out, which is what `z.input` means
 * here; `drawingOptionsSchema.parse` fills them in.
 */
export type DrawingOptions = z.input<typeof drawingOptionsSchema>;
export type DrawingIssue = z.infer<typeof drawingOptionsSchema>;
const escape = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
const round = (n: number) => Number(n.toFixed(3));
export const drawingReference = (d: Design) =>
  bytesToHex(sha256(new TextEncoder().encode(canonical(d)))).slice(0, 12);
export function drawingConfiguration(item: Cabinet) {
  const labels: string[] = [];
  if (item.frontStyle !== 'auto') labels.push(`${item.frontStyle} front`);
  if (item.mirrored) labels.push('Mirrored / reversed handing');
  if (item.details) {
    labels.push(
      `${item.details.shelves} shelves`,
      `${item.details.toeKick} in toe kick`,
      item.details.interior.replaceAll('_', ' '),
    );
    if (item.details.molding) labels.push('Molding');
    if (item.details.corner)
      labels.push(item.details.corner.replaceAll('_', ' '));
    // Ordering attributes, said plainly: a supplier reads these.
    if (item.details.hinge && item.details.hinge !== 'unspecified')
      labels.push(
        item.details.hinge === 'pair'
          ? 'Pair of doors'
          : `Hinged ${item.details.hinge}`,
      );
    if (item.details.drawers) labels.push(`${item.details.drawers} drawers`);
    if (item.details.rollouts) labels.push(`${item.details.rollouts} rollouts`);
  }
  if (item.sinkStyle) labels.push(`${item.sinkStyle} sink`);
  if (item.refrigeratorStyle)
    labels.push(item.refrigeratorStyle.replaceAll('_', ' '));
  if (item.surface?.waterfall) labels.push('Waterfall');
  if (item.surface?.overhangs)
    labels.push(
      'Overhangs (in): ' +
        Object.entries(item.surface.overhangs)
          .map(([side, n]) => `${side} ${n}`)
          .join(', '),
    );
  if (item.surface?.seating && item.surface.seating !== 'none')
    labels.push(`${item.surface.seating} seating`);
  return labels.join('; ') || 'Standard';
}
export function drawingRows(d: Design) {
  return d.items.map((i, n) => ({
    mark: `I${String(n + 1).padStart(3, '0')}`,
    item: i,
    finish:
      i.kind === 'countertop'
        ? (i.countertop ?? d.appearance?.countertop ?? 'quartz')
        : (i.finish ?? d.finish),
    configuration: itemConfiguration(i),
  }));
}
export function groupedDrawingItems(d: Design) {
  const groups = new Map<
    string,
    {
      marks: string[];
      item: Cabinet;
      finish: string;
      configuration: string;
      quantity: number;
    }
  >();
  for (const r of drawingRows(d)) {
    if (isOpening(r.item)) continue;
    const i = r.item,
      key = canonical([
        i.sku,
        i.kind,
        i.versionId,
        i.recordId,
        i.width,
        i.depth,
        i.height,
        r.finish,
        r.configuration,
        i.mirrored ?? false,
      ]);
    const existing = groups.get(key);
    if (existing) {
      existing.marks.push(r.mark);
      existing.quantity++;
    } else groups.set(key, { ...r, marks: [r.mark], quantity: 1 });
  }
  return [...groups.values()];
}
const cell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function drawingItemCsv(d: Design) {
  return [
    [
      'Marks (this issue)',
      'Item IDs',
      'SKU',
      'Kind',
      'Quantity',
      'Width (in)',
      'Depth (in)',
      'Height (in)',
      'Finish / material',
      'Configuration',
      'Catalog version',
      'Source record',
      'PDF page',
    ],
    ...groupedDrawingItems(d).map((r) => [
      r.marks.join(' '),
      drawingRows(d)
        .filter((x) => r.marks.includes(x.mark))
        .map((x) => x.item.id)
        .join(' '),
      r.item.sku,
      r.item.kind,
      r.quantity,
      r.item.width,
      r.item.depth,
      r.item.height,
      r.finish,
      drawingConfiguration(r.item),
      r.item.versionId,
      r.item.recordId,
      r.item.pageNumber,
    ]),
  ]
    .map((r) => r.map(cell).join(','))
    .join('\r\n');
}
const chunks = <T>(rows: T[], n: number) =>
  Array.from({ length: Math.ceil(rows.length / n) }, (_, i) =>
    rows.slice(i * n, (i + 1) * n),
  );
export function drawingPackageHtml(d: Design, input: DrawingOptions) {
  const o = drawingOptionsSchema.parse(input),
    rows = drawingRows(d),
    edges = roomEdges(d.room),
    outline = roomOutline(d.room),
    digest = drawingReference(d),
    font = (2.8 * o.scale) / 25.4,
    pad = (15 * o.scale) / 25.4;
  const length = (n: number) =>
    `${Number((n * (o.unit === 'mm' ? 25.4 : 1)).toFixed(o.unit === 'mm' ? 1 : 3))} ${o.unit}`;
  const text = (x: number, y: number, label: string, anchor = 'middle') =>
    `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" font-size="${font}">${escape(label)}</text>`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}"/>`;
  const dimension = (x1: number, x2: number, y: number) =>
    line(x1, y, x2, y) +
    line(x1, y - font / 2, x1, y + font / 2) +
    line(x2, y - font / 2, x2, y + font / 2) +
    text((x1 + x2) / 2, y - font * 0.7, length(x2 - x1));
  const svg = (
    minX: number,
    minY: number,
    width: number,
    height: number,
    body: string,
  ) => {
    const w = ((width + pad * 2) * 25.4) / o.scale,
      h = ((height + pad * 2) * 25.4) / o.scale;
    if (w > 380 || h > 211)
      throw Error(
        `Drawing exceeds the A3 sheet at 1:${o.scale}. Choose a smaller drawing scale (up to 1:100), or reduce the drawing extent.`,
      );
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dimensioned drawing" width="${w}mm" height="${h}mm" viewBox="${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}" style="font-family:Arial,sans-serif;stroke:#283e43;stroke-width:${(0.22 * o.scale) / 25.4};fill:none"><style>text{fill:#172e34;stroke:none}.tag{paint-order:stroke;stroke:white;stroke-width:${font * 0.2}}</style>${body}</svg>`;
  };
  const pages: { title: string; body: string; scale?: boolean }[] = [];
  const issues = warnings(d),
    survey = measurementStatus(d);
  pages.push({
    title: 'Issue information',
    body: `<h2>${escape(o.purpose)}</h2><div class="metadata"><div><strong>Client</strong><p>${escape(o.client || 'Not recorded')}</p><strong>Prepared by</strong><p>${escape(o.preparedBy)}</p></div><div><strong>Room</strong><p>${escape(length(d.room.width))} × ${escape(length(d.room.depth))}; ceiling ${escape(length(d.room.height))}</p><strong>Contents</strong><p>${rows.length} placed items · ${groupedDrawingItems(d).length} grouped supply lines</p></div></div><h3>Review status</h3><p>${escape(survey || 'Recorded room survey matches the current room geometry.')}</p><p>${issues.length} unresolved modeled layout/installation checks. Catalog references identify source records; source accuracy, options and pricing require separate verification.</p><p>COORDINATION DRAFT — verify site dimensions, appliance specifications, services, fillers, tolerances and supplier configurations before ordering or installing. This package does not confer client, manufacturer or installer approval.</p><h3>Drawing conventions</h3><p>Plan X runs right and Y runs down from the room model origin (0,0). Elevations show projections of items within 36 inches of an enabled straight wall. Room openings appear in the placement schedule and are excluded from the supply list. Marks are consistent across this issue; full item IDs identify objects across revisions.</p><p>Print on A3 landscape at 100% / actual size. Do not fit to page. Drawing sheets are 1:${o.scale}; tables are not to scale. Confirm the 100 mm calibration line below before measuring a printed drawing.</p><div class="calibration"></div><p>100 mm on paper</p><h3>Issue notes</h3><p class="notes">${escape(o.notes || 'No additional issue notes.')}</p>`,
  });
  for (const layer of ['Floor and low items', 'Upper items'] as const) {
    const subset = rows.filter((r) =>
      layer === 'Floor and low items'
        ? r.item.elevation < 40
        : r.item.elevation >= 40,
    );
    if (!subset.length && layer === 'Upper items') continue;
    // A set is composed: a client pack may want the plan alone.
    if (layer === 'Upper items' ? !o.sheets.upper : !o.sheets.plan) continue;
    const points = [...outline, ...subset.flatMap((r) => itemPolygon(r.item))],
      minX = Math.min(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y)),
      maxX = Math.max(...points.map((p) => p.x)),
      maxY = Math.max(...points.map((p) => p.y));
    let body = `<polygon points="${outline.map((p) => `${p.x},${p.y}`).join(' ')}" fill="#fafafa"/>`;
    for (const e of edges)
      body += text(
        (e.a.x + e.b.x) / 2,
        (e.a.y + e.b.y) / 2 - font,
        `W${e.index + 1}`,
      );
    const occupied: { x: number; y: number }[] = [];
    for (const { item: i, mark } of subset) {
      const p = itemPolygon(i),
        cx = p.reduce((s, p) => s + p.x, 0) / p.length,
        cy = p.reduce((s, p) => s + p.y, 0) / p.length;
      let tx = cx,
        ty = cy;
      for (
        let n = 0;
        n < 40 &&
        occupied.some(
          (p) =>
            Math.abs(p.x - tx) < font * 3 && Math.abs(p.y - ty) < font * 1.3,
        );
        n++
      ) {
        tx = cx + (n % 2 ? -1 : 1) * font * 2;
        ty = cy + Math.ceil((n + 1) / 2) * font * 1.4;
      }
      occupied.push({ x: tx, y: ty });
      body += `<polygon points="${p.map((p) => `${p.x},${p.y}`).join(' ')}" fill="${isOpening(i) ? '#e4edf2' : i.kind === 'countertop' ? '#eeeeee' : '#e8e3d8'}" fill-opacity="0.55"/>`;
      if (tx !== cx || ty !== cy) body += line(cx, cy, tx, ty);
      body += text(tx, ty, mark);
    }
    // The surveyed services, which the drawings never carried although the
    // survey has always recorded them. Floor plan only: they are located
    // in plan and their heights are in the schedule.
    if (layer === 'Floor and low items')
      for (const service of servicePoints(d)) {
        body += `<circle cx="${round(service.x)}" cy="${round(service.y)}" r="${round(font * 0.45)}" fill="#ffffff" stroke="#172e34"/>`;
        body += text(service.x, service.y + font * 0.3, service.mark);
      }
    // What the designer marked by hand belongs on the sheet: a drawing that
    // silently drops its own notes is worse than one without them.
    for (const a of (d.annotations ?? []).filter((a) => onLayer(a, o.layer))) {
      const label = annotationLabel(a, o.unit === 'mm' ? 'mm' : 'in');
      if (a.kind === 'angle') {
        const ax = a.x2 ?? a.x,
          ay = a.y2 ?? a.y,
          bx = a.x3 ?? a.x,
          by = a.y3 ?? a.y;
        body +=
          line(ax, ay, a.x, a.y) +
          line(a.x, a.y, bx, by) +
          text(a.x, a.y - font * 0.5, label);
        continue;
      }
      if (a.kind === 'note') {
        // A leader, where the note points at something.
        if (a.x2 !== undefined && a.y2 !== undefined)
          body += line(a.x, a.y, a.x2, a.y2);
        body += `<circle cx="${round(a.x)}" cy="${round(a.y)}" r="${round(font * 0.35)}" fill="#172e34"/>`;
        if (label)
          body += text(a.x + font * 0.7, a.y + font * 0.35, label, 'start');
        continue;
      }
      const x2 = a.x2 ?? a.x,
        y2 = a.y2 ?? a.y,
        span = Math.hypot(x2 - a.x, y2 - a.y) || 1,
        tickX = ((y2 - a.y) / span) * font * 0.45,
        tickY = (-(x2 - a.x) / span) * font * 0.45;
      body +=
        line(a.x, a.y, x2, y2) +
        line(a.x - tickX, a.y - tickY, a.x + tickX, a.y + tickY) +
        line(x2 - tickX, y2 - tickY, x2 + tickX, y2 + tickY) +
        text((a.x + x2) / 2, (a.y + y2) / 2 - font * 0.4, label);
    }
    body +=
      dimension(minX, maxX, maxY + pad * 0.55) +
      line(minX - pad * 0.5, minY, minX - pad * 0.5, maxY) +
      `<g transform="rotate(-90 ${minX - pad * 0.55} ${(minY + maxY) / 2})">${text(minX - pad * 0.55, (minY + maxY) / 2, length(maxY - minY))}</g>`;
    pages.push({
      title:
        layer === 'Floor and low items'
          ? 'P01 · Floor plan'
          : 'P02 · Upper plan',
      scale: true,
      body: `<p>${layer === 'Floor and low items' ? 'Items below 40 inches above floor' : 'Items at or above 40 inches above floor'}. Overall dimensions show the depicted extent; wall lengths are in the wall schedule.</p><div class="drawing">${svg(minX, minY, maxX - minX, maxY - minY, body)}</div>`,
    });
  }
  for (const edge of o.sheets.elevations
    ? edges.filter((e) => d.room.walls[e.side] && !e.curved)
    : []) {
    const dx = (edge.b.x - edge.a.x) / edge.length,
      dy = (edge.b.y - edge.a.y) / edge.length;
    const projected = rows.flatMap((r) => {
      const points = itemPolygon(r.item),
        t = points.map((p) => (p.x - edge.a.x) * dx + (p.y - edge.a.y) * dy),
        normal = points.map(
          (p) => -(p.x - edge.a.x) * dy + (p.y - edge.a.y) * dx,
        ),
        x = Math.min(...t),
        width = Math.max(...t) - x;
      return Math.min(...normal) >= -1 &&
        Math.min(...normal) < 36 &&
        x >= -0.01 &&
        x + width <= edge.length + 0.01
        ? [{ ...r, x, width }]
        : [];
    });
    if (!projected.length) continue;
    const height = Math.max(
      d.room.height,
      d.room.ceiling?.endHeight ?? 0,
      ...projected.map((r) => r.item.elevation + r.item.height),
    );
    let body = `<polygon points="0,${height} ${edge.length},${height} ${edge.length},${height - ceilingAt(d.room, edge.b.x, edge.b.y)} 0,${height - ceilingAt(d.room, edge.a.x, edge.a.y)}" fill="#fafafa"/>`;
    for (const r of projected) {
      body += `<rect x="${r.x}" y="${height - r.item.elevation - r.item.height}" width="${r.width}" height="${r.item.height}" fill="#e8e3d8" fill-opacity=".4"/>`;
      body += text(
        r.x + r.width / 2,
        height - r.item.elevation - r.item.height / 2,
        r.mark,
      );
      if ((r.width * 25.4) / o.scale > 18)
        body += text(
          r.x + r.width / 2,
          height - r.item.elevation - r.item.height / 2 + font * 1.4,
          length(r.width),
        );
    }
    body +=
      dimension(0, edge.length, height + pad * 0.55) +
      `<g transform="rotate(-90 ${-pad * 0.55} ${height / 2})">${text(-pad * 0.55, height / 2, length(height))}</g>`;
    pages.push({
      title: `E${String(edge.index + 1).padStart(2, '0')} · Wall ${edge.index + 1} elevation`,
      scale: true,
      body: `<p>Projected widths shown inside items where space allows. Heights, elevations and product dimensions are in the placement schedule. Adjacent items can appear on two wall projections.</p><div class="drawing">${svg(0, 0, edge.length, height, body)}</div>`,
    });
  }
  const services = servicePoints(d);
  if (o.sheets.schedules && services.length)
    pages.push({
      title: 'U01 · Service schedule',
      body: `<table><thead><tr><th>Mark</th><th>Service</th><th>Plan X / Y</th><th>Height</th><th>Survey note</th></tr></thead><tbody>${services
        .map(
          (s) =>
            `<tr><td>${s.mark}</td><td>${escape(s.kind)}</td><td>${length(s.x)} / ${length(s.y)}</td><td>${length(s.height)}</td><td>${escape(s.notes || '—')}</td></tr>`,
        )
        .join(
          '',
        )}</tbody></table><p>Positions as surveyed and recorded in this design. Confirm on site before first fix; this drawing does not authorise any service alteration.</p>`,
    });
  if (o.sheets.schedules)
    pages.push({
      title: 'W01 · Wall schedule',
      body: `<table><thead><tr><th>Wall</th><th>Start X / Y</th><th>End X / Y</th><th>Length</th><th>Drawing coverage</th></tr></thead><tbody>${edges.map((e) => `<tr><td>W${e.index + 1}</td><td>${length(e.a.x)} / ${length(e.a.y)}</td><td>${length(e.b.x)} / ${length(e.b.y)}</td><td>${length(e.length)}</td><td>${e.curved ? 'Curved: sampled length; no straight elevation' : !d.room.walls[e.side] ? 'Disabled wall' : 'Straight wall; elevation included when adjacent items exist'}</td></tr>`).join('')}</tbody></table><p>Internal partitions and freestanding islands are located by the floor plan and placement schedule. Curved-wall coordinates are retained in the accompanying design JSON.</p>`,
    });
  for (const [page, part] of (o.sheets.schedules
    ? chunks(rows, 6)
    : []
  ).entries())
    pages.push({
      title: `S${String(page + 1).padStart(2, '0')} · Placement schedule`,
      body: `<table><thead><tr><th>Mark / item ID</th><th>SKU / type</th><th>W × D × H</th><th>X / Y / elevation</th><th>Rotation</th><th>Material / configuration</th><th>Source</th></tr></thead><tbody>${part
        .map((r) => {
          const i = r.item;
          return `<tr><td><strong>${r.mark}</strong><small>${escape(i.id)}</small></td><td>${escape(i.sku)}<small>${escape(i.kind)}</small></td><td>${length(i.width)} × ${length(i.depth)} × ${length(i.height)}</td><td>${length(i.x)} / ${length(i.y)} / ${length(i.elevation)}</td><td>${i.rotation}°${i.mirrored ? ' · mirrored' : ''}</td><td>${escape(r.finish)}<small>${escape(drawingConfiguration(r.item))}</small></td><td>${i.kind === 'cabinet' ? `${escape(i.versionId)}<small>${escape(i.recordId)} · PDF page ${i.pageNumber}</small>` : 'Generic / custom item; verify specification'}${i.note ? '<small>See item notes</small>' : ''}</td></tr>`;
        })
        .join(
          '',
        )}</tbody></table><p>X / Y are the modeled footprint position; elevation is height above floor. Coordinate origin is the same as the floor plan. Hidden scene items remain included in this issue.</p>`,
    });
  for (const [page, part] of chunks(groupedDrawingItems(d), 10).entries())
    pages.push({
      title: `Q${String(page + 1).padStart(2, '0')} · Grouped supply list`,
      body: `<table><thead><tr><th>Marks</th><th>SKU</th><th>Qty</th><th>W × D × H</th><th>Material / configuration</th><th>Catalog version</th></tr></thead><tbody>${part.map((r) => `<tr><td>${r.marks.join(', ')}</td><td>${escape(r.item.sku)}</td><td>${r.quantity}</td><td>${length(r.item.width)} × ${length(r.item.depth)} × ${length(r.item.height)}</td><td>${escape(r.finish)}<small>${escape(drawingConfiguration(r.item))}</small></td><td>${escape(r.item.versionId)}</td></tr>`).join('')}</tbody></table><p>Quantities are grouped only when SKU, source, dimensions, material and configuration match. Room openings are excluded. No pricing or supplier order is implied.</p>`,
    });
  for (const [page, part] of chunks(
    rows.filter((r) => r.item.note),
    4,
  ).entries())
    pages.push({
      title: `N${page + 1} · Item notes`,
      body: part
        .map(
          (r) =>
            `<h3>${r.mark} · ${escape(r.item.sku)}</h3><p class="notes">${escape(r.item.note)}</p>`,
        )
        .join(''),
    });
  for (const [page, part] of chunks(issues, 14).entries())
    pages.push({
      title: `R${page + 1} · Unresolved checks`,
      body: `<ul>${part
        .map(
          (w) =>
            `<li>${escape(w.message)} <small>${rows
              .filter((r) => w.itemIds.includes(r.item.id))
              .map((r) => r.mark)
              .join(', ')}</small></li>`,
        )
        .join(
          '',
        )}</ul><p>Resolve and re-export from the revised design. This list covers modeled checks only.</p>`,
    });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(o.reference)} Rev ${escape(o.revision)} — ${escape(d.name)}</title><style>*{box-sizing:border-box}body{margin:0;background:#e9eeed;color:#1c3338;font:11pt/1.4 Arial,sans-serif}.controls{padding:20px;max-width:900px;margin:auto}.sheet{width:396mm;min-height:273mm;background:white;margin:12mm auto;padding:7mm;position:relative;break-after:page;border:1px solid #b8c6c7}.sheet header{display:flex;justify-content:space-between;gap:12mm;border-bottom:1mm solid #254c50;padding-bottom:3mm;margin-bottom:4mm}.sheet header h1{font-size:16pt;margin:0}.sheet header p{margin:1mm 0}.sheet footer{display:flex;justify-content:space-between;gap:6mm;border-top:.3mm solid #526b70;padding-top:3mm;margin-top:4mm;font-size:8pt}h2{font-size:16pt}h3{font-size:12pt}p{margin:2mm 0}.metadata{display:grid;grid-template-columns:1fr 1fr;gap:20mm}.notes{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}th,td{border:.25mm solid #b1bfc0;padding:3mm;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eef3f2}small{display:block;font-size:8pt;overflow-wrap:anywhere}li{margin-bottom:3mm}.drawing{display:flex;justify-content:center;overflow:visible}.drawing svg{max-width:none;flex-shrink:0}button{padding:10px 18px}.calibration{width:100mm;border-bottom:.5mm solid black;margin-top:8mm}@page{size:A3 landscape;margin:12mm}@media print{body{background:white}.controls{display:none}.sheet{margin:0;padding:5mm;width:auto;min-height:0;border:0;break-after:page}.sheet:last-child{break-after:auto}header,footer,tr{break-inside:avoid}thead{display:table-header-group}}@media screen and (max-width:900px){body{overflow-x:auto}.controls{position:sticky;left:0;width:100vw}.sheet{margin:12mm 0}}</style></head><body><div class="controls"><button onclick="window.print()">Print / save PDF</button><p>A3 landscape · 100% / actual size · ${pages.length} sheets. Check the calibration line before measuring the print.</p></div>${pages.map((p, n) => `<section class="sheet"><header><div><h1>${escape(o.company || 'Kitchen Studio')} · ${escape(d.name)}</h1><p>${escape(p.title)}</p></div><div><strong>${escape(o.reference)} · Rev ${escape(o.revision)}</strong><p>${escape(o.date)} · ${p.scale ? `1:${o.scale}` : 'Not to scale'} · ${o.unit}</p></div></header>${p.body}<footer><span>COORDINATION DRAFT · ${escape(o.purpose)}</span><span>Snapshot ${digest} · Sheet ${n + 1} of ${pages.length}</span><span>${escape(o.preparedBy)}</span></footer></section>`).join('')}</body></html>`;
}
