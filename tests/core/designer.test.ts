import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromProduct,
  footprint,
  overlaps,
  warnings,
  snapPosition,
  findSpace,
  parseDesign,
  canPlace,
  csvBill,
  fromObject,
  MAX_DESIGN_ITEMS,
} from '../../src/designer/model';
const product = {
  _id: 'cabinet-b24',
  sku: 'B24',
  category: 'base_cabinet',
  width: 24,
  depth: 24,
  height: 34.5,
  pageNumber: 52,
};
test('cabinet placement requires real positive geometry and a cabinet category', () => {
  assert.equal(canPlace(product), true);
  assert.equal(canPlace({ ...product, depth: undefined }), false);
  assert.equal(canPlace({ ...product, width: 0 }), false);
  assert.equal(canPlace({ ...product, category: 'accessory' }), false);
  assert.throws(() =>
    fromProduct({ ...product, height: undefined }, 'version'),
  );
});
test('quarter turns exchange footprint axes without changing source dimensions', () => {
  const item = fromProduct({ ...product, width: 18 }, 'v');
  assert.deepEqual(footprint({ ...item, rotation: 90 }), {
    width: 24,
    depth: 18,
  });
  assert.deepEqual(footprint({ ...item, rotation: 180 }), {
    width: 18,
    depth: 24,
  });
});
test('touching edges and vertically separated cabinets do not overlap', () => {
  const a = fromProduct(product, 'v'),
    b = { ...a, id: 'second', x: 24 };
  assert.equal(overlaps(a, b), false);
  assert.equal(overlaps(a, { ...b, x: 23 }), true);
  assert.equal(overlaps(a, { ...b, x: 0, elevation: 54, height: 30 }), false);
  assert.equal(overlaps(a, { ...b, x: 0, elevation: 34.5 }), false);
});
test('wall snap respects enabled walls and clamps a rotated cabinet', () => {
  const room = newDesign().room,
    item = {
      ...fromProduct({ ...product, width: 18 }, 'v'),
      rotation: 90 as const,
    };
  assert.deepEqual(snapPosition(item, room, 3, 4, true), { x: 0, y: 0 });
  assert.deepEqual(
    snapPosition(
      item,
      {
        ...room,
        walls: { north: false, east: true, south: true, west: false },
      },
      3,
      4,
      true,
    ),
    { x: 3, y: 4 },
  );
  assert.deepEqual(snapPosition(item, room, 500, 500, true), {
    x: 120,
    y: 102,
  });
  assert.deepEqual(snapPosition(item, room, 3, 4, false), { x: 3, y: 4 });
});
test('room shrinking reports both ceiling and boundary problems', () => {
  const d = newDesign();
  d.items = [{ ...fromProduct(product, 'v'), x: 130, elevation: 80 }];
  const issues = warnings(d);
  assert.ok(issues.length >= 2);
  assert.ok(issues.some((i) => i.id.startsWith('outside')));
  assert.ok(issues.some((i) => i.id.startsWith('ceiling')));
});
test('automatic placement finds unoccupied space and returns null in a full room', () => {
  const d = newDesign();
  d.room.width = 48;
  d.room.depth = 48;
  const a = fromProduct(product, 'v');
  d.items = [a];
  assert.deepEqual(findSpace({ ...a, id: 'second' }, d), { x: 24, y: 0 });
  d.items = [
    a,
    { ...a, id: 'b', x: 24 },
    { ...a, id: 'c', y: 24 },
    { ...a, id: 'd', x: 24, y: 24 },
  ];
  assert.equal(findSpace({ ...a, id: 'new' }, d), null);
});
test('design JSON round-trips and rejects malformed, duplicate and oversized inputs', () => {
  const d = newDesign();
  d.items = [fromProduct(product, 'v')];
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  assert.throws(() =>
    parseDesign(JSON.stringify({ ...d, items: [d.items[0], d.items[0]] })),
  );
  assert.throws(() =>
    parseDesign(JSON.stringify({ ...d, room: { ...d.room, width: -10 } })),
  );
  assert.throws(() => parseDesign('x'.repeat(500001)));
  assert.throws(() =>
    parseDesign(JSON.stringify({ ...d, format: 'something-else' })),
  );
});
test('cabinet list groups repeated products while retaining dimensions and quantities', () => {
  const d = newDesign(),
    a = fromProduct(product, 'v');
  d.items = [a, { ...a, id: 'second', x: 24 }];
  const csv = csvBill(d);
  assert.ok(csv.includes('"B24","2","24","24","34.5","52"'));
  d.items = [{ ...a, sku: '=HYPERLINK(test)' }];
  assert.ok(csvBill(d).includes("'=HYPERLINK"));
});

test('legacy designs default to standard fronts and mirrored designs persist', () => {
  const d = newDesign();
  const item = fromProduct(product, 'v');
  const legacy = JSON.parse(JSON.stringify({ ...d, items: [item] }));
  delete legacy.items[0].mirrored;
  assert.equal(parseDesign(JSON.stringify(legacy)).items[0]?.mirrored, false);
  assert.equal(
    parseDesign(JSON.stringify({ ...d, items: [{ ...item, mirrored: true }] }))
      .items[0]?.mirrored,
    true,
  );
});

test('mirroring is reversible and turning preserves the catalog envelope', async () => {
  const { mirrorCabinet, turnCabinet, frontHandle } =
    await import('../../src/designer/model');
  const item = fromProduct({ ...product, width: 18 }, 'v'),
    flipped = mirrorCabinet(item);
  assert.deepEqual(mirrorCabinet(flipped), item);
  assert.deepEqual(footprint(flipped), footprint(item));
  assert.notEqual(frontHandle(item).x, frontHandle(flipped).x);
  const turned = turnCabinet(item, 180);
  assert.equal(turned.rotation, 180);
  assert.deepEqual(footprint(turned), footprint(item));
  assert.deepEqual(turnCabinet(turned, 180), item);
});

test('all object presets round-trip without pretending to be catalog products', async () => {
  const { objectPresets, fromObject } =
    await import('../../src/designer/model');
  const d = newDesign();
  d.items = objectPresets.map((p) => fromObject(p.kind));
  const restored = parseDesign(JSON.stringify(d));
  assert.equal(restored.items.length, 19);
  assert.ok(restored.items.every((i) => i.versionId === 'demo-objects'));
  assert.ok(csvBill(d).includes('Demo object'));
});
test('wall attachment clamps openings and follows room size', async () => {
  const { fromObject, attachToWall } = await import('../../src/designer/model');
  const d = newDesign(),
    window = fromObject('window');
  assert.deepEqual(attachToWall(window, d.room, 'east', 0, 500), {
    x: 140,
    y: 72,
    rotation: 90,
    wall: 'east',
    wallSegment: 1,
  });
  assert.equal(attachToWall(window, { ...d.room, width: 200 }, 'east').x, 196);
});
test('sink holes preserve surface area and permit only supported sink intersections', async () => {
  const { fromObject, sinkHoles, cutPanels, placementCollision } =
    await import('../../src/designer/model');
  const counter = { ...fromObject('countertop'), width: 60, depth: 30 };
  const sink = { ...fromObject('sink'), x: 15, y: 5 };
  const holes = sinkHoles(counter, [sink]);
  assert.equal(holes.length, 1);
  assert.equal(
    cutPanels(60, 30, holes).reduce((sum, p) => sum + p.width * p.height, 0),
    1200,
  );
  assert.equal(placementCollision(counter, sink), false);
  assert.equal(sinkHoles(counter, [{ ...sink, x: 55 }]).length, 0);
  assert.equal(placementCollision(counter, { ...sink, x: 55 }), true);
});
test('door swing and disabled wall produce actionable warnings', async () => {
  const { fromObject } = await import('../../src/designer/model');
  const d = newDesign();
  d.room.walls.north = false;
  d.items = [fromObject('door'), { ...fromObject('refrigerator'), y: 8 }];
  const issues = warnings(d);
  assert.ok(issues.some((i) => i.id.startsWith('wall-')));
  assert.ok(issues.some((i) => i.id.startsWith('swing-')));
});
test('resized generic objects remain separate in exported quantities', async () => {
  const { fromObject } = await import('../../src/designer/model');
  const d = newDesign();
  const a = fromObject('countertop');
  d.items = [a, { ...a, id: 'second', width: 90 }];
  assert.equal(csvBill(d).split('\n').length, 3);
});

test('custom outlines allow angled walls and reject crossings', async () => {
  const { outlineIssue, roomPreset } = await import('../../src/designer/room');
  const d = newDesign();
  d.room.outline = roomPreset('l', 144, 120);
  assert.equal(outlineIssue(d.room.outline, 144, 120), null);
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  d.room.outline = [
    { x: 0, y: 0 },
    { x: 100, y: 30 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  assert.ok(
    outlineIssue(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 100 },
        { x: 50, y: 0 },
        { x: 0, y: 100 },
      ],
      144,
      120,
    ),
  );
});
test('concave room containment catches furniture spanning an empty notch', async () => {
  const { rectangleInside, roomPreset } =
    await import('../../src/designer/room');
  const d = newDesign();
  d.room.outline = roomPreset('u', 144, 120);
  assert.equal(rectangleInside(d.room, 0, 80, 144, 24), false);
  assert.equal(rectangleInside(d.room, 0, 0, 24, 24), true);
  d.items = [{ ...fromProduct(product, 'v'), x: 65, y: 90 }];
  assert.ok(warnings(d).some((i) => i.id.startsWith('outside')));
});
test('internal custom walls support snapping and opening attachment', async () => {
  const { roomPreset, roomEdges } = await import('../../src/designer/room');
  const { attachToWall, fromObject } = await import('../../src/designer/model');
  const d = newDesign();
  d.room.outline = roomPreset('l', 144, 120);
  const edge = roomEdges(d.room).find(
    (e) => e.side === 'south' && e.a.y === 72,
  );
  assert.ok(edge);
  const opening = {
    ...fromObject('window'),
    width: 36,
    wallSegment: edge.index,
  };
  assert.equal(attachToWall(opening, d.room, 'south', 100, 0).y, 68);
  const item = fromProduct(product, 'v');
  assert.deepEqual(snapPosition(item, d.room, 100, 50, true), {
    x: 100,
    y: 48,
  });
});
test('assembly movement and quarter turns carry other members without changing geometry', async () => {
  const { updateAssembly } = await import('../../src/designer/model');
  const d = newDesign(),
    a = { ...fromProduct(product, 'v'), assemblyId: 'group' };
  const b = { ...a, id: 'b', x: 24 };
  const ungrouped = { ...a, id: 'c', x: 96, assemblyId: null };
  d.items = [a, b, ungrouped];
  const moved = updateAssembly(d, a.id, { x: 12, y: 18 });
  assert.equal(moved.items[1]?.x, 36);
  assert.equal(moved.items[1]?.y, 18);
  assert.equal(moved.items[2]?.x, 96);
  const turned = updateAssembly(d, a.id, { rotation: 90 });
  assert.equal(turned.items[1]?.x, 0);
  assert.equal(turned.items[1]?.y, 24);
  assert.equal(turned.items[1]?.width, 24);
  assert.equal(turned.items[1]?.rotation, 90);
});
test('legacy imported designs receive rectangular rooms and no assembly', () => {
  const d = newDesign();
  d.items = [fromProduct(product, 'v')];
  const old = JSON.parse(JSON.stringify(d));
  delete old.room.outline;
  delete old.items[0].assemblyId;
  delete old.items[0].frontStyle;
  delete old.items[0].wallSegment;
  const parsed = parseDesign(JSON.stringify(old));
  assert.deepEqual(parsed.room.outline, []);
  assert.equal(parsed.items[0]?.assemblyId, null);
  assert.equal(parsed.items[0]?.frontStyle, 'auto');
});

test('design checks scale with item count rather than quadratically', () => {
  const build = (n: number) => ({
    ...newDesign(),
    room: { ...newDesign().room, width: 600, depth: 600 },
    items: Array.from({ length: n }, (_, i) => ({
      ...fromObject('custom_cabinet'),
      id: `i${i}`,
      x: 12 + (i % 20) * 28,
      y: 12 + Math.floor(i / 20) * 28,
    })),
  });
  const time = (design: ReturnType<typeof build>) => {
    warnings(design);
    const started = performance.now();
    for (let i = 0; i < 5; i++) warnings(design);
    return (performance.now() - started) / 5;
  };
  const small = Math.max(time(build(100)), 0.05),
    large = time(build(MAX_DESIGN_ITEMS));
  // Four times the items. Near-linear work lands around 4x; the quadratic
  // version this replaced was about 12x. A generous bound keeps the test
  // meaningful without being machine-dependent.
  assert.ok(
    large / small < 8,
    `warnings grew ${(large / small).toFixed(1)}x for 4x the items (${small.toFixed(2)}ms -> ${large.toFixed(2)}ms)`,
  );
});
