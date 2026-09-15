import { z } from 'zod';
export const selectionCardSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  cabinet: z.enum(['linen', 'oak', 'slate']),
  countertop: z.enum(['quartz', 'marble', 'granite']),
  flooring: z.enum(['oak', 'walnut', 'tile', 'slate']),
  hardware: z.enum(['steel', 'brass', 'black']),
  favorite: z.boolean(),
  reason: z.string().max(1000),
});
export const selectionBoardSchema = z
  .object({
    clientName: z.string().max(120),
    cards: z.array(selectionCardSchema).max(8),
  })
  .superRefine((b, ctx) => {
    if (new Set(b.cards.map((c) => c.id)).size !== b.cards.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Selection card identifiers must be unique.',
      });
  });
export type SelectionCard = z.infer<typeof selectionCardSchema>;
export type SelectionBoard = z.infer<typeof selectionBoardSchema>;
