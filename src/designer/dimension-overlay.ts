import type { Cabinet, Design } from './model';
import { itemPolygon } from './model';
import { lengthLabel } from './units';
import type { Units } from './units';

/**
 * Which of the three dimensions to show.
 *
 * Separate flags rather than one switch because a plan crowded with three
 * numbers per cabinet is unreadable, and the one somebody is checking is
 * usually a single dimension: widths while laying out a run, heights
 * while working out what clears a window.
 *
 * Width, depth and height rather than x, y and z. A cabinet has the
 * first three whichever way it is turned; the axes belong to the room,
 * and naming the switches after them asked the designer to do the
 * translation every time.
 */
export type DimensionAxes = {
  width: boolean;
  depth: boolean;
  height: boolean;
};

export const allAxes: DimensionAxes = {
  width: true,
  depth: true,
  height: true,
};

/** Is any dimension switched on? */
export function anyAxis(axes: DimensionAxes) {
  return axes.width || axes.depth || axes.height;
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
export function itemDimensionText(
  item: Cabinet,
  axes: DimensionAxes,
  units: Units = 'in',
) {
  const size = (value: number) => lengthLabel(value, units);
  if (!anyAxis(axes)) return '';
  if (axes.width && axes.depth && axes.height)
    return `${size(item.width)} × ${size(item.depth)} × ${size(item.height)}`;
  return [
    axes.width ? `W ${size(item.width)}` : '',
    axes.depth ? `D ${size(item.depth)}` : '',
    axes.height ? `H ${size(item.height)}` : '',
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
  const units = design.units ?? 'in';
  const say = (w: number, d: number, h: number) =>
    [
      axes.width ? `W ${lengthLabel(w, units)}` : '',
      axes.depth ? `D ${lengthLabel(d, units)}` : '',
      axes.height ? `H ${lengthLabel(h, units)}` : '',
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
