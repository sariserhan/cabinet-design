export type Point = { x: number; y: number };
export type RoomShape = {
  width: number;
  depth: number;
  outline: Point[];
  curves?: { wall: number; bow: number }[] | undefined;
};
export function baseOutline(room: RoomShape): Point[] {
  return room.outline.length
    ? room.outline
    : [
        { x: 0, y: 0 },
        { x: room.width, y: 0 },
        { x: room.width, y: room.depth },
        { x: 0, y: room.depth },
      ];
}
export function curvePoints(a: Point, b: Point, bow: number) {
  const length = Math.hypot(b.x - a.x, b.y - a.y),
    nx = -(b.y - a.y) / length,
    ny = (b.x - a.x) / length;
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return {
      x: a.x + (b.x - a.x) * t + 4 * t * (1 - t) * nx * bow,
      y: a.y + (b.y - a.y) * t + 4 * t * (1 - t) * ny * bow,
    };
  });
}
export function roomOutline(room: RoomShape): Point[] {
  const base = clockwise(baseOutline(room));
  return base.flatMap((a, i) => {
    const b = base[(i + 1) % base.length] ?? a,
      c = room.curves?.find((c) => c.wall === i);
    return c && c.bow ? curvePoints(a, b, c.bow).slice(0, -1) : [a];
  });
}
export function area(points: Point[]) {
  return (
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return q ? sum + p.x * q.y - q.x * p.y : sum;
    }, 0) / 2
  );
}
export function outlineIssue(
  points: Point[],
  width: number,
  depth: number,
  maxCorners = 24,
): string | null {
  if (!points.length) return null;
  if (points.length < 4 || points.length > maxCorners)
    return 'Use 4–24 corners.';
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > width ||
        p.y > depth,
    )
  )
    return 'Keep all corners inside the room dimensions.';
  const edges = points.map((p, i) => ({
    a: p,
    b: points[(i + 1) % points.length] ?? p,
  }));
  if (edges.some(({ a, b }) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01))
    return 'Use distinct corners.';
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      if (j === i + 1 || (i === 0 && j === edges.length - 1)) continue;
      const e = edges[i],
        f = edges[j];
      if (!e || !f) continue;
      if (segmentsMeet(e.a, e.b, f.a, f.b))
        return 'Walls must not cross or touch other walls.';
    }
  if (Math.abs(area(points)) < 1) return 'The outline must enclose an area.';
  return null;
}
export function clockwise(points: Point[]) {
  return area(points) < 0 ? [...points].reverse() : points;
}
export function inside(point: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (!a || !b) continue;
    if (onSegment(point, a, b)) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}
export function rectangleInside(
  room: RoomShape,
  x: number,
  y: number,
  width: number,
  depth: number,
) {
  if (
    x < -0.01 ||
    y < -0.01 ||
    x + width > room.width + 0.01 ||
    y + depth > room.depth + 0.01
  )
    return false;
  if (!room.outline.length && !room.curves?.length) return true;
  return polygonInside(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + depth },
      { x, y: y + depth },
    ],
    roomOutline(room),
  );
}
export function roomEdges(room: RoomShape) {
  const base = clockwise(baseOutline(room));
  return base.map((a, index) => {
    const b = base[(index + 1) % base.length] ?? a;
    const side: 'north' | 'east' | 'south' | 'west' =
      a.y === b.y
        ? b.x > a.x
          ? 'north'
          : 'south'
        : b.y > a.y
          ? 'east'
          : 'west';
    const curve = room.curves?.find((c) => c.wall === index),
      points = curve?.bow ? curvePoints(a, b, curve.bow) : [a, b];
    return {
      a,
      b,
      points,
      curved: !!curve?.bow,
      index,
      side,
      length: points
        .slice(1)
        .reduce(
          (sum, p, i) =>
            sum +
            Math.hypot(
              p.x - (points[i]?.x ?? p.x),
              p.y - (points[i]?.y ?? p.y),
            ),
          0,
        ),
    };
  });
}
export function roomPreset(
  kind: 'rectangle' | 'l' | 'u',
  width: number,
  depth: number,
): Point[] {
  const x = Math.round(width * 0.6),
    y = Math.round(depth * 0.6);
  if (kind === 'rectangle') return [];
  if (kind === 'l')
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y },
      { x, y },
      { x, y: depth },
      { x: 0, y: depth },
    ];
  const a = Math.round(width * 0.33),
    b = Math.round(width * 0.67);
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: b, y: depth },
    { x: b, y },
    { x: a, y },
    { x: a, y: depth },
    { x: 0, y: depth },
  ];
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function onSegment(p: Point, a: Point, b: Point) {
  return (
    Math.abs(cross(a, b, p)) < 1e-6 &&
    p.x >= Math.min(a.x, b.x) - 1e-6 &&
    p.x <= Math.max(a.x, b.x) + 1e-6 &&
    p.y >= Math.min(a.y, b.y) - 1e-6 &&
    p.y <= Math.max(a.y, b.y) + 1e-6
  );
}
function segmentsMeet(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
export function polygonInside(subject: Point[], boundary: Point[]) {
  if (!subject.every((p) => inside(p, boundary))) return false;
  // Split each edge at boundary intersections, then test every interval.
  return subject.every((a, i) => {
    const b = subject[(i + 1) % subject.length] ?? a,
      ts = [0, 1];
    boundary.forEach((c, j) => {
      const d = boundary[(j + 1) % boundary.length] ?? c,
        rx = b.x - a.x,
        ry = b.y - a.y,
        sx = d.x - c.x,
        sy = d.y - c.y,
        den = rx * sy - ry * sx;
      if (Math.abs(den) > 1e-9) {
        const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den,
          u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      } else
        for (const p of [c, d])
          if (onSegment(p, a, b))
            ts.push(
              Math.abs(rx) > Math.abs(ry) ? (p.x - a.x) / rx : (p.y - a.y) / ry,
            );
    });
    ts.sort((a, b) => a - b);
    return ts.slice(1).every((t, j) => {
      const mid = (t + (ts[j] ?? 0)) / 2;
      return inside(
        { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid },
        boundary,
      );
    });
  });
}
export function ceilingAt(
  room: RoomShape & {
    height: number;
    ceiling?:
      | {
          axis: 'x' | 'y';
          endHeight: number;
          kind?: 'slope' | 'vault' | undefined;
          ridge?: number | undefined;
        }
      | undefined;
  },
  x: number,
  y: number,
) {
  const slope = room.ceiling;
  if (!slope) return room.height;
  const t = slope.axis === 'x' ? x / room.width : y / room.depth;
  const ridge = slope.ridge ?? 0.5,
    amount =
      slope.kind === 'vault'
        ? t <= ridge
          ? t / ridge
          : (1 - t) / (1 - ridge)
        : t;
  return (
    room.height +
    (slope.endHeight - room.height) * Math.max(0, Math.min(1, amount))
  );
}

export function wallSegments(room: RoomShape) {
  return roomEdges(room).flatMap((edge) =>
    edge.points.slice(1).map((b, j) => {
      const a = edge.points[j] ?? edge.a;
      return {
        ...edge,
        a,
        b,
        length: Math.hypot(b.x - a.x, b.y - a.y),
        segment: `${edge.index}:${j}`,
      };
    }),
  );
}
export function ceilingRegions(room: Parameters<typeof ceilingAt>[0]) {
  const points = roomOutline(room),
    c = room.ceiling;
  if (c?.kind !== 'vault') return [points];
  const at = (c.axis === 'x' ? room.width : room.depth) * (c.ridge ?? 0.5);
  return [-1, 1]
    .map((sign) => {
      const out: Point[] = [];
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length] ?? a,
          fa = (a[c.axis] - at) * sign,
          fb = (b[c.axis] - at) * sign;
        if (fa <= 0) out.push(a);
        if (fa * fb < 0) {
          const t = fa / (fa - fb);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      });
      return out;
    })
    .filter((p) => p.length >= 3);
}
