import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromObject,
  designSchema,
  warnings,
} from '../../src/designer/model';
import {
  switchLayout,
  completeRuns,
  appliancePackage,
  cornerOption,
} from '../../src/designer/kitchen-actions';
import { setupKitchen } from '../../src/designer/setup';
test('layout changes preserve the room, openings and design identity', () => {
  const d = setupKitchen(192, 180, 96, 'L-shaped', [
    { kind: 'door', wall: 'south', offset: 48, width: 36 },
  ]);
  const next = switchLayout(d, 'U-shaped');
  assert.deepEqual(next.room, d.room);
  assert.equal(next.id, d.id);
  assert.deepEqual(
    next.items.filter((i) => i.kind === 'door'),
    d.items.filter((i) => i.kind === 'door'),
  );
  assert.ok(next.items.length > d.items.length);
  assert.doesNotThrow(() => designSchema.parse(next));
});
test('cabinet completion adds only exposed parts and is repeatable without duplicates', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('custom_cabinet'), x: 12, width: 30 },
    { ...fromObject('custom_cabinet'), x: 42, width: 30 },
  ];
  const ids = d.items.map((i) => i.id),
    next = completeRuns(d, ids);
  assert.equal(next.items.filter((i) => i.kind === 'countertop').length, 2);
  assert.equal(next.items.filter((i) => i.kind === 'trim').length, 2);
  assert.equal(next.items[0]?.details?.toeKick, 4);
  assert.equal(completeRuns(next, ids).items.length, next.items.length);
  assert.equal(d.items.length, 2);
  assert.equal(
    warnings(next).filter((i) => i.id.startsWith('overlap-')).length,
    0,
  );
});
test('appliance package contains all five types and failures leave the input unchanged', () => {
  const d = newDesign();
  d.room.width = 192;
  d.room.depth = 180;
  const before = JSON.stringify(d),
    next = appliancePackage(d);
  for (const kind of ['refrigerator', 'range', 'hood', 'dishwasher', 'sink'])
    assert.equal(next.items.filter((i) => i.kind === kind).length, 1);
  assert.doesNotThrow(() => designSchema.parse(next));
  assert.equal(JSON.stringify(d), before);
  assert.throws(() => appliancePackage(next));
  assert.equal(
    warnings(next).filter((i) => i.id.startsWith('overlap-')).length,
    0,
  );
  const tiny = newDesign();
  tiny.room.width = 48;
  tiny.room.depth = 48;
  assert.throws(() => appliancePackage(tiny));
  assert.equal(tiny.items.length, 0);
});
test('corner options reserve their footprint and refuse occupied corners', () => {
  const d = newDesign();
  const next = cornerOption(d, 'blind_left', 'NE');
  assert.equal(next.items[0]?.rotation, 90);
  assert.equal(next.items[0]?.details?.corner, 'blind_left');
  assert.throws(() => cornerOption(next, 'diagonal', 'NE'));
  assert.doesNotThrow(() => designSchema.parse(next));
});
