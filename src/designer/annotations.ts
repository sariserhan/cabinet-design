import type { Design } from './model';
import { lengthLabel } from './units';
import type { Units } from './units';

export type Annotation = NonNullable<Design['annotations']>[number];

/** How long a dimension annotation is, or 0 for anything else. */
export function annotationLength(a: Annotation) {
  if (a.kind !== 'dimension' || a.x2 === undefined || a.y2 === undefined)
    return 0;
  return Math.hypot(a.x2 - a.x, a.y2 - a.y);
}

/**
 * The angle at the vertex, in degrees, or 0 where there is not one.
 *
 * Measured the short way round, so a corner reads 90 rather than 270: an
 * angle annotation marks the opening between two runs, not the reflex
 * outside it.
 */
export function annotationAngle(a: Annotation) {
  if (
    a.kind !== 'angle' ||
    a.x2 === undefined ||
    a.y2 === undefined ||
    a.x3 === undefined ||
    a.y3 === undefined
  )
    return 0;
  const first = Math.atan2(a.y2 - a.y, a.x2 - a.x),
    second = Math.atan2(a.y3 - a.y, a.x3 - a.x);
  const turn = Math.abs(((second - first) * 180) / Math.PI) % 360;
  return Math.round((turn > 180 ? 360 - turn : turn) * 10) / 10;
}

/** Does this annotation belong on the drawing being made? */
export function onLayer(
  a: Annotation,
  layer: 'design' | 'installation' | 'client' | 'all',
) {
  const on = a.layer ?? 'all';
  return layer === 'all' || on === 'all' || on === layer;
}

/**
 * What a dimension shows on the drawing.
 *
 * The typed text wins when there is any: a designer who writes "verify on
 * site" there means that to be read instead of the measurement, not beside
 * it. With nothing typed, the measurement speaks for itself.
 */
export function annotationLabel(a: Annotation, units: Units = 'in') {
  if (a.text) return a.text;
  if (a.kind === 'dimension') return lengthLabel(annotationLength(a), units);
  if (a.kind === 'angle') return `${annotationAngle(a)}°`;
  return '';
}

/** A new annotation, ready to be placed and then edited. */
export function newAnnotation(
  kind: Annotation['kind'],
  from: { x: number; y: number },
  to?: { x: number; y: number },
  third?: { x: number; y: number },
): Annotation {
  return {
    id: crypto.randomUUID(),
    kind,
    // A thousandth of an inch: fine enough to hold an eighth or a sixteenth
    // exactly, which a hundredth is not, and short enough in the saved file.
    x: Math.round(from.x * 1000) / 1000,
    y: Math.round(from.y * 1000) / 1000,
    // A dimension's far end, a note's leader target, an angle's first ray.
    ...(to
      ? {
          x2: Math.round(to.x * 1000) / 1000,
          y2: Math.round(to.y * 1000) / 1000,
        }
      : {}),
    ...(third
      ? {
          x3: Math.round(third.x * 1000) / 1000,
          y3: Math.round(third.y * 1000) / 1000,
        }
      : {}),
    layer: 'all',
    text: '',
  };
}
