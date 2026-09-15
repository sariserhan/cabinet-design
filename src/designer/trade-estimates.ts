import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Design } from './model';
import {
  area,
  roomOutline,
  roomEdges,
  ceilingAt,
  ceilingRegions,
} from './room';
export const tradeNames = {
  countertops: 'Countertops',
  flooring: 'Flooring',
  painting: 'Painting',
  tile: 'Tile & backsplash',
} as const;
export type Trade = keyof typeof tradeNames;
const quantity = z.number().finite().min(0).max(1000000);
const positive = z.number().finite().min(0.01).max(1000000);
const money = z.number().finite().min(0).max(1000000);
export const tradeInputSchema = z
  .object({
    included: z.boolean(),
    product: z.string().max(160),
    supplier: z.string().max(160),
    reference: z.string().max(500),
    notes: z.string().max(3000),
    materialPrice: money.nullable(),
    laborRate: money.nullable(),
    prepRate: money,
    extraCost: money,
    areaSource: z.enum(['room', 'zones']),
    zones: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          name: z.string().max(100),
          length: quantity.max(1200),
          width: quantity.max(1200),
        }),
      )
      .max(40),
    deduction: quantity,
    waste: z.number().min(0).max(100),
    boxCoverage: positive,
    direction: z.enum(['lengthwise', 'crosswise', 'diagonal', 'herringbone']),
    transitionLength: quantity,
    transitionRate: money,
    tileWidth: positive.min(0.125).max(120),
    tileHeight: positive.min(0.125).max(120),
    tilesPerBox: z.number().int().min(1).max(10000),
    groutCoverage: positive,
    groutPrice: money,
    adhesiveCoverage: positive,
    adhesivePrice: money,
    coats: z.number().int().min(1).max(10),
    coverage: positive,
    primerCoats: z.number().int().min(0).max(10),
    primerCoverage: positive,
    primerPrice: money,
    includeCeiling: z.boolean(),
    wallIndices: z.array(z.number().int().min(0).max(23)).max(24).nullable(),
    slabWidth: positive,
    slabDepth: positive,
    kerf: z.number().min(0).max(2),
    edgeTrim: z.number().min(0).max(12),
    allowRotation: z.boolean(),
    splits: z
      .array(
        z.object({
          id: z.string().max(100),
          count: z.number().int().min(1).max(8),
        }),
      )
      .max(100),
    edgeLength: quantity,
    edgeRate: money,
    edgeProfile: z.string().max(100),
    seamRate: money,
    extraCutouts: z.number().int().min(0).max(100),
    cutoutRate: money,
  })
  .superRefine((s, ctx) => {
    for (const list of [s.zones, s.splits])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate zone or piece IDs.',
        });
  });
export type TradeInput = z.infer<typeof tradeInputSchema>;
export type EstimateLine = {
  label: string;
  quantity: number;
  unit: string;
  rate: number | null;
  cents: number | null;
};
export type SlabPiece = {
  id: string;
  label: string;
  width: number;
  depth: number;
  slab: number;
  x: number;
  y: number;
  rotated: boolean;
};
export type TradeResult = {
  grossArea: number;
  netArea: number;
  purchaseQuantity: number;
  purchaseUnit: string;
  lines: EstimateLine[];
  totalCents: number | null;
  issues: string[];
  assumptions: string[];
  pieces: SlabPiece[];
  slabCount: number;
};
const savedSchema = z.object({
  designFingerprint: z.string(),
  inputFingerprint: z.string(),
  createdAt: z.string().datetime(),
  result: z.object({
    grossArea: quantity,
    netArea: quantity,
    purchaseQuantity: z.number().finite().min(0).max(1e12),
    purchaseUnit: z.string(),
    totalCents: z.number().int().min(0).nullable(),
  }),
});
const stateSchema = z.object({
  input: tradeInputSchema,
  saved: savedSchema.optional(),
});
export const tradesSchema = z.object({
  format: z.literal('kitchen-trades-v1'),
  designId: z.string().min(1).max(100),
  trades: z.object({
    countertops: stateSchema,
    flooring: stateSchema,
    painting: stateSchema,
    tile: stateSchema,
  }),
});
export type Trades = z.infer<typeof tradesSchema>;
export function emptyTrades(designId: string): Trades {
  const input: TradeInput = {
    included: false,
    product: '',
    supplier: '',
    reference: '',
    notes: '',
    materialPrice: null,
    laborRate: null,
    prepRate: 0,
    extraCost: 0,
    areaSource: 'room',
    zones: [],
    deduction: 0,
    waste: 10,
    boxCoverage: 20,
    direction: 'lengthwise',
    transitionLength: 0,
    transitionRate: 0,
    tileWidth: 12,
    tileHeight: 12,
    tilesPerBox: 10,
    groutCoverage: 100,
    groutPrice: 0,
    adhesiveCoverage: 50,
    adhesivePrice: 0,
    coats: 2,
    coverage: 350,
    primerCoats: 0,
    primerCoverage: 350,
    primerPrice: 0,
    includeCeiling: false,
    wallIndices: null,
    slabWidth: 126,
    slabDepth: 63,
    kerf: 0.125,
    edgeTrim: 0.5,
    allowRotation: false,
    splits: [],
    edgeLength: 0,
    edgeRate: 0,
    edgeProfile: 'To confirm',
    seamRate: 0,
    extraCutouts: 0,
    cutoutRate: 0,
  };
  return {
    format: 'kitchen-trades-v1',
    designId,
    trades: {
      countertops: { input: { ...input } },
      flooring: { input: { ...input } },
      painting: { input: { ...input, waste: 0 } },
      tile: { input: { ...input, areaSource: 'zones' } },
    },
  };
}
export function parseTrades(raw: string, designId: string) {
  if (raw.length > 300000) throw Error('Trade settings exceed 300 KB.');
  const v = tradesSchema.parse(JSON.parse(raw));
  if (v.designId !== designId)
    throw Error('Trade settings belong to another project.');
  return v;
}
export function tradeFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(canonical(value)))),
  ).slice(0, 16);
}
export function tradeIsCurrent(d: Design, s: Trades['trades'][Trade]) {
  return (
    !!s.saved &&
    s.saved.designFingerprint === tradeFingerprint(d) &&
    s.saved.inputFingerprint === tradeFingerprint(s.input)
  );
}
export function roomTakeoff(d: Design) {
  const floor = Math.abs(area(roomOutline(d.room))) / 144;
  const walls = roomEdges(d.room)
    .filter((e) => d.room.walls[e.side])
    .map((e) => {
      let wallArea = 0;
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1],
          b = e.points[i];
        if (!a || !b) continue;
        const points = [a, b],
          c = d.room.ceiling;
        if (c?.kind === 'vault') {
          const at =
            (c.axis === 'x' ? d.room.width : d.room.depth) * (c.ridge ?? 0.5);
          if ((a[c.axis] - at) * (b[c.axis] - at) < 0) {
            const t = (at - a[c.axis]) / (b[c.axis] - a[c.axis]);
            points.splice(1, 0, {
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
            });
          }
        }
        for (let j = 1; j < points.length; j++) {
          const p = points[j - 1],
            q = points[j];
          if (p && q)
            wallArea +=
              (Math.hypot(q.x - p.x, q.y - p.y) *
                (ceilingAt(d.room, p.x, p.y) + ceilingAt(d.room, q.x, q.y))) /
              2;
        }
      }
      return {
        index: e.index,
        label: `Wall ${e.index + 1}`,
        length: e.length / 12,
        area: wallArea / 144,
      };
    });
  const ceiling = ceilingRegions(d.room).reduce((sum, poly) => {
    let x = 0,
      y = 0,
      z = 0;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      if (!q) return;
      const ph = ceilingAt(d.room, p.x, p.y),
        qh = ceilingAt(d.room, q.x, q.y);
      x += (p.y - q.y) * (ph + qh);
      y += (ph - qh) * (p.x + q.x);
      z += (p.x - q.x) * (p.y + q.y);
    });
    return sum + Math.hypot(x, y, z) / 288;
  }, 0);
  const openings = d.items
    .filter(
      (i) =>
        (i.kind === 'door' || i.kind === 'window') &&
        !i.opening &&
        i.wall &&
        d.room.walls[i.wall],
    )
    .reduce((s, i) => s + (i.width * i.height) / 144, 0);
  return { floor, ceiling, walls, openings };
}
export function packSlabs(d: Design, s: TradeInput) {
  const width = s.slabWidth - 2 * s.edgeTrim,
    depth = s.slabDepth - 2 * s.edgeTrim;
  const parts = d.items
    .filter((i) => i.kind === 'countertop')
    .flatMap((i) => {
      const count = s.splits.find((p) => p.id === i.id)?.count ?? 1;
      return Array.from({ length: count }, (_, n) => ({
        id: `${i.id}:${n}`,
        label: `${i.sku} · ${i.id.slice(0, 6)} · part ${n + 1}/${count}`,
        width: i.width / count,
        depth: i.depth,
      }));
    })
    .sort((a, b) => b.depth - a.depth || b.width - a.width);
  type Rect = { x: number; y: number; width: number; depth: number };
  const bins: Rect[][] = [];
  const pieces: SlabPiece[] = [];
  const unfit: string[] = [];
  for (const p of parts) {
    const options = [
      { width: p.width, depth: p.depth, rotated: false },
      ...(s.allowRotation
        ? [{ width: p.depth, depth: p.width, rotated: true }]
        : []),
    ];
    if (!options.some((o) => o.width <= width && o.depth <= depth)) {
      unfit.push(p.label);
      continue;
    }
    let placed = false;
    for (let b = 0; b <= bins.length && !placed; b++) {
      if (b === bins.length)
        bins.push([{ x: s.edgeTrim, y: s.edgeTrim, width, depth }]);
      const free = bins[b];
      if (!free) continue;
      for (let j = 0; j < free.length && !placed; j++) {
        const r = free[j];
        if (!r) continue;
        const o = options.find(
          (o) => o.width <= r.width + 1e-9 && o.depth <= r.depth + 1e-9,
        );
        if (!o) continue;
        free.splice(j, 1);
        pieces.push({
          ...p,
          width: o.width,
          depth: o.depth,
          rotated: o.rotated,
          slab: b,
          x: r.x,
          y: r.y,
        });
        const right = r.width - o.width - s.kerf,
          bottom = r.depth - o.depth - s.kerf;
        if (right > 0)
          free.push({
            x: r.x + o.width + s.kerf,
            y: r.y,
            width: right,
            depth: o.depth,
          });
        if (bottom > 0)
          free.push({
            x: r.x,
            y: r.y + o.depth + s.kerf,
            width: r.width,
            depth: bottom,
          });
        placed = true;
      }
    }
  }
  return {
    pieces,
    slabCount: bins.length,
    unfit,
    seams: parts.length - d.items.filter((i) => i.kind === 'countertop').length,
  };
}
export function estimateTrade(
  d: Design,
  trade: Trade,
  raw: TradeInput,
): TradeResult {
  const s = tradeInputSchema.parse(raw),
    room = roomTakeoff(d);
  const issues: string[] = [],
    assumptions: string[] = [];
  const lines: EstimateLine[] = [];
  let grossArea = 0,
    purchaseQuantity = 0,
    purchaseUnit = '',
    pieces: SlabPiece[] = [],
    slabCount = 0;
  if (trade === 'countertops')
    grossArea = d.items
      .filter((i) => i.kind === 'countertop')
      .reduce((n, i) => n + (i.width * i.depth) / 144, 0);
  else if (trade === 'painting')
    grossArea =
      room.walls
        .filter(
          (w) => s.wallIndices === null || s.wallIndices.includes(w.index),
        )
        .reduce((n, w) => n + w.area, 0) +
      (s.includeCeiling ? room.ceiling : 0);
  else
    grossArea =
      s.areaSource === 'room'
        ? room.floor
        : s.zones.reduce((n, z) => n + (z.length * z.width) / 144, 0);
  if (s.deduction > grossArea) issues.push('Deductions exceed measured area.');
  const netArea = Math.max(
    0,
    grossArea - (trade === 'countertops' ? 0 : s.deduction),
  );
  if (netArea <= 0)
    issues.push('Add a measured area or countertop before estimating.');
  const add = (label: string, q: number, unit: string, rate: number | null) =>
    lines.push({
      label,
      quantity: q,
      unit,
      rate,
      cents: rate === null ? null : Math.round(q * rate * 100),
    });
  if (trade === 'flooring') {
    purchaseQuantity = Math.ceil(
      (netArea * (1 + s.waste / 100)) / s.boxCoverage - 1e-10,
    );
    purchaseUnit = 'boxes';
    add('Flooring', purchaseQuantity, 'boxes', s.materialPrice);
    add('Transitions', s.transitionLength, 'linear ft', s.transitionRate);
    assumptions.push(
      `${s.boxCoverage} sq ft/box; ${s.waste}% waste; ${s.direction} layout.`,
      'Whole-room area includes cabinet footprints. Enter exclusions as deductions. Rectangular zones are summed; overlap is not automatically removed.',
    );
  } else if (trade === 'tile') {
    const tiles = Math.ceil(
      (netArea * (1 + s.waste / 100)) / ((s.tileWidth * s.tileHeight) / 144) -
        1e-10,
    );
    purchaseQuantity = Math.ceil(tiles / s.tilesPerBox);
    purchaseUnit = 'boxes';
    add('Tile', purchaseQuantity, 'boxes', s.materialPrice);
    add(
      'Grout',
      Math.ceil(netArea / s.groutCoverage - 1e-10),
      'bags',
      s.groutPrice,
    );
    add(
      'Adhesive',
      Math.ceil(netArea / s.adhesiveCoverage - 1e-10),
      'bags',
      s.adhesivePrice,
    );
    add('Edge trim', s.transitionLength, 'linear ft', s.transitionRate);
    assumptions.push(
      `${tiles} tiles required incl. ${s.waste}% waste; ${s.tilesPerBox} tiles/box; ${s.tileWidth} × ${s.tileHeight} in tile.`,
      `${s.direction} pattern; waste and bag coverage are user assumptions. No individual tile cutting plan. Rectangle overlaps/openings require manual deductions.`,
    );
  } else if (trade === 'painting') {
    purchaseQuantity = Math.ceil(
      (netArea * s.coats * (1 + s.waste / 100)) / s.coverage - 1e-10,
    );
    purchaseUnit = 'gallons';
    add('Finish paint', purchaseQuantity, 'gallons', s.materialPrice);
    add(
      'Primer',
      Math.ceil((netArea * s.primerCoats) / s.primerCoverage - 1e-10),
      'gallons',
      s.primerPrice,
    );
    assumptions.push(
      `${s.coats} finish coats at ${s.coverage} sq ft/gallon/coat, ${s.waste}% allowance; ${s.primerCoats} primer coats.`,
      'One interior face of selected perimeter walls; optional modeled ceiling. Openings, cabinets and unpainted areas require manual deductions. Partition walls, trim and exterior faces excluded.',
    );
  } else {
    const packed = packSlabs(d, s);
    pieces = packed.pieces;
    slabCount = packed.slabCount;
    purchaseQuantity = slabCount;
    purchaseUnit = 'slabs';
    if (packed.unfit.length)
      issues.push(
        `${packed.unfit.length} countertop piece(s) exceed usable slab dimensions. Review split counts or slab size.`,
      );
    add('Countertop slabs', slabCount, 'slabs', s.materialPrice);
    add(
      `Finished edges · ${s.edgeProfile}`,
      s.edgeLength,
      'linear ft',
      s.edgeRate,
    );
    add('Planned seams', packed.seams, 'seams', s.seamRate);
    const tops = new Set(
      d.items.filter((i) => i.kind === 'countertop').map((i) => i.id),
    );
    const sinks = d.items.filter(
      (i) => i.kind === 'sink' && i.sinkMount && tops.has(i.sinkMount.hostId),
    ).length;
    add('Cutouts', sinks + s.extraCutouts, 'cutouts', s.cutoutRate);
    assumptions.push(
      `${s.slabWidth} × ${s.slabDepth} in slabs; ${s.edgeTrim} in edge trim; ${s.kerf} in kerf; rotation ${s.allowRotation ? 'allowed' : 'disabled'}.`,
      'Rectangular packing preview, not optimized fabrication/CNC output. Equal-width splits are proposed seams; fabricator must verify seam locations, support, vein matching and sink conflicts.',
      'Countertop dimensions include modeled surface extents. Sink areas are not deducted from slab purchases; waterfall/upstand pieces must be added separately to the design.',
    );
  }
  add('Installation labor', netArea, 'sq ft', s.laborRate);
  add('Preparation', netArea, 'sq ft', s.prepRate);
  add('Other allowance', 1, 'allowance', s.extraCost);
  if (s.materialPrice === null || s.laborRate === null)
    issues.push('Enter material and installation rates (zero is allowed).');
  assumptions.push(
    'Rates entered by user in USD; taxes excluded. Confirm manufacturer coverage, quantities and site conditions.',
  );
  if (
    lines.some((l) => l.cents !== null && !Number.isSafeInteger(l.cents)) ||
    !Number.isSafeInteger(lines.reduce((n, l) => n + (l.cents ?? 0), 0))
  )
    issues.push(
      'Estimate exceeds supported amount. Reduce quantities or rates.',
    );
  const totalCents = issues.length
    ? null
    : lines.reduce((n, l) => n + (l.cents ?? 0), 0);
  return {
    grossArea,
    netArea,
    purchaseQuantity: Math.max(0, purchaseQuantity),
    purchaseUnit,
    lines,
    totalCents,
    issues,
    assumptions,
    pieces,
    slabCount,
  };
}
export function combinedTradeTotal(d: Design, v: Trades) {
  const included = (Object.keys(tradeNames) as Trade[]).filter(
    (k) => v.trades[k].input.included,
  );
  const pending = included.filter(
    (k) =>
      !tradeIsCurrent(d, v.trades[k]) ||
      estimateTrade(d, k, v.trades[k].input).totalCents === null,
  );
  return {
    included,
    pending,
    totalCents:
      included.length && !pending.length
        ? included.reduce(
            (sum, k) =>
              sum + (estimateTrade(d, k, v.trades[k].input).totalCents ?? 0),
            0,
          )
        : null,
  };
}
export function tradeCsv(d: Design, t: Trade, s: TradeInput) {
  const r = estimateTrade(d, t, s),
    safe = (v: unknown) => {
      let x = String(v ?? '');
      if (/^[=+@\-\t\r]/.test(x)) x = "'" + x;
      return '"' + x.replaceAll('"', '""') + '"';
    };
  return [
    [
      'Trade',
      'Project',
      'Design fingerprint',
      'Description',
      'Quantity',
      'Unit',
      'Rate USD',
      'Amount USD',
    ],
    ...r.lines.map((l) => [
      tradeNames[t],
      d.name,
      tradeFingerprint(d),
      l.label,
      l.quantity,
      l.unit,
      l.rate,
      l.cents === null ? '' : (l.cents / 100).toFixed(2),
    ]),
  ]
    .map((row) => row.map(safe).join(','))
    .join('\r\n');
}
export function tradeHtml(d: Design, t: Trade, s: TradeInput) {
  const r = estimateTrade(d, t, s),
    esc = (v: unknown) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c] ?? c,
      );
  const price = (n: number | null) =>
    n === null ? 'Unpriced' : `$${(n / 100).toFixed(2)}`;
  const slabDrawings =
    t === 'countertops' && r.slabCount
      ? `<h2>Rectangular slab planning preview</h2><p>First ${Math.min(24, r.slabCount)} of ${r.slabCount} slabs shown. Export the slab cut list for all piece coordinates. Verify seams and cutouts with the fabricator.</p>${Array.from(
          { length: Math.min(24, r.slabCount) },
          (_, n) =>
            `<figure style="break-inside:avoid"><figcaption>Slab ${n + 1}</figcaption><svg style="width:100%;max-height:180px" viewBox="0 0 ${s.slabWidth} ${s.slabDepth}"><rect width="${s.slabWidth}" height="${s.slabDepth}" fill="#eee" stroke="#456"/>${r.pieces
              .filter((p) => p.slab === n)
              .map(
                (p) =>
                  `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.depth}" fill="#b8d1c8" stroke="#456" stroke-width=".2"/><text x="${p.x + 1}" y="${p.y + Math.min(5, p.depth / 2)}" font-size="2.5">${p.width.toFixed(1)} × ${p.depth.toFixed(1)}</text>`,
              )
              .join('')}</svg></figure>`,
        ).join('')}`
      : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(tradeNames[t])} estimate</title><style>body{font:14px/1.5 Arial;color:#203d3b;max-width:1000px;margin:30px auto;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #bcccca;text-align:left}p{white-space:pre-wrap;overflow-wrap:anywhere}@media print{button{display:none}@page{margin:15mm}tr{break-inside:avoid}}</style></head><body><button onclick="print()">Print / save PDF</button><h1>${esc(tradeNames[t])} · ${esc(d.name)}</h1><p>ESTIMATE DRAFT · USD · taxes excluded<br>Generated ${new Date().toISOString().slice(0, 10)}<br>Design ${tradeFingerprint(d)} · Settings ${tradeFingerprint(s)}</p><p>Product: ${esc(s.product || 'Not specified')}<br>Supplier: ${esc(s.supplier || 'Not specified')}<br>Price reference: ${esc(s.reference || 'Not specified')}</p><p>Gross ${r.grossArea.toFixed(2)} sq ft · Net ${r.netArea.toFixed(2)} sq ft · Purchase ${r.purchaseQuantity} ${r.purchaseUnit}</p><table><thead><tr><th>Description</th><th>Quantity</th><th>Rate USD</th><th>Amount</th></tr></thead><tbody>${r.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${l.quantity.toFixed(2)} ${esc(l.unit)}</td><td>${l.rate === null ? '—' : l.rate.toFixed(2)}</td><td>${price(l.cents)}</td></tr>`).join('')}</tbody></table><h2>${price(r.totalCents)}</h2>${r.issues.map((x) => `<p>${esc(x)}</p>`).join('')}<h2>Assumptions & scope</h2><ul>${r.assumptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p>${esc(s.notes)}</p>${slabDrawings}${s.areaSource === 'zones' && (t === 'tile' || t === 'flooring') ? `<h2>Measured areas</h2><table><thead><tr><th>Area</th><th>Length (in)</th><th>Width / height (in)</th><th>Gross sq ft</th></tr></thead><tbody>${s.zones.map((z) => `<tr><td>${esc(z.name)}</td><td>${z.length}</td><td>${z.width}</td><td>${((z.length * z.width) / 144).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : ''}</body></html>`;
}

export function slabCutCsv(d: Design, s: TradeInput) {
  const r = estimateTrade(d, 'countertops', s);
  const safe = (v: unknown) => {
    const text = String(v ?? '');
    return (
      '"' +
      (/^[=+@\-\t\r]/.test(text) ? "'" : '') +
      text.replaceAll('"', '""') +
      '"'
    );
  };
  return [
    [
      'Design fingerprint',
      'Piece ID',
      'Description',
      'Slab',
      'Width in',
      'Depth in',
      'X in',
      'Y in',
      'Rotated',
      'Status',
    ],
    ...r.pieces.map((p) => [
      tradeFingerprint(d),
      p.id,
      p.label,
      p.slab + 1,
      p.width,
      p.depth,
      p.x,
      p.y,
      p.rotated,
      'Planning draft — fabricator review required',
    ]),
  ]
    .map((row) => row.map(safe).join(','))
    .join('\r\n');
}
