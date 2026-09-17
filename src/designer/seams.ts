import type { Cabinet, Design } from './model';
import { localToWorld } from './model';
import { lengthLabel, type Units } from './units';

/**
 * Where a worktop is joined, and what that means downstream.
 *
 * A seam is a fact about the kitchen: the fabricator cuts to it, the
 * installer silicones it and the client runs a hand over it. Held as
 * positions along the top rather than as a count of equal pieces, because
 * a seam in the middle of a sink or across the front of an island is the
 * thing a designer is trying to avoid, and a count cannot say where it is.
 */
export function seamsOf(item: Cabinet) {
  return [...(item.surface?.seams ?? [])]
    .filter((at) => at > 0.5 && at < item.width - 0.5)
    .sort((a, b) => a - b);
}

/** The pieces a top is cut into, left to right, in inches. */
export function pieceWidths(item: Cabinet) {
  const cuts = seamsOf(item);
  const widths: number[] = [];
  let last = 0;
  for (const at of cuts) {
    widths.push(Math.round((at - last) * 1000) / 1000);
    last = at;
  }
  widths.push(Math.round((item.width - last) * 1000) / 1000);
  return widths;
}

/** Evenly spaced joins, which is what a fabricator proposes first. */
export function equalSeams(item: Cabinet, pieces: number) {
  const count = Math.max(1, Math.min(8, Math.round(pieces)));
  return Array.from(
    { length: count - 1 },
    (_, n) => Math.round(((item.width * (n + 1)) / count) * 1000) / 1000,
  );
}

/** Each seam as a line across the top, in plan coordinates. */
export function seamLines(design: Design) {
  return design.items.flatMap((item) => {
    if (item.kind !== 'countertop' && item.kind !== 'island') return [];
    if (item.hidden) return [];
    return seamsOf(item).map((at) => {
      const a = localToWorld(item, at, 0),
        b = localToWorld(item, at, item.depth);
      return { id: `${item.id}:${at}`, item, at, a, b };
    });
  });
}

/**
 * What a seam runs through, which is the reason to look at it.
 *
 * A join across a sink cutout or a hob has nowhere to be supported and
 * nothing to hold it flat, and one within a few inches of either is a
 * weak strip of stone. Reported rather than prevented: a fabricator
 * sometimes has no better option, and this app is not the one to decide.
 */
export function seamConflicts(design: Design, units: Units = 'in') {
  const out: string[] = [];
  for (const line of seamLines(design)) {
    for (const fitting of design.items) {
      if (!['sink', 'range', 'hob'].includes(fitting.kind)) continue;
      const near =
        Math.min(line.a.x, line.b.x) - 4 <= fitting.x + fitting.width &&
        Math.max(line.a.x, line.b.x) + 4 >= fitting.x &&
        Math.min(line.a.y, line.b.y) - 4 <= fitting.y + fitting.depth &&
        Math.max(line.a.y, line.b.y) + 4 >= fitting.y;
      if (near)
        out.push(
          `A seam at ${lengthLabel(line.at, units)} runs within four inches of ${fitting.sku}. Ask the fabricator whether it can be supported.`,
        );
    }
  }
  return out;
}

/** One row per piece, for the fabricator's sheet. */
export function seamSchedule(design: Design, units: Units = 'in') {
  return design.items
    .filter(
      (i) => !i.hidden && (i.kind === 'countertop' || i.kind === 'island'),
    )
    .flatMap((item) => {
      const widths = pieceWidths(item);
      if (widths.length < 2) return [];
      return [
        {
          item,
          sku: item.sku,
          pieces: widths.length,
          widths: widths.map((w) => lengthLabel(w, units)).join(' + '),
          seams: seamsOf(item)
            .map((at) => lengthLabel(at, units))
            .join(', '),
        },
      ];
    });
}

/** The design with this top joined where the designer asked. */
export function setSeams(design: Design, id: string, seams: number[]): Design {
  return {
    ...design,
    items: design.items.map((item) =>
      item.id === id
        ? {
            ...item,
            surface: {
              ...item.surface,
              seams: [...seams].sort((a, b) => a - b),
            },
          }
        : item,
    ),
  };
}
