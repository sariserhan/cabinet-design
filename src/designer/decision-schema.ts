import { z } from 'zod';
export const storageProfileSchema = z.object({
  household: z.number().int().min(1).max(12),
  cookware: z.enum(['light', 'regular', 'extensive']),
  pantry: z.enum(['small', 'weekly', 'bulk']),
  reach: z.enum(['standard', 'low']),
  priority: z.enum(['balanced', 'drawers', 'pantry']),
});
export const siteTaskSchema = z.object({
  id: z.string().min(1).max(100),
  wall: z.number().int().min(0).max(23),
  title: z.string().trim().min(1).max(160),
  notes: z.string().max(2000),
  status: z.enum(['open', 'in_progress', 'resolved']),
  assignee: z.string().max(120),
  updatedAt: z.string().max(40),
  photo: z
    .string()
    .max(12000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});
export const siteTasksSchema = z
  .array(siteTaskSchema)
  .max(20)
  .superRefine((tasks, ctx) => {
    if (new Set(tasks.map((t) => t.id)).size !== tasks.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Site task IDs must be unique.',
      });
    if (tasks.filter((t) => t.photo).length > 4)
      ctx.addIssue({
        code: 'custom',
        message: 'Keep at most four site photos per handoff.',
      });
  });
export type StorageProfile = z.infer<typeof storageProfileSchema>;
export type SiteTask = z.infer<typeof siteTaskSchema>;
export const defaultStorageProfile: StorageProfile = {
  household: 2,
  cookware: 'regular',
  pantry: 'weekly',
  reach: 'standard',
  priority: 'balanced',
};
