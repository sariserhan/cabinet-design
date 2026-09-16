import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, type Design } from '../../src/designer/model';
import {
  emptyTrades,
  estimateTrade,
  roomTakeoff,
  packSlabs,
  tradeFingerprint,
  tradeIsCurrent,
  combinedTradeTotal,
  tradeCsv,
  tradeHtml,
  parseTrades,
  tradeInputSchema,
} from '../../src/designer/trade-estimates';
import {
  collectProjectBackup,
  restoreProjectCopy,
} from '../../src/designer/project-backup';
function room(): Design {
  const d = newDesign();
  return {
    ...d,
    room: { ...d.room, width: 120, depth: 120, height: 96, outline: [] },
    items: [],
  };
}
test('floor boxes round purchases, labor uses net area, invalid deductions and missing prices block totals', () => {
  const d = room(),
    s = emptyTrades(d.id).trades.flooring.input;
  s.materialPrice = 50;
  s.laborRate = 2;
  const r = estimateTrade(d, 'flooring', s);
  assert.equal(r.netArea, 100);
  assert.equal(r.purchaseQuantity, 6);
  assert.equal(r.totalCents, 50000);
  assert.equal(
    estimateTrade(d, 'flooring', { ...s, deduction: 101 }).totalCents,
    null,
  );
  assert.equal(
    estimateTrade(d, 'flooring', { ...s, materialPrice: null }).totalCents,
    null,
  );
  assert.throws(() => estimateTrade(d, 'flooring', { ...s, boxCoverage: 0 }));
});
test('painting integrates sloped/vaulted walls and ceilings and accounts for coats and manual deductions', () => {
  const d = room(),
    s = emptyTrades(d.id).trades.painting.input;
  assert.equal(
    roomTakeoff(d).walls.reduce((n, w) => n + w.area, 0),
    320,
  );
  assert.equal(roomTakeoff(d).ceiling, 100);
  const r = estimateTrade(d, 'painting', {
    ...s,
    deduction: 20,
    materialPrice: 40,
    laborRate: 1,
  });
  assert.equal(r.netArea, 300);
  assert.equal(r.purchaseQuantity, 2);
  assert.equal(r.totalCents, 38000);
  d.room.ceiling = { axis: 'x', kind: 'vault', endHeight: 120, ridge: 0.5 };
  assert.equal(
    roomTakeoff(d).walls.reduce((n, w) => n + w.area, 0),
    340,
  );
  assert.ok(Math.abs(roomTakeoff(d).ceiling - 100 * Math.sqrt(1.16)) < 1e-8);
  assert.equal(
    estimateTrade(d, 'painting', {
      ...s,
      wallIndices: [],
      includeCeiling: false,
    }).netArea,
    0,
  );
});
test('tile zones calculate tiles, boxes, grout and adhesive separately', () => {
  const d = room(),
    s = emptyTrades(d.id).trades.tile.input;
  const r = estimateTrade(d, 'tile', {
    ...s,
    zones: [{ id: 'zone', name: 'Backsplash', length: 120, width: 18 }],
    materialPrice: 20,
    laborRate: 5,
    groutPrice: 10,
    adhesivePrice: 15,
  });
  assert.equal(r.netArea, 15);
  assert.equal(r.purchaseQuantity, 2);
  assert.equal(r.totalCents, 14000);
  assert.equal(r.lines.find((l) => l.label === 'Grout')?.quantity, 1);
  assert.throws(() =>
    tradeInputSchema.parse({
      ...s,
      zones: [
        { id: 'x', name: 'a', length: 1, width: 1 },
        { id: 'x', name: 'b', length: 1, width: 1 },
      ],
    }),
  );
});
test('countertop packing respects edge trim, kerf, split pieces, slab bounds and no overlaps', () => {
  const d = room();
  d.items = [{ ...fromObject('countertop'), id: 'top', width: 120, depth: 24 }];
  const s = {
    ...emptyTrades(d.id).trades.countertops.input,
    slabWidth: 64,
    slabDepth: 30,
    edgeTrim: 1,
    materialPrice: 100,
    laborRate: 10,
    edgeLength: 10,
    edgeRate: 2,
    seamRate: 15,
  };
  assert.equal(estimateTrade(d, 'countertops', s).totalCents, null);
  const next = { ...s, splits: [{ id: 'top', count: 2 }] },
    r = estimateTrade(d, 'countertops', next);
  assert.equal(r.slabCount, 2);
  assert.equal(r.totalCents, 43500);
  assert.equal(r.netArea, 20);
  for (const p of r.pieces) {
    assert.ok(p.x >= 1 && p.y >= 1);
    assert.ok(p.x + p.width <= 63 && p.y + p.depth <= 29);
  }
  d.items = [
    { ...d.items[0], width: 30, depth: 24 } as (typeof d.items)[number],
    { ...fromObject('countertop'), id: 'second', width: 30, depth: 24 },
  ];
  const packed = packSlabs(d, s);
  assert.equal(packed.slabCount, 1);
  assert.equal(packed.pieces.length, 2);
  const a = packed.pieces[0],
    b = packed.pieces[1];
  assert.ok(a && b);
  assert.ok(
    a.x + a.width + s.kerf <= b.x ||
      b.x + b.width + s.kerf <= a.x ||
      a.y + a.depth + s.kerf <= b.y ||
      b.y + b.depth + s.kerf <= a.y,
  );
});
test('saved estimates become stale after geometry or settings edits; combined total never uses stale numbers', () => {
  const d = room(),
    v = emptyTrades(d.id),
    s = v.trades.flooring;
  s.input = { ...s.input, included: true, materialPrice: 50, laborRate: 2 };
  s.saved = {
    designFingerprint: tradeFingerprint(d),
    inputFingerprint: tradeFingerprint(s.input),
    createdAt: new Date().toISOString(),
    result: estimateTrade(d, 'flooring', s.input),
  };
  assert.equal(tradeIsCurrent(d, s), true);
  assert.equal(combinedTradeTotal(d, v).totalCents, 50000);
  d.room.width = 144;
  assert.equal(tradeIsCurrent(d, s), false);
  assert.equal(combinedTradeTotal(d, v).totalCents, null);
  assert.throws(() => parseTrades(JSON.stringify(v), 'another-project'));
});
test('complete backup carries trade settings; restored copies require recalculation; export escapes markup and formulas', () => {
  const d = room(),
    v = emptyTrades(d.id);
  v.trades.tile.input.notes = '<script>bad</script>';
  v.trades.flooring.saved = {
    designFingerprint: tradeFingerprint(d),
    inputFingerprint: tradeFingerprint(v.trades.flooring.input),
    createdAt: new Date().toISOString(),
    result: estimateTrade(d, 'flooring', v.trades.flooring.input),
  };
  const storage = {
    getItem: (key: string) =>
      key === `kitchen-trades:owner:${d.id}` ? JSON.stringify(v) : null,
  };
  const bundle = collectProjectBackup(storage, 'owner', d);
  assert.equal(bundle.trades?.trades.tile.input.notes, '<script>bad</script>');
  const copy = restoreProjectCopy(bundle, 'new-id');
  assert.equal(copy.trades?.designId, 'new-id');
  assert.equal(copy.trades?.trades.tile.saved, undefined);
  assert.equal(copy.trades?.trades.flooring.saved, undefined);
  assert.ok(bundle.trades?.trades.flooring.saved);
  const html = tradeHtml(d, 'tile', v.trades.tile.input);
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad'));
  d.name = '=SUM(1,2)';
  assert.ok(
    tradeCsv(d, 'flooring', v.trades.flooring.input).includes("'=SUM(1,2)"),
  );
});

test('the design derives the deductions it can, without applying them', () => {
  const d = room();
  const base = fromObject('custom_cabinet');
  d.items = [
    // Two floor-standing cabinets, 36x24in each, so 12 sq ft together.
    { ...base, id: 'c1', width: 36, depth: 24, elevation: 0, x: 0, y: 0 },
    { ...base, id: 'c2', width: 36, depth: 24, elevation: 0, x: 40, y: 0 },
    // A wall cabinet hangs above the floor and hides none of it.
    { ...base, id: 'c3', width: 36, depth: 24, elevation: 54, x: 0, y: 40 },
  ];
  const s = emptyTrades(d.id).trades.flooring.input;
  const r = estimateTrade(d, 'flooring', s);
  assert.ok(r.suggestedDeduction, 'expected a floor suggestion');
  assert.equal(r.suggestedDeduction.area, 12);

  // Offered, never applied: the estimate still uses the entered deduction.
  assert.equal(r.netArea, 100);
  assert.equal(
    estimateTrade(d, 'flooring', { ...s, deduction: 12 }).netArea,
    88,
  );
  assert.ok(
    r.assumptions.some((a) => a.includes('does not use that figure')),
    'the estimate should say the suggestion was not used',
  );
});

test('paint suggestions count only openings on the selected walls', () => {
  const d = room();
  const door = fromObject('door'),
    window_ = fromObject('window');
  d.items = [
    { ...door, id: 'd1', wall: 'north', width: 36, height: 80, elevation: 0 },
    { ...window_, id: 'w1', wall: 'south', width: 36, height: 48, elevation: 36 },
  ];
  const s = emptyTrades(d.id).trades.painting.input;
  const all = estimateTrade(d, 'painting', { ...s, wallIndices: null });
  assert.ok(all.suggestedDeduction);
  // 36x80 = 20 sq ft, 36x48 = 12 sq ft.
  assert.equal(all.suggestedDeduction.area, 32);

  const northOnly = roomTakeoff(d).walls.find((w) => w.index === 0);
  assert.ok(northOnly);
  const one = estimateTrade(d, 'painting', {
    ...s,
    wallIndices: [northOnly.index],
  });
  assert.ok(one.suggestedDeduction);
  assert.ok(
    one.suggestedDeduction.area < all.suggestedDeduction.area,
    'selecting one wall must not carry the other wall openings',
  );
});

test('a room with no openings or floor items offers no suggestion', () => {
  const d = room();
  assert.equal(
    estimateTrade(d, 'painting', emptyTrades(d.id).trades.painting.input)
      .suggestedDeduction,
    null,
  );
  assert.equal(
    estimateTrade(d, 'flooring', emptyTrades(d.id).trades.flooring.input)
      .suggestedDeduction,
    null,
  );
});

test('countertops never offer a floor or opening deduction', () => {
  const d = room();
  const base = fromObject('custom_cabinet');
  d.items = [{ ...base, id: 'c1', width: 36, depth: 24, elevation: 0 }];
  assert.equal(
    estimateTrade(d, 'countertops', emptyTrades(d.id).trades.countertops.input)
      .suggestedDeduction,
    null,
  );
});
