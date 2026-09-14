import { z } from 'zod';
import {
  idSchema,
  factSchema,
  reviewStatusSchema,
  sourceEvidenceSchema,
} from './evidence';
export const registryEntrySchema = z.strictObject({
  id: idSchema,
  entityKind: z.enum(['family', 'option', 'modification']),
  name: factSchema,
  attributes: z.record(idSchema, factSchema),
  productIds: z.array(
    z.strictObject({
      value: idSchema,
      provenance: z.array(sourceEvidenceSchema).min(1),
    }),
  ),
  reviewStatus: reviewStatusSchema,
});
export type RegistryEntry = z.infer<typeof registryEntrySchema>;
