import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromObject,
  placementCollision,
  designSchema,
  MAX_DESIGN_ITEMS,
} from '../../src/designer/model';
import {
  fillWallRun,
  placementFeedback,
  lightingVariants,
} from '../../src/designer/demo-readiness';
test('wall runs preserve existing objects and reserve opening widths', () => {
  const d = newDesign();
  const window = { ...fromObject('window'), x: 60, width: 48, wallSegment: 0 };
  const fridge = { ...fromObject('refrigerator'), x: 140, y: 0 };
  d.items = [window, fridge];
  const snapshot = JSON.stringify(d);
  const next = fillWallRun(d, 0, false),
    added = next.items.slice(2);
  assert.ok(added.length > 0);
  assert.equal(JSON.stringify(d), snapshot);
  assert.deepEqual(next.items.slice(0, 2), d.items);
  for (const i of added) {
    assert.ok(i.x + i.width <= 59 || i.x >= 109);
    assert.ok(!placementCollision(i, fridge));
    for (const other of next.items)
      if (other.id !== i.id) assert.equal(placementCollision(i, other), false);
  }
  assert.doesNotThrow(() => designSchema.parse(next));
});
test('finished wall runs include tops and stay within the object limit', () => {
  const d = newDesign(),
    next = fillWallRun(d, 0, true);
  assert.ok(next.items.some((i) => i.kind === 'countertop'));
  assert.ok(next.items.some((i) => i.details?.toeKick === 4));
  assert.ok(next.items.length <= MAX_DESIGN_ITEMS);
  assert.throws(() => fillWallRun(d, 99));
  const full = {
    ...d,
    items: Array.from({ length: MAX_DESIGN_ITEMS }, () => fromObject('sink')),
  };
  assert.throws(() => fillWallRun(full, 0));
});
test('drag feedback distinguishes blocked positions from clear placements', () => {
  const a = { ...fromObject('custom_cabinet'), x: 10, y: 10 },
    b = { ...fromObject('refrigerator'), x: 80, y: 10 },
    d = { ...newDesign(), items: [a, b] };
  const blocked = placementFeedback(d, { ...b, x: 20 }, false, true);
  assert.equal(blocked.state, 'blocked');
  assert.match(blocked.message, /overlap/);
  assert.equal(
    placementFeedback(
      { ...newDesign(), items: [] },
      { ...fromObject('custom_cabinet'), x: 40, y: 40 },
      true,
      false,
    ).state,
    'ready',
  );
});
test('lighting comparison uses separate profiles without changing the source kitchen', () => {
  const d = {
      ...newDesign(),
      appearance: {
        countertop: 'quartz' as const,
        lighting: 'warm' as const,
        underCabinet: true,
      },
    },
    before = JSON.stringify(d),
    variants = lightingVariants(d);
  assert.equal(variants.length, 3);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(
    variants.map((v) => v.design.appearance.lightingProfile),
    ['day', 'evening', 'task'],
  );
  assert.equal(variants[0]?.design.appearance.lighting, 'daylight');
  assert.equal(variants[0]?.design.appearance.underCabinet, false);
  assert.equal(variants[2]?.design.appearance.pendants, false);
  for (const v of variants)
    assert.doesNotThrow(() => designSchema.parse(v.design));
});
