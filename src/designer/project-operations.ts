import { z } from 'zod';
import { catalogSnapshotSchema, catalogImpact } from './catalog-impact';
import { optionalDate } from './product-support';
import { type ProjectBackup } from './project-backup';
import { dashboardSummary } from './project-dashboard';
import { purchaseLines } from './purchasing';
import { measurementStatus } from './project-workflow';
import { parseDesign, isOpening } from './model';
export const stages = [
  'Measure',
  'Design',
  'Approve',
  'Order',
  'Install',
  'Aftercare',
] as const;
const id = z.string().min(1).max(100);
export const sequenceTaskSchema = z.object({
  id,
  title: z.string().trim().min(1).max(160),
  assignee: z.string().max(120),
  planned: optionalDate,
  done: z.boolean(),
  dependsOn: z.array(id).max(60),
  purchaseId: z.string().max(100),
  itemIds: z.array(id).max(100),
  siteIds: z.array(id).max(60),
});
export const pilotEntrySchema = z.object({
  id,
  date: optionalDate.refine(Boolean, 'Date required.'),
  stage: z.enum(stages),
  minutes: z.number().int().min(0).max(100000),
  reworkMinutes: z.number().int().min(0).max(100000),
  quoteRevisions: z.number().int().min(0).max(1000),
  issues: z.number().int().min(0).max(1000),
  note: z.string().trim().min(1).max(2000),
});
export const operationsSchema = z
  .object({
    format: z.literal('kitchen-operations-v1'),
    designId: id,
    sequence: z.array(sequenceTaskSchema).max(60),
    catalog: z
      .object({ before: catalogSnapshotSchema, after: catalogSnapshotSchema })
      .optional(),
    pilot: z.object({
      name: z.string().max(160),
      kind: z.enum(['synthetic', 'real']),
      baselineMinutes: z.number().int().min(0).max(1000000),
      entries: z.array(pilotEntrySchema).max(200),
    }),
  })
  .superRefine((o, ctx) => {
    for (const rows of [o.sequence, o.pilot.entries])
      if (new Set(rows.map((t) => t.id)).size !== rows.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate record IDs.' });
    const visiting = new Set<string>(),
      visited = new Set<string>(),
      tasks = new Map(o.sequence.map((t) => [t.id, t]));
    function visit(key: string): boolean {
      if (visiting.has(key)) return false;
      if (visited.has(key)) return true;
      const t = tasks.get(key);
      if (!t) return false;
      visiting.add(key);
      for (const dep of t.dependsOn) if (!visit(dep)) return false;
      visiting.delete(key);
      visited.add(key);
      return true;
    }
    if (o.sequence.some((t) => !visit(t.id)))
      ctx.addIssue({
        code: 'custom',
        message: 'Dependencies must exist and cannot form a cycle.',
      });
  });
export type Operations = z.infer<typeof operationsSchema>;
export type SequenceTask = z.infer<typeof sequenceTaskSchema>;
export const emptyOperations = (designId: string): Operations => ({
  format: 'kitchen-operations-v1',
  designId,
  sequence: [],
  pilot: { name: '', kind: 'synthetic', baselineMinutes: 0, entries: [] },
});
export function parseOperations(raw: string, designId: string) {
  if (raw.length > 1500000) throw Error('Operations exceed 1.5 MB.');
  const o = operationsSchema.parse(JSON.parse(raw));
  if (o.designId !== designId)
    throw Error('Operations belong to another project.');
  return o;
}
export function workflowStages(b: ProjectBackup) {
  const rows = dashboardSummary(b).rows,
    count = (id: string) => rows.find((r) => r.id === id)?.count ?? 0;
  let changedCatalogItems = 0;
  if (b.operations?.catalog) {
    try {
      changedCatalogItems = catalogImpact(
        b.operations.catalog.before,
        b.operations.catalog.after,
        [b.design],
      ).affected.length;
    } catch {
      changedCatalogItems = 1;
    }
  }
  const operations = b.operations;
  const sequence =
    operations?.sequence.filter(
      (t) => sequenceStatus(t, operations, b).status !== 'Done',
    ).length ?? 0;
  return [
    {
      name: 'Measure',
      count: measurementStatus(b.design) ? 1 : 0,
      detail: measurementStatus(b.design) || 'Survey matches the current room.',
      tools: ['Guided room measurements', 'Installation tolerance checks'],
    },
    {
      name: 'Design',
      count:
        count('questions') +
        changedCatalogItems +
        (!b.design.items.length ? 1 : 0),
      detail:
        'Resolve site and layout checks; review source evidence separately.',
      tools: [
        'canvas',
        'Suggested layout fixes',
        'Design decisions · budget, checks & site handoff',
        'Catalog update impact',
        'Reusable assembly library',
      ],
    },
    {
      name: 'Approve',
      count: count('approval'),
      detail: 'Capture approval for the current design revision.',
      tools: ['Cloud projects & client reviews', 'Visual revision history'],
    },
    {
      name: 'Order',
      count:
        count('supplier') +
        count('delivery') +
        (!b.purchasing.purchases.length ? 1 : 0),
      detail:
        'Review purchase drafts, confirmations and outstanding deliveries.',
      tools: [
        'Orders, changes & deliveries',
        'Supplier quotes',
        'QR delivery labels',
      ],
    },
    {
      name: 'Install',
      count: count('closeout') + sequence,
      detail: 'Check task prerequisites and record completion.',
      tools: [
        'Installation sequence',
        'Installation closeout & handover',
        'Offline field workspace',
      ],
    },
    {
      name: 'Aftercare',
      count: count('aftercare'),
      detail: 'Follow up service requests and measure project outcomes.',
      tools: [
        'Aftercare, warranties & service visits',
        'Pilot outcomes',
        'Complete project backup',
        'Shared project records',
      ],
    },
  ];
}
type SequenceResult = {
  blockers: string[];
  expected: string;
  status: string;
  overdue: boolean;
};
export function sequenceStatus(
  task: SequenceTask,
  o: Operations,
  b: ProjectBackup,
  today = new Date().toISOString().slice(0, 10),
  visiting = new Set<string>(),
  memo = new Map<string, SequenceResult>(),
): SequenceResult {
  const cached = memo.get(task.id);
  if (cached) return cached;
  if (visiting.has(task.id))
    return {
      blockers: ['Dependency cycle'],
      expected: '',
      status: 'Blocked',
      overdue: false,
    };
  const seen = new Set(visiting).add(task.id);
  const blockers: string[] = [],
    expected: string[] = [];
  for (const dep of task.dependsOn) {
    const t = o.sequence.find((t) => t.id === dep);
    if (!t?.done || sequenceStatus(t, o, b, today, seen, memo).blockers.length)
      blockers.push(`Finish ${t?.title ?? 'missing prerequisite'}`);
  }
  for (const id of task.siteIds) {
    const t = b.design.siteTasks?.find((t) => t.id === id);
    if (!t || t.status !== 'resolved')
      blockers.push(`Resolve site task: ${t?.title ?? id}`);
  }
  if (task.itemIds.length) {
    const p = b.purchasing.purchases.find((p) => p.id === task.purchaseId);
    if (!p) blockers.push('Purchase draft is missing');
    else {
      const d = parseDesign(p.designJson);
      for (const id of task.itemIds) {
        const item = d.items.find((i) => i.id === id);
        const receipt = p.receipts.find((r) => r.itemId === id);
        if (!item || isOpening(item) || receipt?.status !== 'received')
          blockers.push(
            `${item?.sku ?? id}: ${receipt?.status ?? 'pending delivery'}`,
          );
        const grouped = purchaseLines(d, p.book).find((l) =>
          l.itemIds.includes(id),
        );
        const line = p.confirmation?.lines.find(
          (l) => l.lineId === grouped?.id,
        );
        if (line?.expectedDelivery) expected.push(line.expectedDelivery);
      }
    }
  }
  const result = {
    blockers,
    expected: expected.sort().at(-1) ?? '',
    status: task.done
      ? blockers.length
        ? 'Recheck completed task'
        : 'Done'
      : blockers.length
        ? 'Blocked'
        : 'Ready',
    overdue: !task.done && !!task.planned && task.planned < today,
  };
  memo.set(task.id, result);
  return result;
}
export function pilotTotals(o: Operations) {
  const minutes = o.pilot.entries.reduce((n, e) => n + e.minutes, 0),
    rework = o.pilot.entries.reduce((n, e) => n + e.reworkMinutes, 0);
  return {
    minutes,
    rework,
    totalMinutes: minutes + rework,
    quoteRevisions: o.pilot.entries.reduce((n, e) => n + e.quoteRevisions, 0),
    issues: o.pilot.entries.reduce((n, e) => n + e.issues, 0),
    difference: o.pilot.baselineMinutes
      ? o.pilot.baselineMinutes - minutes - rework
      : null,
  };
}
