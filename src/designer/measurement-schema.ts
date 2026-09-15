import { z } from 'zod';
export const surveySchema = z.object({
  measuredBy: z.string().trim().min(1).max(120),
  measuredAt: z.string().max(30),
  originalUnit: z.enum(['in', 'cm', 'mm']),
  north: z.number().finite().min(36).max(600),
  south: z.number().finite().min(36).max(600),
  east: z.number().finite().min(36).max(600),
  west: z.number().finite().min(36).max(600),
  height: z.number().finite().min(36).max(600),
  openings: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        kind: z.enum(['door', 'window']),
        wall: z.enum(['north', 'east', 'south', 'west']),
        offset: z.number().finite().min(0).max(600),
        width: z.number().finite().positive().max(600),
        height: z.number().finite().positive().max(600),
        sill: z.number().finite().min(0).max(600),
      }),
    )
    .max(30),
  utilities: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        kind: z.enum(['water', 'drain', 'electric', 'gas', 'vent']),
        wall: z.enum(['north', 'east', 'south', 'west']),
        offset: z.number().finite().min(0).max(600),
        height: z.number().finite().min(0).max(600),
        notes: z.string().max(500),
      }),
    )
    .max(30),
  notes: z.string().max(2000),
  confirmed: z.literal(true),
});
export type Survey = z.infer<typeof surveySchema>;
