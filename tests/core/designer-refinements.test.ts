import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fromObject,
  newDesign,
  sinkHoles,
  worldToLocal,
  footprint,
  designSchema,
} from '../../src/designer/model';
import {
  fitSink,
  placementBlock,
  closeupViews,
  apronHeight,
} from '../../src/designer/refinements';
import { overhang } from '../../src/designer/studio-tools';
import { snapPlacement } from '../../src/designer/editing';
test('fitted sinks follow rotated surfaces, preserve mount height and reject impossible offsets', () => {
  const host = {
    ...fromObject('island'),
    x: 50,
    y: 50,
    width: 72,
    depth: 36,
    rotation: 90,
  };
  const sink = fromObject('sink');
  const d = { ...newDesign(), items: [host, sink] },
    next = fitSink(d, sink.id, host.id, 'undermount', 5),
    placed = next.items[1];
  assert.ok(placed);
  const f = footprint(placed),
    center = worldToLocal(host, placed.x + f.width / 2, placed.y + f.depth / 2);
  assert.equal(center.x, 41);
  assert.equal(center.y, 18);
  assert.equal(placed.elevation + placed.height, 34.4);
  assert.equal(sinkHoles(host, next.items).length, 1);
  assert.doesNotThrow(() => designSchema.parse(next));
  assert.throws(() => fitSink(d, sink.id, host.id, 'drop_in', 100));
  assert.throws(() =>
    fitSink(
      { ...d, items: [host, { ...sink, locked: true }] },
      sink.id,
      host.id,
      'drop_in',
    ),
  );
  const apron = fitSink(d, sink.id, host.id, 'apron');
  const hole = sinkHoles(host, apron.items)[0];
  assert.ok(hole);
  assert.equal(hole.y + hole.height, host.depth);
  assert.ok(apronHeight(apron, host) > 0);
});
test('independent overhangs expand a rotated top relative to its cabinets', () => {
  const host = {
    ...fromObject('custom_cabinet'),
    width: 60,
    depth: 30,
    x: 50,
    y: 50,
    rotation: 90,
    assemblyId: 'g',
  };
  const top = {
    ...fromObject('countertop'),
    width: 60,
    depth: 30,
    x: 50,
    y: 50,
    rotation: 90,
    assemblyId: 'g',
  };
  const d = { ...newDesign(), items: [host, top] },
    next = overhang(d, top.id, { front: 12, back: 1, left: 2, right: 5 });
  assert.equal(next.items[1]?.width, 67);
  assert.equal(next.items[1]?.depth, 43);
  assert.deepEqual(next.items[0], host);
  const island = fromObject('island'),
    standalone = overhang({ ...newDesign(), items: [island] }, island.id, {
      front: 12,
      back: 1,
      left: 0,
      right: 0,
    });
  assert.equal(standalone.items[0]?.width, island.width);
  assert.equal(standalone.items[0]?.surface?.overhangs?.front, 12);
});
test('placement protection rejects new appliance overlaps but permits joining cabinet edges', () => {
  const a = { ...fromObject('custom_cabinet'), x: 10, y: 10 },
    b = { ...fromObject('refrigerator'), x: 80, y: 10 };
  const d = { ...newDesign(), items: [a, b] };
  assert.ok(placementBlock(d, { ...d, items: [a, { ...b, x: 20 }] }));
  assert.equal(placementBlock(d, { ...d, items: [a, { ...b, x: 34 }] }), null);
  assert.deepEqual(snapPlacement(b, d, 35, 10, true), { x: 34, y: 10 });
  assert.ok(placementBlock(d, { ...d, items: [a, { ...b, x: 500 }] }));
});
test('detail cameras target visible sinks and upper cabinets', () => {
  const d = {
    ...newDesign(),
    items: [
      fromObject('sink'),
      { ...fromObject('custom_cabinet'), elevation: 54, height: 30 },
    ],
  };
  assert.equal(closeupViews(d).length, 2);
  assert.equal(
    closeupViews({ ...d, items: d.items.map((i) => ({ ...i, hidden: true })) })
      .length,
    0,
  );
});

test('countertop changes preserve fitted sink cutouts and mounting references', () => {
  const base = {
    ...fromObject('custom_cabinet'),
    width: 72,
    depth: 30,
    assemblyId: 'g',
  };
  const top = {
    ...fromObject('countertop'),
    width: 72,
    depth: 30,
    assemblyId: 'g',
  };
  const sink = fromObject('sink');
  const fitted = fitSink(
    { ...newDesign(), items: [base, top, sink] },
    sink.id,
    top.id,
    'apron',
    4,
  );
  const changed = overhang(fitted, top.id, {
    front: 1,
    back: 12,
    left: 2,
    right: 2,
  });
  const movedTop = changed.items.find((i) => i.id === top.id);
  assert.ok(movedTop);
  assert.equal(sinkHoles(movedTop, changed.items).length, 1);
  const mounted = changed.items.find((i) => i.id === sink.id);
  assert.ok(mounted);
  assert.equal(mounted.sinkMount?.offset, 4);
});

test('apron sinks face their linked cabinet when its top uses the opposite rotation', () => {
  const cabinet = {
      ...fromObject('custom_cabinet'),
      width: 60,
      depth: 30,
      rotation: 180,
      assemblyId: 'g',
    },
    top = {
      ...fromObject('countertop'),
      width: 60,
      depth: 30,
      assemblyId: 'g',
    },
    sink = fromObject('sink');
  const d = fitSink(
    { ...newDesign(), items: [cabinet, top, sink] },
    sink.id,
    top.id,
    'apron',
  );
  assert.equal(d.items[2]?.rotation, 180);
  assert.equal(sinkHoles(top, d.items)[0]?.y, 0);
  assert.ok(apronHeight(d, cabinet) > 0);
});
