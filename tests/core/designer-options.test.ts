import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objectOptions,
  fromObject,
  objectOptionPatch,
  designSchema,
  newDesign,
} from '../../src/designer/model';
import { parseDrop } from '../../src/designer/drop';
import { quoteTotals } from '../../src/designer/quote';

test('every object option survives validated design serialization and drag payloads', () => {
  for (const option of objectOptions) {
    const item = fromObject(option.kind, option.id);
    const d = designSchema.parse(
      JSON.parse(JSON.stringify({ ...newDesign(), items: [item] })),
    );
    assert.equal(d.items[0]?.sku, option.name);
    for (const [key, value] of Object.entries(option.patch))
      assert.deepEqual(item[key as keyof typeof item], value);
    assert.equal(
      parseDrop(
        JSON.stringify({
          kind: 'object',
          object: option.kind,
          option: option.id,
        }),
      )?.kind,
      'object',
    );
  }
  assert.equal(
    parseDrop(
      JSON.stringify({ kind: 'object', object: 'door', option: 'sink-double' }),
    ),
    null,
  );
});
test('sink changes preserve rim elevation, including farmhouse and prep bowls', () => {
  for (const style of ['single', 'double', 'farmhouse', 'prep']) {
    const sink = fromObject('sink', 'sink-' + style);
    assert.equal(sink.elevation + sink.height, 36);
    const next = { ...sink, ...objectOptionPatch(sink, 'sink-farmhouse') };
    assert.equal(next.elevation + next.height, 36);
  }
});
test('refrigerator, sink and island options affect demo allowances', () => {
  const total = (kind: 'sink' | 'refrigerator' | 'island', id: string) =>
    quoteTotals({ ...newDesign(), items: [fromObject(kind, id)] }).total;
  assert.ok(
    total('refrigerator', 'fridge-french') >
      total('refrigerator', 'fridge-single'),
  );
  assert.ok(total('sink', 'sink-farmhouse') > total('sink', 'sink-prep'));
  assert.ok(total('island', 'island-96') > total('island', 'island-48'));
});
test('flooring and backsplash choices persist while legacy scenes remain valid', () => {
  for (const flooring of ['oak', 'walnut', 'tile', 'slate'])
    for (const backsplash of ['none', 'subway', 'slab', 'mosaic', 'stacked']) {
      const d = designSchema.parse({
        ...newDesign(),
        appearance: {
          flooring,
          backsplash,
          countertop: 'quartz',
          lighting: 'daylight',
        },
      });
      assert.equal(d.appearance?.flooring, flooring);
    }
  assert.doesNotThrow(() => designSchema.parse(newDesign()));
});
