import type { Design } from './model';
import { quoteTotals } from './quote';

/**
 * A job that covers more than one room.
 *
 * A design holds one room, and changing that would mean threading a room
 * through every piece of geometry in the app. A job instead collects
 * several designs - a kitchen, an ensuite vanity, a laundry - so each keeps
 * its own room, its own drawings and its own approval, while the money and
 * the item list add up across them. That is the part a dealer cannot do by
 * opening three files.
 */
export type JobRoom = {
  design: Design;
  /** What this room is called on the job, falling back to the design name. */
  room: string;
  total: number;
  items: number;
};

/** The jobs present among these designs, newest name order. */
export function jobsFrom(designs: Design[]) {
  const jobs = new Map<string, string>();
  for (const d of designs) if (d.job) jobs.set(d.job.id, d.job.name);
  return [...jobs]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every room in one job, in a stable order. */
export function roomsInJob(designs: Design[], jobId: string): JobRoom[] {
  return designs
    .filter((d) => d.job?.id === jobId)
    .map((design) => ({
      design,
      room: design.job?.room || design.name,
      total: quoteTotals(design).total,
      items: design.items.length,
    }))
    .sort((a, b) => a.room.localeCompare(b.room));
}

/**
 * What the job comes to.
 *
 * Each room keeps its own tax, discount and delivery, because they are
 * settings of that design and quietly re-pricing one room against another's
 * assumptions would be worse than adding them up as they stand.
 */
export function jobTotals(rooms: JobRoom[]) {
  const totals = rooms.map((r) => quoteTotals(r.design));
  return {
    rooms: rooms.length,
    items: rooms.reduce((sum, r) => sum + r.items, 0),
    subtotal: totals.reduce((sum, t) => sum + t.subtotal, 0),
    tax: totals.reduce((sum, t) => sum + t.tax, 0),
    discount: totals.reduce((sum, t) => sum + t.discount, 0),
    total: totals.reduce((sum, t) => sum + t.total, 0),
  };
}

/**
 * Every item in the job, grouped the way it would be ordered: the same
 * product in two rooms is one line with the rooms named, because that is
 * one line on a purchase order.
 */
export function jobItemList(rooms: JobRoom[]) {
  const lines = new Map<
    string,
    { sku: string; size: string; quantity: number; rooms: Set<string> }
  >();
  for (const { design, room } of rooms)
    for (const item of design.items) {
      const size = `${item.width} × ${item.depth} × ${item.height} in`,
        key = `${item.sku}|${size}`;
      const line = lines.get(key) ?? {
        sku: item.sku,
        size,
        quantity: 0,
        rooms: new Set<string>(),
      };
      line.quantity++;
      line.rooms.add(room);
      lines.set(key, line);
    }
  return [...lines.values()]
    .map((line) => ({ ...line, rooms: [...line.rooms].sort() }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}
