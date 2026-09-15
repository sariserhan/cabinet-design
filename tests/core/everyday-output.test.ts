import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject } from '../../src/designer/model';
import {
  previewEverydayEdit,
  selectionMembers,
} from '../../src/designer/everyday-editing';
import {
  drawingOptionsSchema,
  drawingRows,
  groupedDrawingItems,
  drawingItemCsv,
  drawingPackageHtml,
  drawingReference,
} from '../../src/designer/drawing-package';
const fixture = () => {
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
      width: 24,
      depth: 24,
      height: 34.5,
      x: 0,
      y: 0,
      assemblyId: 'pair',
    },
    {
      ...fromObject('countertop'),
      id: 'top',
      sku: 'TOP',
      width: 24,
      depth: 24,
      height: 1.5,
      elevation: 34.5,
      x: 0,
      y: 0,
      assemblyId: 'pair',
    },
  ];
  return d;
};
const options = () =>
  drawingOptionsSchema.parse({
    company: 'Dealer',
    client: 'Client',
    reference: 'JOB-1',
    revision: 'A',
    preparedBy: 'Designer',
    date: '2026-09-15',
    purpose: 'Dealer review',
    unit: 'in',
    scale: 25,
    notes: '',
  });
test('exact moves include linked items, preserve input and block new boundary conflicts', () => {
  const d = fixture();
  const move = previewEverydayEdit(d, ['base'], {
    kind: 'move',
    x: 3.125,
    y: 6,
  });
  assert.equal(move.members, 2);
  assert.equal(move.design.items[1]?.x, 3.125);
  assert.equal(d.items[0]?.x, 0);
  assert.equal(move.blocked, false);
  assert.equal(
    previewEverydayEdit(d, ['base'], { kind: 'move', x: -12, y: 0 }).blocked,
    true,
  );
  assert.throws(() =>
    previewEverydayEdit(d, ['base'], { kind: 'move', x: NaN, y: 0 }),
  );
});
test('repeat produces fresh linked identities, accurate gaps and collision checks', () => {
  const d = fixture();
  const r = previewEverydayEdit(d, ['base'], {
    kind: 'repeat',
    count: 2,
    gap: 3,
    direction: 'right',
  });
  assert.equal(r.design.items.length, 6);
  assert.equal(new Set(r.design.items.map((i) => i.id)).size, 6);
  assert.equal(r.design.items[2]?.x, 27);
  assert.equal(r.design.items[4]?.x, 54);
  assert.notEqual(r.design.items[2]?.assemblyId, 'pair');
  assert.equal(r.design.items[2]?.assemblyId, r.design.items[3]?.assemblyId);
  assert.equal(r.blocked, false);
  assert.equal(
    previewEverydayEdit(d, ['base'], {
      kind: 'repeat',
      count: 8,
      gap: 0,
      direction: 'right',
    }).blocked,
    true,
  );
  assert.throws(() =>
    previewEverydayEdit(d, ['base'], {
      kind: 'repeat',
      count: 0,
      gap: 0,
      direction: 'right',
    }),
  );
});
test('selection finishes do not recolor worktops; linked locks prevent editing', () => {
  const d = fixture();
  const r = previewEverydayEdit(d, ['base'], {
    kind: 'finish',
    finish: 'slate',
  });
  assert.equal(r.design.items[0]?.finish, 'slate');
  assert.equal(r.design.items[1]?.countertop, d.items[1]?.countertop);
  d.items = d.items.map((i) => (i.id === 'top' ? { ...i, locked: true } : i));
  assert.throws(
    () => previewEverydayEdit(d, ['base'], { kind: 'move', x: 1, y: 0 }),
    /Unlock/,
  );
  assert.equal(selectionMembers(d, ['base', 'top']).length, 2);
});
test('drawing marks and grouped quantities distinguish finishes and sources, exclude openings', () => {
  const d = fixture();
  d.items.push(
    {
      ...d.items[0],
      ...fromObject('custom_cabinet'),
      id: 'copy',
      sku: 'B24',
      width: 24,
      depth: 24,
      height: 34.5,
      x: 24,
      y: 0,
    },
    { ...fromObject('door'), id: 'door' },
  );
  const rows = drawingRows(d);
  assert.equal(new Set(rows.map((r) => r.mark)).size, 4);
  assert.equal(
    groupedDrawingItems(d).reduce((n, r) => n + r.quantity, 0),
    3,
  );
  assert.equal(
    groupedDrawingItems(d).find((r) => r.item.sku === 'B24')?.quantity,
    2,
  );
  d.items = d.items.map((i) =>
    i.id === 'copy' ? { ...i, mirrored: true } : i,
  );
  assert.equal(
    groupedDrawingItems(d).filter((r) => r.item.sku === 'B24').length,
    2,
  );
  d.items = d.items.map((i) =>
    i.id === 'copy' ? { ...i, finish: 'slate' } : i,
  );
  assert.equal(
    groupedDrawingItems(d).filter((r) => r.item.sku === 'B24').length,
    2,
  );
});
test('drawing issue has matched references, scale, calibration, escaped text and fingerprint', () => {
  const d = fixture();
  d.name = '<script>bad</script>';
  const html = drawingPackageHtml(d, options());
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad'));
  assert.ok(html.includes('100 mm on paper'));
  assert.ok(html.includes('width:100mm'));
  assert.ok(html.includes('1:25'));
  assert.ok(html.includes('I001'));
  assert.ok(html.includes(drawingReference(d)));
  assert.ok(html.includes('COORDINATION DRAFT'));
  assert.ok(html.includes('Sheet 1 of'));
  assert.equal(drawingReference(d), drawingReference(structuredClone(d)));
  const changed = { ...d, items: d.items.map((i) => ({ ...i, x: i.x + 1 })) };
  assert.notEqual(drawingReference(d), drawingReference(changed));
});
test('drawing scales refuse clipped sheets and support large rooms at 1:100', () => {
  const d = fixture();
  d.room.width = 600;
  d.room.depth = 600;
  assert.throws(() => drawingPackageHtml(d, options()), /exceeds the A3 sheet/);
  assert.ok(
    drawingPackageHtml(d, { ...options(), scale: 100 }).includes('1:100'),
  );
  assert.throws(() =>
    drawingOptionsSchema.parse({ ...options(), date: '2026-02-30' }),
  );
});
test('spreadsheet export neutralizes formulas and retains exact product quantities', () => {
  const d = fixture();
  d.items = d.items.map((i) => ({ ...i, sku: '=SUM(A1:A2)' }));
  const csv = drawingItemCsv(d);
  assert.ok(csv.includes('"\'=SUM(A1:A2)"'));
  assert.ok(csv.includes('Width (in)'));
  assert.ok(csv.includes('I001'));
  assert.ok(csv.includes('I002'));
});
