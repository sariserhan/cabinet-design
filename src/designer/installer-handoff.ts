import { z } from 'zod';
import { type Design, designSchema } from './model';
import { siteTasksSchema } from './decision-schema';
function canonical(value: unknown): string {
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
