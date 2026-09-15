import {
  newDesign,
  fromObject,
  normalizeOpenings,
  overlaps,
  footprint,
  localToWorld,
  type Design,
  type Cabinet,
} from './model';
export type RoomOpening = {
  kind: 'door' | 'window';
  wall: 'north' | 'south' | 'east' | 'west';
  offset: number;
  width: number;
};
export function setupKitchen(
  width: number,
  depth: number,
  height: number,
  layout: string,
  openings: RoomOpening[],
): Design {
  const d = newDesign();
  d.name = `${layout === 'empty' ? 'New' : layout} kitchen`;
  d.room = { ...d.room, width, depth, height };
  d.items = openings.map((o) => ({
    ...fromObject(o.kind),
    width: o.width,
    rotation: { north: 0, east: 90, south: 180, west: 270 }[o.wall],
    ...(o.kind === 'window' ? { height: 36, elevation: 44 } : {}),
    wall: o.wall,
    wallSegment: { north: 0, east: 1, south: 2, west: 3 }[o.wall],
    x: o.wall === 'east' ? width - 4 : o.wall === 'west' ? 0 : o.offset,
    y: o.wall === 'south' ? depth - 4 : o.wall === 'north' ? 0 : o.offset,
  }));
  d.items = normalizeOpenings(d).items;
  if (layout === 'empty') return d;
  if (width < 120 || depth < 120)
    throw Error(
      'Starter layouts need a room at least 120 × 120 inches. Choose Empty room for a smaller space.',
    );
  const add = (x: number, y: number, rotation: number) => {
    const item = {
      ...fromObject('custom_cabinet'),
      x,
      y,
      rotation,
      width: 30,
      depth: 24,
    };
    // Quarter-turn footprints are 24 × 30. Keep doorway approaches open.
    const blocked = d.items.some((other) => {
      if (other.kind !== 'door') return false;
      const f = footprint({ ...other, depth: 36 }),
        center = localToWorld(other, other.width / 2, 18);
      return overlaps(item, {
        ...other,
        depth: 36,
        x: center.x - f.width / 2,
        y: center.y - f.depth / 2,
      });
    });
    if (!blocked && !d.items.some((other) => overlaps(item, other)))
      d.items.push(item);
  };
  for (let x = 28; x + 30 <= width - 28; x += 30) add(x, 0, 0);
  if (layout === 'L-shaped' || layout === 'U-shaped')
    for (let y = 28; y + 30 <= depth - 36; y += 30) add(0, y, 270);
  if (layout === 'U-shaped')
    for (let y = 28; y + 30 <= depth - 36; y += 30) add(width - 24, y, 90);
  if (layout === 'Island') {
    if (width < 168 || depth < 168)
      throw Error(
        'The island starter needs at least 168 × 168 inches to leave circulation space.',
      );
    const island: Cabinet = {
      ...fromObject('island'),
      x: (width - 60) / 2,
      y: 84,
      width: 60,
      depth: 36,
    };
    if (d.items.some((other) => overlaps(island, other)))
      throw Error(
        'Move the opening or choose another layout to make room for the island.',
      );
    d.items.push(island);
  }
  return d;
}
