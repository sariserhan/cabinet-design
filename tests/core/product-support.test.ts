import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  newDesign,
  fromObject,
  type Design,
  parseDesign,
} from '../../src/designer/model';
import { canonical } from '../../src/designer/installer-handoff';
import {
  compatibilityRuleSchema,
  compatibilityResults,
  emptySupport,
  parseSupport,
  toleranceRunSchema,
  toleranceResult,
  warrantySchema,
} from '../../src/designer/product-support';
import {
  captureAssembly,
  placeAssembly,
  assemblyPlacementBlock,
  parseAssemblyLibrary,
} from '../../src/designer/assembly-library';
import { makePurchase } from '../../src/designer/purchasing';
import {
  priceRequest,
  parsePriceBook,
} from '../../src/designer/supplier-pricing';
import { compareReplacement } from '../../src/designer/substitution-comparison';
import {
  deliveryLabelUrl,
  deliveryLabelDocument,
} from '../../src/designer/delivery-labels';
import {
  collectProjectBackup,
  restoreProjectCopy,
} from '../../src/designer/project-backup';
import { fieldPackage, emptyCloseout } from '../../src/designer/closeout';
function fixture() {
  const one = {
    ...fromObject('custom_cabinet'),
    id: 'one',
    sku: 'B24',
    width: 24,
    depth: 24,
    height: 34.5,
    x: 12,
    y: 0,
    assemblyId: 'assembly',
  };
  const top = {
    ...fromObject('countertop'),
    id: 'top',
    sku: 'TOP',
    width: 24,
    depth: 24,
    height: 1.5,
    x: 12,
    y: 0,
    elevation: 34.5,
    assemblyId: 'assembly',
  };
  const d: Design = {
    ...newDesign(),
    room: {
      width: 144,
      depth: 120,
      height: 96,
      outline: [],
      walls: { north: true, east: true, south: true, west: true },
    },
    items: [one, top],
  };
  const book = parsePriceBook(
    JSON.stringify({
      ...priceRequest(d),
      supplier: 'Synthetic test supplier',
      reference: 'QA fixture',
      validUntil: '2099-01-01',
      lines: priceRequest(d).lines.map((l) => ({ ...l, unitPrice: 100 })),
    }),
  );
  return { d, one, top, book };
}
function rule() {
  return compatibilityRuleSchema.parse({
    id: 'rule',
    manufacturer: 'Synthetic QA manufacturer',
    hostSku: 'B24',
    componentSku: 'HINGE-QA',
    componentType: 'hinge',
    width: { min: 24, max: 30 },
    depth: { min: 24, max: 24 },
    height: { min: 34, max: 35 },
    hostFinish: '',
    hostConfiguration: '',
    source: 'Synthetic test sheet, page 1',
    url: 'https://example.com/spec',
    revision: 'QA-1',
  });
}
test('compatibility stays unverified without a reviewed exact SKU pair and reports documented mismatches', () => {
  const { d, one } = fixture(),
    r = rule();
  assert.equal(
    compatibilityResults(one, 'OTHER', [r], d)[0]?.status,
    'unverified',
  );
  assert.equal(
    compatibilityResults(one, 'HINGE-QA', [r], d)[0]?.status,
    'unverified',
  );
  const reviewed = {
    ...r,
    review: { by: 'QA reviewer', at: new Date().toISOString() },
  };
  assert.equal(
    compatibilityResults(one, 'HINGE-QA', [reviewed], d)[0]?.status,
    'matches_rule',
  );
  const mismatch = compatibilityResults(
    { ...one, width: 23 },
    'HINGE-QA',
    [reviewed],
    d,
  )[0];
  assert.equal(mismatch?.status, 'mismatch');
  assert.match(mismatch?.message ?? '', /documented range/);
  assert.equal(
    compatibilityResults(
      one,
      'HINGE-QA',
      [{ ...reviewed, hostFinish: 'linen' }],
      { ...d, finish: 'oak' },
    )[0]?.status,
    'mismatch',
  );
});
test('imported support rules lose review authority and malformed ranges and URLs are rejected', () => {
  const { d } = fixture();
  const data = {
    ...emptySupport(d.id),
    rules: [{ ...rule(), review: { by: 'QA', at: new Date().toISOString() } }],
  };
  assert.equal(
    parseSupport(JSON.stringify(data), d.id).rules[0]?.review,
    undefined,
  );
  assert.ok(parseSupport(JSON.stringify(data), d.id, true).rules[0]?.review);
  assert.throws(() =>
    compatibilityRuleSchema.parse({ ...rule(), width: { min: 30, max: 24 } }),
  );
  assert.throws(() =>
    compatibilityRuleSchema.parse({ ...rule(), url: 'javascript:alert(1)' }),
  );
  assert.throws(
    () => parseSupport(JSON.stringify(data), 'different'),
    /another project/,
  );
});
test('tolerance calculations count uncertainty at both ends and do not double-count overlapping worktops', () => {
  const { d } = fixture();
  const r = toleranceRunSchema.parse({
    id: 'run',
    name: 'North',
    itemIds: ['one', 'top'],
    wall: 0,
    start: 10,
    span: 28,
    uncertainty: 0.25,
    unevenness: 0.5,
    leftFiller: 1,
    rightFiller: 1,
    measuredBy: 'QA',
    note: 'Synthetic',
    roomSignature: canonical(d.room),
  });
  const result = toleranceResult(d, r);
  assert.equal(result.status, 'fits_allowance');
  assert.equal(result.occupied, 24);
  assert.equal(result.left, 0.5);
  assert.equal(result.right, 0.5);
  assert.equal(
    toleranceResult(d, { ...r, leftFiller: 2 }).status,
    'insufficient',
  );
  assert.equal(
    toleranceResult({ ...d, room: { ...d.room, width: 145 } }, r).status,
    'unverified',
  );
  const curved = { ...d, room: { ...d.room, curves: [{ wall: 0, bow: 2 }] } };
  assert.equal(
    toleranceResult(curved, { ...r, roomSignature: canonical(curved.room) })
      .status,
    'unverified',
  );
});
test('assembly capture expands dependencies, clears site coordinates and placement creates new linked IDs', () => {
  const { d } = fixture();
  const sink = {
    ...fromObject('sink'),
    id: 'sink',
    x: 14,
    y: 2,
    width: 20,
    depth: 20,
    height: 5,
    elevation: 31,
    sinkMount: { hostId: 'top', mount: 'undermount' as const, offset: 0 },
    assemblyId: 'assembly',
  };
  d.items.push(sink);
  const first = d.items[0];
  assert.ok(first);
  first.installation = {
    profile: '',
    voltage: 0,
    circuitAmps: 0,
    water: 'unknown',
    drain: false,
    vent: 'unknown',
    ductDiameter: 0,
    notes: 'Reference notes',
    serviceX: 10,
    serviceY: 20,
  };
  const t = captureAssembly(d, ['one'], 'Sink assembly', 'Fit after survey');
  assert.equal(t.items.length, 3);
  assert.equal(t.items[0]?.installation?.serviceX, undefined);
  const placed = placeAssembly(d, t, 70, 10);
  const added = placed.items.slice(3);
  assert.equal(added.length, 3);
  assert.ok(added.every((i) => !d.items.some((old) => old.id === i.id)));
  assert.equal(
    added.find((i) => i.kind === 'sink')?.sinkMount?.hostId,
    added.find((i) => i.kind === 'countertop')?.id,
  );
  assert.equal(new Set(added.map((i) => i.assemblyId)).size, 1);
  assert.equal(d.items.length, 3);
});
test('assembly placement blocks overlap, boundary and ceiling failures; malformed dependencies cannot import', () => {
  const { d } = fixture();
  const t = captureAssembly(d, ['one'], 'Base cabinet', '');
  assert.match(
    assemblyPlacementBlock(d, placeAssembly(d, t, 12, 0)) ?? '',
    /overlaps/,
  );
  assert.match(
    assemblyPlacementBlock(d, placeAssembly(d, t, 140, 0)) ?? '',
    /beyond/,
  );
  assert.equal(assemblyPlacementBlock(d, placeAssembly(d, t, 70, 0)), null);
  const broken = {
    ...t,
    items: t.items.map((i) => ({
      ...i,
      sinkMount: { hostId: 'missing', mount: 'undermount', offset: 0 },
    })),
  };
  assert.throws(
    () =>
      parseAssemblyLibrary(
        JSON.stringify({
          format: 'kitchen-assembly-library-v1',
          templates: [broken],
        }),
      ),
    /linked hosts/,
  );
});
test('replacement comparison preserves order and identifies dependent tops and unit-price differences', () => {
  const { d, book } = fixture();
  const p = makePurchase(d, 'PO-1', '', book);
  const replacement = {
    sku: 'B30',
    width: 30,
    depth: 24,
    height: 34.5,
    finish: 'oak',
    configuration: 'different drawer system',
    unitPrice: 150,
    reference: 'Synthetic quote',
  };
  const result = compareReplacement(p, 'one', replacement);
  assert.equal(result.delta, 5000);
  assert.ok(result.affected.some((i) => i.id === 'top'));
  assert.ok(result.configurationChanged);
  assert.equal(parseDesign(p.designJson).items[0]?.width, 24);
  assert.equal(result.after.items[0]?.width, 30);
  const unpriced = { ...replacement };
  delete (unpriced as Partial<typeof replacement>).unitPrice;
  assert.equal(compareReplacement(p, 'one', unpriced).delta, null);
});
test('QR encodes the exact item link and can be read by an independent decoder', async () => {
  const { d, book } = fixture();
  const p = makePurchase(d, 'PO-1', '', book);
  const url = deliveryLabelUrl(
    'https://studio.example.com/old?x=1',
    d.id,
    p.id,
    'one',
  );
  assert.ok(url.startsWith('https://studio.example.com/field/index.html#'));
  assert.throws(() =>
    deliveryLabelUrl('javascript:alert(1)', d.id, p.id, 'one'),
  );
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' }),
    scale = 6,
    margin = 4,
    size = (qr.modules.size + margin * 2) * scale,
    data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - margin,
        col = Math.floor(x / scale) - margin;
      const black =
        row >= 0 &&
        col >= 0 &&
        row < qr.modules.size &&
        col < qr.modules.size &&
        qr.modules.get(row, col);
      const value = black ? 0 : 255,
        offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  assert.equal(jsQR(data, size, size)?.data, url);
  const html = await deliveryLabelDocument(p, 'https://studio.example.com');
  assert.equal((html.match(/<svg /g) ?? []).length, 2);
  assert.match(html, /Ordered location/);
  assert.match(html, /Import an up-to-date field package/);
});
test('complete backup preserves service records and attached templates while clearing imported rule reviews', () => {
  const { d } = fixture();
  const map = new Map<string, string>(),
    storage = { getItem: (k: string) => map.get(k) ?? null };
  const support = {
    ...emptySupport(d.id),
    rules: [{ ...rule(), review: { by: 'QA', at: new Date().toISOString() } }],
    assemblies: [captureAssembly(d, ['one'], 'Reusable', 'Notes')],
    warranties: [
      {
        id: 'w',
        itemId: 'one',
        product: 'B24',
        serial: 'S1',
        provider: 'QA',
        contact: '',
        starts: '2026-09-15',
        expires: '2027-09-15',
        terms: 'Recorded terms',
        parts: 'HINGE-QA',
      },
    ],
    cases: [
      {
        id: 'service',
        itemId: 'one',
        title: 'Adjust drawer',
        status: 'scheduled',
        assignee: 'QA',
        visit: '2026-10-01',
        note: 'Bring hinge',
        partSku: 'HINGE-QA',
      },
    ],
  };
  map.set(`kitchen-product-support:owner:${d.id}`, JSON.stringify(support));
  const b = collectProjectBackup(storage, 'owner', d);
  const restored = restoreProjectCopy(b, 'copy');
  assert.equal(restored.support?.designId, 'copy');
  assert.equal(restored.support?.rules[0]?.review, undefined);
  assert.equal(restored.support?.warranties[0]?.parts, 'HINGE-QA');
  assert.equal(restored.support?.cases[0]?.visit, '2026-10-01');
  assert.equal(restored.support?.assemblies[0]?.items.length, 2);
  assert.throws(() =>
    warrantySchema.parse({
      ...support.warranties[0],
      starts: '2027-09-15',
      expires: '2026-09-15',
    }),
  );
});
test('field label packages retain immutable ordered locations and delivery records', () => {
  const { d } = fixture(),
    p = makePurchase(d, 'PO-1', '');
  p.receipts = [
    {
      itemId: 'one',
      status: 'damaged',
      note: 'Corner',
      updatedAt: new Date().toISOString(),
    },
  ];
  const changed = { ...d, items: d.items.map((i) => ({ ...i, x: i.x + 10 })) };
  const packet = fieldPackage(changed, emptyCloseout(d.id), {
    format: 'kitchen-purchasing-v1',
    designId: d.id,
    changes: [],
    purchases: [p],
  });
  assert.equal(packet.purchases?.[0]?.items[0]?.x, 12);
  assert.equal(packet.purchases?.[0]?.receipts[0]?.status, 'damaged');
  assert.equal(parseDesign(packet.designJson).items[0]?.x, 22);
});
