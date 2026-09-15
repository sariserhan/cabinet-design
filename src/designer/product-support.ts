import { z } from 'zod';
import { assemblyTemplateSchema } from './assembly-library';
import { type Design, type Cabinet, itemPolygon } from './model';
import { roomEdges } from './room';
import { canonical } from './installer-handoff';
import { itemConfiguration } from './supplier-pricing';
import { compactPhotoSchema } from './closeout';
export const optionalDate = z
  .string()
  .refine(
    (s) =>
      s === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        Number.isFinite(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    'Use a valid calendar date.',
  );
const range = z
  .object({
    min: z.number().finite().min(0).max(600),
    max: z.number().finite().positive().max(600),
  })
  .refine((r) => r.min <= r.max, 'Minimum must not exceed maximum.');
export const compatibilityRuleSchema = z.object({
  id: z.string().min(1).max(100),
  manufacturer: z.string().trim().min(1).max(160),
  hostSku: z.string().trim().min(1).max(100),
  componentSku: z.string().trim().min(1).max(100),
  componentType: z.enum(['hinge', 'drawer', 'sink', 'appliance', 'accessory']),
  width: range,
  depth: range,
  height: range,
  hostFinish: z.string().max(100),
  hostConfiguration: z.string().max(2000),
  source: z.string().trim().min(1).max(1000),
  url: z
    .string()
    .max(2000)
    .refine(
      (s) => !s || /^https?:\/\/[^\s]+$/i.test(s),
      'Use an HTTP(S) source URL.',
    ),
  revision: z.string().trim().min(1).max(120),
  review: z
    .object({
      by: z.string().trim().min(1).max(120),
      at: z.string().datetime(),
    })
    .optional(),
});
export type CompatibilityRule = z.infer<typeof compatibilityRuleSchema>;
export function compatibilityResults(
  host: Cabinet,
  componentSku: string,
  rules: CompatibilityRule[],
  design: Design,
) {
  const matches = rules.filter(
    (r) => r.hostSku === host.sku && r.componentSku === componentSku,
  );
  if (!matches.length)
    return [
      {
        status: 'unverified' as const,
        rule: undefined,
        message:
          'No documented rule matches this exact cabinet and component SKU.',
      },
    ];
  return matches.map((rule) => {
    if (!rule.review)
      return {
        status: 'unverified' as const,
        rule,
        message: 'Source rule needs human review before it can be used.',
      };
    const mismatches = (['width', 'depth', 'height'] as const)
      .filter((key) => host[key] < rule[key].min || host[key] > rule[key].max)
      .map(
        (key) =>
          `${key}: ${host[key]} in; documented range ${rule[key].min}–${rule[key].max} in`,
      );
    if (rule.hostFinish && rule.hostFinish !== (host.finish ?? design.finish))
      mismatches.push(`finish must be ${rule.hostFinish}`);
    if (
      rule.hostConfiguration &&
      rule.hostConfiguration !== itemConfiguration(host)
    )
      mismatches.push('configuration does not match the documented rule');
    return {
      status: mismatches.length
        ? ('mismatch' as const)
        : ('matches_rule' as const),
      rule,
      message: mismatches.length
        ? mismatches.join('; ')
        : 'Matches these recorded dimensions and constraints. Other requirements remain unverified.',
    };
  });
}
export const toleranceRunSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  itemIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  wall: z.number().int().min(0).max(23),
  start: z.number().min(0).max(600),
  span: z.number().positive().max(600),
  uncertainty: z.number().min(0).max(12),
  unevenness: z.number().min(0).max(12),
  leftFiller: z.number().min(0).max(24),
  rightFiller: z.number().min(0).max(24),
  measuredBy: z.string().trim().min(1).max(120),
  note: z.string().max(1000),
  roomSignature: z.string().max(20000),
});
export type ToleranceRun = z.infer<typeof toleranceRunSchema>;
export function toleranceResult(d: Design, r: ToleranceRun) {
  const wall = roomEdges(d.room)[r.wall];
  const selected = d.items.filter((i) => r.itemIds.includes(i.id));
  if (r.roomSignature !== canonical(d.room))
    return {
      status: 'unverified',
      message:
        'Room changed since this measured span. Re-measure and save a new run.',
    };
  if (!wall || d.room.curves?.some((c) => c.wall === r.wall && c.bow !== 0))
    return {
      status: 'unverified',
      message: 'This check requires a straight, existing wall.',
    };
  if (selected.length !== new Set(r.itemIds).size || !selected.length)
    return {
      status: 'unverified',
      message: 'A measured-run item is missing. Re-select the run.',
    };
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (r.start + r.span > length + 0.01)
    return {
      status: 'unverified',
      message: 'Measured span extends beyond the modeled wall.',
    };
  const projected = selected
    .flatMap((i) => itemPolygon(i))
    .map(
      (p) =>
        ((p.x - wall.a.x) * (wall.b.x - wall.a.x) +
          (p.y - wall.a.y) * (wall.b.y - wall.a.y)) /
        length,
    );
  const min = Math.min(...projected),
    max = Math.max(...projected),
    allowance = r.uncertainty + r.unevenness / 2;
  const left = min - r.start - r.leftFiller - allowance,
    right = r.start + r.span - max - r.rightFiller - allowance;
  return {
    status: left >= -0.01 && right >= -0.01 ? 'fits_allowance' : 'insufficient',
    left,
    right,
    occupied: max - min,
    available:
      r.span - 2 * r.uncertainty - r.unevenness - r.leftFiller - r.rightFiller,
    message: `Left adjustment ${left.toFixed(2)} in · right adjustment ${right.toFixed(2)} in. Includes ${r.uncertainty} in uncertainty at each end and ${r.unevenness} in total wall unevenness.`,
  };
}
export const warrantySchema = z
  .object({
    id: z.string().min(1).max(100),
    itemId: z.string().max(100),
    product: z.string().trim().min(1).max(160),
    serial: z.string().max(160),
    provider: z.string().max(200),
    contact: z.string().max(500),
    starts: optionalDate,
    expires: optionalDate,
    terms: z.string().max(2000),
    parts: z.string().max(2000),
  })
  .refine(
    (w) => !w.starts || !w.expires || w.starts <= w.expires,
    'Warranty expiry must follow its start.',
  );
export const serviceCaseSchema = z.object({
  id: z.string().min(1).max(100),
  itemId: z.string().max(100),
  title: z.string().trim().min(1).max(160),
  status: z.enum(['open', 'scheduled', 'waiting_parts', 'resolved']),
  assignee: z.string().max(120),
  visit: optionalDate,
  note: z.string().max(2000),
  partSku: z.string().max(100),
  photo: compactPhotoSchema.optional(),
});
export type Warranty = z.infer<typeof warrantySchema>;
export type ServiceCase = z.infer<typeof serviceCaseSchema>;
export const productSupportSchema = z
  .object({
    format: z.literal('kitchen-product-support-v1'),
    designId: z.string().min(1).max(100),
    rules: z.array(compatibilityRuleSchema).max(100),
    runs: z.array(toleranceRunSchema).max(20),
    warranties: z.array(warrantySchema).max(100),
    cases: z.array(serviceCaseSchema).max(60),
    assemblies: z.array(assemblyTemplateSchema).max(20).default([]),
  })
  .superRefine((s, c) => {
    for (const rows of [s.rules, s.runs, s.warranties, s.cases, s.assemblies])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        c.addIssue({
          code: 'custom',
          message: 'Duplicate support record identifiers.',
        });
    if (s.cases.filter((c) => c.photo).length > 8)
      c.addIssue({
        code: 'custom',
        message: 'Keep at most eight aftercare photos.',
      });
  });
export type ProductSupport = z.infer<typeof productSupportSchema>;
export const emptySupport = (designId: string): ProductSupport => ({
  format: 'kitchen-product-support-v1',
  designId,
  rules: [],
  runs: [],
  warranties: [],
  cases: [],
  assemblies: [],
});
export function parseSupport(
  raw: string,
  designId: string,
  trustedLocal = false,
) {
  if (raw.length > 1000000) throw Error('Product support file exceeds 1 MB.');
  const s = productSupportSchema.parse(JSON.parse(raw));
  if (s.designId !== designId)
    throw Error('Product support belongs to another project.');
  if (!trustedLocal)
    s.rules.forEach((r) => {
      delete r.review;
    });
  return s;
}
