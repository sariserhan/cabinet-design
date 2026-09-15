import {
  footprint,
  localToWorld,
  worldToLocal,
  placementCollision,
  isOpening,
  isUpperCabinet,
  type Cabinet,
  type Design,
} from './model';
import { rectangleInside } from './room';
export function placementBlock(before: Design, after: Design) {
  if (before.id !== after.id) return null;
  const previous = new Map(before.items.map((i) => [i.id, i]));
  const changed = after.items.filter((i) => {
    const old = previous.get(i.id);
    return (
      !old || (['x', 'y', 'rotation'] as const).some((k) => i[k] !== old[k])
    );
  });
  for (const item of changed) {
    if (
      isOpening(item) ||
      ![
        'cabinet',
        'custom_cabinet',
        'corner',
        'island',
        'refrigerator',
        'range',
        'dishwasher',
        'washing_machine',
      ].includes(item.kind)
    )
      continue;
    const f = footprint(item);
    if (!rectangleInside(after.room, item.x, item.y, f.width, f.depth))
      return `${item.sku} would leave the room.`;
    for (const other of after.items) {
      if (
        other.id === item.id ||
        (item.assemblyId && item.assemblyId === other.assemblyId)
      )
        continue;
      if (!placementCollision(item, other)) continue;
      const a = previous.get(item.id),
        b = previous.get(other.id);
      if (a && b && placementCollision(a, b)) continue;
      return `${item.sku} would overlap ${other.sku}. Try an open position or align its edge with the run.`;
    }
  }
  return null;
}
export function fitSink(
  design: Design,
  id: string,
  hostId: string,
  mount: 'undermount' | 'drop_in' | 'apron',
  offset = 0,
): Design {
  const sink = design.items.find((i) => i.id === id && i.kind === 'sink'),
    host = design.items.find(
      (i) => i.id === hostId && ['countertop', 'island'].includes(i.kind),
    );
  if (!sink || !host) throw Error('Choose a sink and a countertop or island.');
  if (sink.locked || host.locked)
    throw Error('Unlock the sink and its surface before fitting.');
  if (!Number.isFinite(offset)) throw Error('Enter a valid sink offset.');
  const left = (host.width - sink.width) / 2 + offset;
  if (
    left < 1 ||
    left + sink.width > host.width - 1 ||
    sink.depth > host.depth - 2
  )
    throw Error(
      'The sink needs at least one inch of surface on each side. Choose a larger surface or a smaller sink.',
    );
  const top = host.elevation + host.height,
    thickness = host.kind === 'island' ? 1.5 : host.height;
  const rim = mount === 'undermount' ? top - thickness - 0.1 : top;
  if (rim < sink.height)
    throw Error('There is not enough height for the basin.');
  const base = design.items.find(
    (i) =>
      host.assemblyId &&
      i.assemblyId === host.assemblyId &&
      ['cabinet', 'custom_cabinet'].includes(i.kind) &&
      i.elevation === 0 &&
      i.rotation % 180 === host.rotation % 180,
  );
  const rotation = base?.rotation ?? host.rotation;
  const reversed =
    Math.abs(((rotation - host.rotation + 360) % 360) - 180) < 0.1;
  const y =
    mount === 'apron'
      ? reversed
        ? 1
        : host.depth - sink.depth - 1
      : (host.depth - sink.depth) / 2;
  const center = localToWorld(host, left + sink.width / 2, y + sink.depth / 2),
    f = footprint({ ...sink, rotation });
  const group = host.assemblyId ?? host.id;
  return {
    ...design,
    items: design.items.map((i) =>
      i.id === sink.id
        ? {
            ...i,
            rotation,
            x: center.x - f.width / 2,
            y: center.y - f.depth / 2,
            elevation: rim - sink.height,
            assemblyId: group,
            sinkStyle: mount === 'apron' ? 'farmhouse' : i.sinkStyle,
            sinkMount: { hostId: host.id, mount, offset },
          }
        : i.id === host.id
          ? { ...i, assemblyId: group }
          : i,
    ),
  };
}
export function apronHeight(design: Design, cabinet: Cabinet) {
  return Math.max(
    0,
    ...design.items
      .filter((s) => s.kind === 'sink' && s.sinkMount?.mount === 'apron')
      .map((s) => {
        const host = design.items.find((h) => h.id === s.sinkMount?.hostId);
        if (
          !host ||
          (host.id !== cabinet.id &&
            (!host.assemblyId || host.assemblyId !== cabinet.assemblyId))
        )
          return 0;
        const center = worldToLocal(
          cabinet,
          s.x + footprint(s).width / 2,
          s.y + footprint(s).depth / 2,
        );
        return center.x + s.width / 2 > 0 &&
          center.x - s.width / 2 < cabinet.width
          ? Math.max(0, cabinet.elevation + cabinet.height - s.elevation)
          : 0;
      }),
  );
}
export function closeupViews(design: Design) {
  const subjects = [
    design.items.find((i) => i.kind === 'sink' && !i.hidden),
    design.items.find((i) => isUpperCabinet(i) && !i.hidden),
  ];
  return subjects.flatMap((item, n) => {
    if (!item) return [];
    const target = localToWorld(item, item.width / 2, item.depth / 2),
      p = localToWorld(item, item.width / 2, item.depth + 65);
    return [
      {
        id: `detail-${n}`,
        name: n === 0 ? 'Sink & worktop close-up' : 'Cabinet detail close-up',
        position: [p.x, item.elevation + item.height + 22, p.y] as [
          number,
          number,
          number,
        ],
        target: [target.x, item.elevation + item.height * 0.65, target.y] as [
          number,
          number,
          number,
        ],
      },
    ];
  });
}
