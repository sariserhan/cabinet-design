import type { Cabinet, Design } from './model';
import { footprint, isOpening, itemBounds, localToWorld } from './model';

/**
 * Distances a kitchen is checked against.
 *
 * These are workspace settings, not a code citation. The app reports what it
 * measured beside the number it was given and names where that number came
 * from, so nobody reads a passing check as a compliance ruling. Change them
 * per project, or per the standard the practice designs to.
 */
export type SpacingSettings = {
  /** Clear floor between two runs that face each other, in inches. */
  aisle: number;
  /** Shortest sensible leg between sink, hob and refrigerator. */
  legMin: number;
  /** Longest sensible leg between the same three. */
  legMax: number;
  /** Largest sensible total of the three legs. */
  triangleMax: number;
  /** Where these numbers came from, shown wherever they are applied. */
  source: string;
};

export const defaultSpacing: SpacingSettings = {
  aisle: 42,
  legMin: 48,
  legMax: 108,
  triangleMax: 312,
  source:
    'Workspace defaults, not a published standard. Confirm against the guidance this project is designed to.',
};

export type SpacingFinding = {
  id: string;
  kind: 'aisle' | 'triangle';
  message: string;
  itemIds: string[];
  /** What the design measures, in inches. */
  measured: number;
  /** The setting it was compared against, in inches. */
  required: number;
};

/** Inches rendered the way a designer writes them: 41-1/2", not 41.5. */
function inches(value: number) {
  const whole = Math.floor(value),
    eighths = Math.round((value - whole) * 8);
  if (eighths === 0) return `${whole}"`;
  if (eighths === 8) return `${whole + 1}"`;
  const parts = [
    [1, '1/8'],
    [2, '1/4'],
    [3, '3/8'],
    [4, '1/2'],
    [5, '5/8'],
    [6, '3/4'],
    [7, '7/8'],
  ] as const;
  return `${whole}-${parts.find(([n]) => n === eighths)?.[1]}"`;
}

/**
 * Items a person has to walk around.
 *
 * Anything standing on the floor with real bulk: cabinet runs, islands and
 * appliances. Wall cabinets pass above a walking person, worktops sit on the
 * cabinets already counted, and openings are holes rather than obstacles.
 */
function floorObstacles(design: Design) {
  return design.items.filter(
    (i) =>
      !i.hidden &&
      !isOpening(i) &&
      i.elevation < 30 &&
      i.elevation + i.height > 20 &&
      ![
        'countertop',
        'sink',
        'trim',
        'molding',
        'toe_kick',
        'filler',
        'hood',
      ].includes(i.kind),
  );
}

/**
 * Which way the item's front faces, as a unit vector in plan.
 *
 * Two cabinets standing shoulder to shoulder in one run are also two items
 * with a gap between them, and that gap is a filler problem rather than an
 * aisle. What separates the two cases is direction: an aisle is floor that a
 * front opens onto.
 */
function facing(item: Cabinet) {
  const f = footprint(item),
    centreX = item.x + f.width / 2,
    centreY = item.y + f.depth / 2,
    front = localToWorld(item, item.width / 2, item.depth);
  const dx = front.x - centreX,
    dy = front.y - centreY,
    length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

/** The centre of an item's footprint in plan. */
function centre(item: Cabinet) {
  const f = footprint(item);
  return { x: item.x + f.width / 2, y: item.y + f.depth / 2 };
}

/**
 * How much clear floor the design leaves, and whether the work centres are a
 * sensible distance apart.
 *
 * The gap that matters to a person is the shortest distance between two solid
 * things they have to pass between, which is why this measures every pair of
 * floor obstacles whose spans overlap rather than trying to decide first
 * which cabinets form a "run". Two items that only meet at a corner do not
 * face each other and are not reported.
 */
export function spacingFindings(
  design: Design,
  settings: SpacingSettings = design.spacing ?? defaultSpacing,
): SpacingFinding[] {
  const found: SpacingFinding[] = [];
  const obstacles = floorObstacles(design);
  const bounds = obstacles.map(itemBounds);
  const seen = new Set<string>();
  for (let a = 0; a < obstacles.length; a++)
    for (let b = a + 1; b < obstacles.length; b++) {
      const first = obstacles[a],
        second = obstacles[b],
        one = bounds[a],
        two = bounds[b];
      if (!first || !second || !one || !two) continue;
      // Members of one assembly are a single piece of furniture.
      if (first.assemblyId && first.assemblyId === second.assemblyId) continue;
      const overlapX =
        Math.min(one.maxX, two.maxX) - Math.max(one.minX, two.minX);
      const overlapY =
        Math.min(one.maxY, two.maxY) - Math.max(one.minY, two.minY);
      // A gap is only a gap where the two actually stand opposite each other.
      // Requiring a foot of shared span keeps a corner touch out of it.
      let gap: number | null = null,
        axis: 'x' | 'y' | null = null;
      if (overlapY > 12 && overlapX < 0) {
        gap = Math.max(one.minX, two.minX) - Math.min(one.maxX, two.maxX);
        axis = 'x';
      } else if (overlapX > 12 && overlapY < 0) {
        gap = Math.max(one.minY, two.minY) - Math.min(one.maxY, two.maxY);
        axis = 'y';
      }
      if (gap === null || !axis || gap <= 0 || gap >= settings.aisle) continue;
      // Someone has to be able to stand in it for it to be an aisle. That is
      // true when either front opens onto the gap, and false for two
      // cabinets side by side in the same run, where the same measurement is
      // a filler to order rather than a clearance to fix.
      const firstLeads =
        axis === 'x' ? one.maxX <= two.minX : one.maxY <= two.minY;
      const toward = (item: Cabinet, positive: boolean) => {
        const f = facing(item);
        return (axis === 'x' ? f.x : f.y) * (positive ? 1 : -1) > 0.7;
      };
      if (!toward(first, firstLeads) && !toward(second, !firstLeads)) continue;
      const key = [first.id, second.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        id: `aisle-${key}`,
        kind: 'aisle',
        measured: Math.round(gap * 100) / 100,
        required: settings.aisle,
        itemIds: [first.id, second.id],
        message: `${inches(gap)} of floor between ${first.sku} and ${second.sku}, against the ${inches(settings.aisle)} this project is set to.`,
      });
    }
  found.sort((x, y) => x.measured - y.measured);

  // The three work centres, when the design has one of each to measure.
  const sink = design.items.find((i) => i.kind === 'sink' && !i.hidden),
    hob = design.items.find((i) => i.kind === 'range' && !i.hidden),
    fridge = design.items.find((i) => i.kind === 'refrigerator' && !i.hidden);
  if (sink && hob && fridge) {
    const points = [
      ['sink', sink],
      ['hob', hob],
      ['refrigerator', fridge],
    ] as const;
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const from = points[i],
        to = points[(i + 1) % points.length];
      if (!from || !to) continue;
      const a = centre(from[1]),
        b = centre(to[1]);
      const leg = Math.hypot(a.x - b.x, a.y - b.y);
      total += leg;
      if (leg < settings.legMin || leg > settings.legMax)
        found.push({
          id: `leg-${from[0]}-${to[0]}`,
          kind: 'triangle',
          measured: Math.round(leg * 100) / 100,
          required: leg < settings.legMin ? settings.legMin : settings.legMax,
          itemIds: [from[1].id, to[1].id],
          message: `${inches(leg)} from the ${from[0]} to the ${to[0]}, ${
            leg < settings.legMin ? 'under' : 'over'
          } the ${inches(leg < settings.legMin ? settings.legMin : settings.legMax)} this project is set to.`,
        });
    }
    if (total > settings.triangleMax)
      found.push({
        id: 'triangle-total',
        kind: 'triangle',
        measured: Math.round(total * 100) / 100,
        required: settings.triangleMax,
        itemIds: [sink.id, hob.id, fridge.id],
        message: `${inches(total)} around the sink, hob and refrigerator, against the ${inches(settings.triangleMax)} this project is set to.`,
      });
  }
  return found;
}
