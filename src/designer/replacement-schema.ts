import { z } from 'zod';
export const replacementSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  width: z.number().positive().max(600),
  depth: z.number().positive().max(600),
  height: z.number().positive().max(600),
  finish: z.string().trim().min(1).max(100),
  configuration: z.string().trim().min(1).max(2000),
  unitPrice: z.number().min(0).max(100000000).optional(),
  reference: z.string().trim().min(1).max(1000),
});
export type Replacement = z.infer<typeof replacementSchema>;
