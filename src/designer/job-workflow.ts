import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { type Design, designSchema, isOpening, warnings } from './model';
import { canonical } from './installer-handoff';
import { roomOutline, roomEdges } from './room';
import { itemPolygon } from './model';
import { quoteTotals } from './quote';
import { drawingPackageHtml, drawingItemCsv } from './drawing-package';
const id = z.string().min(1).max(120),
  note = z.string().trim().min(1).max(1500);
export const tiers = ['Good', 'Better', 'Best'] as const;
export const orderTopics = [
  ['fillers', 'Fillers and scribe allowances'],
  ['ends', 'Finished ends and exposed panels'],
  ['accessories', 'Toe kicks, trim, hardware and accessories'],
  ['appliances', 'Exact appliance models and installation clearances'],
  ['prices', 'Current supplier prices and availability'],
] as const;
export const pilotTasks = [
  {
    id: 'dealer-measure',
    role: 'Dealer',
    title: 'Enter a measured room, openings and services',
  },
  {
    id: 'dealer-options',
    role: 'Dealer',
    title: 'Compare three options and revise a quote',
  },
  {
    id: 'dealer-order',
    role: 'Dealer',
    title: 'Resolve order checks and record customer sign-off',
  },
  {
    id: 'installer-drawings',
    role: 'Installer',
    title: 'Locate every item from the drawing package',
  },
  {
    id: 'installer-site',
    role: 'Installer',
    title: 'Check site dimensions, services and installation notes',
  },
  {
    id: 'installer-change',
    role: 'Installer',
    title: 'Report an issue and verify the corrected revision',
  },
] as const;
const evidenceSchema = z.object({
  status: z.enum(['verified', 'needs_change', 'unverified']),
  key: id,
  basis: z.string().length(64),
  by: z.string().trim().min(1).max(120),
  at: z.string().datetime(),
  note,
});
const revisionSchema = z.object({
  id,
  title: z.string().trim().min(1).max(120),
  reason: note,
  at: z.string().datetime(),
  design: designSchema,
  approval: z
    .object({
      customer: z.string().trim().min(1).max(120),
      recordedBy: z.string().trim().min(1).max(120),
      reference: note,
      at: z.string().datetime(),
    })
    .optional(),
});
export const jobWorkflowSchema = z
  .object({
    format: z.literal('kitchen-job-v1'),
    designId: id,
    measurements: z.array(evidenceSchema).max(100),
    checks: z.array(evidenceSchema).max(120),
    photos: z
      .array(
        z.object({
          id,
          caption: note,
          url: z
            .string()
            .max(12000)
            .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
        }),
      )
      .max(8),
    options: z
      .array(
        z.object({ tier: z.enum(tiers), scope: note, design: designSchema }),
      )
      .max(3),
    revisions: z.array(revisionSchema).max(8),
    pilot: z.object({
      kind: z.enum(['rehearsal', 'real']),
      dealer: z.string().max(120),
      installer: z.string().max(120),
      observations: z
        .array(
          z.object({
            id,
            task: z.enum(pilotTasks.map((t) => t.id) as [string, ...string[]]),
            participant: z.string().trim().min(1).max(120),
            kind: z.enum(['rehearsal', 'real']),
            fingerprint: z.string().length(64),
            minutes: z.number().int().min(0).max(10000),
            result: z.enum(['pass', 'blocked']),
            note,
            at: z.string().datetime(),
            resolution: z.string().max(1500),
          }),
        )
        .max(60),
    }),
  })
  .superRefine((v, c) => {
    for (const rows of [
      v.measurements.map((r) => r.key),
      v.checks.map((r) => r.key),
      v.photos.map((r) => r.id),
      v.options.map((r) => r.tier),
      v.revisions.map((r) => r.id),
      v.pilot.observations.map((r) => r.id),
    ])
      if (new Set(rows).size !== rows.length)
        c.addIssue({
          code: 'custom',
          message: 'Duplicate job record identifiers.',
        });
    if ([...v.options, ...v.revisions].some((r) => r.design.id !== v.designId))
      c.addIssue({
        code: 'custom',
        message: 'Snapshot belongs to another project.',
      });
  });
export type JobWorkflow = z.infer<typeof jobWorkflowSchema>;
export const emptyJobWorkflow = (designId: string): JobWorkflow => ({
  format: 'kitchen-job-v1',
  designId,
  measurements: [],
  checks: [],
  photos: [],
  options: [],
  revisions: [],
  pilot: { kind: 'rehearsal', dealer: '', installer: '', observations: [] },
});
export const digest = (v: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(canonical(v))));
export const jobContent = (d: Design) => ({
  room: d.room,
  items: d.items,
  finish: d.finish,
  appearance: d.appearance,
  measurements: d.measurements,
  quote: d.quote,
  supplierBookId: d.supplierBookId,
  siteTasks: d.siteTasks,
});
export const jobFingerprint = (d: Design) => digest(jobContent(d));
export function parseJobWorkflow(
  raw: string,
  designId: string,
  trusted = false,
) {
  if (raw.length > 2200000) throw Error('Job records exceed 2.2 MB.');
  const v = jobWorkflowSchema.parse(JSON.parse(raw));
  if (v.designId !== designId)
    throw Error('Job records belong to another project.');
  if (!trusted) {
    v.measurements.forEach((e) => (e.status = 'unverified'));
    v.checks.forEach((e) => (e.status = 'unverified'));
    v.revisions.forEach((r) => delete r.approval);
  }
  return v;
}
export function measurementRows(d: Design) {
  const rows = [
    {
      key: 'room',
      label: `Room: ${d.room.width} × ${d.room.depth} × ${d.room.height} in; verify wall runs, diagonals and ceiling`,
      value: d.room,
    },
    ...roomEdges(d.room).map((e) => ({
      key: `wall:${e.index}`,
      label: `Wall ${e.index + 1} (${e.side}): ${Number(e.length.toFixed(3))} in${e.curved ? ' along curve' : ''}`,
      value: e,
    })),
    ...d.items.filter(isOpening).map((i) => ({
      key: `opening:${i.id}`,
      label: `${i.sku}: opening ${i.width} × ${i.height} in; position ${i.x}, ${i.y}; sill ${i.elevation} in`,
      value: i,
    })),
    ...(d.measurements?.utilities ?? []).map((u) => ({
      key: `utility:${u.id}`,
      label: `${u.kind}: ${u.wall}, offset ${u.offset} in, height ${u.height} in`,
      value: u,
    })),
    {
      key: 'services',
      label:
        'Confirm plumbing, outlets, gas and ventilation locations; record absent or relocated services',
      value: {
        utilities: d.measurements?.utilities,
        items: d.items.filter((i) =>
          ['sink', 'range', 'dishwasher', 'refrigerator'].includes(i.kind),
        ),
      },
    },
  ];
  return rows.map((r) => ({ ...r, basis: digest(r.value) }));
}
export function orderRows(d: Design) {
  const basis = jobFingerprint(d);
  return [
    ...orderTopics.map(([key, label]) => ({ key, label, basis })),
    ...d.items
      .filter(
        (i) =>
          !isOpening(i) && !['partition', 'beam', 'column'].includes(i.kind),
      )
      .map((i) => ({
        key: `product:${i.id}`,
        label: `${i.sku} · ${i.width} × ${i.depth} × ${i.height} in: verify SKU, dimensions, finish, handing and specification source`,
        basis,
      })),
  ];
}
export function approvedRevision(d: Design, v: JobWorkflow) {
  if (v.designId !== d.id) return undefined;
  return [...v.revisions]
    .reverse()
    .find((r) => r.approval && jobFingerprint(r.design) === jobFingerprint(d));
}
export function releaseIssues(d: Design, v: JobWorkflow) {
  if (v.designId !== d.id) return ['Job records belong to another project.'];
  const issues: string[] = [];
  if (!d.items.some((i) => !isOpening(i)))
    issues.push('Add supply items to the design.');
  for (const r of measurementRows(d))
    if (
      !v.measurements.some(
        (e) =>
          e.key === r.key && e.basis === r.basis && e.status === 'verified',
      )
    )
      issues.push(`Site verification: ${r.label}`);
  for (const r of orderRows(d))
    if (
      !v.checks.some(
        (e) =>
          e.key === r.key && e.basis === r.basis && e.status === 'verified',
      )
    )
      issues.push(`Order review: ${r.label}`);
  issues.push(...warnings(d).map((w) => w.message));
  issues.push(
    ...(d.siteTasks ?? [])
      .filter((t) => t.status !== 'resolved')
      .map((t) => `Open site issue: ${t.title}`),
  );
  if (!approvedRevision(d, v))
    issues.push('Record customer sign-off for this exact revision.');
  return issues;
}
export function revisionDiff(before: Design, after: Design) {
  const rows: {
    field: string;
    label: string;
    before: string;
    after: string;
  }[] = [];
  function label(path: string) {
    const parts = path.split('.');
    if (parts[0] === 'items') {
      const item = [...after.items, ...before.items].find(
        (i) => i.id === parts[1],
      );
      return `${item?.sku ?? 'Item'} (${parts[1]?.slice(0, 6)}) / ${parts.slice(2).join(' / ') || 'Added or removed'}`;
    }
    return path === 'itemOrder'
      ? 'Item schedule order'
      : parts
          .map((s) =>
            s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
          )
          .join(' / ');
  }
  const display = (v: unknown) =>
    typeof v === 'string' ? v : (canonical(v) ?? '(absent)');
  function walk(a: unknown, b: unknown, path: string) {
    if (canonical(a) === canonical(b)) return;
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const aa = a as Record<string, unknown>,
        bb = b as Record<string, unknown>;
      for (const k of new Set([...Object.keys(aa), ...Object.keys(bb)]))
        walk(aa[k], bb[k], path ? `${path}.${k}` : k);
    } else
      rows.push({
        field: path,
        label: label(path),
        before: display(a),
        after: display(b),
      });
  }
  const a = jobContent(before),
    b = jobContent(after);
  walk(
    {
      ...a,
      itemOrder: a.items.map((i) => i.id),
      items: Object.fromEntries(a.items.map((i) => [i.id, i])),
    },
    {
      ...b,
      itemOrder: b.items.map((i) => i.id),
      items: Object.fromEntries(b.items.map((i) => [i.id, i])),
    },
    '',
  );
  return rows;
}
export function optionComparison(v: JobWorkflow) {
  const base = v.options.find((o) => o.tier === 'Good') ?? v.options[0];
  return tiers.flatMap((tier) => {
    const o = v.options.find((o) => o.tier === tier);
    if (!o) return [];
    const total = quoteTotals(o.design).total;
    return [
      {
        ...o,
        total,
        delta: base ? total - quoteTotals(base.design).total : 0,
        changes: base ? revisionDiff(base.design, o.design) : [],
      },
    ];
  });
}
export function pilotSummary(v: JobWorkflow, fingerprint?: string) {
  return pilotTasks.map((task) => {
    const attempts = v.pilot.observations.filter(
      (o) =>
        o.task === task.id &&
        o.kind === v.pilot.kind &&
        (!fingerprint || o.fingerprint === fingerprint),
    );
    const last = attempts.at(-1);
    return {
      ...task,
      attempts: attempts.length,
      result: last?.result ?? 'not tested',
      minutes: attempts.reduce((n, o) => n + o.minutes, 0),
    };
  });
}
const escape = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export function installerPackage(
  d: Design,
  v: JobWorkflow,
  by: string,
  release = false,
) {
  if (v.designId !== d.id)
    throw Error('Job records belong to another project.');
  if (!by.trim()) throw Error('Enter the package preparer.');
  const issues = releaseIssues(d, v);
  if (release && issues.length)
    throw Error(
      'Resolve all release checks before issuing a reviewed package.',
    );
  const ref = jobFingerprint(d).slice(0, 12),
    revision = approvedRevision(d, v)?.title.slice(0, 40) ?? 'Draft';
  const sheet = (title: string, body: string) =>
    `<!doctype html><html><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:15px system-ui;max-width:1000px;margin:32px auto;padding:16px}td,th{border:1px solid #aaa;padding:8px;text-align:left}table{border-collapse:collapse;width:100%}img{max-width:320px}li{margin:8px 0}@media print{a{color:black}}</style><h1>${escape(title)}</h1><p>${escape(d.name)} · ${escape(revision)} · ${ref} · ${release ? 'Reviewed coordination package' : 'DRAFT — outstanding checks may remain'}</p>${body}</html>`;
  const list = (values: string[]) =>
    `<ul>${values.map((s) => `<li>${escape(s)}</li>`).join('')}</ul>`;
  const notes = sheet(
    'Site verification and installation checklist',
    `<p>Prepared by ${escape(by)}. Field and supplier checks are recorded attestations, not manufacturer certification.</p><h2>Outstanding checks</h2>${list(issues)}<h2>Site evidence</h2>${list(v.measurements.map((m) => `${m.key}: ${m.note} — ${m.by}, ${m.at} (${measurementRows(d).some((r) => r.key === m.key && r.basis === m.basis && m.status === 'verified') ? 'current' : 'stale / removed'})`))}<h2>Order review</h2>${list(v.checks.map((m) => `${m.key}: ${m.note} — ${m.by}, ${m.at} (${orderRows(d).some((r) => r.key === m.key && r.basis === m.basis && m.status === 'verified') ? 'current' : 'stale / removed'})`))}<h2>Site notes</h2>${list((d.siteTasks ?? []).map((t) => `${t.title}: ${t.notes} (${t.status})`))}<h2>Installation checklist</h2>${list(['Match delivered items to numbered drawing marks and item list.', 'Verify site dimensions and service positions before installation.', 'Check finished ends, fillers, clearances and selected appliance manuals.', 'Record damaged or missing items before fitting.', 'Complete fit, level, door/drawer operation and customer walkthrough checks.'])}<h2>Site photos</h2>${v.photos.map((p) => `<figure><img src="${p.url}" alt="${escape(p.caption)}"><figcaption>${escape(p.caption)}</figcaption></figure>`).join('')}`,
  );
  return {
    'index.html': sheet(
      'Installer handoff',
      `<p><a href="drawings.html">Numbered plans, elevations and dimensions</a></p><p><a href="items.csv">Item list</a></p><p><a href="site-checklist.html">Site evidence, photos and installation checklist</a></p><p>Keep this folder together. Print drawings using their specified scale.</p>`,
    ),
    'drawings.html': drawingPackageHtml(d, {
      company: '',
      client: d.quote?.customer ?? '',
      reference: ref,
      revision,
      preparedBy: by,
      date: new Date().toISOString().slice(0, 10),
      purpose: 'Installation coordination',
      unit: 'in',
      scale: 25,
      notes: `${release ? 'Reviewed' : 'DRAFT'} coordination package. See site-checklist.html. ${issues.length} outstanding checks.`,
    }),
    'items.csv': drawingItemCsv(d),
    'site-checklist.html': notes,
    'design.json': JSON.stringify(d, null, 2),
    'job-records.json': JSON.stringify(v, null, 2),
  };
}

export function customerComparisonHtml(v: JobWorkflow) {
  const options = optionComparison(v);
  return `<!doctype html><html><meta charset="utf-8"><title>Kitchen options</title><style>body{font:16px system-ui;margin:30px;color:#213d33}main{display:flex;flex-wrap:wrap;gap:20px}article{flex:1;min-width:240px;border:1px solid #abc;padding:20px}svg{width:100%;height:220px}li,p{overflow-wrap:anywhere}@media print{article{break-inside:avoid}}</style><h1>Compare your kitchen options</h1><p>Illustrative demo estimates in USD, not supplier quotations. Scope and exclusions are recorded separately for each option.</p><main>${options
    .map(
      (o) =>
        `<article><h2>${o.tier}</h2><h3>$${(o.total / 100).toFixed(2)} estimated</h3><p>$${(o.delta / 100).toFixed(2)} versus the baseline option</p><svg role="img" aria-label="${o.tier} floor plan" viewBox="-8 -8 ${o.design.room.width + 16} ${o.design.room.depth + 16}"><polygon points="${roomOutline(
          o.design.room,
        )
          .map((p) => `${p.x},${p.y}`)
          .join(' ')}" fill="#eef2ea" stroke="#456"/>${o.design.items
          .filter((i) => !i.hidden)
          .map(
            (i) =>
              `<polygon points="${itemPolygon(i)
                .map((p) => `${p.x},${p.y}`)
                .join(
                  ' ',
                )}" fill="${{ linen: '#e7e0d4', oak: '#b79365', slate: '#53626b' }[i.finish ?? o.design.finish]}" stroke="#456"/>`,
          )
          .join(
            '',
          )}</svg><p>${escape(o.scope)}</p><p>${o.design.items.length} items · ${escape(o.design.finish)} cabinets · ${escape(o.design.appearance?.countertop ?? 'quartz')} worktops</p><h4>Changes from baseline</h4><ul>${o.changes.map((c) => `<li>${escape(c.label)}: ${escape(c.before)} → ${escape(c.after)}</li>`).join('')}</ul></article>`,
    )
    .join('')}</main></html>`;
}
