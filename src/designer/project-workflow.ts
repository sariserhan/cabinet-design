import { z } from 'zod';
import { type Design, designSchema, warnings, isOpening } from './model';
import { type CatalogChoice, changeImpact } from './design-decisions';
import { type PriceBook, supplierQuote } from './supplier-pricing';
import { measuredDesign } from './measurements';
import { roomOutline } from './room';
import { canonical } from './installer-handoff';
export const stages = [
  'Measure',
  'Design',
  'Check',
  'Price',
  'Present',
  'Install',
] as const;
export type Stage = (typeof stages)[number];
export function reviewContent(d: Design) {
  return canonical({
    room: d.room,
    items: d.items,
    finish: d.finish,
    appearance: d.appearance,
    quote: d.quote,
    supplierBookId: d.supplierBookId,
  });
}
export function milestoneDesign(d: Design): Design {
  const { orders, quoteDocument, siteTasks, selectionBoard, ...rest } = d;
  void orders;
  void quoteDocument;
  void siteTasks;
  void selectionBoard;
  return designSchema.parse(rest);
}
export const milestoneSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(1000),
  createdAt: z.string().max(40),
  designJson: z
    .string()
    .max(100000)
    .refine((s) => {
      try {
        return designSchema.safeParse(JSON.parse(s)).success;
      } catch {
        return false;
      }
    }, 'Invalid milestone design'),
  price: z
    .object({
      total: z.number().min(0),
      supplier: z.string().max(160),
      reference: z.string().max(500),
      revision: z.number().int().min(1),
      validUntil: z.string().max(10),
    })
    .optional(),
  approval: z
    .object({
      revision: z.number().int().min(1),
      names: z.array(z.string().max(100)).min(1).max(100),
      capturedAt: z.string().max(40),
    })
    .optional(),
});
export type Milestone = z.infer<typeof milestoneSchema>;
export function createMilestone(
  d: Design,
  title: string,
  reason: string,
  book?: PriceBook,
  revision?: number,
): Milestone {
  const quote = book ? supplierQuote(d, book) : null;
  return milestoneSchema.parse({
    id: crypto.randomUUID(),
    title,
    reason,
    createdAt: new Date().toISOString(),
    designJson: JSON.stringify(milestoneDesign(d)),
    ...(quote?.total !== null && quote?.total !== undefined && revision
      ? {
          price: {
            total: quote.total,
            supplier: quote.supplier,
            reference: quote.reference,
            revision,
            validUntil: quote.validUntil,
          },
        }
      : {}),
  });
}
export function parseMilestones(
  text: string,
  designId: string,
  trustedLocal = false,
): Milestone[] {
  if (text.length > 900000)
    throw Error('History file must be smaller than 900 KB.');
  const parsed = z
    .object({
      format: z.literal('kitchen-milestones-v1'),
      designId: z.string(),
      entries: z.array(milestoneSchema).max(8),
    })
    .parse(JSON.parse(text));
  if (parsed.designId !== designId)
    throw Error('History belongs to another project.');
  if (parsed.entries.some((e) => JSON.parse(e.designJson).id !== designId))
    throw Error('Milestone belongs to another project.');
  if (new Set(parsed.entries.map((e) => e.id)).size !== parsed.entries.length)
    throw Error('Duplicate milestone identifiers.');
  return parsed.entries.map((e) => {
    if (trustedLocal) return e;
    const { approval, ...rest } = e;
    void approval;
    return rest;
  });
}
export function measurementStatus(d: Design): string | null {
  if (!d.measurements) return 'No confirmed room survey recorded.';
  try {
    const measured = measuredDesign(d.measurements);
    const match =
      Math.abs(measured.room.width - d.room.width) < 0.01 &&
      Math.abs(measured.room.depth - d.room.depth) < 0.01 &&
      Math.abs(measured.room.height - d.room.height) < 0.01 &&
      canonical(roomOutline(measured.room)) ===
        canonical(roomOutline(d.room)) &&
      !d.room.ceiling &&
      canonical(measured.room.walls) === canonical(d.room.walls);
    if (!match)
      return 'Room geometry changed since the survey; recheck the dimensions.';
    const keys = [
      'x',
      'y',
      'width',
      'height',
      'elevation',
      'wallSegment',
      'rotation',
    ] as const;
    if (
      d.items.filter(isOpening).length !== measured.items.length ||
      measured.items.some((i) => {
        const current = d.items.find((c) => c.id === i.id);
        return !current || keys.some((k) => i[k] !== current[k]);
      })
    )
      return 'Door/window positions changed since the survey.';
    return null;
  } catch {
    return 'The recorded survey needs correction.';
  }
}
export function projectReadiness(
  d: Design,
  book: PriceBook | undefined,
  catalog: CatalogChoice[] | undefined,
  approved?: Milestone,
  now = Date.now(),
) {
  const geometry = warnings(d),
    measure = measurementStatus(d);
  const unverified = d.items.filter((i) => {
    if (
      i.kind === 'custom_cabinet' ||
      i.kind === 'corner' ||
      [
        'island',
        'countertop',
        'filler',
        'trim',
        'molding',
        'toe_kick',
      ].includes(i.kind)
    )
      return true;
    if (i.kind !== 'cabinet') return false;
    const r = catalog?.find(
      (r) => r._id === i.recordId && r.versionId === i.versionId,
    );
    return (
      !r ||
      !r.truthVerified ||
      r.reviewStatus !== 'approved' ||
      r.blockers.length > 0 ||
      r.width !== i.width ||
      r.depth !== i.depth ||
      r.height !== i.height
    );
  });
  const quote = book ? supplierQuote(d, book, now) : null;
  const approvalCurrent =
    !!approved?.approval &&
    reviewContent(JSON.parse(approved.designJson) as Design) ===
      reviewContent(d);
  const site = d.siteTasks?.filter((t) => t.status !== 'resolved') ?? [];
  const rows: {
    id: string;
    stage: Stage;
    done: boolean;
    message: string;
    itemIds: string[];
  }[] = [
    {
      id: 'measure',
      stage: 'Measure',
      done: measure === null,
      message:
        measure ?? 'Confirmed survey matches the current room and openings.',
      itemIds: [],
    },
    {
      id: 'items',
      stage: 'Design',
      done: d.items.length > 0,
      message: d.items.length
        ? `${d.items.length} items in the layout.`
        : 'Add items to your room.',
      itemIds: [],
    },
    {
      id: 'geometry',
      stage: 'Check',
      done: geometry.length === 0 && d.items.length > 0,
      message: geometry.length
        ? `${geometry.length} layout or installation checks need attention.`
        : 'No current layout warnings.',
      itemIds: geometry.flatMap((w) => w.itemIds),
    },
    {
      id: 'catalog',
      stage: 'Check',
      done:
        catalog !== undefined && unverified.length === 0 && d.items.length > 0,
      message:
        catalog === undefined
          ? 'Checking catalog evidence…'
          : unverified.length
            ? `${unverified.length} products need source verification or manufacturer specifications.`
            : 'Placed catalog cabinets match reviewed source dimensions.',
      itemIds: unverified.map((i) => i.id),
    },
    {
      id: 'price',
      stage: 'Price',
      done: quote?.total !== null && quote?.total !== undefined,
      message: !quote
        ? 'Import a supplier price list.'
        : quote.expired
          ? 'Supplier prices have expired.'
          : quote.total === null
            ? `${quote.missing.length} items need prices; no final total.`
            : 'Every item has a current supplier price.',
      itemIds: quote?.missing.map((i) => i.id) ?? [],
    },
    {
      id: 'approval',
      stage: 'Present',
      done: approvalCurrent,
      message: !approved?.approval
        ? 'Capture a client-approved review link in Visual revision history.'
        : approvalCurrent
          ? `Design matches captured approved revision ${approved.approval.revision}; its original quoted price is not reverified.`
          : 'Design changed since the captured client approval. Create a new review link.',
      itemIds: [],
    },
    {
      id: 'site',
      stage: 'Install',
      done: !!d.siteTasks?.length && site.length === 0,
      message: !d.siteTasks?.length
        ? 'Record and resolve the site handoff questions.'
        : site.length
          ? `${site.length} site questions remain open.`
          : 'All recorded site questions are resolved.',
      itemIds: [],
    },
  ];
  return {
    rows,
    remaining: rows.filter((r) => !r.done).length,
    stages: stages.map((stage) => ({
      stage,
      done: rows.filter((r) => r.stage === stage).every((r) => r.done),
      remaining: rows.filter((r) => r.stage === stage && !r.done).length,
    })),
  };
}
export function milestoneChanges(
  entry: Milestone,
  d: Design,
  book?: PriceBook,
) {
  const before = designSchema.parse(JSON.parse(entry.designJson));
  return {
    before,
    impact: changeImpact(before, d, book),
    rows: [
      ...new Set([
        ...before.items.map((i) => i.id),
        ...d.items.map((i) => i.id),
      ]),
    ].flatMap((id) => {
      const a = before.items.find((i) => i.id === id),
        b = d.items.find((i) => i.id === id);
      if (canonical(a) === canonical(b)) return [];
      const changes: string[] = [];
      if (!a) changes.push('Added');
      else if (!b) changes.push('Removed');
      else {
        if (
          a.x !== b.x ||
          a.y !== b.y ||
          a.rotation !== b.rotation ||
          a.elevation !== b.elevation
        )
          changes.push(
            `Position (${a.x}, ${a.y}, ${a.elevation}) → (${b.x}, ${b.y}, ${b.elevation}); rotation ${a.rotation}° → ${b.rotation}°`,
          );
        if (a.sku !== b.sku) changes.push(`${a.sku} → ${b.sku}`);
        if (a.width !== b.width || a.depth !== b.depth || a.height !== b.height)
          changes.push(
            `Size ${a.width}×${a.depth}×${a.height} → ${b.width}×${b.depth}×${b.height} in`,
          );
        const oldMaterial =
          a.kind === 'countertop'
            ? (a.countertop ?? before.appearance?.countertop ?? 'quartz')
            : (a.finish ?? before.finish);
        const newMaterial =
          b.kind === 'countertop'
            ? (b.countertop ?? d.appearance?.countertop ?? 'quartz')
            : (b.finish ?? d.finish);
        if (oldMaterial !== newMaterial)
          changes.push(
            `${b.kind === 'countertop' ? 'Countertop' : 'Finish'} ${oldMaterial} → ${newMaterial}`,
          );
        if (a.frontStyle !== b.frontStyle)
          changes.push(`Front ${a.frontStyle} → ${b.frontStyle}`);
        if (!changes.length)
          changes.push('Configuration or installation details changed');
      }
      return [{ id, sku: b?.sku ?? a?.sku ?? id, changes }];
    }),
  };
}
