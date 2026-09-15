import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fromObject,
  newDesign,
  placementCollision,
} from '../../src/designer/model';
import { sampleKitchen } from '../../src/designer/demo-gallery';
import { layoutAlternatives } from '../../src/designer/layout-alternatives';
import {
  parsePriceBook,
  priceRequest,
  supplierQuote,
} from '../../src/designer/supplier-pricing';

test('alternatives preserve inventory, locked fixtures and dimensions with distinct nonoverlapping arrangements', () => {
  const a = { ...fromObject('custom_cabinet'), x: 12, y: 0 },
    b = { ...fromObject('custom_cabinet'), x: 60, y: 0 },
    fixed = { ...fromObject('refrigerator'), x: 100, y: 80, locked: true };
  const d = { ...newDesign(), items: [a, b, fixed] },
    original = JSON.stringify(d);
  const alternatives = layoutAlternatives(d);
  assert.equal(alternatives.length, 3);
  assert.equal(JSON.stringify(d), original);
  assert.equal(
    new Set(alternatives.map((o) => JSON.stringify(o.design.items))).size,
    3,
  );
  for (const option of alternatives) {
    assert.deepEqual(
      option.design.items.find((i) => i.id === fixed.id),
      fixed,
    );
    assert.deepEqual(
      option.design.items.map((i) => [i.id, i.sku, i.width, i.depth, i.height]),
      d.items.map((i) => [i.id, i.sku, i.width, i.depth, i.height]),
    );
    for (const i of option.design.items)
      for (const other of option.design.items)
        if (i.id !== other.id)
          assert.equal(placementCollision(i, other), false);
  }
});
test('locked assemblies cannot be rearranged and infeasible rooms return a useful failure', () => {
  const a = { ...fromObject('custom_cabinet'), assemblyId: 'assembly' },
    b = { ...fromObject('countertop'), assemblyId: 'assembly', locked: true };
  assert.throws(
    () => layoutAlternatives({ ...newDesign(), items: [a, b] }),
    /unlocked/,
  );
  assert.throws(
    () =>
      layoutAlternatives({
        ...newDesign(),
        room: { ...newDesign().room, width: 36, depth: 36, outline: [] },
        items: [{ ...a, width: 100 }],
      }),
    /No different layout/,
  );
});
test('supplier quotes use exact variants and reject missing, expired and duplicate prices', () => {
  const item = {
    ...fromObject('custom_cabinet'),
    sku: 'B24',
    finish: 'linen' as const,
  };
  const design = {
    ...newDesign(),
    items: [item, { ...item, id: 'two' }],
    quote: {
      customer: 'Test',
      tax: 10,
      discount: 5,
      installation: 100,
      delivery: 25,
    },
  };
  const line = {
    sku: 'B24',
    finish: 'linen',
    width: item.width,
    depth: item.depth,
    height: item.height,
    unitPrice: 123.45,
  };
  const book = parsePriceBook(
    JSON.stringify({
      supplier: 'Test supplier',
      reference: 'QA fixture',
      currency: 'USD',
      validUntil: '2030-01-01',
      lines: [line],
    }),
  );
  const now = Date.parse('2029-01-01');
  const quote = supplierQuote(design, book, now);
  assert.equal(quote.subtotal, 24690);
  assert.equal(quote.total, 38301);
  assert.equal(
    supplierQuote(design, book, Date.parse('2030-01-02')).total,
    null,
  );
  assert.equal(
    supplierQuote(
      { ...design, items: [{ ...item, width: item.width + 1 }] },
      book,
      now,
    ).total,
    null,
  );
  assert.equal(
    supplierQuote({ ...design, items: [{ ...item, finish: 'oak' }] }, book, now)
      .total,
    null,
  );
  assert.throws(
    () => parsePriceBook(JSON.stringify({ ...book, lines: [line, line] })),
    /Duplicate/,
  );
  assert.throws(() =>
    parsePriceBook(
      JSON.stringify({ ...book, lines: [{ ...line, unitPrice: -1 }] }),
    ),
  );
  assert.throws(() =>
    parsePriceBook(JSON.stringify({ ...book, validUntil: '2030-02-30' })),
  );
  assert.equal(priceRequest(design).lines.length, 1);
  assert.equal(priceRequest(design).lines[0]?.unitPrice, null);
});

test('family kitchen alternatives accommodate worktop overhangs without dropping parts', () => {
  const design = sampleKitchen('family'),
    options = layoutAlternatives(design);
  assert.ok(options.length > 0);
  for (const option of options)
    assert.deepEqual(
      option.design.items.map((i) => i.id),
      design.items.map((i) => i.id),
    );
});
