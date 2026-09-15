import { z } from 'zod';
import { supplierConfirmationSchema } from './supplier-confirmation';
import { type Design, parseDesign, isOpening, warnings } from './model';
import { canonical } from './installer-handoff';
import { milestoneDesign, reviewContent } from './project-workflow';
import {
  type PriceBook,
  priceBookSchema,
  supplierQuote,
} from './supplier-pricing';

const snapshot = z
  .string()
  .max(100000)
  .refine((s) => {
    try {
      parseDesign(s);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid design snapshot');
const approvalSchema = z.object({
  revision: z.number().int().positive(),
  names: z.array(z.string().min(1).max(100)).min(1).max(100),
  capturedAt: z.string().datetime(),
});
const receiptSchema = z.object({
  itemId: z.string().min(1).max(100),
  status: z.enum(['pending', 'received', 'missing', 'damaged']),
  note: z.string().max(1000),
  updatedAt: z.string().datetime(),
  photo: z
    .string()
    .max(12000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});
const changeSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(1).max(1000),
  createdAt: z.string().datetime(),
  before: snapshot,
  after: snapshot,
  book: priceBookSchema.optional(),
  approval: approvalSchema.optional(),
});
const purchaseSchema = z.object({
  id: z.string().min(1),
  number: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(),
  designJson: snapshot,
  book: priceBookSchema.optional(),
  approval: approvalSchema.optional(),
  supplierNote: z.string().max(2000),
  receipts: z.array(receiptSchema).max(100),
  confirmation: supplierConfirmationSchema.optional(),
});
export const purchasingSchema = z.object({
  format: z.literal('kitchen-purchasing-v1'),
  designId: z.string().min(1),
  baseline: z
    .object({ designJson: snapshot, approval: approvalSchema })
    .optional(),
  baselineReference: snapshot.optional(),
  changes: z.array(changeSchema).max(10),
  purchases: z.array(purchaseSchema).max(10),
});
export type Purchasing = z.infer<typeof purchasingSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Purchase = z.infer<typeof purchaseSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export function emptyPurchasing(designId: string): Purchasing {
  return {
    format: 'kitchen-purchasing-v1',
    designId,
    changes: [],
    purchases: [],
  };
}
export function designSnapshot(d: Design) {
  return JSON.stringify(milestoneDesign(d));
}
export function parsePurchasing(
  text: string,
  designId: string,
  trustedLocal = false,
): Purchasing {
  if (text.length > 3500000) throw Error('Purchasing backup exceeds 3.5 MB.');
  const data = purchasingSchema.parse(JSON.parse(text));
  if (data.designId !== designId)
    throw Error('Purchasing records belong to another project.');
  const snapshots = [
    data.baseline?.designJson,
    data.baselineReference,
    ...data.changes.flatMap((c) => [c.before, c.after]),
    ...data.purchases.map((p) => p.designJson),
  ].filter((s): s is string => !!s);
  if (snapshots.some((s) => parseDesign(s).id !== designId))
    throw Error('Snapshot belongs to another project.');
  const ids = [...data.changes, ...data.purchases].map((e) => e.id);
  if (new Set(ids).size !== ids.length)
    throw Error('Duplicate record identifiers.');
  for (const p of data.purchases) {
    const items = supplyDesign(parseDesign(p.designJson)).items;
    const lines = purchaseLines(parseDesign(p.designJson), p.book);
    if (p.confirmation) {
      if (
        new Set(p.confirmation.lines.map((l) => l.lineId)).size !==
        p.confirmation.lines.length
      )
        throw Error('Duplicate supplier confirmation lines.');
      for (const confirmation of p.confirmation.lines) {
        const line = lines.find((l) => l.id === confirmation.lineId);
        if (!line || confirmation.confirmedQuantity > line.quantity)
          throw Error(
            'Confirmed quantity exceeds the ordered quantity or references an unknown line.',
          );
        if (
          confirmation.substitution !== 'none' &&
          !confirmation.substituteSku.trim()
        )
          throw Error(
            'Enter a substitute SKU before recording a substitution.',
          );
      }
    }
    if (
      new Set(p.receipts.map((r) => r.itemId)).size !== p.receipts.length ||
      p.receipts.some((r) => !items.some((i) => i.id === r.itemId))
    )
      throw Error('Invalid delivery item reference.');
    if (p.receipts.filter((r) => r.photo).length > 4)
      throw Error('Use at most four photos per purchase draft.');
  }
  if (!trustedLocal) {
    if (data.baseline) data.baselineReference = data.baseline.designJson;
    delete data.baseline;
    data.changes.forEach((c) => {
      delete c.approval;
    });
    data.purchases.forEach((p) => {
      delete p.approval;
    });
  }
  return data;
}
export function approvalFromReview(
  review: {
    designJson: string;
    revision: number;
    comments: { kind: string; name: string }[];
  } | null,
  expected: Design,
): Approval {
  if (!review)
    throw Error('Review link expired, was revoked, or was not found.');
  const reviewed = parseDesign(review.designJson);
  if (
    reviewed.id !== expected.id ||
    reviewContent(reviewed) !== reviewContent(expected)
  )
    throw Error('Review does not match this exact design snapshot.');
  const names = [
    ...new Set(
      review.comments.filter((c) => c.kind === 'approval').map((c) => c.name),
    ),
  ];
  if (!names.length) throw Error('This review has no client approval yet.');
  return approvalSchema.parse({
    revision: review.revision,
    names,
    capturedAt: new Date().toISOString(),
  });
}
export function makeChange(
  before: Design,
  after: Design,
  reason: string,
  book?: PriceBook,
) {
  if (before.id !== after.id)
    throw Error('Choose a baseline from this project.');
  if (reviewContent(before) === reviewContent(after))
    throw Error('There are no scope changes to record.');
  return changeSchema.parse({
    id: crypto.randomUUID(),
    reason,
    createdAt: new Date().toISOString(),
    before: designSnapshot(before),
    after: designSnapshot(after),
    ...(book ? { book } : {}),
  });
}
export function supplyDesign(d: Design): Design {
  return { ...d, items: d.items.filter((i) => !isOpening(i)) };
}
export function purchaseLines(d: Design, book?: PriceBook) {
  const lines = supplierQuote(
    supplyDesign(d),
    book ?? {
      supplier: '',
      reference: '',
      currency: 'USD',
      validUntil: '2000-01-01',
      lines: [],
    },
  ).lines;
  const grouped = new Map<
    string,
    (typeof lines)[number] & {
      itemIds: string[];
      quantity: number;
      lineCents: number | null;
    }
  >();
  for (const line of lines) {
    const { id, ...configuration } = line;
    const key = canonical(configuration),
      previous = grouped.get(key);
    if (previous) {
      previous.itemIds.push(id);
      previous.quantity++;
      previous.lineCents =
        previous.unitCents === null
          ? null
          : previous.quantity * previous.unitCents;
    } else
      grouped.set(key, {
        ...line,
        itemIds: [id],
        quantity: 1,
        lineCents: line.unitCents,
      });
  }
  return [...grouped.values()];
}
export function purchaseChecks(
  d: Design,
  book?: PriceBook,
  approval?: Approval,
  now = Date.now(),
) {
  const quote = book ? supplierQuote(supplyDesign(d), book, now) : null;
  const issues: string[] = [];
  if (!approval) issues.push('Verify client approval for this exact snapshot.');
  if (!quote || quote.total === null)
    issues.push(
      !quote
        ? 'Import supplier prices.'
        : quote.expired
          ? 'Supplier prices have expired.'
          : 'Supply items have missing prices or the order is empty.',
    );
  if (!supplyDesign(d).items.length) issues.push('Add products to the order.');
  const checks = warnings(d);
  if (checks.length)
    issues.push(`${checks.length} layout checks need attention.`);
  const open = d.siteTasks?.filter((t) => t.status !== 'resolved').length ?? 0;
  if (open) issues.push(`${open} site questions remain unresolved.`);
  return issues;
}
export function makePurchase(
  d: Design,
  number: string,
  supplierNote: string,
  book?: PriceBook,
  approval?: Approval,
): Purchase {
  // Keep site questions in this snapshot so outstanding questions remain reviewable.
  const clean = {
    ...milestoneDesign(d),
    ...(d.siteTasks ? { siteTasks: d.siteTasks } : {}),
  };
  return purchaseSchema.parse({
    id: crypto.randomUUID(),
    number,
    supplierNote,
    createdAt: new Date().toISOString(),
    designJson: JSON.stringify(clean),
    ...(book ? { book } : {}),
    ...(approval ? { approval } : {}),
    receipts: [],
  });
}
export function deliverySummary(p: Purchase) {
  const ids = supplyDesign(parseDesign(p.designJson)).items.map((i) => i.id);
  const counts = { pending: 0, received: 0, damaged: 0, missing: 0 };
  ids.forEach(
    (id) =>
      counts[p.receipts.find((r) => r.itemId === id)?.status ?? 'pending']++,
  );
  return counts;
}
export function scopeDifference(
  before: Design,
  after: Design,
  book?: PriceBook,
) {
  const a = purchaseLines(before, book),
    b = purchaseLines(after, book);
  const changes = [
    ...new Set([
      ...a.flatMap((l) => l.itemIds),
      ...b.flatMap((l) => l.itemIds),
    ]),
  ].flatMap((id) => {
    const old = a.find((l) => l.itemIds.includes(id)),
      next = b.find((l) => l.itemIds.includes(id));
    const oldItem = before.items.find((i) => i.id === id),
      nextItem = after.items.find((i) => i.id === id);
    if (
      canonical(oldItem) === canonical(nextItem) &&
      canonical(old) === canonical(next)
    )
      return [];
    return [{ id, before: old ?? null, after: next ?? null }];
  });
  const oldQuote = book ? supplierQuote(supplyDesign(before), book) : null,
    nextQuote = book ? supplierQuote(supplyDesign(after), book) : null;
  return {
    changes,
    beforeTotal: oldQuote?.total ?? null,
    afterTotal: nextQuote?.total ?? null,
    delta:
      oldQuote?.total != null && nextQuote?.total != null
        ? nextQuote.total - oldQuote.total
        : null,
    roomChanged: canonical(before.room) !== canonical(after.room),
    finishesChanged:
      canonical(before.appearance) !== canonical(after.appearance) ||
      before.finish !== after.finish,
    quoteChanged: canonical(before.quote) !== canonical(after.quote),
  };
}
