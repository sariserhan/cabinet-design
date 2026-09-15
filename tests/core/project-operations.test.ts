import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, warnings } from '../../src/designer/model';
import {
  collectProjectBackup,
  restoreProjectCopy,
} from '../../src/designer/project-backup';
import {
  emptyOperations,
  operationsSchema,
  sequenceTaskSchema,
  sequenceStatus,
  pilotTotals,
  workflowStages,
} from '../../src/designer/project-operations';
import {
  parseCatalogSnapshot,
  catalogImpact,
} from '../../src/designer/catalog-impact';
import { suggestedMoves } from '../../src/designer/layout-fixes';
import { makePurchase } from '../../src/designer/purchasing';
function required<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}
const fixture = () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      id: 'base',
      sku: 'B24',
      versionId: 'v1',
      x: 0,
      y: 0,
      width: 24,
      depth: 24,
      height: 34.5,
    },
  ];
  return collectProjectBackup({ getItem: () => null }, 'qa', d);
};
const task = (id: string, dependsOn: string[] = []) =>
  sequenceTaskSchema.parse({
    id,
    title: id,
    dependsOn,
    done: false,
    assignee: '',
    planned: '',
    purchaseId: '',
    itemIds: [],
    siteIds: [],
  });
test('guided stages expose recorded blockers and tools without asserting certification', () => {
  const b = fixture(),
    stages = workflowStages(b);
  assert.equal(stages.length, 6);
  assert.equal(stages[0]?.count, 1);
  assert.ok(required(stages.find((s) => s.name === 'Order')).count > 0);
  assert.ok(
    required(stages.find((s) => s.name === 'Design')).tools.includes(
      'Suggested layout fixes',
    ),
  );
});
test('sequence rejects missing dependencies, cycles and duplicate identifiers', () => {
  const o = emptyOperations('d');
  assert.throws(() =>
    operationsSchema.parse({ ...o, sequence: [task('a', ['b'])] }),
  );
  assert.throws(() =>
    operationsSchema.parse({
      ...o,
      sequence: [task('a', ['b']), task('b', ['a'])],
    }),
  );
  assert.throws(() =>
    operationsSchema.parse({ ...o, sequence: [task('a'), task('a')] }),
  );
});
test('sequence blocks missing deliveries and propagates invalidated completed prerequisites', () => {
  const b = fixture(),
    p = makePurchase(b.design, 'PO', '');
  b.purchasing.purchases = [p];
  const o = emptyOperations(b.design.id),
    a = { ...task('install'), purchaseId: p.id, itemIds: ['base'], done: true },
    c = task('finish', ['install']);
  o.sequence = [a, c];
  assert.equal(sequenceStatus(a, o, b).status, 'Recheck completed task');
  assert.equal(sequenceStatus(c, o, b).status, 'Blocked');
  p.receipts = [
    {
      itemId: 'base',
      status: 'received',
      note: '',
      updatedAt: new Date().toISOString(),
    },
  ];
  assert.equal(sequenceStatus(c, o, b).status, 'Ready');
  required(p.receipts[0]).status = 'damaged';
  assert.equal(sequenceStatus(c, o, b).status, 'Blocked');
});
test('site tasks, missing items and overdue work remain visible', () => {
  const b = fixture(),
    o = emptyOperations(b.design.id),
    t = { ...task('a'), siteIds: ['gone'], planned: '2020-01-01' };
  o.sequence = [t];
  assert.equal(sequenceStatus(t, o, b, '2026-09-15').overdue, true);
  assert.match(required(sequenceStatus(t, o, b).blockers[0]), /site task/);
});
test('catalog reports only scoped matching projects, dimensions and compatibility changes', () => {
  const b = fixture();
  const before = parseCatalogSnapshot(
    JSON.stringify({
      format: 'kitchen-catalog-snapshot-v1',
      catalogKey: 'M / S',
      versionId: 'v1',
      revision: '1',
      source: 'sheet1',
      complete: true,
      products: [
        {
          sku: 'B24',
          width: 24,
          depth: 24,
          height: 34.5,
          compatibility: 'hinge1',
        },
      ],
    }),
  );
  const after = {
    ...before,
    versionId: 'v2',
    revision: '2',
    products: [
      { ...required(before.products[0]), width: 30, compatibility: 'hinge2' },
    ],
  };
  const other = {
    ...b.design,
    id: 'other',
    items: b.design.items.map((i) => ({ ...i, versionId: 'different' })),
  };
  const result = catalogImpact(before, after, [b.design, other]);
  assert.deepEqual(result.changes[0]?.fields, ['width', 'compatibility']);
  assert.equal(result.affected.length, 1);
  assert.equal(b.design.items[0]?.width, 24);
  assert.equal(
    catalogImpact(before, { ...after, complete: false, products: [] }, [
      b.design,
    ]).changes[0]?.fields[0],
    'missing from partial snapshot',
  );
  assert.throws(() =>
    catalogImpact(before, { ...after, catalogKey: 'Other' }, []),
  );
});
test('suggested move resolves outside warning with linked assembly and respects locks', () => {
  const b = fixture(),
    d = b.design;
  d.items[0] = { ...required(d.items[0]), x: -2, assemblyId: 'pair' };
  d.items.push({
    ...fromObject('countertop'),
    id: 'top',
    sku: 'TOP',
    width: 24,
    depth: 24,
    height: 1.5,
    elevation: 34.5,
    x: -2,
    y: 0,
    assemblyId: 'pair',
  });
  const fix = suggestedMoves(d, 'outside-base')[0];
  assert.ok(fix);
  assert.equal(fix.design.items[0]?.x, 0);
  assert.equal(fix.design.items[1]?.x, 0);
  assert.equal(d.items[0]?.x, -2);
  assert.ok(!warnings(fix.design).some((w) => w.id.startsWith('outside')));
  required(d.items[1]).locked = true;
  assert.equal(suggestedMoves(d, 'outside-base').length, 0);
  assert.equal(suggestedMoves(d, 'ceiling-base').length, 0);
});
test('pilot totals separate work from rework and backup preserves operations', () => {
  const b = fixture(),
    o = emptyOperations(b.design.id);
  o.sequence = [task('a')];
  o.pilot = {
    name: 'Rehearsal',
    kind: 'synthetic',
    baselineMinutes: 100,
    entries: [
      {
        id: 'p',
        date: '2026-09-15',
        stage: 'Install',
        minutes: 60,
        reworkMinutes: 15,
        quoteRevisions: 2,
        issues: 1,
        note: 'Observed correction',
      },
    ],
  };
  b.operations = o;
  assert.deepEqual(pilotTotals(o), {
    minutes: 60,
    rework: 15,
    totalMinutes: 75,
    quoteRevisions: 2,
    issues: 1,
    difference: 25,
  });
  const restored = restoreProjectCopy(b, 'copy');
  assert.equal(restored.operations?.designId, 'copy');
  assert.deepEqual(restored.operations?.pilot, o.pilot);
  assert.equal(restored.operations?.sequence[0]?.id, 'a');
});

test('batch replacement can remove stale supplier references and rolls back failed writes', async () => {
  const { writeLocalBatch } =
    await import('../../src/designer/local-project-events');
  const values = new Map([
    ['old-price', 'stale'],
    ['record', 'before'],
  ]);
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === 'full') throw Error('Quota');
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  assert.throws(() =>
    writeLocalBatch(storage, [
      ['old-price', null],
      ['record', 'after'],
      ['full', 'fail'],
    ]),
  );
  assert.equal(values.get('old-price'), 'stale');
  assert.equal(values.get('record'), 'before');
  writeLocalBatch(storage, [
    ['old-price', null],
    ['record', 'after'],
  ]);
  assert.equal(values.has('old-price'), false);
  assert.equal(values.get('record'), 'after');
});
