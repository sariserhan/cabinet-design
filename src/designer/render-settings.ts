import { z } from 'zod';
export const renderSettingsSchema = z.object({
  lens: z.number().min(20).max(85),
  exposure: z.number().min(0.25).max(4),
  whiteBalance: z.tuple([
    z.number().min(0.5).max(2),
    z.number().min(0.5).max(2),
    z.number().min(0.5).max(2),
  ]),
  environment: z.enum(['studio', 'garden']),
  scanned: z.boolean(),
  autoBalance: z.boolean(),
  adaptive: z.boolean(),
  denoise: z.boolean(),
  quality: z.boolean(),
  ceiling: z.boolean(),
  cutaway: z.boolean(),
  variant: z.enum(['original', 'oak', 'white', 'dark']),
  lighting: z.enum(['daylight', 'warm', 'studio']),
  lightingProfile: z.enum(['day', 'evening', 'task']).default('day'),
  interiors: z.boolean().default(false),
  opening: z.number().min(0).max(100).default(0),
});
export type RenderSettings = z.infer<typeof renderSettingsSchema>;
export const defaultRenderSettings: RenderSettings = {
  lens: 45,
  exposure: 1,
  whiteBalance: [1, 1, 1],
  environment: 'garden',
  scanned: true,
  autoBalance: true,
  adaptive: true,
  denoise: true,
  quality: false,
  ceiling: false,
  cutaway: true,
  variant: 'original',
  lighting: 'daylight',
  lightingProfile: 'day',
  interiors: false,
  opening: 0,
};
const vector = z.tuple([
  z.number().finite().min(-1000000).max(1000000),
  z.number().finite().min(-1000000).max(1000000),
  z.number().finite().min(-1000000).max(1000000),
]);
export const presentationSceneSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    position: vector,
    target: vector,
    settings: renderSettingsSchema,
  })
  .refine(
    (v) =>
      Math.hypot(...v.position.map((n, i) => n - (v.target[i] ?? 0))) > 0.001,
    { message: 'Camera position and target must be different.' },
  );
export type PresentationScene = z.infer<typeof presentationSceneSchema>;
export const presentationScenesSchema = z
  .object({
    format: z.literal('kitchen-scenes-v1'),
    designId: z.string().min(1).max(100),
    scenes: z.array(presentationSceneSchema).max(6),
  })
  .superRefine((v, c) => {
    if (new Set(v.scenes.map((s) => s.id)).size !== v.scenes.length)
      c.addIssue({ code: 'custom', message: 'Duplicate scene IDs.' });
  });
export type PresentationScenes = z.infer<typeof presentationScenesSchema>;
export const emptyPresentationScenes = (
  designId: string,
): PresentationScenes => ({
  format: 'kitchen-scenes-v1',
  designId,
  scenes: [],
});
export function parsePresentationScenes(raw: string, id: string) {
  if (raw.length > 50000) throw Error('Scene settings exceed 50 KB.');
  const v = presentationScenesSchema.parse(JSON.parse(raw));
  if (v.designId !== id)
    throw Error('Scene settings belong to a different design.');
  return v;
}

/**
 * How much of the environment lights the room.
 *
 * Held well below one so that the sun and the lamps lead on everything with
 * a diffuse term; a task-lit scene leans on its own fittings further still.
 * Metals have no diffuse term at all, so they undo this with an
 * `envMapIntensity` of its reciprocal rather than being left in the dark.
 */
export function environmentIntensity(
  profile: RenderSettings['lightingProfile'] | undefined,
) {
  return profile === 'task' ? 0.2 : 0.35;
}
