import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromObject,
  itemPolygon,
  attachToWall,
  footprint,
  overlaps,
  parseDesign,
  wallPanels,
  warnings,
  clearanceWarnings,
  localToWorld,
  worldToLocal,
} from '../../src/designer/model';
import {
  roomEdges,
  polygonInside,
  roomOutline,
  ceilingAt,
  outlineIssue,
} from '../../src/designer/room';
import {
  quoteTotals,
  demoUnitPrice,
  quoteDocument,
} from '../../src/designer/quote';

test('angled opening aligns to its segment and its rotated footprint stays inside the room', () => {
  const d = newDesign();
  d.room.outline = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 60 },
    { x: 84, y: 120 },
    { x: 0, y: 120 },
  ];
  const item = { ...fromObject('window'), wallSegment: 2 };
  const placed = { ...item, ...attachToWall(item, d.room, 'east', 100, 80) };
  assert.equal(placed.rotation, 135);
  assert.ok(polygonInside(itemPolygon(placed), roomOutline(d.room)));
  const edge = roomEdges(d.room)[2];
  assert.ok(edge);
  assert.ok(Math.abs(edge.length - Math.sqrt(7200)) < 1e-8);
  const back = localToWorld(placed, placed.width / 2, 0);
  assert.ok(Math.abs(back.x + back.y - 204) < 1e-6);
  const original = worldToLocal(placed, back.x, back.y);
  assert.ok(Math.abs(original.x - placed.width / 2) < 1e-6);
  assert.ok(Math.abs(original.y) < 1e-6);
});
test('angled polygon containment catches an edge crossing a concave notch', () => {
  const boundary = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 70, y: 100 },
    { x: 50, y: 40 },
    { x: 30, y: 100 },
    { x: 0, y: 100 },
  ];
  assert.equal(outlineIssue(boundary, 100, 100), null);
  assert.equal(
    polygonInside(
      [
        { x: 10, y: 70 },
        { x: 90, y: 70 },
        { x: 90, y: 80 },
        { x: 10, y: 80 },
      ],
      boundary,
    ),
    false,
  );
});
test('rotated collision uses polygons rather than just bounding boxes', () => {
  const a = {
    ...fromObject('trim'),
    width: 40,
    depth: 2,
    rotation: 45,
    x: 0,
    y: 0,
  };
  const b = { ...a, id: 'second', x: 0, y: 10 };
  assert.equal(overlaps(a, b), false);
  assert.equal(overlaps(a, { ...b, y: 1 }), true);
  assert.ok(footprint(a).width > 29 && footprint(a).width < 30);
});
test('sloped walls clip at ceiling, preserve openings, and warn on tall objects', () => {
  const d = newDesign();
  d.room.ceiling = { axis: 'x', endHeight: 60 };
  const item = {
    ...fromObject('window'),
    width: 30,
    height: 30,
    elevation: 30,
    wallSegment: 0,
  };
  d.items = [{ ...item, ...attachToWall(item, d.room, 'north', 30, 0) }];
  const edge = roomEdges(d.room)[0];
  assert.ok(edge);
  const panels = wallPanels(d, edge);
  assert.ok(panels.length > 1);
  for (const p of panels.flat())
    assert.ok(p.y <= ceilingAt(d.room, p.x, 0) + 1e-7);
  const tall = { ...fromObject('column'), x: 120, height: 80 };
  d.items.push(tall);
  assert.ok(warnings(d).some((w) => w.id === `ceiling-${tall.id}`));
  assert.equal(ceilingAt(d.room, 144, 0), 60);
});
test('clearance checks find door and drawer envelopes at arbitrary angles and overhead appliances', () => {
  const d = newDesign(),
    range = { ...fromObject('range'), x: 40, y: 40 };
  const obstruction = { ...fromObject('column'), x: 42, y: 70, height: 20 };
  d.items = [range, obstruction];
  assert.ok(
    clearanceWarnings(d).some((w) => w.id === `clearance-${range.id}-front`),
  );
  d.items = [
    range,
    { ...obstruction, x: 42, y: 42, elevation: 50, height: 10 },
  ];
  assert.ok(
    clearanceWarnings(d).some((w) => w.id === `clearance-${range.id}-above`),
  );
  d.items = [
    { ...range, clearance: { front: 0, rear: 0, side: 0, above: 0 } },
    obstruction,
  ];
  assert.equal(clearanceWarnings(d).length, 0);
});
test('demo quote uses integer cents, explicit price overrides, discounts and tax', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('island'), demoPrice: 100.01 },
    { ...fromObject('sink'), demoPrice: 50 },
  ];
  d.quote = {
    customer: 'Sample',
    tax: 8.25,
    discount: 10,
    installation: 100,
    delivery: 25,
  };
  const totals = quoteTotals(d);
  assert.equal(totals.subtotal, 15001);
  assert.equal(totals.discount, 1500);
  assert.equal(totals.tax, 1114);
  assert.equal(totals.total, 27115);
  const snapshot = JSON.stringify(quoteDocument(d));
  d.orders = [
    {
      id: 'DEMO-test',
      createdAt: '2026-09-15',
      customer: 'Sample',
      total: totals.total,
      snapshot,
    },
  ];
  d.items[0] = { ...(d.items[0] as (typeof d.items)[number]), demoPrice: 0 };
  assert.equal(d.orders[0]?.snapshot, snapshot);
  assert.equal(JSON.parse(snapshot).total, 27115);
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  assert.equal(demoUnitPrice(d.items[0]), 0);
});
test('invalid pricing and malformed order snapshots cannot enter a design', () => {
  const d = newDesign();
  d.items = [{ ...fromObject('sink'), demoPrice: -1 }];
  assert.throws(() => parseDesign(JSON.stringify(d)));
  d.items = [];
  d.orders = [
    { id: 'x', createdAt: 'now', customer: '', total: 0, snapshot: 'not json' },
  ];
  assert.throws(() => parseDesign(JSON.stringify(d)));
});
