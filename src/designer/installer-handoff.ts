import { roomEdges } from './room';
import { z } from 'zod';
import { type Design, designSchema } from './model';
import { siteTasksSchema } from './decision-schema';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',')}}`;
  return JSON.stringify(value);
}
export function installationBaseline(design: Design) {
  return canonical({
    id: design.id,
    room: design.room,
    items: design.items,
    measurements: design.measurements,
  });
}
export function handoffPackage(design: Design) {
  return {
    format: 'kitchen-handoff-v1' as const,
    createdAt: new Date().toISOString(),
    design,
  };
}
export function parseHandoff(text: string) {
  if (text.length > 600000) throw Error('Handoff must be smaller than 600 KB.');
  return z
    .object({
      format: z.literal('kitchen-handoff-v1'),
      createdAt: z.string(),
      design: designSchema,
    })
    .parse(JSON.parse(text));
}
export function siteReport(source: Design, updated: Design) {
  return {
    format: 'kitchen-site-report-v1',
    designId: source.id,
    baseline: installationBaseline(source),
    originalTasks: source.siteTasks ?? [],
    tasks: updated.siteTasks ?? [],
  };
}
export function mergeSiteReport(design: Design, text: string): Design {
  if (text.length > 600000)
    throw Error('Site report must be smaller than 600 KB.');
  const report = z
    .object({
      format: z.literal('kitchen-site-report-v1'),
      designId: z.string(),
      baseline: z.string().max(500000),
      originalTasks: siteTasksSchema,
      tasks: siteTasksSchema,
    })
    .parse(JSON.parse(text));
  if (
    report.designId !== design.id ||
    report.baseline !== installationBaseline(design)
  )
    throw Error(
      'Room or items changed since this handoff. Export a fresh handoff and reconcile the site findings.',
    );
  if (canonical(report.originalTasks) !== canonical(design.siteTasks ?? []))
    throw Error(
      'Site tasks changed since this handoff. Reconcile those changes before importing.',
    );
  return designSchema.parse({ ...design, siteTasks: report.tasks });
}

const reportSchema = z.object({
  format: z.literal('kitchen-site-report-v1'),
  designId: z.string(),
  baseline: z.string().max(500000),
  originalTasks: siteTasksSchema,
  tasks: siteTasksSchema,
});
export function inspectSiteReport(design: Design, text: string) {
  if (text.length > 600000)
    throw Error('Site report must be smaller than 600 KB.');
  const report = reportSchema.parse(JSON.parse(text));
  if (report.designId !== design.id)
    throw Error('Site report belongs to another project.');
  const baseline = JSON.parse(report.baseline) as Partial<Design>;
  const before = designSchema.parse({
    ...design,
    ...baseline,
    name: 'Original handoff',
    siteTasks: report.originalTasks,
  });
  const current = design.siteTasks ?? [];
  const rows = [
    ...new Set([
      ...report.originalTasks.map((t) => t.id),
      ...report.tasks.map((t) => t.id),
    ]),
  ].flatMap((id) => {
    const original = report.originalTasks.find((t) => t.id === id),
      incoming = report.tasks.find((t) => t.id === id),
      local = current.find((t) => t.id === id);
    if (
      canonical(original) === canonical(incoming) ||
      canonical(local) === canonical(incoming)
    )
      return [];
    return [
      {
        id,
        original: original ?? null,
        incoming: incoming ?? null,
        current: local ?? null,
        conflict: canonical(local) !== canonical(original),
      },
    ];
  });
  return {
    report,
    before,
    rows,
    geometryChanged: report.baseline !== installationBaseline(design),
    source: canonical(design),
  };
}
export type SiteResolution = {
  id: string;
  choice: 'current' | 'incoming' | 'both';
  wall?: number;
};
export function resolveSiteReport(
  design: Design,
  text: string,
  resolutions: SiteResolution[],
  acknowledgeGeometry: boolean,
  expectedSource: string,
): Design {
  if (canonical(design) !== expectedSource)
    throw Error(
      'Design or site notes changed during review. Reopen the report to compare again.',
    );
  const review = inspectSiteReport(design, text);
  if (new Set(resolutions.map((r) => r.id)).size !== resolutions.length)
    throw Error('Choose one resolution per finding.');
  if (review.rows.some((row) => !resolutions.some((r) => r.id === row.id)))
    throw Error('Choose a resolution for every finding.');
  if (
    review.geometryChanged &&
    !acknowledgeGeometry &&
    resolutions.some((r) => r.choice !== 'current')
  )
    throw Error(
      'Confirm wall locations against the current plan before merging.',
    );
  let tasks = [...(design.siteTasks ?? [])];
  for (const row of review.rows) {
    const decision = resolutions.find((r) => r.id === row.id);
    if (!decision || decision.choice === 'current') continue;
    if (decision.choice === 'both' && !row.incoming)
      throw Error('A deleted finding cannot be kept as a copy.');
    if (decision.choice === 'incoming')
      tasks = tasks.filter((t) => t.id !== row.id);
    if (row.incoming) {
      const wall = decision.wall ?? row.incoming.wall;
      if (
        !Number.isInteger(wall) ||
        wall < 0 ||
        wall >= roomEdges(design.room).length
      )
        throw Error('Choose an existing wall for the incoming finding.');
      tasks.push({
        ...row.incoming,
        wall,
        id: decision.choice === 'both' ? crypto.randomUUID() : row.incoming.id,
      });
    }
  }
  return designSchema.parse({
    ...design,
    siteTasks: siteTasksSchema.parse(tasks),
  });
}
