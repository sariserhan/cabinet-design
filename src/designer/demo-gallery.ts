import { polishedSample } from './sample';
import {
  newDesign,
  fromObject,
  normalizeOpenings,
  type Design,
  type Cabinet,
} from './model';
import { completeRuns } from './kitchen-actions';
import { presentationViews, materialVariant } from './render-planning';
export const sampleStories = [
  {
    key: 'apartment',
    name: 'Small apartment',
    description:
      'Compact L-shaped storage, light surfaces and space-saving appliances.',
    tour: 'Start with the compact layout, compare white and oak, then review the demo budget.',
  },
  {
    key: 'family',
    name: 'Family kitchen',
    description:
      'Warm oak, a contrasting island and room for cooking together.',
    tour: 'Tour the work surfaces, move the island, compare finishes and download the proposal.',
  },
  {
    key: 'premium',
    name: 'Premium kitchen',
    description:
      'Dark cabinetry, marble waterfall ends, tall storage and warm lighting.',
    tour: 'Show the lighting, inspect the island and tall storage, then compare the material allowance.',
  },
] as const;
export type SampleKey = (typeof sampleStories)[number]['key'];
export function sampleKitchen(key: SampleKey): Design {
  let d: Design;
  if (key === 'apartment') {
    d = newDesign();
    d.room = { ...d.room, width: 180, depth: 144, height: 96 };
    const add = (kind: Cabinet['kind'], patch: Partial<Cabinet>) => {
      const i = {
        ...fromObject(kind === 'cabinet' ? 'custom_cabinet' : kind),
        ...patch,
      };
      d.items.push(i);
      return {
        ...i,
        opening: i.opening
          ? {
              ...i.opening,
              hostId: d.items.findIndex((h) => h.id === i.opening?.hostId),
            }
          : undefined,
      };
    };
    add('custom_cabinet', { x: 0, y: 0, width: 24 });
    add('range', { x: 24, y: 0, width: 30 });
    add('hood', { x: 24, y: 0, width: 30, elevation: 66 });
    const sink = add('custom_cabinet', {
      x: 54,
      y: 0,
      width: 36,
      sku: 'DEMO-SB36',
      assemblyId: crypto.randomUUID(),
      details: { shelves: 0, toeKick: 4, molding: false, interior: 'shelves' },
    });
    add('sink', { x: 57, y: 2, width: 30, assemblyId: sink.assemblyId });
    add('dishwasher', { x: 90, y: 0, width: 24 });
    add('countertop', { x: 90, y: 0, width: 24, depth: 24, elevation: 34.5 });
    add('refrigerator', { x: 120, y: 0, width: 30, depth: 30, height: 66 });
    for (const y of [36, 66])
      add('custom_cabinet', { x: 0, y, width: 30, depth: 24, rotation: 270 });
    for (const x of [0, 90])
      add('custom_cabinet', {
        x,
        y: 0,
        width: 24,
        depth: 12,
        height: 30,
        elevation: 54,
        frontStyle: x === 90 ? 'glass' : 'double',
      });
    add('window', {
      x: 54,
      y: 0,
      width: 36,
      height: 36,
      elevation: 44,
      wall: 'north',
      wallSegment: 0,
    });
    add('door', {
      x: 112,
      y: 140,
      width: 32,
      wall: 'south',
      wallSegment: 2,
      rotation: 180,
    });
    d = completeRuns(
      d,
      d.items
        .filter((i) => i.kind === 'custom_cabinet' && i.elevation === 0)
        .map((i) => i.id),
    );
    d.finish = 'linen';
    d.appearance = {
      countertop: 'quartz',
      lighting: 'daylight',
      backsplash: 'subway',
      hardware: 'steel',
      faucet: 'steel',
      handleStyle: 'bar',
      outlets: true,
      underCabinet: true,
      staging: true,
    };
    d.views = [
      {
        id: 'hero',
        name: 'Apartment overview',
        position: [170, 105, 135] as [number, number, number],
        target: [75, 38, 36] as [number, number, number],
      },
      ...presentationViews(d).filter((v) => v.id !== 'preset-island'),
    ].slice(0, 4);
  } else {
    d = polishedSample();
    d.views = d.views?.slice(0, 4);
    d.appearance = {
      ...d.appearance,
      countertop: 'quartz',
      lighting: 'daylight',
      pendantLevel: 75,
      underCabinet: true,
      outlets: true,
      faucet: 'brass',
      handleStyle: 'bar',
    };
    d.items = d.items.map((i) =>
      i.kind === 'countertop' && i.y > 30
        ? { ...i, surface: { seating: 'south', waterfall: key === 'premium' } }
        : i,
    );
    if (key === 'premium') {
      d = materialVariant(d, 'dark');
      d.appearance = {
        ...d.appearance,
        countertop: 'marble',
        lighting: 'warm',
        hardware: 'brass',
        faucet: 'brass',
        pendantLevel: 60,
      };
      d.items.push({
        ...fromObject('custom_cabinet'),
        x: 0,
        y: 52,
        width: 30,
        depth: 24,
        height: 90,
        finish: 'slate',
        sku: 'DEMO-PANTRY30',
        category: 'tall_cabinet',
        frontStyle: 'double',
        details: {
          shelves: 5,
          toeKick: 4,
          molding: true,
          interior: 'pullouts',
        },
      });
    }
  }
  d.name = sampleStories.find((s) => s.key === key)?.name ?? key;
  d.sampleKey = key;
  return normalizeOpenings(d);
}
function signature(d: Design) {
  return JSON.stringify({
    room: d.room,
    finish: d.finish,
    appearance: d.appearance,
    items: d.items.map(({ id, assemblyId, ...i }) => {
      void id;
      void assemblyId;
      return {
        ...i,
        opening: i.opening
          ? {
              ...i.opening,
              hostId: d.items.findIndex((h) => h.id === i.opening?.hostId),
            }
          : undefined,
      };
    }),
  });
}
export function isPreparedSample(d: Design) {
  return (
    !!d.sampleKey && signature(d) === signature(sampleKitchen(d.sampleKey))
  );
}
