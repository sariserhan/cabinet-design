import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, type Design } from '../../src/designer/model';
import {
  priceRequest,
  parsePriceBook,
} from '../../src/designer/supplier-pricing';
import {
  approvalFromReview,
  emptyPurchasing,
  designSnapshot,
  makeChange,
  makePurchase,
  parsePurchasing,
  purchaseLines,
  purchaseChecks,
  deliverySummary,
  scopeDifference,
} from '../../src/designer/purchasing';
import { purchaseDocument } from '../../src/designer/purchase-document';
import {
  directoryEntrySchema,
  matchesProject,
} from '../../src/designer/project-directory';
function required<T>(value: T | undefined): T {
  assert.ok(value !== undefined);
  return value;
}
function fixture() {
  const base = newDesign();
  const one = {
    ...fromObject('custom_cabinet'),
    id: 'one',
    sku: 'B24',
    x: 12,
    y: 0,
    width: 24,
  };
  const d: Design = { ...base, items: [one, { ...one, id: 'two', x: 36 }] };
  const book = parsePriceBook(
    JSON.stringify({
      ...priceRequest(d),
      supplier: 'QA supplier',
      reference: 'Synthetic prices',
      validUntil: '2099-01-01',
      lines: priceRequest(d).lines.map((l) => ({ ...l, unitPrice: 125 })),
    }),
  );
  const review = {
    designJson: designSnapshot(d),
    revision: 2,
    comments: [{ kind: 'approval', name: 'QA client' }],
  };
  return { d, book, review };
}
test('quantities group exact supply configurations and exclude room openings', () => {
  const { d, book } = fixture();
  const lines = purchaseLines(
    { ...d, items: [...d.items, { ...fromObject('door'), id: 'door' }] },
    book,
  );
  assert.equal(lines.length, 1);
  assert.equal(required(lines[0]).quantity, 2);
  assert.equal(required(lines[0]).lineCents, 25000);
  assert.deepEqual(required(lines[0]).itemIds, ['one', 'two']);
  const changed = {
    ...d,
    items: d.items.map((i) => (i.id === 'two' ? { ...i, width: 30 } : i)),
  };
  const split = purchaseLines(changed, book);
  assert.equal(split.length, 2);
  assert.equal(required(split[1]).unitCents, null);
});
test('approval requires exact matching project and physical scope with actual approval', () => {
  const { d, review } = fixture();
  assert.equal(approvalFromReview(review, d).revision, 2);
  assert.throws(() => approvalFromReview(null, d), /expired/);
  assert.throws(
    () => approvalFromReview({ ...review, comments: [] }, d),
    /no client approval/,
  );
  assert.throws(
    () => approvalFromReview(review, { ...d, id: 'other' }),
    /exact design/,
  );
  assert.throws(
    () =>
      approvalFromReview(review, {
        ...d,
        room: { ...d.room, width: d.room.width + 1 },
      }),
    /exact design/,
  );
  assert.throws(
    () =>
      approvalFromReview(review, {
        ...d,
        items: d.items.map((i) => ({ ...i, x: i.x + 1 })),
      }),
    /exact design/,
  );
});
test('scope changes capture immutable snapshots and complete-price differences only', () => {
  const { d, book } = fixture();
  const after = { ...d, items: [required(d.items[0])] };
  const change = makeChange(d, after, 'Remove second cabinet', book);
  assert.equal(JSON.parse(change.before).items.length, 2);
  assert.equal(JSON.parse(change.after).items.length, 1);
  assert.equal(scopeDifference(d, after, book).delta, -12500);
  assert.equal(
    scopeDifference(d, after, { ...book, validUntil: '2000-01-01' }).delta,
    null,
  );
  assert.throws(() => makeChange(d, d, 'No edits'), /no scope changes/);
  assert.throws(() => makeChange(d, after, ' '));
  required(d.items[0]).sku = 'Changed later';
  assert.equal(JSON.parse(change.before).items[0].sku, 'B24');
});
test('purchase draft preserves site questions and gates missing prices and approval', () => {
  const { d, book, review } = fixture();
  const approval = approvalFromReview(review, d);
  const withTask = {
    ...d,
    siteTasks: [
      {
        id: 'site',
        wall: 0,
        title: 'Confirm outlet',
        notes: '',
        status: 'open' as const,
        assignee: '',
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const p = makePurchase(
    withTask,
    'PO-1',
    'Confirm availability',
    book,
    approval,
  );
  assert.match(p.designJson, /Confirm outlet/);
  assert.ok(
    purchaseChecks(withTask, book, approval).some((s) =>
      s.includes('site questions'),
    ),
  );
  assert.ok(
    purchaseChecks(d, undefined, undefined).some((s) => s.includes('approval')),
  );
  assert.ok(
    purchaseChecks(d, { ...book, validUntil: '2000-01-01' }, approval).some(
      (s) => s.includes('expired'),
    ),
  );
});
test('purchasing import strips approval claims and rejects foreign or malformed delivery references', () => {
  const { d, book, review } = fixture();
  const approval = approvalFromReview(review, d);
  const data = {
    ...emptyPurchasing(d.id),
    baseline: { designJson: designSnapshot(d), approval },
    purchases: [makePurchase(d, 'PO-1', '', book, approval)],
    changes: [
      {
        ...makeChange(
          d,
          { ...d, items: [required(d.items[0])] },
          'Remove one',
          book,
        ),
        approval,
      },
    ],
  };
  const raw = JSON.stringify(data);
  const imported = parsePurchasing(raw, d.id);
  assert.equal(imported.baseline, undefined);
  assert.equal(required(imported.purchases[0]).approval, undefined);
  assert.equal(required(imported.changes[0]).approval, undefined);
  assert.equal(
    required(parsePurchasing(raw, d.id, true).purchases[0]).approval?.revision,
    2,
  );
  assert.throws(() => parsePurchasing(raw, 'wrong'), /another project/);
  const receipt = {
    itemId: 'unknown',
    status: 'received',
    note: '',
    updatedAt: new Date().toISOString(),
  };
  assert.throws(
    () =>
      parsePurchasing(
        JSON.stringify({
          ...data,
          purchases: [{ ...data.purchases[0], receipts: [receipt] }],
        }),
        d.id,
      ),
    /delivery item/,
  );
  assert.throws(
    () =>
      parsePurchasing(
        JSON.stringify({
          ...data,
          purchases: [data.purchases[0], data.purchases[0]],
        }),
        d.id,
      ),
    /Duplicate/,
  );
});
test('delivery totals use original item snapshot and preserve distinct damaged and missing units', () => {
  const { d, book } = fixture();
  const purchase = makePurchase(d, 'PO-1', '', book);
  purchase.receipts = [
    {
      itemId: 'one',
      status: 'damaged',
      note: 'Broken corner',
      updatedAt: new Date().toISOString(),
    },
  ];
  assert.deepEqual(deliverySummary(purchase), {
    pending: 1,
    received: 0,
    damaged: 1,
    missing: 0,
  });
  purchase.receipts.push({
    itemId: 'two',
    status: 'missing',
    note: 'Not in truck',
    updatedAt: new Date().toISOString(),
  });
  d.items = [];
  assert.deepEqual(deliverySummary(purchase), {
    pending: 0,
    received: 0,
    damaged: 1,
    missing: 1,
  });
});
test('printable purchase draft escapes user text and separates product subtotal from customer fees', () => {
  const { d, book } = fixture();
  const purchase = makePurchase(
    {
      ...d,
      name: '<script>alert(1)</script>',
      quote: {
        customer: 'QA',
        tax: 10,
        discount: 20,
        installation: 500,
        delivery: 50,
      },
    },
    'PO-1',
    '<img onerror=alert(1)>',
    book,
  );
  const html = purchaseDocument(purchase);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('Product subtotal: $250.00'));
  assert.ok(html.includes('not submitted'));
  assert.ok(html.includes('&lt;img'));
});
test('directory matches client, room, SKU, tags, status and archive visibility', () => {
  const entry = directoryEntrySchema.parse({
    client: 'River family',
    room: 'Kitchen',
    tags: 'priority remodel',
    skus: ['B24'],
    status: 'ordering',
  });
  assert.ok(
    matchesProject('Main floor', entry, 'river B24', false, 'ordering'),
  );
  assert.ok(matchesProject('Main floor', entry, 'kitchen priority', false, ''));
  assert.equal(matchesProject('Main floor', entry, 'B30', false, ''), false);
  assert.equal(
    matchesProject('Main floor', { ...entry, archived: true }, '', false, ''),
    false,
  );
  assert.equal(
    matchesProject('Main floor', { ...entry, archived: true }, '', true, ''),
    true,
  );
});
