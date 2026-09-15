import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, parseDesign } from '../../src/designer/model';
import {
  assemblyMembers,
  finishAssembly,
  placementAt,
  alignSelection,
  snapPlacement,
  duplicateOption,
  clearanceZones,
} from '../../src/designer/editing';
import { parseDrop } from '../../src/designer/drop';
import {
  machiningParts,
  machiningDefaults,
  nestPanels,
  machiningDxf,
} from '../../src/designer/machining';
import { panelParts } from '../../src/designer/fabrication';
test('snap finds item edges and excludes members of the same assembly', () => {
  const d = newDesign(),
    a = { ...fromObject('custom_cabinet'), x: 10, y: 10 },
    b = { ...fromObject('custom_cabinet'), x: 36, y: 10 };
  d.items = [a, b];
  assert.equal(snapPlacement(b, d, 36, 10, true).x, 34);
  d.items[0] = { ...a, assemblyId: 'g' };
  assert.equal(snapPlacement({ ...b, assemblyId: 'g' }, d, 36, 10, true).x, 36);
});
test('alignment moves assemblies once and distribution uses clear edge gaps', () => {
  const d = newDesign(),
    a = { ...fromObject('custom_cabinet'), x: 10, y: 10, assemblyId: 'a' },
    top = {
      ...fromObject('countertop'),
      x: 10,
      y: 10,
      width: 24,
      assemblyId: 'a',
    },
    b = { ...fromObject('custom_cabinet'), x: 50, y: 30 };
  d.items = [a, top, b];
  const next = alignSelection(d, [a.id, top.id, b.id], 'top');
  assert.equal(next.items[2]?.y, 10);
  assert.equal(next.items[1]?.y, 10);
  d.items = [
    { ...a, assemblyId: null, x: 0 },
    { ...b, x: 35 },
    { ...b, id: 'third', x: 100 },
  ];
  const spaced = alignSelection(
    d,
    d.items.map((i) => i.id),
    'horizontal',
  );
  assert.equal(spaced.items[1]?.x, 50);
});
test('alternatives are independent and drop parsing rejects untrusted shapes', () => {
  const d = newDesign();
  d.items = [fromObject('custom_cabinet')];
  const copy = duplicateOption(d, 'B');
  const copied = copy.items[0];
  assert.ok(copied);
  copied.width = 30;
  assert.notEqual(copy.id, d.id);
  assert.equal(d.items[0]?.width, 24);
  assert.deepEqual(copy.orders, []);
  assert.equal(parseDrop('{"kind":"object","object":"unknown"}'), null);
  assert.equal(
    parseDrop(JSON.stringify({ kind: 'product', product: { sku: 'bad' } })),
    null,
  );
  assert.equal(parseDrop('{"kind":"object","object":"sink"}')?.kind, 'object');
});
test('clearance overlay rotates with its host', () => {
  const item = { ...fromObject('custom_cabinet'), rotation: 90, x: 30, y: 30 };
  const front = clearanceZones(item).find((z) => z.name === 'front');
  assert.ok(front);
  assert.ok(front.points.every((p) => p.x <= 30 + 0.001));
});
test('edge banding, rabbets and mirrored hinge cups agree on raw dimensions', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('custom_cabinet'), width: 36, frontStyle: 'double' },
  ];
  d.fabrication = {
    ...machiningDefaults,
    joinery: 'rabbet',
    rebate: 0.25,
    edgeBandMm: 1,
    drilling: true,
  };
  const parts = machiningParts(d),
    doors = parts.panels.filter((p) => p.part === 'Slab door blank');
  assert.equal(doors.length, 2);
  const left = doors[0],
    right = doors[1];
  assert.ok(left && right);
  const lh = left.holes[0],
    rh = right.holes[0];
  assert.ok(lh && rh);
  assert.ok(Math.abs((left.finishedWidth - left.width) * 25.4 - 2) < 1e-6);
  assert.equal(doors[0]?.holes.length, 2);
  assert.ok(Math.abs(lh.x + rh.x - left.width) < 1e-6);
  assert.equal(
    panelParts(d).parts.find((p) => p.part === 'Top / bottom')?.width,
    35,
  );
  assert.equal(parts.panels.find((p) => p.part === 'Side')?.pockets.length, 2);
  assert.ok(machiningDxf(d).includes('CIRCLE'));
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
});
test('nesting keeps stock separate, stays on sheets, respects kerf and reports oversized panels', () => {
  const d = newDesign();
  d.items = Array.from({ length: 4 }, () => fromObject('custom_cabinet'));
  d.fabrication = { ...machiningDefaults, edgeBandMm: 1 };
  const nest = nestPanels(d);
  assert.equal(nest.unplaced.length, 0);
  for (const sheet of nest.sheets)
    for (const [i, p] of sheet.placements.entries()) {
      assert.ok(
        p.x >= 0 && p.y >= 0 && p.x + p.width <= 48 && p.y + p.height <= 96,
      );
      assert.equal(p.panel.material, sheet.material);
      assert.equal(p.panel.thickness, sheet.thickness);
      for (const q of sheet.placements.slice(i + 1))
        assert.ok(
          p.x + p.width + 0.12499 <= q.x ||
            q.x + q.width + 0.12499 <= p.x ||
            p.y + p.height + 0.12499 <= q.y ||
            q.y + q.height + 0.12499 <= p.y,
        );
    }
  d.fabrication.sheetWidth = 12;
  d.fabrication.sheetHeight = 12;
  assert.ok(nestPanels(d).unplaced.length > 0);
});
test('unsafe-depth drilling is omitted and excessive rabbet depth is rejected', () => {
  const d = newDesign();
  d.items = [fromObject('custom_cabinet')];
  d.fabrication = { ...machiningDefaults, thickness: 0.25, drilling: true };
  const parts = machiningParts(d);
  assert.ok(parts.issues.some((i) => i.includes('drilling omitted')));
  assert.equal(parts.panels.flatMap((p) => p.holes).length, 0);
  d.fabrication.joinery = 'rabbet';
  assert.throws(() => parseDesign(JSON.stringify(d)));
});

test('drop preview uses wall attachment and item snapping, and rejects openings without walls', () => {
  const d = newDesign(),
    item = fromObject('custom_cabinet');
  d.items = [{ ...fromObject('custom_cabinet'), x: 10, y: 20 }];
  const placed = placementAt(item, d, { x: 47, y: 32 }, true);
  assert.equal(placed?.x, 34);
  const door = placementAt(fromObject('door'), d, { x: 60, y: 0 }, true);
  assert.equal(door?.wall, 'north');
  assert.equal(door?.y, 0);
  d.room.walls = { north: false, east: false, south: false, west: false };
  assert.equal(
    placementAt(fromObject('window'), d, { x: 60, y: 0 }, true),
    null,
  );
});
test('individual materials survive JSON roundtrip and changing kitchen defaults', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('island'), finish: 'slate', countertop: 'granite' },
  ];
  const restored = parseDesign(JSON.stringify({ ...d, finish: 'linen' }));
  assert.equal(restored.finish, 'linen');
  assert.equal(restored.items[0]?.finish, 'slate');
  assert.equal(restored.items[0]?.countertop, 'granite');
});

test('whole-island finish changes cabinet members but preserves countertop and unrelated cabinets', () => {
  const d = newDesign(),
    a = { ...fromObject('custom_cabinet'), assemblyId: 'island' },
    b = { ...fromObject('custom_cabinet'), assemblyId: 'island' },
    top = {
      ...fromObject('countertop'),
      assemblyId: 'island',
      countertop: 'granite' as const,
    },
    other = fromObject('custom_cabinet');
  d.items = [a, b, top, other];
  assert.deepEqual(assemblyMembers(d, top.id), [a.id, b.id, top.id]);
  const next = finishAssembly(d, top.id, 'slate');
  assert.equal(next.items[0]?.finish, 'slate');
  assert.equal(next.items[1]?.finish, 'slate');
  assert.equal(next.items[2]?.countertop, 'granite');
  assert.equal(next.items[2]?.finish, undefined);
  assert.equal(next.items[3]?.finish, undefined);
  assert.equal(d.items[0]?.finish, undefined);
});
