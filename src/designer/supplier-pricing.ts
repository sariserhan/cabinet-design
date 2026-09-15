import { z } from 'zod';
import type { Cabinet, Design } from './model';

const amount = z.number().finite().min(0).max(100000000);
export const priceBookSchema = z
  .object({
    supplier: z.string().trim().min(1).max(160),
    reference: z.string().trim().min(1).max(500),
    currency: z.literal('USD'),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (s) =>
          Number.isFinite(Date.parse(s)) &&
          new Date(s).toISOString().slice(0, 10) === s,
        'Use a valid expiry date',
      ),
    lines: z
      .array(
        z.object({
          sku: z.string().trim().min(1).max(100),
          finish: z.string().trim().min(1).max(100),
          configuration: z.string().max(2000).default('standard'),
          width: z.number().positive().max(600),
          depth: z.number().positive().max(600),
          height: z.number().positive().max(600),
          unitPrice: amount,
        }),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((book, ctx) => {
    const keys = new Set<string>();
    book.lines.forEach((line, index) => {
      const key = priceKey(line);
      if (keys.has(key))
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate SKU, finish and dimensions',
          path: ['lines', index],
        });
      keys.add(key);
    });
  });
export type PriceBook = z.infer<typeof priceBookSchema>;
function priceKey(line: {
  sku: string;
  finish: string;
  configuration?: string;
  width: number;
  depth: number;
  height: number;
}) {
  return JSON.stringify([
    line.sku,
    line.finish,
    line.configuration ?? 'standard',
    line.width,
    line.depth,
    line.height,
  ]);
}
export function itemConfiguration(item: Cabinet) {
  const options = {
    details: item.details,
    surface: item.surface,
    sinkStyle: item.sinkStyle,
    refrigeratorStyle: item.refrigeratorStyle,
    frontStyle: item.frontStyle === 'auto' ? undefined : item.frontStyle,
  };
  const serialized = JSON.stringify(options);
  return serialized === '{}' ? 'standard' : serialized;
}
export function parsePriceBook(text: string): PriceBook {
  if (text.length > 400000)
    throw Error('Price list must be smaller than 400 KB.');
  return priceBookSchema.parse(JSON.parse(text));
}
export function supplierQuote(
  design: Design,
  book: PriceBook,
  now = Date.now(),
) {
  const prices = new Map(book.lines.map((line) => [priceKey(line), line]));
  const expired = now >= Date.parse(book.validUntil + 'T00:00:00Z') + 86400000;
  const lines = design.items.map((item) => {
    const finish =
      item.kind === 'countertop'
        ? (item.countertop ?? design.appearance?.countertop ?? 'quartz')
        : (item.finish ?? design.finish);
    const price = prices.get(
      priceKey({ ...item, finish, configuration: itemConfiguration(item) }),
    );
    return {
      id: item.id,
      sku: item.sku,
      finish,
      configuration: itemConfiguration(item),
      width: item.width,
      depth: item.depth,
      height: item.height,
      unitCents: price ? Math.round(price.unitPrice * 100) : null,
    };
  });
  const missing = lines.filter((line) => line.unitCents === null);
  const subtotal = lines.reduce((sum, line) => sum + (line.unitCents ?? 0), 0);
  const settings = {
    discount: 0,
    tax: 0,
    installation: 0,
    delivery: 0,
    ...design.quote,
  };
  const discount = Math.round((subtotal * settings.discount) / 100);
  const tax = Math.round(((subtotal - discount) * settings.tax) / 100);
  const installation = Math.round(settings.installation * 100),
    delivery = Math.round(settings.delivery * 100);
  return {
    supplier: book.supplier,
    reference: book.reference,
    currency: book.currency,
    validUntil: book.validUntil,
    expired,
    lines,
    missing,
    subtotal,
    discount,
    tax,
    installation,
    delivery,
    total:
      missing.length || expired || !lines.length
        ? null
        : subtotal - discount + tax + installation + delivery,
  };
}
export function priceRequest(design: Design) {
  return {
    supplier: '',
    reference: '',
    currency: 'USD',
    validUntil: '',
    lines: [
      ...new Map(
        design.items.map((item) => {
          const line = {
            sku: item.sku,
            configuration: itemConfiguration(item),
            finish:
              item.kind === 'countertop'
                ? (item.countertop ?? design.appearance?.countertop ?? 'quartz')
                : (item.finish ?? design.finish),
            width: item.width,
            depth: item.depth,
            height: item.height,
            unitPrice: null,
          };
          return [priceKey(line), line];
        }),
      ).values(),
    ],
  };
}
