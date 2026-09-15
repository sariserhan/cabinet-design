import { presentationViews } from './render-planning';
import { newDesign, fromObject, normalizeOpenings } from './model';
import type { Cabinet } from './model';
import { installationDefaults, installationProfiles } from './installation';
export function polishedSample() {
  const d = newDesign();
  d.name = 'The Oak House · presentation kitchen';
  d.room = {
    width: 240,
    depth: 192,
    height: 108,
    outline: [],
    curves: [{ wall: 2, bow: 12 }],
    ceiling: { axis: 'x', kind: 'vault', endHeight: 138, ridge: 0.5 },
    walls: { north: true, east: true, south: true, west: true },
  };
  d.appearance = {
    countertop: 'quartz',
    lighting: 'daylight',
    backsplash: 'subway',
    hardware: 'brass',
    pendants: true,
    staging: true,
  };
  d.views = [
    {
      id: crypto.randomUUID(),
      name: 'Kitchen hero',
      position: [210, 108, 295],
      target: [110, 42, 48],
    },
  ];
  d.fabrication = { thickness: 0.75, back: 0.25, gap: 0.125 };
  const add = (kind: Cabinet['kind'], patch: Partial<Cabinet>) => {
    const item = {
      ...fromObject(kind === 'cabinet' ? 'custom_cabinet' : kind),
      ...patch,
    };
    d.items.push(item);
    return item;
  };
  for (const [x, w] of [
    [4, 30],
    [68, 24],
    [94, 36],
    [158, 30],
  ] as const) {
    const b = add('custom_cabinet', {
      sku: x === 94 ? 'CUSTOM-SB36' : `CUSTOM-B${w}`,
      x,
      y: 0,
      width: w,
      assemblyId: crypto.randomUUID(),
      details: {
        shelves: x === 94 ? 0 : 2,
        toeKick: 4,
        molding: false,
        interior: 'shelves',
      },
    });
    add('countertop', {
      x: x - 0.5,
      y: 0,
      width: w + 1,
      depth: 25.5,
      elevation: 34.5,
      assemblyId: b.assemblyId,
    });
    if (x === 94)
      add('sink', {
        x: 97,
        y: 3,
        width: 30,
        depth: 20,
        elevation: 28,
        assemblyId: b.assemblyId,
        installation: {
          ...installationDefaults,
          water: 'hot',
          drain: true,
          serviceX: 112,
          serviceY: 2,
          serviceZ: 18,
          notes:
            'Demo hot/cold supply and waste location; confirm field rough-in.',
        },
      });
  }
  add('range', {
    x: 36,
    y: 1,
    width: 30,
    depth: 26,
    installation: {
      ...installationDefaults,
      voltage: 240,
      circuitAmps: 40,
      vent: 'outside',
      ductDiameter: 6,
      ventCfm: 400,
      serviceX: 51,
      serviceY: 0,
      serviceZ: 12,
      notes:
        'Demo electric range assumptions; select an actual model before installation.',
    },
  });
  add('hood', { x: 36, y: 0 });
  const dw = installationProfiles.find((p) => p.kind === 'dishwasher');
  if (dw)
    add('dishwasher', {
      sku: dw.name,
      x: 132.21875,
      y: 0.25,
      ...dw.dimensions,
      clearance: dw.clearance,
      installation: {
        ...installationDefaults,
        profile: dw.id,
        voltage: 120,
        circuitAmps: 15,
        water: 'hot',
        waterPressure: 50,
        drain: true,
        drainRise: 36,
        serviceX: 130,
        serviceY: 0,
        serviceZ: 18,
        notes: 'Demo service data, not field verified.',
      },
    });
  add('countertop', {
    x: 131.5,
    y: 0,
    width: 25,
    depth: 25.5,
    elevation: 34.5,
  });
  const fridge = installationProfiles.find((p) => p.kind === 'refrigerator');
  if (fridge)
    add('refrigerator', {
      sku: fridge.name,
      x: 196,
      y: 2,
      ...fridge.dimensions,
      clearance: fridge.clearance,
      installation: {
        ...installationDefaults,
        profile: fridge.id,
        voltage: 120,
        circuitAmps: 15,
        water: 'none',
        vent: 'none',
        serviceX: 211,
        serviceY: 0,
        serviceZ: 12,
        notes:
          'Illustrative appliance mesh; specification profile uses GE dimensions.',
      },
    });
  for (const [x, w] of [
    [4, 30],
    [68, 24],
    [160, 28],
  ] as const)
    add('custom_cabinet', {
      sku: `CUSTOM-W${w}30`,
      x,
      y: 0,
      width: w,
      depth: 12,
      height: 30,
      elevation: 54,
      category: 'wall_cabinet',
      details: { shelves: 2, toeKick: 0, molding: true, interior: 'shelves' },
      frontStyle: 'double',
    });
  add('window', {
    x: 98,
    y: 0,
    width: 58,
    depth: 4,
    height: 42,
    elevation: 44,
    wall: 'north',
    wallSegment: 0,
  });
  const assemblyId = crypto.randomUUID();
  for (const x of [70, 98, 126])
    add('custom_cabinet', {
      sku: 'CUSTOM-ISLAND28',
      finish: 'slate',
      x,
      y: 100,
      width: 28,
      depth: 30,
      rotation: 180,
      assemblyId,
      frontStyle: 'double',
      details: { shelves: 2, toeKick: 4, molding: false, interior: 'pullouts' },
    });
  add('countertop', {
    x: 68,
    y: 98,
    width: 88,
    depth: 47,
    elevation: 34.5,
    assemblyId,
  });
  const partition = add('partition', {
    x: 222,
    y: 82,
    width: 88,
    depth: 4,
    height: 96,
    rotation: 90,
  });
  add('door', {
    width: 32,
    height: 80,
    opening: { hostId: partition.id, offset: 28, sill: 0 },
  });
  d.views = [...(d.views ?? []), ...presentationViews(d)];
  return normalizeOpenings(d);
}
