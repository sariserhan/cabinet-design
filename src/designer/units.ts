import type { Design } from './model';

/**
 * What the designer reads and types in.
 *
 * Geometry is stored in inches throughout, and always has been; this is a
 * display and parsing layer over it. Storing one unit keeps every
 * calculation, fixture and saved design comparable, and means a project can
 * change what it shows without changing what it is.
 */
export type Units = 'in' | 'mm';

const PER_INCH = 25.4;

export function unitsOf(design: Pick<Design, 'units'>): Units {
  return design.units ?? 'in';
}

/** Inches to what the field shows. */
export function toDisplay(inches: number, units: Units) {
  return units === 'mm' ? inches * PER_INCH : inches;
}

/** What someone typed, back to the inches everything is stored in. */
export function fromDisplay(value: number, units: Units) {
  return units === 'mm' ? value / PER_INCH : value;
}

/** A sensible step for a number input in this unit. */
export function stepFor(units: Units) {
  return units === 'mm' ? 1 : 0.5;
}

/** How many decimals a field shows: a millimetre is already fine enough. */
export function roundDisplay(value: number, units: Units) {
  return units === 'mm'
    ? Math.round(value)
    : Math.round(value * 1000) / 1000;
}

/**
 * Inches the way a designer writes them: 41-1/2", not 41.5.
 *
 * Rounded to the nearest eighth, which is the smallest division these
 * drawings mark.
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

/**
 * A length written for whichever unit the project works in.
 *
 * Millimetres are whole numbers - nobody dimensions a kitchen to a tenth of
 * one - and inches keep their eighths.
 */
export function lengthLabel(inches: number, units: Units = 'in') {
  return units === 'mm'
    ? `${Math.round(inches * PER_INCH)} mm`
    : inchLabel(inches);
}

/** The suffix a field label carries, as in "Room width (mm)". */
export function unitSuffix(units: Units) {
  return units === 'mm' ? 'mm' : 'in';
}
