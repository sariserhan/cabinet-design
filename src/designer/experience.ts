import {
  footprint,
  localToWorld,
  worldToLocal,
  updateAssembly,
  isUpperCabinet,
  type Design,
} from './model';
import { fitSink, placementBlock } from './refinements';
import { alignUpper } from './placement-assist';
import { lockViolation } from './studio-tools';
export type SmartAction = 'upper' | 'sink' | 'appliance';
export function smartPlace(
  design: Design,
  id: string,
  action: SmartAction,
): Design {
  const item = design.items.find((i) => i.id === id);
  if (!item) throw Error('Select an object first.');
  if (item.locked) throw Error('Unlock the selected object first.');
  let next = design;
  if (action === 'upper') {
    if (!isUpperCabinet(item)) throw Error('Select an upper cabinet.');
    next = alignUpper(design, id);
    const moved = next.items.find((i) => i.id === id) ?? item;
    next = updateAssembly(design, id, { x: moved.x, y: moved.y });
  } else if (action === 'sink') {
    if (item.kind !== 'sink') throw Error('Select a sink.');
    const f = footprint(item),
      center = { x: item.x + f.width / 2, y: item.y + f.depth / 2 };
    const windows = design.items
      .filter(
        (i) =>
          i.kind === 'window' && i.rotation === item.rotation && !i.opening,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) -
          Math.hypot(b.x - center.x, b.y - center.y),
      );
    const window = windows[0];
    if (!window)
      throw Error('No window with the same orientation is available.');
    const wf = footprint(window),
      wc = { x: window.x + wf.width / 2, y: window.y + wf.depth / 2 };
    const hosts = design.items
      .filter(
        (i) =>
          ['countertop', 'island'].includes(i.kind) &&
          i.rotation === item.rotation,
      )
      .sort(
        (a, b) =>
          Number(b.id === item.sinkMount?.hostId) -
            Number(a.id === item.sinkMount?.hostId) ||
          Math.hypot(a.x - item.x, a.y - item.y) -
            Math.hypot(b.x - item.x, b.y - item.y),
      );
    let fitted: Design | undefined;
    for (const host of hosts) {
      // Only surfaces near this window's wall, not an island across the room.
      const local = worldToLocal(host, wc.x, wc.y);
      if (Math.abs(local.y) > host.depth + 12) continue;
      try {
        fitted = fitSink(
          design,
          id,
          host.id,
          item.sinkMount?.mount ?? 'drop_in',
          local.x - host.width / 2,
        );
        break;
      } catch {
        /* Try another compatible surface. */
      }
    }
    if (!fitted)
      throw Error(
        'No surface beneath this window has room to center the sink.',
      );
    next = fitted;
  } else {
    if (
      !['refrigerator', 'range', 'dishwasher', 'washing_machine'].includes(
        item.kind,
      )
    )
      throw Error('Select an appliance.');
    const bases = design.items
      .filter(
        (i) =>
          ['cabinet', 'custom_cabinet'].includes(i.kind) &&
          i.elevation === 0 &&
          i.rotation === item.rotation,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - item.x, a.y - item.y) -
          Math.hypot(b.x - item.x, b.y - item.y),
      );
    const base = bases[0];
    if (!base)
      throw Error('No base cabinet with the same orientation is available.');
    const front = localToWorld(item, item.width / 2, item.depth),
      local = worldToLocal(base, front.x, front.y),
      target = localToWorld(base, local.x, base.depth);
    next = updateAssembly(design, id, {
      x: item.x + target.x - front.x,
      y: item.y + target.y - front.y,
    });
  }
  const locked = lockViolation(design, next);
  if (locked) throw Error(`Unlock ${locked} before aligning this assembly.`);
  const error = placementBlock(design, next);
  if (error) throw Error(error);
  if (JSON.stringify(next) === JSON.stringify(design))
    throw Error('Already aligned, or no compatible cabinet was found.');
  return next;
}
export function bestCamera(design: Design) {
  const items = design.items.filter(
    (i) =>
      !i.hidden &&
      !['door', 'window', 'partition', 'beam', 'soffit', 'column'].includes(
        i.kind,
      ),
  );
  if (!items.length)
    return {
      position: [
        design.room.width * 1.1,
        design.room.height,
        design.room.depth * 1.2,
      ] as [number, number, number],
      target: [design.room.width / 2, 30, design.room.depth / 2] as [
        number,
        number,
        number,
      ],
    };
  const bounds = items.map((i) => {
      const f = footprint(i);
      return { x: i.x, y: i.y, w: f.width, d: f.depth };
    }),
    minX = Math.min(...bounds.map((b) => b.x)),
    maxX = Math.max(...bounds.map((b) => b.x + b.w)),
    minY = Math.min(...bounds.map((b) => b.y)),
    maxY = Math.max(...bounds.map((b) => b.y + b.d));
  const x = (minX + maxX) / 2,
    z = (minY + maxY) / 2,
    size = Math.max(90, maxX - minX, maxY - minY);
  const bases = items.filter(
    (i) => ['cabinet', 'custom_cabinet'].includes(i.kind) && i.elevation === 0,
  );
  let nx = 0,
    nz = 0;
  for (const i of bases) {
    const a = (i.rotation * Math.PI) / 180;
    nx -= Math.sin(a) * i.width;
    nz += Math.cos(a) * i.width;
  }
  const angle = Math.atan2(nx, nz) + 0.3;
  return {
    position: [
      x + Math.sin(angle) * size * 1.15,
      Math.min(150, 65 + size * 0.28),
      z + Math.cos(angle) * size * 1.15,
    ] as [number, number, number],
    target: [x, 35, z] as [number, number, number],
  };
}
