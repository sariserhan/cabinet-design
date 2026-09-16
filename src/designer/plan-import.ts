import type { Design } from './model';

/**
 * Reading a room out of a DXF the architect sent.
 *
 * A large share of jobs start from someone else's drawing, and until now
 * this app could only export one. This reads the shape of the room - the
 * outline - and leaves everything else in the file alone: a plan carries
 * furniture, text, hatching and title blocks that are none of a kitchen
 * designer's business, and guessing at them would put walls where there
 * are none.
 *
 * The file is untrusted input, so every number is checked before it
 * reaches the design, and what was ignored is reported rather than hidden.
 */
export type ImportedPlan = {
  /** Room corners in inches, starting at the origin. */
  outline: { x: number; y: number }[];
  width: number;
  depth: number;
  /** What the file said its units were, and what was done about it. */
  units: 'in' | 'mm' | 'unknown';
  /** Counts a person can check the import against. */
  read: { polylines: number; lines: number; vertices: number };
  notes: string[];
};

type Pair = { code: number; value: string };

/** DXF is pairs of lines: a group code, then its value. */
function pairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number((lines[i] ?? '').trim());
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: (lines[i + 1] ?? '').trim() });
  }
  return out;
}

/** $INSUNITS: 1 is inches, 4 is millimetres. Anything else is unknown. */
function headerUnits(items: Pair[]): 'in' | 'mm' | 'unknown' {
  for (let i = 0; i < items.length - 2; i++)
    if (items[i]?.code === 9 && items[i]?.value === '$INSUNITS') {
      const value = Number(items[i + 1]?.value);
      if (value === 1) return 'in';
      if (value === 4) return 'mm';
      return 'unknown';
    }
  return 'unknown';
}

/** The closed shapes and the loose segments the file draws. */
function geometry(items: Pair[]) {
  const polylines: { points: { x: number; y: number }[]; closed: boolean }[] =
    [];
  const segments: { x: number; y: number }[][] = [];
  let entity = '';
  let points: { x: number; y: number }[] = [];
  let closed = false;
  let pending: { x?: number; y?: number; x2?: number; y2?: number } = {};
  const finish = () => {
    if (entity === 'LWPOLYLINE' && points.length > 1)
      polylines.push({ points, closed });
    if (
      entity === 'LINE' &&
      pending.x !== undefined &&
      pending.y !== undefined &&
      pending.x2 !== undefined &&
      pending.y2 !== undefined
    )
      segments.push([
        { x: pending.x, y: pending.y },
        { x: pending.x2, y: pending.y2 },
      ]);
    points = [];
    closed = false;
    pending = {};
  };
  for (const { code, value } of items) {
    if (code === 0) {
      finish();
      entity = value.toUpperCase();
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    if (entity === 'LWPOLYLINE') {
      if (code === 70) closed = (n & 1) === 1;
      if (code === 10) points.push({ x: n, y: 0 });
      if (code === 20) {
        const last = points[points.length - 1];
        if (last) last.y = n;
      }
    } else if (entity === 'LINE') {
      if (code === 10) pending.x = n;
      if (code === 20) pending.y = n;
      if (code === 11) pending.x2 = n;
      if (code === 21) pending.y2 = n;
    }
  }
  finish();
  return { polylines, segments };
}

/** Area of a closed ring, used to pick the room out of the furniture. */
function area(points: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a && b) total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total) / 2;
}

/**
 * Fewer corners, keeping the shape.
 *
 * A surveyed outline can carry hundreds of vertices where a wall is drawn
 * as a chain of short segments, and a room here holds 24. Corners that
 * barely turn are dropped first, so what goes is detail rather than shape.
 */
function simplify(points: { x: number; y: number }[], limit: number) {
  let kept = [...points];
  while (kept.length > limit) {
    let flattest = 1,
      flattestTurn = Infinity;
    for (let i = 0; i < kept.length; i++) {
      const previous = kept[(i - 1 + kept.length) % kept.length],
        here = kept[i],
        next = kept[(i + 1) % kept.length];
      if (!previous || !here || !next) continue;
      const turn = Math.abs(
        (here.x - previous.x) * (next.y - here.y) -
          (here.y - previous.y) * (next.x - here.x),
      );
      if (turn < flattestTurn) {
        flattestTurn = turn;
        flattest = i;
      }
    }
    kept = kept.filter((_, i) => i !== flattest);
  }
  return kept;
}

const MAX_CORNERS = 24;
const MAX_INCHES = 600;

/**
 * The room a DXF describes, or an explanation of why it does not.
 *
 * The largest closed polyline is taken as the room, because that is what a
 * floor plan's outline is; where there is none, the extent of everything
 * drawn becomes a rectangle, which is honest about being a guess.
 */
export function readPlanDxf(
  text: string,
  assumeUnits: 'in' | 'mm' = 'mm',
): ImportedPlan {
  if (text.length > 8_000_000)
    throw Error('That DXF is larger than 8 MB. Export the plan layer alone.');
  const items = pairs(text);
  if (!items.some((p) => p.code === 0 && p.value.toUpperCase() === 'SECTION'))
    throw Error('That file does not read as a DXF drawing.');
  const { polylines, segments } = geometry(items);
  const notes: string[] = [];
  const fileUnits = headerUnits(items);
  const units = fileUnits === 'unknown' ? assumeUnits : fileUnits;
  if (fileUnits === 'unknown')
    notes.push(
      `The file does not say what its units are; it was read as ${units === 'mm' ? 'millimetres' : 'inches'}.`,
    );

  const closed = polylines.filter((p) => p.closed && p.points.length > 2);
  let points: { x: number; y: number }[] | null = null;
  if (closed.length) {
    const room = closed.reduce((biggest, candidate) =>
      area(candidate.points) > area(biggest.points) ? candidate : biggest,
    );
    points = room.points;
    if (closed.length > 1)
      notes.push(
        `${closed.length} closed shapes were found; the largest was taken as the room.`,
      );
  } else if (polylines.length || segments.length) {
    const all = [...polylines.flatMap((p) => p.points), ...segments.flat()];
    const minX = Math.min(...all.map((p) => p.x)),
      maxX = Math.max(...all.map((p) => p.x)),
      minY = Math.min(...all.map((p) => p.y)),
      maxY = Math.max(...all.map((p) => p.y));
    points = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
    notes.push(
      'No closed outline was found, so the extent of everything drawn was taken as a rectangular room. Check it against the plan.',
    );
  }
  if (!points)
    throw Error(
      'No lines or outlines were found in that DXF to read a room from.',
    );

  const scale = units === 'mm' ? 1 / 25.4 : 1;
  let inches = points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  if (inches.length > MAX_CORNERS) {
    notes.push(
      `The outline had ${inches.length} corners and was simplified to ${MAX_CORNERS}.`,
    );
    inches = simplify(inches, MAX_CORNERS);
  }
  const minX = Math.min(...inches.map((p) => p.x)),
    minY = Math.min(...inches.map((p) => p.y));
  const outline = inches.map((p) => ({
    x: Math.round((p.x - minX) * 1000) / 1000,
    y: Math.round((p.y - minY) * 1000) / 1000,
  }));
  const width = Math.max(...outline.map((p) => p.x)),
    depth = Math.max(...outline.map((p) => p.y));
  if (!(width > 12 && depth > 12))
    throw Error(
      `That plan reads as ${Math.round(width)} by ${Math.round(depth)} inches, which is too small to be a room. Check the drawing units.`,
    );
  if (width > MAX_INCHES || depth > MAX_INCHES)
    throw Error(
      `That plan reads as ${Math.round(width)} by ${Math.round(depth)} inches, larger than this designer holds. Check the drawing units, or import the kitchen alone.`,
    );
  return {
    outline,
    width: Math.round(width * 1000) / 1000,
    depth: Math.round(depth * 1000) / 1000,
    units: fileUnits,
    read: {
      polylines: polylines.length,
      lines: segments.length,
      vertices: points.length,
    },
    notes,
  };
}

/**
 * The design with the imported room in it.
 *
 * Only the room changes. Anything already placed stays where it is, which
 * may now be outside the walls - the layout checks will say so, and that is
 * a better answer than moving someone's cabinets for them.
 */
export function applyImportedPlan(design: Design, plan: ImportedPlan): Design {
  return {
    ...design,
    room: {
      ...design.room,
      width: plan.width,
      depth: plan.depth,
      outline: plan.outline,
    },
  };
}
