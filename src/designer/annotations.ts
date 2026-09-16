import type { Design } from './model';

export type Annotation = NonNullable<Design['annotations']>[number];

/**
 * Inches the way a designer writes them: 41-1/2", not 41.5.
 *
 * Rounded to the nearest eighth, which is the smallest division these
 * drawings mark, and the same division the plan's own dimensions use.
 */
export function inchLabel(value: number) {
  const sign = value < 0 ? '-' : '',
    size = Math.abs(value),
    whole = Math.floor(size),
    eighths = Math.round((size - whole) * 8);
  if (eighths === 0) return `${sign}${whole}"`;
  if (eighths === 8) return `${sign}${whole + 1}"`;
  const fraction = ['', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'][
    eighths
  ];
  return `${sign}${whole}-${fraction}"`;
}

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
export function annotationLabel(a: Annotation) {
  if (a.text) return a.text;
  return a.kind === 'dimension' ? inchLabel(annotationLength(a)) : '';
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
