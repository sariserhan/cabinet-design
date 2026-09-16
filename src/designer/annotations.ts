import type { Design } from './model';
import { lengthLabel } from './units';
import type { Units } from './units';

export type Annotation = NonNullable<Design['annotations']>[number];

/** How long a dimension annotation is, or 0 for a note. */
export function annotationLength(a: Annotation) {
  if (a.kind !== 'dimension' || a.x2 === undefined || a.y2 === undefined)
    return 0;
  return Math.hypot(a.x2 - a.x, a.y2 - a.y);
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
  return a.kind === 'dimension' ? lengthLabel(annotationLength(a), units) : '';
}

/** A new annotation, ready to be placed and then edited. */
export function newAnnotation(
  kind: Annotation['kind'],
  from: { x: number; y: number },
  to?: { x: number; y: number },
): Annotation {
  return {
    id: crypto.randomUUID(),
    kind,
    // A thousandth of an inch: fine enough to hold an eighth or a sixteenth
    // exactly, which a hundredth is not, and short enough in the saved file.
    x: Math.round(from.x * 1000) / 1000,
    y: Math.round(from.y * 1000) / 1000,
    ...(kind === 'dimension' && to
      ? {
          x2: Math.round(to.x * 1000) / 1000,
          y2: Math.round(to.y * 1000) / 1000,
        }
      : {}),
    text: '',
  };
}
