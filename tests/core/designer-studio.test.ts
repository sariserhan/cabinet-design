import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleKitchen,
  isPreparedSample,
} from '../../src/designer/demo-gallery';
import {
  designSchema,
  fromObject,
  newDesign,
  localToWorld,
  sinkHoles,
  warnings,
} from '../../src/designer/model';
import {
  lockViolation,
  resizeFromPoint,
  connectCountertops,
  overhang,
  elevationRows,
  readiness,
} from '../../src/designer/studio-tools';
import { materialVariant } from '../../src/designer/render-planning';
import { quoteTotals } from '../../src/designer/quote';
test('three sample stories are valid, complete and have four camera views', () => {
  for (const key of ['apartment', 'family', 'premium'] as const) {
    const d = sampleKitchen(key);
    assert.doesNotThrow(() => designSchema.parse(d));
    assert.equal(d.views?.length, 4);
    for (const kind of ['range', 'hood', 'refrigerator', 'dishwasher', 'sink'])
      assert.ok(d.items.some((i) => i.kind === kind));
    assert.ok(isPreparedSample(d));
    assert.equal(
      warnings(d).filter((w) => /^(outside|overlap|ceiling)-/.test(w.id))
        .length,
      0,
    );
    assert.ok(quoteTotals(d).total > 0);
    assert.equal(isPreparedSample(materialVariant(d, 'white')), false);
  }
});
test('locked geometry rejects movement and deletion while allowing notes and visibility', () => {
  const d = newDesign();
  const item = { ...fromObject('custom_cabinet'), locked: true };
  d.items = [item];
  assert.ok(lockViolation(d, { ...d, items: [{ ...item, x: 30 }] }));
  assert.ok(lockViolation(d, { ...d, items: [] }));
  assert.equal(
    lockViolation(d, {
      ...d,
      items: [{ ...item, note: 'Review', hidden: true }],
    }),
    null,
  );
});
test('drag resize preserves the opposite corner for rotated cabinets', () => {
  const item = { ...fromObject('custom_cabinet'), x: 40, y: 50, rotation: 90 };
  const p = localToWorld(item, 40, 30),
    patch = resizeFromPoint(item, p.x, p.y),
    before = localToWorld(item, 0, 0),
    after = localToWorld({ ...item, ...patch }, 0, 0);
  assert.equal(patch.width, 40);
  assert.equal(patch.depth, 30);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 0.001);
});
test('connected countertops retain a sink opening and receive assembly overhangs', () => {
  const d = newDesign(),
    group = 'g';
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      width: 60,
      x: 10,
      y: 10,
      assemblyId: group,
    },
    {
      ...fromObject('countertop'),
      width: 30,
      depth: 24,
      x: 10,
      y: 10,
      assemblyId: group,
    },
    {
      ...fromObject('countertop'),
      width: 30,
      depth: 24,
      x: 40,
      y: 10,
      assemblyId: group,
    },
    { ...fromObject('sink'), x: 24, y: 12, width: 30, depth: 20 },
  ];
  const ids = d.items.filter((i) => i.kind === 'countertop').map((i) => i.id),
    next = connectCountertops(d, ids),
    top = next.items.find((i) => i.kind === 'countertop');
  assert.ok(top);
  assert.equal(top.width, 60);
  assert.equal(sinkHoles(top, next.items).length, 1);
  const expanded = overhang(next, top.id, 2).items.find((i) => i.id === top.id);
  assert.equal(expanded?.width, 64);
  assert.equal(expanded?.depth, 28);
});
test('finish and stone changes affect demo totals, explicit prices remain fixed', () => {
  const d = newDesign();
  d.items = [fromObject('custom_cabinet'), fromObject('countertop')];
  const light = materialVariant(d, 'white'),
    dark = materialVariant(d, 'dark');
  assert.ok(quoteTotals(dark).total > quoteTotals(light).total);
  const fixed = {
    ...d,
    items: [{ ...fromObject('custom_cabinet'), demoPrice: 123 }],
  };
  assert.equal(quoteTotals(materialVariant(fixed, 'dark')).total, 12300);
});
test('elevations omit hidden objects while readiness retains missing-appliance and note flags', () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      hidden: true,
      note: 'Confirm measurement',
    },
  ];
  assert.equal(elevationRows(d, 0).length, 0);
  assert.ok(readiness(d).some((i) => i.id.startsWith('missing-')));
  assert.ok(
    readiness(d).some((i) => i.message.includes('Confirm measurement')),
  );
});

test('each sample has two alternatives with distinct demo totals', () => {
  for (const key of ['apartment', 'family', 'premium'] as const) {
    const d = sampleKitchen(key);
    const alternatives =
      key === 'apartment'
        ? ['oak', 'dark']
        : key === 'premium'
          ? ['white', 'oak']
          : ['white', 'dark'];
    const totals = [
      quoteTotals(d).total,
      ...alternatives.map((v) => quoteTotals(materialVariant(d, v)).total),
    ];
    assert.equal(new Set(totals).size, 3);
  }
});
