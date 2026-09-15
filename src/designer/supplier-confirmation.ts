import { z } from 'zod';
const date = z
  .string()
  .refine(
    (s) =>
      s === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        Number.isFinite(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    'Use a valid date.',
  );
export const supplierConfirmationSchema = z.object({
  reference: z.string().max(160),
  contact: z.string().max(200),
  confirmedOn: date,
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1).max(100),
        confirmedQuantity: z.number().int().min(0).max(100),
        leadDays: z.number().int().min(0).max(730),
        expectedDelivery: date,
        substituteSku: z.string().max(100),
        substitution: z.enum(['none', 'proposed', 'accepted', 'rejected']),
        note: z.string().max(2000),
      }),
    )
    .max(100),
});
export type SupplierConfirmation = z.infer<typeof supplierConfirmationSchema>;
export const emptyConfirmation = (): SupplierConfirmation => ({
  reference: '',
  contact: '',
  confirmedOn: '',
  lines: [],
});
