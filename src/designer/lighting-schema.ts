import { z } from 'zod';

/**
 * What a kitchen's lighting is, as a plan rather than a render setting.
 *
 * Lighting has existed here only as something to look at: a daylight or
 * evening preset, a switch for under-cabinet glow. None of that can be
 * handed to an electrician, who needs to know what fixtures there are,
 * where they go, what they draw, which switch turns them on and what
 * drives them.
 *
 * Positions are in inches on the same plan grid as everything else, and
 * lengths run along a cabinet run. A first-fix drawing, not a certified
 * electrical design: this app says where the designer wants light, and
 * the electrician says what the regulations allow.
 */
export const lightingFixtureSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum([
    'under_cabinet',
    'in_cabinet',
    'toe_kick',
    'downlight',
    'pendant',
    'wall',
  ]),
  /** Plan position: the start of a run, or the centre of a point fitting. */
  x: z.number().finite().min(-600).max(1200),
  y: z.number().finite().min(-600).max(1200),
  /** Along the run, for the strips; omitted for a point fitting. */
  length: z.number().finite().min(0).max(600).optional(),
  /** Degrees, matching the cabinet run the strip follows. */
  rotation: z.number().finite().min(-360).max(360).default(0),
  /** Height above the floor, so an elevation can draw it. */
  elevation: z.number().finite().min(0).max(240).default(0),
  /** Watts per foot for a strip, or watts outright for a fitting. */
  watts: z.number().finite().min(0).max(500),
  circuit: z.string().max(100).optional(),
  note: z.string().max(300).optional(),
});
export type LightingFixture = z.infer<typeof lightingFixtureSchema>;

export const lightingCircuitSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  /** Where the switch goes, as a wall and a distance along it. */
  switchWall: z.enum(['north', 'east', 'south', 'west']).optional(),
  switchOffset: z.number().finite().min(0).max(600).optional(),
  dimmed: z.boolean().default(false),
  /** The driver or transformer this circuit runs on, in watts. */
  driverWatts: z.number().finite().min(0).max(1000).optional(),
  voltage: z.union([z.literal(12), z.literal(24), z.literal(120)]).default(24),
});
export type LightingCircuit = z.infer<typeof lightingCircuitSchema>;

export const lightingPlanSchema = z.object({
  fixtures: z.array(lightingFixtureSchema).max(200).default([]),
  circuits: z.array(lightingCircuitSchema).max(20).default([]),
});
export type LightingPlan = z.infer<typeof lightingPlanSchema>;
