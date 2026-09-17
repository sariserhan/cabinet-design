import type { Design } from './model';
import { roomEdges } from './room';

/**
 * Where the services actually are.
 *
 * The survey records water, drain, electric, gas and vent against a wall,
 * an offset along it and a height. Nothing drew them, so a sink was lined
 * up with a waste by eye and the drawings that reached site said nothing
 * about either. This turns what was recorded into points on the plan.
 */
export type ServicePoint = {
  id: string;
  kind: 'water' | 'drain' | 'electric' | 'gas' | 'vent';
  /** Plan position, in inches. */
  x: number;
  y: number;
  /** Height above the floor, in inches, as surveyed. */
  height: number;
  notes: string;
  /** Short mark drawn on the plan: W, D, E, G, V. */
  mark: string;
};

const marks: Record<ServicePoint['kind'], string> = {
  water: 'W',
  drain: 'D',
  electric: 'E',
  gas: 'G',
  vent: 'V',
};

/**
 * Service positions in plan coordinates.
 *
 * A utility is recorded against one of the four sides, so it is placed on
 * the first wall edge facing that way, at its offset along that edge.
 * Where the room has no such wall - it was turned off, or the outline does
 * not have that side - the service is left out rather than guessed at.
 */
export function servicePoints(design: Design): ServicePoint[] {
  const utilities = design.measurements?.utilities ?? [];
  if (!utilities.length) return [];
  const edges = roomEdges(design.room);
  return utilities.flatMap((utility) => {
    const edge = edges.find((e) => e.side === utility.wall && !e.curved);
    if (!edge) return [];
    const along = Math.min(Math.max(utility.offset, 0), edge.length),
      dx = (edge.b.x - edge.a.x) / (edge.length || 1),
      dy = (edge.b.y - edge.a.y) / (edge.length || 1);
    return [
      {
        id: utility.id,
        kind: utility.kind,
        x: Math.round((edge.a.x + dx * along) * 1000) / 1000,
        y: Math.round((edge.a.y + dy * along) * 1000) / 1000,
        height: utility.height,
        notes: utility.notes,
        mark: marks[utility.kind],
      },
    ];
  });
}
