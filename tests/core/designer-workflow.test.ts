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
  annotationAngle,
  onLayer,
  newAnnotation,
} from '../../src/designer/annotations';
import { planAndElevationsDxf, planDxf } from '../../src/designer/fabrication';
import { roomEdges } from '../../src/designer/room';
import {
  drawingPackageHtml,
  drawingOptionsSchema,
} from '../../src/designer/drawing-package';
import { trimRunItems, applyTrimRuns } from '../../src/designer/trim-runs';
import {
  jobsFrom,
  roomsInJob,
  jobTotals,
  jobItemList,
} from '../../src/designer/job-rooms';
import { quoteTotals } from '../../src/designer/quote';
import {
  itemDimensionText,
  designDimensionSummary,
  allAxes,
} from '../../src/designer/dimension-overlay';
import {
  toDisplay,
  fromDisplay,
  lengthLabel,
  unitsOf,
} from '../../src/designer/units';
import { readPlanDxf, applyImportedPlan } from '../../src/designer/plan-import';
import { designSchema } from '../../src/designer/model';
import { servicePoints } from '../../src/designer/services';
import { drawingConfiguration } from '../../src/designer/drawing-package';
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
test('trim follows a run, breaks at a gap and mitres at a corner', () => {
  const d = newDesign();
  d.room = {
    width: 180,
    depth: 150,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  const wall = (id: string, x: number, y: number, w: number, rotation = 0) => ({
    ...fromObject('custom_cabinet'),
    id,
    sku: id,
    x,
    y,
    width: w,
    depth: 12,
    height: 30,
    elevation: 54,
    rotation,
  });
  // Three cabinets meeting end to end, and a fourth on its own.
  d.items = [
    wall('a', 0, 0, 30),
    wall('b', 30, 0, 24),
    wall('c', 54, 0, 30),
    wall('far', 120, 0, 30),
  ];
  const crown = trimRunItems(d, 'crown');
  assert.deepEqual(
    crown.items.map((i) => i.width),
    [84, 30],
  );
  // One length for the run, not one per cabinet, and it sits on top of them.
  assert.equal(crown.items[0]?.elevation, 84);
  assert.equal(crown.mitres, 0);

  // An L: each leg reaches out by the depth of the profile to meet at the
  // corner, and that corner is one mitre rather than two.
  d.items = [
    wall('a', 0, 0, 30),
    wall('b', 30, 0, 24),
    wall('side', 0, 12, 36, 270),
  ];
  const turned = trimRunItems(d, 'crown');
  assert.deepEqual(
    turned.items.map((i) => i.width).sort((x, y) => x - y),
    [39, 57],
  );
  assert.equal(turned.mitres, 1);

  // Toe kick takes the floor cabinets instead, at the floor.
  d.items = [
    { ...wall('base', 0, 0, 36), elevation: 0, height: 34.5, depth: 24 },
  ];
  const kick = trimRunItems(d, 'toe_kick');
  assert.equal(kick.items[0]?.elevation, 0);
  assert.equal(kick.items[0]?.height, 4);
  assert.match(kick.items[0]?.sku ?? '', /^Toe kick /);
  assert.throws(() => applyTrimRuns(d, 'crown'), /wall cabinets/);

  // Running it twice replaces rather than orders it twice.
  const once = applyTrimRuns(d, 'toe_kick');
  const twice = applyTrimRuns(once, 'toe_kick');
  assert.equal(
    once.items.filter((i) => i.kind === 'toe_kick').length,
    twice.items.filter((i) => i.kind === 'toe_kick').length,
  );
  assert.equal(
    parseDesign(JSON.stringify(twice)).items.length,
    twice.items.length,
  );
});
test('a job adds up the rooms it covers without merging them', () => {
  const room = (name: string, jobId: string, skus: string[]) => {
    const d = newDesign();
    d.name = name;
    d.job = { id: jobId, name: 'Oak House', room: name };
    d.items = skus.map((sku, n) => ({
      ...fromObject('custom_cabinet'),
      id: `${name}-${n}`,
      sku,
      x: n * 30,
      y: 0,
      width: 30,
      depth: 24,
      height: 34.5,
    }));
    return d;
  };
  const kitchen = room('Kitchen', 'job-1', ['B30', 'B30', 'SB36']),
    vanity = room('Ensuite vanity', 'job-1', ['B30']),
    other = room('Someone else', 'job-2', ['B30']);
  const saved = [kitchen, vanity, other];

  assert.deepEqual(
    jobsFrom(saved)
      .map((j) => j.id)
      .sort(),
    ['job-1', 'job-2'],
  );
  const rooms = roomsInJob(saved, 'job-1');
  assert.deepEqual(
    rooms.map((r) => r.room),
    ['Ensuite vanity', 'Kitchen'],
  );
  // Another job's room is not in this one's money.
  const totals = jobTotals(rooms);
  assert.equal(totals.rooms, 2);
  assert.equal(totals.items, 4);
  assert.equal(
    totals.total,
    quoteTotals(kitchen).total + quoteTotals(vanity).total,
  );

  // The same product in two rooms is one purchase line that names both.
  const lines = jobItemList(rooms);
  const b30 = lines.find((l) => l.sku === 'B30');
  assert.ok(b30);
  assert.equal(b30.quantity, 3);
  assert.deepEqual(b30.rooms, ['Ensuite vanity', 'Kitchen']);
  assert.equal(lines.find((l) => l.sku === 'SB36')?.quantity, 1);

  // And a design still holds exactly one room, saved and restored as one.
  const restored = parseDesign(JSON.stringify(kitchen));
  assert.equal(restored.job?.room, 'Kitchen');
  assert.equal(restored.room.width, kitchen.room.width);
});
test('dimension labels name the axis unless all three are shown', () => {
  const item = {
    ...fromObject('custom_cabinet'),
    id: 'b',
    width: 24,
    depth: 24,
    height: 34.5,
  };
  assert.equal(itemDimensionText(item, allAxes), '24" × 24" × 34-1/2"');
  // One number on its own has to say which way it is measured.
  assert.equal(
    itemDimensionText(item, { x: false, y: false, z: true }),
    'H 34-1/2"',
  );
  assert.equal(
    itemDimensionText(item, { x: true, y: false, z: true }),
    'W 24" · H 34-1/2"',
  );
  assert.equal(itemDimensionText(item, { x: false, y: false, z: false }), '');

  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  d.items = [
    { ...item, id: 'a', x: 0, y: 0 },
    { ...item, id: 'c', x: 60, y: 0, height: 30, elevation: 54 },
    { ...item, id: 'hidden', x: 0, y: 80, hidden: true, width: 200 },
  ];
  const summary = designDimensionSummary(d);
  assert.equal(summary.room, 'W 144" · D 120" · H 96"');
  // The extent of what is placed, not the room, and not counting what is
  // hidden from view.
  assert.equal(summary.count, 2);
  assert.equal(summary.extent.width, 84);
  assert.equal(summary.extent.height, 84);
  assert.equal(
    designDimensionSummary(d, { x: true, y: false, z: false }).items,
    'W 84"',
  );
});
test('a project can be worked in millimetres while it is stored in inches', () => {
  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  const item = {
    ...fromObject('custom_cabinet'),
    id: 'b',
    x: 0,
    y: 0,
    width: 24,
    depth: 24,
    height: 34.5,
  };
  d.items = [item];

  // What is typed and read changes; what is stored does not.
  // Floating point, so within a thousandth of a millimetre.
  assert.ok(Math.abs(toDisplay(24, 'mm') - 609.6) < 0.001);
  assert.equal(fromDisplay(610, 'mm'), 610 / 25.4);
  assert.equal(lengthLabel(24, 'in'), '24"');
  assert.equal(lengthLabel(24, 'mm'), '610 mm');
  assert.equal(lengthLabel(34.5, 'in'), '34-1/2"');
  assert.equal(lengthLabel(34.5, 'mm'), '876 mm');

  assert.equal(itemDimensionText(item, allAxes, 'in'), '24" × 24" × 34-1/2"');
  assert.equal(
    itemDimensionText(item, allAxes, 'mm'),
    '610 mm × 610 mm × 876 mm',
  );

  d.units = 'mm';
  assert.equal(unitsOf(d), 'mm');
  assert.match(designDimensionSummary(d).room, /3658 mm/);
  const restored = parseDesign(JSON.stringify(d));
  assert.equal(restored.units, 'mm');
  // The geometry is the same design either way.
  assert.equal(restored.room.width, 144);
  assert.equal(restored.items[0]?.height, 34.5);
});
test('a DXF plan gives up its room, and says what it could not', () => {
  const dxf = (body: string, insunits = '4') =>
    [
      '0',
      'SECTION',
      '2',
      'HEADER',
      '9',
      '$INSUNITS',
      '70',
      insunits,
      '0',
      'ENDSEC',
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      body,
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
  const ring = (points: [number, number][], closed = true) =>
    [
      '0',
      'LWPOLYLINE',
      '90',
      String(points.length),
      '70',
      closed ? '1' : '0',
      ...points.flatMap(([x, y]) => ['10', String(x), '20', String(y)]),
    ].join('\n');

  // A 4000 x 3000 mm room, offset from the origin as a real plan would be.
  const room = readPlanDxf(
    dxf(
      ring([
        [1000, 2000],
        [5000, 2000],
        [5000, 5000],
        [1000, 5000],
      ]),
    ),
  );
  assert.equal(Math.round(room.width), 157);
  assert.equal(Math.round(room.depth), 118);
  assert.deepEqual(room.outline[0], { x: 0, y: 0 });
  assert.equal(room.units, 'mm');

  // The largest closed shape is the room; an island drawn inside it is not.
  const withFurniture = readPlanDxf(
    dxf(
      ring([
        [0, 0],
        [4000, 0],
        [4000, 3000],
        [0, 3000],
      ]) +
        '\n' +
        ring([
          [1000, 1000],
          [2000, 1000],
          [2000, 2000],
          [1000, 2000],
        ]),
    ),
  );
  assert.equal(Math.round(withFurniture.width), 157);
  assert.match(withFurniture.notes.join(' '), /largest was taken/);

  // Walls drawn as loose lines rather than one outline: the extent is
  // taken as the room, and the note says that is a guess. A single line
  // bounds nothing, and is refused instead.
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    [
      '0',
      'LINE',
      '10',
      String(x1),
      '20',
      String(y1),
      '11',
      String(x2),
      '21',
      String(y2),
    ].join('\n');
  const loose = readPlanDxf(
    dxf(
      [
        line(0, 0, 4000, 0),
        line(4000, 0, 4000, 3000),
        line(4000, 3000, 0, 3000),
        line(0, 3000, 0, 0),
      ].join('\n'),
    ),
  );
  assert.equal(Math.round(loose.width), 157);
  assert.equal(Math.round(loose.depth), 118);
  assert.match(loose.notes.join(' '), /No closed outline/);
  assert.throws(
    () => readPlanDxf(dxf(line(0, 0, 4000, 0))),
    /too small to be a room/,
  );

  // A file that says nothing about units is read as millimetres and says so.
  const silent = readPlanDxf(
    dxf(
      ring([
        [0, 0],
        [4000, 0],
        [4000, 3000],
        [0, 3000],
      ]),
      '0',
    ),
  );
  assert.equal(silent.units, 'unknown');
  assert.match(silent.notes.join(' '), /does not say what its units are/);

  // Refusals, rather than a room nobody can use.
  assert.throws(() => readPlanDxf('not a drawing'), /does not read as a DXF/);
  assert.throws(
    () =>
      readPlanDxf(
        dxf(
          ring([
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ]),
        ),
      ),
    /too small to be a room/,
  );
  assert.throws(
    () =>
      readPlanDxf(
        dxf(
          ring([
            [0, 0],
            [40000, 0],
            [40000, 30000],
            [0, 30000],
          ]),
        ),
      ),
    /larger than this designer holds/,
  );

  // Applying it changes the room and leaves the furniture alone.
  const d = newDesign();
  d.items = [{ ...fromObject('custom_cabinet'), id: 'keep', x: 4, y: 4 }];
  const next = applyImportedPlan(d, room);
  assert.equal(Math.round(next.room.width), 157);
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0]?.x, 4);
  assert.ok(designSchema.safeParse(next).success);
});
test('leaders, angles and layers reach the drawing they belong to', () => {
  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  d.items = [{ ...fromObject('custom_cabinet'), id: 'c', x: 0, y: 0 }];

  // A right angle between two runs reads 90, not 270: the opening, not
  // the reflex outside it.
  const corner = newAnnotation(
    'angle',
    { x: 20, y: 20 },
    { x: 60, y: 20 },
    { x: 20, y: 60 },
  );
  assert.equal(annotationAngle(corner), 90);
  assert.equal(annotationLabel(corner), '90°');
  const shallow = newAnnotation(
    'angle',
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  );
  assert.equal(annotationAngle(shallow), 45);

  // A note with a second point is a note on a leader; the label is still
  // the words, and the leader is drawn to what it points at.
  const leader = {
    ...newAnnotation('note', { x: 10, y: 10 }, { x: 40, y: 30 }),
    text: 'Verify riser',
  };
  assert.equal(annotationLabel(leader), 'Verify riser');
  assert.equal(leader.x2, 40);

  // Layers decide which issue carries which note.
  const installOnly = { ...leader, layer: 'installation' as const };
  assert.ok(onLayer(installOnly, 'installation'));
  assert.ok(onLayer(installOnly, 'all'));
  assert.ok(!onLayer(installOnly, 'client'));
  assert.ok(onLayer(corner, 'client'));

  d.annotations = [corner, installOnly];
  const everything = drawingPackageHtml(d, drawingOptions());
  assert.ok(everything.includes('Verify riser'));
  const clientIssue = drawingPackageHtml(d, {
    ...drawingOptions(),
    layer: 'client',
  });
  assert.ok(!clientIssue.includes('Verify riser'));

  // A set is composed: the plan alone is a valid issue.
  const planOnly = drawingPackageHtml(d, {
    ...drawingOptions(),
    sheets: { plan: true, upper: false, elevations: false, schedules: false },
  });
  assert.ok(planOnly.includes('P01 · Floor plan'));
  assert.ok(!planOnly.includes('W01 · Wall schedule'));
  assert.ok(everything.includes('W01 · Wall schedule'));
  assert.ok(parseDesign(JSON.stringify(d)).annotations?.length === 2);
});
test('surveyed services become points on the plan, and handing reaches the sheet', () => {
  const d = newDesign();
  d.room = {
    width: 144,
    depth: 120,
    height: 96,
    outline: [],
    walls: { north: true, south: true, east: true, west: true },
  };
  d.measurements = {
    measuredBy: 'Surveyor',
    measuredAt: '2026-09-16',
    originalUnit: 'in',
    north: 144,
    south: 144,
    east: 120,
    west: 120,
    height: 96,
    confirmed: true,
    notes: '',
    openings: [],
    utilities: [
      {
        id: 'u1',
        kind: 'drain',
        wall: 'north',
        offset: 36,
        height: 18,
        notes: 'Existing waste',
      },
      {
        id: 'u2',
        kind: 'gas',
        wall: 'east',
        offset: 24,
        height: 30,
        notes: '',
      },
    ],
  };

  const points = servicePoints(d);
  assert.equal(points.length, 2);
  const drain = points.find((p) => p.id === 'u1');
  assert.ok(drain);
  // 36 inches along the north wall, which runs left to right at y = 0.
  assert.equal(drain.x, 36);
  assert.equal(drain.y, 0);
  assert.equal(drain.mark, 'D');
  assert.equal(drain.height, 18);

  // A curved wall has no straight run to measure an offset along, so the
  // service on it is left out rather than placed somewhere plausible.
  d.room.curves = [{ wall: 0, bow: 24 }];
  const curved = servicePoints(d);
  assert.equal(curved.length, 1);
  assert.equal(curved[0]?.id, 'u2');
  delete d.room.curves;

  // They reach the sheets, with their heights in a schedule.
  d.items = [{ ...fromObject('custom_cabinet'), id: 'c', x: 0, y: 40 }];
  const html = drawingPackageHtml(d, drawingOptions());
  assert.ok(html.includes('U01 · Service schedule'));
  assert.ok(html.includes('Existing waste'));

  // Handing is an ordering attribute, and says so on the drawing.
  const hinged = {
    ...fromObject('custom_cabinet'),
    id: 'h',
    x: 0,
    y: 0,
    details: {
      shelves: 1,
      toeKick: 4,
      molding: false,
      interior: 'shelves' as const,
      hinge: 'right' as const,
      drawers: 3,
    },
  };
  const labels = drawingConfiguration(hinged);
  assert.ok(labels.includes('Hinged right'));
  assert.ok(labels.includes('3 drawers'));
});
