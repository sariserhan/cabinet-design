import test from 'node:test';
import assert from 'node:assert/strict';
import { setupKitchen } from '../../src/designer/setup';
import {
  alignUpper,
  fillerSuggestions,
} from '../../src/designer/placement-assist';
import {
  newDesign,
  fromObject,
  designSchema,
  warnings,
} from '../../src/designer/model';
import { zipFiles } from '../../src/designer/presentation-bundle';
import { snapPlacement } from '../../src/designer/editing';
test('guided layouts round-trip and keep cabinets inside a room without overlaps', () => {
  for (const layout of ['L-shaped', 'U-shaped', 'Island', 'empty']) {
    const d = setupKitchen(192, 180, 96, layout, [
      { kind: 'door', wall: 'south', offset: 48, width: 36 },
      { kind: 'window', wall: 'north', offset: 72, width: 48 },
    ]);
    assert.doesNotThrow(() => designSchema.parse(d));
    assert.equal(
      warnings(d).filter((i) => /^(overlap|outside|ceiling)-/.test(i.id))
        .length,
      0,
    );
    if (layout !== 'empty') assert.ok(d.items.length > 2);
  }
  assert.throws(() => setupKitchen(120, 120, 96, 'Island', []));
});
test('opening offsets are measured consistently on all four walls', () => {
  for (const wall of ['north', 'east', 'south', 'west'] as const) {
    const d = setupKitchen(192, 180, 96, 'empty', [
      { kind: 'door', wall, offset: 48, width: 36 },
    ]);
    const door = d.items[0];
    assert.ok(door);
    assert.equal(wall === 'north' || wall === 'south' ? door.x : door.y, 48);
  }
});
test('fillers close narrow straight-run gaps and are not suggested twice', () => {
  const d = newDesign();
  d.items = [
    { ...fromObject('custom_cabinet'), x: 0, width: 30 },
    { ...fromObject('custom_cabinet'), x: 33, width: 30 },
  ];
  const suggestions = fillerSuggestions(d);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.width, 3);
  d.items.push(...suggestions);
  assert.equal(fillerSuggestions(d).length, 0);
});
test('upper alignment and snapping use base cabinets across elevations', () => {
  const d = newDesign(),
    base = { ...fromObject('custom_cabinet'), x: 30, width: 30 },
    upper = {
      ...fromObject('custom_cabinet'),
      x: 32,
      width: 30,
      depth: 12,
      elevation: 54,
    };
  d.items = [base, upper];
  assert.equal(alignUpper(d, upper.id).items[1]?.x, 30);
  assert.equal(snapPlacement(upper, d, 32, 0, true).x, 30);
});
test('presentation ZIP includes valid stored records and CRC for UTF-8 file names', () => {
  const data = new TextEncoder().encode('123456789'),
    zip = zipFiles([{ name: 'quote-é.csv', data }]),
    view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  assert.equal(view.getUint16(12, true), 33);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 12, true), 1);
});
