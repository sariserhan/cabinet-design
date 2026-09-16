import {
  backsplashRuns,
  presentationViews,
  walkPosition,
  walkEntry,
  materialVariant,
  openingConflicts,
} from '../../src/designer/render-planning';
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
  marqueeSelection,
} from '../../src/designer/editing';
import { previewEverydayEdit } from '../../src/designer/everyday-editing';
import { spacingFindings, defaultSpacing } from '../../src/designer/spacing';
import { parseDrop } from '../../src/designer/drop';
import {
  machiningParts,
  machiningDefaults,
  nestPanels,
  machiningDxf,
} from '../../src/designer/machining';
import { panelParts } from '../../src/designer/fabrication';
import {
  annotationLabel,
  annotationLength,
  newAnnotation,
} from '../../src/designer/annotations';
import { planAndElevationsDxf, planDxf } from '../../src/designer/fabrication';
import { roomEdges } from '../../src/designer/room';
import {
  drawingPackageHtml,
  drawingOptionsSchema,
} from '../../src/designer/drawing-package';
const drawingOptions = () =>
  drawingOptionsSchema.parse({
    company: 'Dealer',
    client: 'Client',
    reference: 'JOB-1',
    revision: 'A',
    preparedBy: 'Designer',
    date: '2026-09-16',
    purpose: 'Dealer review',
    unit: 'in',
    scale: 50,
    notes: '',
  });
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

test('backsplash follows opposite wall runs and retains window cutouts', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('custom_cabinet'), x: 10, y: 0 },
    { ...fromObject('custom_cabinet'), x: 60, y: 96, rotation: 180 },
    {
      ...fromObject('window'),
      x: 15,
      y: 0,
      width: 20,
      elevation: 44,
      wall: 'north',
      wallSegment: 0,
    },
  ];
  const runs = backsplashRuns(d);
  assert.equal(runs.length, 2);
  assert.equal(runs[0]?.holes.length, 1);
  assert.ok(Math.abs(Math.abs(runs[1]?.rotation ?? 0) - Math.PI) < 0.001);
});
test('presentation cameras, room-boundary walking and open-front conflict checks', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('custom_cabinet'), x: 0, y: 0 },
    { ...fromObject('custom_cabinet'), x: 0, y: 40 },
  ];
  assert.equal(presentationViews(d).length, 5);
  assert.deepEqual(walkPosition(d, 60, 80), [60, 64, 80]);
  assert.equal(walkPosition(d, -1, 80), null);
  assert.equal(openingConflicts(d, 0).length, 0);
  assert.ok(openingConflicts(d, 100, d.items[0]?.id).length > 0);
  assert.doesNotThrow(() =>
    parseDesign(JSON.stringify({ ...d, views: presentationViews(d) })),
  );
});

test('walk navigation avoids rotated solids while leaving partition doorways passable', () => {
  const d = newDesign();
  const wall = {
    ...fromObject('partition'),
    x: 20,
    y: 70,
    width: 100,
    depth: 4,
    height: 96,
  };
  d.items = [
    wall,
    {
      ...fromObject('door'),
      opening: { hostId: wall.id, offset: 34, sill: 0 },
      elevation: 0,
      width: 32,
      height: 80,
    },
  ];
  assert.equal(walkPosition(d, 30, 72), null);
  assert.deepEqual(walkPosition(d, 70, 72), [70, 64, 72]);
  d.items.push({
    ...fromObject('custom_cabinet'),
    x: 60,
    y: 100,
    rotation: 45,
  });
  assert.equal(walkPosition(d, 75, 115), null);
  assert.ok(walkEntry(d));
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      x: 0,
      y: 0,
      width: d.room.width,
      depth: d.room.depth,
      height: 90,
    },
  ];
  assert.equal(walkEntry(d), null);
});
test('material previews preserve layout, camera and lighting without mutating the original', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('custom_cabinet'), finish: 'oak' },
    fromObject('countertop'),
  ];
  d.views = presentationViews(d);
  const json = JSON.stringify(d),
    variant = materialVariant(d, 'dark');
  assert.equal(variant.items[0]?.finish, 'slate');
  assert.equal(variant.items[1]?.countertop, 'marble');
  assert.deepEqual(variant.views, d.views);
  assert.equal(variant.items[0]?.x, d.items[0]?.x);
  assert.equal(JSON.stringify(d), json);
  assert.equal(materialVariant(d, 'original'), d);
});
test('a selection band takes what it touches, and leaves hidden items and wall openings behind', () => {
  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  const run = [0, 24, 48].map((x, n) => ({
    ...fromObject('custom_cabinet'),
    id: `run-${n}`,
    x,
    y: 0,
    width: 24,
    depth: 24,
  }));
  d.items = [
    ...run,
    { ...fromObject('custom_cabinet'), id: 'far', x: 100, y: 80 },
    { ...fromObject('custom_cabinet'), id: 'unseen', x: 0, y: 0, hidden: true },
    {
      ...fromObject('window'),
      id: 'glass',
      x: 0,
      y: 0,
      wall: 'north' as const,
    },
  ];
  // A band that only clips the first two cabinets takes exactly those two: it
  // touches the second rather than enclosing it, and never reaches the third.
  assert.deepEqual(
    marqueeSelection(d, { x: -5, y: -5, width: 35, depth: 30 }),
    ['run-0', 'run-1'],
  );
  // The same band over the whole wall still refuses the window and the item
  // that is not on screen.
  assert.deepEqual(
    marqueeSelection(d, { x: -5, y: -5, width: 140, depth: 30 }),
    ['run-0', 'run-1', 'run-2'],
  );
  assert.deepEqual(
    marqueeSelection(d, { x: 200, y: 200, width: 10, depth: 10 }),
    [],
  );
});
test('a turned selection keeps its arrangement and stays one run', () => {
  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  d.items = [0, 24].map((x, n) => ({
    ...fromObject('custom_cabinet'),
    id: `run-${n}`,
    x: x + 12,
    y: 12,
    width: 24,
    depth: 24,
    wall: 'north' as const,
  }));
  const turned = previewEverydayEdit(d, ['run-0', 'run-1'], {
    kind: 'rotate',
    degrees: 90,
  }).design;
  const [a, b] = turned.items;
  assert.ok(a && b);
  // Turning each cabinet about its own centre would leave both at the same
  // place; turning the pair about their shared centre stacks them instead,
  // and the run keeps its length in the other direction.
  assert.equal(a.rotation, 90);
  assert.equal(b.rotation, 90);
  assert.equal(a.x, b.x);
  assert.equal(Math.abs(a.y - b.y), 24);
  assert.equal(a.wall, null);
  // A half turn applied twice is a full circle: the pair comes back exactly
  // where it started, which a per-item rotation would not do.
  let back = d;
  for (let turn = 0; turn < 2; turn++)
    back = previewEverydayEdit(back, ['run-0', 'run-1'], {
      kind: 'rotate',
      degrees: 180,
    }).design;
  assert.deepEqual(
    back.items.map((i) => [i.id, i.x, i.y, i.rotation]),
    [
      ['run-0', 12, 12, 0],
      ['run-1', 36, 12, 0],
    ],
  );
  assert.throws(
    () =>
      previewEverydayEdit(d, ['run-0', 'run-1'], {
        kind: 'rotate',
        degrees: 45,
      }),
    /90, 180 or 270/,
  );
});
test('deleting a selection takes its linked parts and refuses a locked member', () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      id: 'base',
      x: 0,
      y: 0,
      assemblyId: 'pair',
    },
    {
      ...fromObject('countertop'),
      id: 'top',
      x: 0,
      y: 0,
      elevation: 34.5,
      assemblyId: 'pair',
    },
    { ...fromObject('custom_cabinet'), id: 'other', x: 60, y: 0 },
  ];
  // The countertop was never selected, but it belongs to the cabinet, so it
  // goes with it rather than being left floating.
  const removed = previewEverydayEdit(d, ['base'], { kind: 'delete' });
  assert.deepEqual(
    removed.design.items.map((i) => i.id),
    ['other'],
  );
  assert.equal(removed.addedItems, -2);
  const top = d.items[1];
  assert.ok(top);
  d.items[1] = { ...top, locked: true };
  assert.throws(
    () => previewEverydayEdit(d, ['base'], { kind: 'delete' }),
    /Unlock/,
  );
});
test('spacing reports the floor between facing runs and the work centres', () => {
  const d = newDesign();
  d.room = {
    width: 180,
    depth: 144,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  const base = (id: string, x: number, y: number) => ({
    ...fromObject('custom_cabinet'),
    id,
    x,
    y,
    width: 36,
    depth: 24,
    height: 34.5,
  });
  // Two runs facing each other across 30 inches of floor.
  d.items = [base('north-run', 20, 0), base('south-run', 20, 54)];
  const tight = spacingFindings(d);
  assert.equal(tight.length, 1);
  assert.equal(tight[0]?.kind, 'aisle');
  assert.equal(tight[0]?.measured, 30);
  assert.deepEqual(tight[0]?.itemIds.sort(), ['north-run', 'south-run']);
  assert.match(tight[0]?.message ?? '', /30" of floor/);

  // Pulling them apart past the setting clears it.
  d.items[1] = { ...base('south-run', 20, 66) };
  assert.deepEqual(spacingFindings(d), []);

  // A corner touch is not two runs facing each other, however close.
  d.items = [base('along-north', 0, 0), base('along-west', 40, 26)];
  assert.deepEqual(spacingFindings(d), []);

  // Two cabinets shoulder to shoulder in one run leave the same measurable
  // gap, but nobody stands in it: that is a filler to order, not an aisle.
  d.items = [base('run-left', 0, 0), base('run-right', 38, 0)];
  assert.deepEqual(spacingFindings(d), []);

  // The same two turned to face each other across that gap is an aisle.
  // Rotation 270 faces +x and 90 faces -x, so this pair opens onto the gap
  // while the back-to-back pair below does not.
  d.items = [
    { ...base('faces-east', 0, 0), rotation: 270 },
    { ...base('faces-west', 38, 0), rotation: 90 },
  ];
  assert.equal(spacingFindings(d).length, 1);
  d.items = [
    { ...base('backs-west', 0, 0), rotation: 90 },
    { ...base('backs-east', 38, 0), rotation: 270 },
  ];
  assert.deepEqual(spacingFindings(d), []);

  // The setting is what it is compared against, so a project that works to
  // a narrower aisle reports nothing.
  d.items = [base('north-run', 20, 0), base('south-run', 20, 54)];
  assert.deepEqual(spacingFindings(d, { ...defaultSpacing, aisle: 30 }), []);
});
test('work centres are measured only when all three are present', () => {
  const d = newDesign();
  d.room = {
    width: 240,
    depth: 200,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  const sink = { ...fromObject('sink'), id: 'sink', x: 0, y: 0 };
  const range = { ...fromObject('range'), id: 'range', x: 150, y: 0 };
  d.items = [sink, range];
  assert.deepEqual(
    spacingFindings(d).filter((f) => f.kind === 'triangle'),
    [],
  );

  // Placed far apart on purpose: the legs and the total both exceed the
  // settings, and each one says what it measured against what it was given.
  d.items = [
    sink,
    range,
    { ...fromObject('refrigerator'), id: 'fridge', x: 0, y: 150 },
  ];
  const legs = spacingFindings(d).filter((f) => f.kind === 'triangle');
  assert.ok(legs.length >= 2);
  const total = legs.find((f) => f.id === 'triangle-total');
  assert.ok(total);
  assert.ok(total.measured > 312);
  assert.equal(total.required, 312);
  assert.deepEqual(total.itemIds.sort(), ['fridge', 'range', 'sink']);
});
test('annotations measure themselves, defer to typed text and reach the drawing', () => {
  const d = newDesign();
  const dimension = newAnnotation(
    'dimension',
    { x: 10, y: 10 },
    { x: 46.375, y: 10 },
  );
  const note = newAnnotation('note', { x: 20, y: 40 });
  d.annotations = [dimension, note];

  // Nothing typed, so the dimension says what it measures, to the eighth.
  assert.equal(annotationLength(dimension), 36.375);
  assert.equal(annotationLabel(dimension), '36-3/8"');
  assert.equal(annotationLabel(note), '');

  // Typed text replaces the measurement rather than joining it: someone who
  // writes "verify on site" means that instead.
  assert.equal(
    annotationLabel({ ...dimension, text: 'Verify on site' }),
    'Verify on site',
  );
  assert.equal(annotationLength(note), 0);

  // They survive the round trip the app saves through.
  const restored = parseDesign(JSON.stringify(d));
  assert.equal(restored.annotations?.length, 2);
  assert.equal(restored.annotations?.[0]?.x2, 46.375);

  // And they are drawn on the plan sheet, not only on screen.
  d.annotations = [{ ...note, text: 'Verify riser before install' }];
  d.items = [{ ...fromObject('custom_cabinet'), id: 'c1', x: 0, y: 0 }];
  const html = drawingPackageHtml(d, drawingOptions());
  assert.ok(html.includes('Verify riser before install'));
});
test('the drawing DXF carries the plan, every straight elevation and the notes', () => {
  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      id: 'base',
      sku: 'B24',
      x: 12,
      y: 0,
      width: 24,
      depth: 24,
      height: 34.5,
    },
    {
      ...fromObject('custom_cabinet'),
      id: 'wall',
      sku: 'W3030',
      x: 12,
      y: 0,
      width: 30,
      depth: 12,
      height: 30,
      elevation: 54,
    },
  ];
  d.annotations = [
    { ...newAnnotation('note', { x: 30, y: 60 }), text: 'Verify riser' },
  ];
  const dxf = planAndElevationsDxf(d);

  // A real DXF, with one elevation frame per straight wall.
  assert.ok(dxf.startsWith('0\nSECTION'));
  assert.ok(dxf.trimEnd().endsWith('EOF'));
  const walls = roomEdges(d.room).filter((e) => !e.curved).length;
  assert.equal([...dxf.matchAll(/WALL \d+ ELEVATION/g)].length, walls);

  // Both items appear in the plan and again in an elevation, and the note
  // travels with the drawing.
  assert.ok(dxf.includes('B24'));
  assert.ok(dxf.includes('W3030'));
  assert.ok(dxf.includes('Verify riser'));

  // It is a millimetre file, and says so in the header, so the numbers in
  // it have to be millimetres: a 96 inch room is 2438.4, not 96.
  assert.ok(dxf.includes('2438.400'));
  d.annotations = [
    newAnnotation('dimension', { x: 0, y: 60 }, { x: 36, y: 60 }),
  ];
  assert.ok(planAndElevationsDxf(d).includes('914 mm'));

  // The plan-only export stays what it was.
  assert.ok(!planDxf(d).includes('WALL 1 ELEVATION'));
});
