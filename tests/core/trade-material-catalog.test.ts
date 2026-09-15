import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign } from '../../src/designer/model';
import {
  emptyTrades,
  estimateTrade,
  parseTrades,
  tradeCsv,
  tradeHtml,
  tradeFingerprint,
  tradeIsCurrent,
} from '../../src/designer/trade-estimates';
import {
  tradeMaterials,
  materialProfileSchema,
  applyTradeMaterial,
  materialMatches,
} from '../../src/designer/trade-material-catalog';

test('catalog covers each trade with unique sourced profiles and supported specifications', () => {
  assert.equal(
    new Set(tradeMaterials.map((m) => m.id)).size,
    tradeMaterials.length,
  );
  assert.equal(new Set(tradeMaterials.map((m) => m.trade)).size, 4);
  for (const m of tradeMaterials) {
    materialProfileSchema.parse(m);
    const input = applyTradeMaterial(
      m.trade,
      emptyTrades('test').trades[m.trade].input,
      m,
    );
    assert.equal(materialMatches(input), true);
  }
});
test('product selection resets product pricing, preserves measured work and invalidates saved estimates', () => {
  const d = newDesign(),
    old = emptyTrades(d.id).trades.flooring.input;
  old.materialPrice = 100;
  old.laborRate = 3;
  old.reference = 'Previous quote';
  old.deduction = 4;
  const m = tradeMaterials.find((m) => m.id === 'coretec-calypso-oak');
  assert.ok(m);
  const selected = applyTradeMaterial('flooring', old, m);
  assert.equal(selected.boxCoverage, 23.64);
  assert.equal(selected.materialPrice, null);
  assert.equal(selected.reference, '');
  assert.equal(selected.laborRate, 3);
  assert.equal(selected.deduction, 4);
  assert.equal(materialMatches({ ...selected, boxCoverage: 22 }), false);
  assert.equal(materialMatches({ ...selected, product: 'Custom' }), false);
  assert.throws(() => applyTradeMaterial('painting', old, m));
  const state = {
    input: selected,
    saved: {
      designFingerprint: tradeFingerprint(d),
      inputFingerprint: tradeFingerprint(old),
      createdAt: new Date().toISOString(),
      result: {
        grossArea: 0,
        netArea: 0,
        purchaseQuantity: 0,
        purchaseUnit: 'box',
        totalCents: 0,
      },
    },
  };
  assert.equal(tradeIsCurrent(d, state), false);
});
test('catalog sources survive settings roundtrip and appear in exports', () => {
  const d = newDesign(),
    settings = emptyTrades(d.id),
    m = tradeMaterials[0];
  assert.ok(m);
  settings.trades.countertops.input = applyTradeMaterial(
    'countertops',
    settings.trades.countertops.input,
    m,
  );
  const restored = parseTrades(JSON.stringify(settings), d.id).trades
    .countertops.input;
  assert.deepEqual(restored.materialCatalog, m);
  assert.ok(tradeHtml(d, 'countertops', restored).includes(m.source));
  assert.ok(tradeCsv(d, 'countertops', restored).includes(m.source));
  const legacy = emptyTrades(d.id);
  assert.doesNotThrow(() => parseTrades(JSON.stringify(legacy), d.id));
});
test('wall tile blocks floor estimates and uses the correct carton quantity for backsplashes', () => {
  const d = newDesign(),
    m = tradeMaterials.find((m) => m.trade === 'tile');
  assert.ok(m);
  const s = applyTradeMaterial('tile', emptyTrades(d.id).trades.tile.input, m);
  s.zones = [{ id: 'wall', name: 'Backsplash', length: 120, width: 18 }];
  s.materialPrice = 30;
  s.laborRate = 5;
  assert.equal(estimateTrade(d, 'tile', s).purchaseQuantity, 2);
  assert.equal(estimateTrade(d, 'tile', s).issues.length, 0);
  for (const change of [
    { areaSource: 'room' as const },
    { tileApplication: 'floor' as const },
  ]) {
    const r = estimateTrade(d, 'tile', { ...s, ...change });
    assert.equal(r.totalCents, null);
    assert.ok(r.issues.some((i) => i.includes('wall-only')));
  }
});
