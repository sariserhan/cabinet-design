import type { Cabinet, Design } from './model';
import { fromObject, localToWorld } from './model';

export type TrimKind = 'crown' | 'light_rail' | 'toe_kick';

/** What each trim is, in inches, and which cabinets carry it. */
const profiles = {
  crown: { depth: 3, height: 3, kind: 'molding' as const, label: 'Crown' },
  light_rail: {
    depth: 1.5,
    height: 1.5,
    kind: 'molding' as const,
    label: 'Light rail',
  },
  toe_kick: {
    depth: 0.75,
    height: 4,
    kind: 'toe_kick' as const,
    label: 'Toe kick',
  },
};

/** Cabinets this trim belongs on: crown and rail above, toe kick below. */
function carriers(design: Design, kind: TrimKind) {
  return design.items.filter(
    (i) =>
      !i.hidden &&
      ['cabinet', 'custom_cabinet', 'corner'].includes(i.kind) &&
      (kind === 'toe_kick' ? i.elevation < 6 : i.elevation >= 30),
  );
}

/** Where a cabinet's back line sits, and how far along that line it runs. */
function seat(item: Cabinet) {
  const angle = (item.rotation * Math.PI) / 180,
    along = { x: Math.cos(angle), y: Math.sin(angle) },
    back = localToWorld(item, 0, 0);
  // Distance from the origin to the item's back line, which two cabinets in
  // one run share.
  const offset = -back.x * along.y + back.y * along.x;
  const start = back.x * along.x + back.y * along.y;
  return { along, offset, start, end: start + item.width };
}

/**
 * Cabinets grouped into the runs a trim actually follows.
 *
 * One run is a set of cabinets on the same line, facing the same way, whose
 * ends meet. A gap wider than a scribe starts a new run, because trim does
 * not bridge a doorway or an appliance.
 */
export function cabinetRuns(design: Design, kind: TrimKind) {
  const seats = carriers(design, kind).map((item) => ({
    item,
    ...seat(item),
  }));
  const runs: (typeof seats)[] = [];
  for (const entry of seats.sort((a, b) => a.start - b.start)) {
    const run = runs.find((candidate) => {
      const last = candidate[candidate.length - 1];
      if (!last) return false;
      return (
        Math.abs(last.item.rotation - entry.item.rotation) < 0.5 &&
        Math.abs(last.offset - entry.offset) < 1 &&
        Math.abs(last.item.elevation - entry.item.elevation) < 1 &&
        entry.start - last.end < 0.75 &&
        entry.start - last.end > -0.75
      );
    });
    if (run) run.push(entry);
    else runs.push([entry]);
  }
  return runs;
}

/**
 * One trim piece per run, mitred where two runs meet at a corner.
 *
 * Trim ordered per cabinet is trim ordered wrong: a run of four cabinets
 * takes one length, and where it turns a corner each leg grows by the
 * depth of the profile so the two meet. The count of those corners is
 * returned because a mitre is a cut somebody has to make.
 */
export function trimRunItems(design: Design, kind: TrimKind) {
  const profile = profiles[kind];
  const runs = cabinetRuns(design, kind).filter((run) => run.length);
  const ends = runs.map((run) => {
    const first = run[0],
      last = run[run.length - 1];
    return first && last
      ? { first, last, start: first.start, finish: last.end }
      : null;
  });
  let mitres = 0;
  const items: Cabinet[] = [];
  runs.forEach((run, index) => {
    const bounds = ends[index];
    const first = run[0];
    if (!bounds || !first) return;
    const { start } = bounds;
    let { finish } = bounds;
    // A corner is another run whose end arrives square to this one, close
    // enough to touch. Each leg reaches out by its own depth to meet it.
    for (const [otherIndex, other] of ends.entries()) {
      if (otherIndex === index || !other) continue;
      const square =
        Math.abs(
          (Math.abs(other.first.item.rotation - first.item.rotation) + 360) %
            180,
        ) > 45;
      if (!square) continue;
      const corner = profile.depth + 1;
      const here = localToWorld(first.item, 0, 0),
        there = localToWorld(other.first.item, 0, 0);
      if (Math.hypot(here.x - there.x, here.y - there.y) < corner + 48) {
        mitres++;
        finish += profile.depth;
      }
    }
    const base = fromObject(profile.kind);
    const anchor = localToWorld(first.item, 0, 0);
    items.push({
      ...base,
      id: crypto.randomUUID(),
      sku: `${profile.label} ${Math.round((finish - start) * 8) / 8}"`,
      width: Math.round((finish - start) * 1000) / 1000,
      depth: profile.depth,
      height: profile.height,
      rotation: first.item.rotation,
      x: Math.round(anchor.x * 1000) / 1000,
      y: Math.round(anchor.y * 1000) / 1000,
      elevation:
        kind === 'toe_kick'
          ? 0
          : kind === 'crown'
            ? first.item.elevation + first.item.height
            : Math.max(0, first.item.elevation - profile.height),
      finish: design.finish,
    });
  });
  // Each corner is shared by the two runs that make it.
  return { items, runs: runs.length, mitres: Math.round(mitres / 2) };
}

/**
 * The design with one run of this trim added, replacing any the tool added
 * before so running it twice does not order it twice.
 */
export function applyTrimRuns(design: Design, kind: TrimKind): Design {
  const { items } = trimRunItems(design, kind);
  if (!items.length)
    throw Error(
      kind === 'toe_kick'
        ? 'Place floor cabinets before adding a toe kick.'
        : 'Place wall cabinets before adding this trim.',
    );
  const label = profiles[kind].label;
  const kept = design.items.filter(
    (i) => !i.sku.startsWith(`${label} `) || i.kind !== profiles[kind].kind,
  );
  return { ...design, items: [...kept, ...items] };
}

/** How many runs and mitres this trim would come to, without applying it. */
export function trimSummary(design: Design, kind: TrimKind) {
  const { runs, mitres, items } = trimRunItems(design, kind);
  return {
    runs,
    mitres,
    length: items.reduce((total, i) => total + i.width, 0),
  };
}
