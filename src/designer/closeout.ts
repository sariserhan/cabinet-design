import { z } from 'zod';
import { type Design, parseDesign } from './model';
import { canonical } from './installer-handoff';
import { reviewContent } from './project-workflow';
export const compactPhotoSchema = z
  .string()
  .max(12000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
export const closeoutTaskSchema = z.object({
  id: z.string().min(1).max(100),
  room: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  kind: z.enum(['check', 'punch']),
  status: z.enum(['open', 'done']),
  note: z.string().max(2000),
  assignee: z.string().max(120),
  photo: compactPhotoSchema.optional(),
});
export const closeoutSchema = z
  .object({
    format: z.literal('kitchen-closeout-v1'),
    designId: z.string().min(1),
    tasks: z.array(closeoutTaskSchema).max(60),
    care: z.string().max(4000),
    signoff: z
      .object({
        name: z.string().trim().min(1).max(120),
        at: z.string().datetime(),
        content: z.string().max(510000),
      })
      .optional(),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.tasks.map((t) => t.id)).size !== c.tasks.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate closeout task identifiers.',
      });
    if (c.tasks.filter((t) => t.photo).length > 8)
      ctx.addIssue({
        code: 'custom',
        message: 'Keep at most eight closeout photos.',
      });
  });
export type Closeout = z.infer<typeof closeoutSchema>;
export type CloseoutTask = z.infer<typeof closeoutTaskSchema>;
export const emptyCloseout = (designId: string): Closeout => ({
  format: 'kitchen-closeout-v1',
  designId,
  tasks: [],
  care: '',
});
export function parseCloseout(
  raw: string,
  designId: string,
  trustedLocal = false,
) {
  if (raw.length > 750000) throw Error('Closeout exceeds 750 KB.');
  const value = closeoutSchema.parse(JSON.parse(raw));
  if (value.designId !== designId)
    throw Error('Closeout belongs to another project.');
  if (!trustedLocal) delete value.signoff;
  return value;
}
export function closeoutContent(d: Design, c: Closeout) {
  return canonical({ design: reviewContent(d), tasks: c.tasks, care: c.care });
}
export function signCloseout(d: Design, c: Closeout, name: string): Closeout {
  if (!c.tasks.length || c.tasks.some((t) => t.status !== 'done'))
    throw Error(
      'Resolve every checklist and punch-list item before recording completion.',
    );
  return closeoutSchema.parse({
    ...c,
    signoff: {
      name,
      at: new Date().toISOString(),
      content: closeoutContent(d, c),
    },
  });
}
export function isClosed(d: Design, c: Closeout) {
  return (
    !!c.signoff &&
    c.tasks.length > 0 &&
    c.tasks.every((t) => t.status === 'done') &&
    c.signoff.content === closeoutContent(d, c)
  );
}
export function starterCloseout(designId: string, room: string): Closeout {
  return {
    ...emptyCloseout(designId),
    tasks: [
      'Cabinets secured and leveled',
      'Doors and drawers adjusted',
      'Worktop joints and seals checked',
      'Appliance and utility checks recorded by qualified installer',
      'Room cleaned and customer care explained',
    ].map((title) => ({
      id: crypto.randomUUID(),
      room,
      title,
      kind: 'check' as const,
      status: 'open' as const,
      note: '',
      assignee: '',
    })),
  };
}
export function fieldPackage(d: Design, c: Closeout) {
  return {
    format: 'kitchen-field-v1' as const,
    exportedAt: new Date().toISOString(),
    designJson: JSON.stringify(d),
    source: c,
  };
}
export function mergeFieldReport(
  raw: string,
  d: Design,
  c: Closeout,
): Closeout {
  if (raw.length > 2300000) throw Error('Field report exceeds 2.3 MB.');
  const report = z
    .object({
      format: z.literal('kitchen-field-report-v1'),
      reportId: z.string().min(1).max(100),
      designJson: z.string().max(500000),
      source: closeoutSchema,
      returned: closeoutSchema,
    })
    .parse(JSON.parse(raw));
  const sourceDesign = parseDesign(report.designJson);
  if (
    sourceDesign.id !== d.id ||
    report.source.designId !== d.id ||
    report.returned.designId !== d.id
  )
    throw Error('Field report belongs to another project.');
  if (reviewContent(sourceDesign) !== reviewContent(d))
    throw Error(
      'Design changed since this field package. Export a current package and reconcile the findings before importing.',
    );
  if (canonical(report.source) !== canonical(c))
    throw Error(
      'Closeout changed since this field package. Export a current package and reconcile the findings before importing.',
    );
  const next = report.returned;
  delete next.signoff;
  return parseCloseout(JSON.stringify(next), d.id);
}
const escape = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export function handoverDocument(d: Design, c: Closeout) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(d.name)} handover</title><style>body{font:16px system-ui;max-width:900px;margin:32px auto;padding:20px;color:#203c30}article{border-bottom:1px solid #ccd8ce;padding:16px 0}img{max-width:250px}pre{white-space:pre-wrap} @media print{button{display:none}article{break-inside:avoid}}</style><h1>${escape(d.name)} · Customer handover</h1><p>${isClosed(d, c) ? 'Completion recorded' : 'DRAFT — closeout incomplete or changed'}</p><p>${escape(d.quote?.customer)} · Room ${d.room.width} × ${d.room.depth} × ${d.room.height} in</p>${isClosed(d, c) ? `<p>Recorded by ${escape(c.signoff?.name)} on ${escape(c.signoff?.at)}. Name is self-reported.</p>` : ''}<h2>Installation checklist and punch list</h2>${c.tasks.map((t) => `<article><h3>${escape(t.room)} · ${escape(t.title)}</h3><p>${escape(t.kind)} · ${escape(t.status)} · ${escape(t.assignee)}</p><pre>${escape(t.note)}</pre>${t.photo ? `<img src="${t.photo}" alt="Evidence: ${escape(t.title)}">` : ''}</article>`).join('')}<h2>Care, warranty and contact notes</h2><pre>${escape(c.care)}</pre><h2>Installed design schedule</h2>${d.items.map((i) => `<p>${escape(i.sku)} · ${i.width}×${i.depth}×${i.height} in · ${escape(i.id)}</p>`).join('')}<button onclick="window.print()">Print / save PDF</button></html>`;
}
