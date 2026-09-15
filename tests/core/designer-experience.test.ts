import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fromObject,
  newDesign,
  footprint,
  localToWorld,
  designSchema,
} from '../../src/designer/model';
import { smartPlace, bestCamera } from '../../src/designer/experience';
import { openingConflicts } from '../../src/designer/render-planning';
test('upper alignment preserves height and moves linked parts', () => {
  const base = { ...fromObject('custom_cabinet'), x: 30, y: 0, width: 30 },
    upper = {
      ...fromObject('custom_cabinet'),
      x: 40,
      y: 0,
      width: 24,
      depth: 12,
      elevation: 54,
      height: 30,
      assemblyId: 'upper',
    },
    trim = {
      ...fromObject('trim'),
      x: 64,
      y: 0,
      elevation: 54,
      assemblyId: 'upper',
    };
  const d = { ...newDesign(), items: [base, upper, trim] },
    next = smartPlace(d, upper.id, 'upper');
  assert.equal(next.items[1]?.x, 33);
  assert.equal(next.items[1]?.elevation, 54);
  assert.equal(next.items[2]?.x, 57);
  assert.equal(d.items[1]?.x, 40);
  assert.throws(
    () =>
      smartPlace(
        { ...d, items: [base, { ...upper, locked: true }, trim] },
        upper.id,
        'upper',
      ),
    /Unlock/,
  );
});
test('appliance fronts align in rotated rooms and reject new collisions', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const base = { ...fromObject('custom_cabinet'), x: 20, y: 20, rotation };
    const appliance = { ...fromObject('dishwasher'), x: 80, y: 80, rotation };
    const d = { ...newDesign(), items: [base, appliance] },
      next = smartPlace(d, appliance.id, 'appliance');
    const bf = localToWorld(base, base.width / 2, base.depth),
      af = localToWorld(
        next.items[1] ?? appliance,
        appliance.width / 2,
        appliance.depth,
      );
    assert.ok(
      Math.abs(rotation % 180 === 0 ? bf.y - af.y : bf.x - af.x) < 0.001,
    );
    assert.doesNotThrow(() => designSchema.parse(next));
  }
  const base = { ...fromObject('custom_cabinet'), x: 0, y: 0 },
    a = { ...fromObject('dishwasher'), x: 0, y: 60 };
  assert.throws(
    () => smartPlace({ ...newDesign(), items: [base, a] }, a.id, 'appliance'),
    /overlap/,
  );
});
test('sink centers under a window only when a compatible worktop fits', () => {
  const top = {
      ...fromObject('countertop'),
      width: 90,
      depth: 26,
      x: 10,
      y: 0,
      elevation: 34.5,
    },
    sink = { ...fromObject('sink'), x: 30, y: 5 },
    window = { ...fromObject('window'), width: 36, x: 42, y: 0 };
  const d = { ...newDesign(), items: [top, sink, window] },
    next = smartPlace(d, sink.id, 'sink'),
    placed = next.items[1];
  assert.ok(placed);
  assert.equal(placed.x + footprint(placed).width / 2, 60);
  assert.equal(placed.sinkMount?.hostId, top.id);
  assert.throws(
    () =>
      smartPlace(
        { ...d, items: [{ ...top, width: 20 }, sink, window] },
        sink.id,
        'sink',
      ),
    /No surface/,
  );
});
test('composition faces cabinet runs and refrigerator opening reports obstacles', () => {
  const cabinet = { ...fromObject('custom_cabinet'), x: 60, y: 60 },
    d = { ...newDesign(), items: [cabinet] },
    view = bestCamera(d),
    turned = bestCamera({ ...d, items: [{ ...cabinet, rotation: 180 }] });
  assert.ok(view.position[2] > view.target[2]);
  assert.ok(turned.position[2] < turned.target[2]);
  assert.ok(bestCamera(newDesign()).position.every(Number.isFinite));
  const fridge = {
      ...fromObject('refrigerator'),
      x: 40,
      y: 0,
      refrigeratorStyle: 'double' as const,
    },
    block = { ...fromObject('custom_cabinet'), x: 40, y: fridge.depth + 4 };
  assert.equal(
    openingConflicts({ ...newDesign(), items: [fridge, block] }, 0, fridge.id)
      .length,
    0,
  );
  assert.ok(
    openingConflicts({ ...newDesign(), items: [fridge, block] }, 100, fridge.id)
      .length > 0,
  );
});
