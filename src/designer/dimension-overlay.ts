import type { Cabinet, Design } from './model';
import { itemPolygon } from './model';
import { inchLabel } from './annotations';

/**
 * Which of the three dimensions to show.
 *
 * Separate flags rather than one switch because a plan crowded with three
 * numbers per cabinet is unreadable, and the axis somebody is checking is
 * usually one of them: widths while laying out a run, heights while
 * working out what clears a window.
 */
export type DimensionAxes = { x: boolean; y: boolean; z: boolean };

export const allAxes: DimensionAxes = { x: true, y: true, z: true };

/** Is any axis switched on? */
export function anyAxis(axes: DimensionAxes) {
  return axes.x || axes.y || axes.z;
}

/**
 * The sizes of one item, as a designer would say them.
 *
 * With all three on it reads as a product size, 24 × 24 × 34-1/2". With
 * fewer, each number is named, because 34-1/2" on its own does not say
 * which way it is measured.
 *
 * These are the item's own width, depth and height - what would be ordered
 * - rather than the footprint it occupies when turned.
 */
export function itemDimensionText(item: Cabinet, axes: DimensionAxes) {
  if (!anyAxis(axes)) return '';
  if (axes.x && axes.y && axes.z)
    return `${inchLabel(item.width)} × ${inchLabel(item.depth)} × ${inchLabel(item.height)}`;
  return [
    axes.x ? `W ${inchLabel(item.width)}` : '',
    axes.y ? `D ${inchLabel(item.depth)}` : '',
    axes.z ? `H ${inchLabel(item.height)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The totals: the room itself, and the extent the placed items cover.
 *
 * The second is the one a fitter asks for - how much wall the run takes,
 * and how high it goes - and it is not the room, because a kitchen rarely
 * fills one.
 */
export function designDimensionSummary(
  design: Design,
  axes: DimensionAxes = allAxes,
) {
  const visible = design.items.filter((i) => !i.hidden);
  const points = visible.flatMap(itemPolygon);
  const extent = points.length
    ? {
        width:
          Math.max(...points.map((p) => p.x)) -
          Math.min(...points.map((p) => p.x)),
        depth:
          Math.max(...points.map((p) => p.y)) -
          Math.min(...points.map((p) => p.y)),
        height: Math.max(...visible.map((i) => i.elevation + i.height)),
      }
    : { width: 0, depth: 0, height: 0 };
  const say = (w: number, d: number, h: number) =>
    [
      axes.x ? `W ${inchLabel(w)}` : '',
      axes.y ? `D ${inchLabel(d)}` : '',
      axes.z ? `H ${inchLabel(h)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  return {
    room: say(design.room.width, design.room.depth, design.room.height),
    items: say(extent.width, extent.depth, extent.height),
    count: visible.length,
    extent,
  };
}
