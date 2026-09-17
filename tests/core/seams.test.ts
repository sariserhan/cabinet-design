import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject } from '../../src/designer/model';
import {
  equalSeams,
  pieceWidths,
  seamConflicts,
  seamLines,
  seamSchedule,
  seamsOf,
  setSeams,
} from '../../src/designer/seams';
import { emptyTrades, packSlabs } from '../../src/designer/trade-estimates';
import { drawingPackageHtml } from '../../src/designer/drawing-package';

const settings = () => emptyTrades('design').trades.countertops.input;

function run() {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('countertop'),
      id: 'top',
      x: 0,
      y: 0,
      width: 120,
      depth: 25,
      elevation: 34.5,
    },
  ];
  return d;
}

test('a top is cut where the designer says, not into equal thirds by a setting', () => {
  let d = run();
  const top = (design: typeof d) => {
    const item = design.items.find((i) => i.id === 'top');
    assert.ok(item);
    return item;
  };
  assert.deepEqual(equalSeams(top(d), 3), [40, 80]);
  d = setSeams(d, 'top', [40, 80]);
  assert.deepEqual(seamsOf(top(d)), [40, 80]);
  assert.deepEqual(pieceWidths(top(d)), [40, 40, 40]);

  // Uneven, which is the case a count of pieces could never express.
  d = setSeams(d, 'top', [96]);
  assert.deepEqual(pieceWidths(top(d)), [96, 24]);
  // A seam outside the top, or on its edge, is not a seam.
  d = setSeams(d, 'top', [0, 120, 60]);
  assert.deepEqual(seamsOf(top(d)), [60]);
});

test('each seam is a line across the top, in plan coordinates', () => {
  const d = setSeams(run(), 'top', [48]);
  const [line] = seamLines(d);
  assert.ok(line);
  assert.equal(Math.round(line.a.x), 48);
  assert.equal(Math.round(line.a.y), 0);
  assert.equal(Math.round(line.b.x), 48);
  assert.equal(Math.round(line.b.y), 25);

  // And it turns with the top it belongs to.
  const turned = {
    ...d,
    items: d.items.map((i) => ({ ...i, rotation: 90 })),
  };
  const [rotated] = seamLines(turned);
  assert.ok(rotated);
  assert.notEqual(Math.round(rotated.a.x), Math.round(rotated.b.x));
});

test('a seam beside the sink is reported, not prevented', () => {
  let d = setSeams(run(), 'top', [48]);
  d = {
    ...d,
    items: [
      ...d.items,
      { ...fromObject('sink'), x: 44, y: 2, width: 30, depth: 20 },
    ],
  };
  assert.equal(seamConflicts(d).length, 1);
  assert.ok(seamConflicts(d)[0]?.includes('within four inches'));
  // Moved clear of it, there is nothing to say.
  assert.equal(seamConflicts(setSeams(d, 'top', [110])).length, 0);
});

test('the slab packing cuts to the seams the design carries', () => {
  const plain = packSlabs(run(), settings());
  assert.equal(plain.pieces.length, 1);
  const split = packSlabs(setSeams(run(), 'top', [96]), settings());
  assert.equal(split.pieces.length, 2);
  assert.equal(split.seams, 1);
  const widths = split.pieces
    .map((p) => Math.round(p.width))
    .sort((a, b) => a - b);
  assert.deepEqual(widths, [24, 96]);
});

test('the schedule lists the pieces a fabricator has to cut', () => {
  const d = setSeams(run(), 'top', [40, 80]);
  const [row] = seamSchedule(d);
  assert.ok(row);
  assert.equal(row.pieces, 3);
  assert.equal(row.widths, '40" + 40" + 40"');
  assert.equal(row.seams, '40", 80"');
  // A top in one piece is not in the schedule at all.
  assert.equal(seamSchedule(run()).length, 0);
});

test('the seams reach the drawing set as their own sheet', () => {
  const d = setSeams(run(), 'top', [40, 80]);
  const html = drawingPackageHtml(d, {
    company: 'Studio',
    client: 'Client',
    reference: 'REF-1',
    revision: 'A',
    preparedBy: 'Designer',
    date: '2026-09-17',
    purpose: 'Installation coordination',
    unit: 'in',
    scale: 48,
    notes: '',
  });
  assert.ok(html.includes('C01 · Worktop seams'));
  assert.ok(
    html.includes('40&quot; + 40&quot; + 40&quot;') ||
      html.includes('40" + 40" + 40"'),
  );
  assert.ok(html.includes('fabricator confirms support'));
  // A kitchen whose tops are each one piece has no such sheet.
  assert.equal(
    drawingPackageHtml(run(), {
      company: 'Studio',
      client: 'Client',
      reference: 'REF-1',
      revision: 'A',
      preparedBy: 'Designer',
      date: '2026-09-17',
      purpose: 'Installation coordination',
      unit: 'in',
      scale: 48,
      notes: '',
    }).includes('C01 · Worktop seams'),
    false,
  );
});
