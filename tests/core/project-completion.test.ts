import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, parseDesign } from '../../src/designer/model';
import {
  emptyCloseout,
  starterCloseout,
  signCloseout,
  isClosed,
  fieldPackage,
  mergeFieldReport,
  handoverDocument,
  parseCloseout,
} from '../../src/designer/closeout';
import {
  emptyPurchasing,
  makePurchase,
  parsePurchasing,
  approvalFromReview,
  designSnapshot,
} from '../../src/designer/purchasing';
import { emptyConfirmation } from '../../src/designer/supplier-confirmation';
import {
  collectProjectBackup,
  parseProjectBackup,
  restoreProjectCopy,
} from '../../src/designer/project-backup';
import { dashboardSummary } from '../../src/designer/project-dashboard';
import { writeLocalBatch } from '../../src/designer/local-project-events';
import { createMilestone } from '../../src/designer/project-workflow';
function fixture() {
  const d = {
    ...newDesign(),
    items: [
      { ...fromObject('custom_cabinet'), id: 'one', sku: 'B24', x: 12, y: 0 },
    ],
  };
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
  return { d, map, storage };
}
test('complete backup preserves every local project collection and restores an isolated copy', () => {
  const { d, storage } = fixture();
  d.siteTasks = [
    {
      id: 'site',
      wall: 0,
      title: 'Socket',
      notes: 'Photo evidence',
      status: 'open',
      assignee: 'QA',
      updatedAt: new Date().toISOString(),
      photo: 'data:image/jpeg;base64,YQ==',
    },
  ];
  const approval = approvalFromReview(
    {
      designJson: designSnapshot(d),
      revision: 1,
      comments: [{ kind: 'approval', name: 'QA' }],
    },
    d,
  );
  const history = {
    ...createMilestone(d, 'Approved', 'Client selection'),
    approval,
  };
  const purchase = makePurchase(
    d,
    'PO-1',
    'Check availability',
    undefined,
    approval,
  );
  purchase.confirmation = {
    ...emptyConfirmation(),
    reference: 'S-1',
    confirmedOn: '2026-09-15',
    lines: [
      {
        lineId: 'one',
        confirmedQuantity: 1,
        leadDays: 7,
        expectedDelivery: '2026-09-22',
        substituteSku: '',
        substitution: 'none',
        note: 'In stock',
      },
    ],
  };
  storage.setItem(
    `kitchen-project-history:owner:${d.id}`,
    JSON.stringify({
      format: 'kitchen-milestones-v1',
      designId: d.id,
      entries: [history],
    }),
  );
  storage.setItem(
    `kitchen-purchasing:owner:${d.id}`,
    JSON.stringify({
      ...emptyPurchasing(d.id),
      baseline: { designJson: designSnapshot(d), approval },
      purchases: [purchase],
    }),
  );
  const closeout = starterCloseout(d.id, 'Kitchen');
  storage.setItem(`kitchen-closeout:owner:${d.id}`, JSON.stringify(closeout));
  storage.setItem(
    'kitchen-directory:owner',
    JSON.stringify({
      [d.id]: {
        client: 'QA family',
        room: 'Main kitchen',
        tags: 'priority',
        status: 'installed',
        archived: true,
        skus: ['B24'],
      },
    }),
  );
  const bundle = collectProjectBackup(storage, 'owner', d);
  assert.equal(bundle.history.length, 1);
  assert.equal(bundle.purchasing.purchases[0]?.confirmation?.reference, 'S-1');
  assert.equal(
    bundle.design.siteTasks?.[0]?.photo,
    'data:image/jpeg;base64,YQ==',
  );
  const restored = restoreProjectCopy(bundle, 'restored-id');
  assert.equal(restored.design.id, 'restored-id');
  assert.equal(restored.purchasing.designId, 'restored-id');
  assert.equal(
    parseDesign(restored.history[0]?.designJson ?? '').id,
    'restored-id',
  );
  assert.equal(restored.history[0]?.approval, undefined);
  assert.equal(restored.purchasing.purchases[0]?.approval, undefined);
  assert.equal(restored.closeout.designId, 'restored-id');
  assert.ok(restored.purchasing.baselineReference);
  assert.equal(
    parseDesign(restored.purchasing.baselineReference).id,
    'restored-id',
  );
  assert.equal(restored.organization.client, 'QA family');
  assert.equal(restored.organization.archived, false);
  assert.equal(bundle.design.id, d.id);
});
test('complete backup rejects cross-project records before a restore can write', () => {
  const { d, storage } = fixture();
  const b = collectProjectBackup(storage, 'owner', d);
  b.purchasing.designId = 'other';
  assert.throws(() => parseProjectBackup(JSON.stringify(b)), /another project/);
  assert.throws(() => parseProjectBackup(' '.repeat(6000001)), /exceeds/);
});
test('atomic local restore rolls back writes when storage quota is exceeded', () => {
  const { storage } = fixture();
  storage.setItem('old', 'preserved');
  let writes = 0;
  const failing = {
    ...storage,
    setItem: (k: string, v: string) => {
      if (++writes === 3) throw Error('Quota');
      storage.setItem(k, v);
    },
  };
  assert.throws(
    () =>
      writeLocalBatch(failing, [
        ['old', 'new'],
        ['new', 'one'],
        ['fails', 'two'],
      ]),
    /Quota/,
  );
  assert.equal(storage.getItem('old'), 'preserved');
  assert.equal(storage.getItem('new'), null);
  assert.equal(storage.getItem('fails'), null);
});
test('completion requires all checks and becomes stale after design or finding edits', () => {
  const { d } = fixture();
  const c = starterCloseout(d.id, 'Kitchen');
  assert.throws(() => signCloseout(d, c, 'Installer'), /Resolve every/);
  const done = {
    ...c,
    tasks: c.tasks.map((t) => ({ ...t, status: 'done' as const })),
  };
  const signed = signCloseout(d, done, 'Installer');
  assert.ok(isClosed(d, signed));
  assert.equal(
    isClosed({ ...d, room: { ...d.room, width: d.room.width + 1 } }, signed),
    false,
  );
  assert.equal(isClosed(d, { ...signed, care: 'New care notes' }), false);
  assert.equal(parseCloseout(JSON.stringify(signed), d.id).signoff, undefined);
  assert.equal(isClosed(d, emptyCloseout(d.id)), false);
});
test('field reports transfer findings and reject changed baselines, foreign projects and repeated imports', () => {
  const { d } = fixture();
  const c = starterCloseout(d.id, 'Kitchen'),
    p = fieldPackage(d, c);
  const returned = {
    ...c,
    tasks: c.tasks.map((t) => ({
      ...t,
      status: 'done' as const,
      note: 'Checked on site',
    })),
  };
  const report = JSON.stringify({
    format: 'kitchen-field-report-v1',
    reportId: 'report',
    designJson: p.designJson,
    source: p.source,
    returned,
  });
  const merged = mergeFieldReport(report, d, c);
  assert.equal(merged.tasks[0]?.note, 'Checked on site');
  assert.equal(merged.signoff, undefined);
  assert.throws(() => mergeFieldReport(report, d, merged), /Closeout changed/);
  assert.throws(
    () =>
      mergeFieldReport(
        report,
        { ...d, room: { ...d.room, width: d.room.width + 1 } },
        c,
      ),
    /Design changed/,
  );
  assert.throws(
    () => mergeFieldReport(report, { ...d, id: 'other' }, c),
    /another project/,
  );
});
test('supplier confirmations enforce quantity bounds, known lines and real dates', () => {
  const { d } = fixture(),
    purchase = makePurchase(d, 'PO-1', '');
  const confirmation = {
    ...emptyConfirmation(),
    lines: [
      {
        lineId: 'one',
        confirmedQuantity: 2,
        leadDays: 7,
        expectedDelivery: '2026-09-25',
        substituteSku: '',
        substitution: 'none' as const,
        note: '',
      },
    ],
  };
  const raw = () =>
    JSON.stringify({
      ...emptyPurchasing(d.id),
      purchases: [{ ...purchase, confirmation }],
    });
  assert.throws(() => parsePurchasing(raw(), d.id), /quantity exceeds/);
  const line = confirmation.lines[0];
  assert.ok(line);
  line.confirmedQuantity = 1;
  line.lineId = 'missing';
  assert.throws(() => parsePurchasing(raw(), d.id), /unknown line/);
  line.lineId = 'one';
  line.expectedDelivery = '2026-02-30';
  assert.throws(() => parsePurchasing(raw(), d.id), /valid date/);
});
test('dashboard counts shortages, overdue lines, pending confirmations and installation work', () => {
  const { d, storage } = fixture();
  const b = collectProjectBackup(storage, 'owner', d);
  const p = makePurchase(d, 'PO-1', '');
  p.receipts = [
    {
      itemId: 'one',
      status: 'damaged',
      note: 'Corner',
      updatedAt: new Date().toISOString(),
    },
  ];
  p.confirmation = {
    ...emptyConfirmation(),
    reference: 'S1',
    confirmedOn: '2026-09-01',
    lines: [
      {
        lineId: 'one',
        confirmedQuantity: 1,
        leadDays: 7,
        expectedDelivery: '2026-09-08',
        substituteSku: 'B24-ALT',
        substitution: 'proposed',
        note: 'Review dimensions',
      },
    ],
  };
  b.purchasing.purchases = [p];
  b.closeout = starterCloseout(d.id, 'Kitchen');
  const summary = dashboardSummary(b, Date.parse('2026-09-15'));
  assert.match(
    summary.rows.find((r) => r.id === 'delivery')?.detail ?? '',
    /1 missing\/damaged.*1 overdue/,
  );
  assert.equal(summary.rows.find((r) => r.id === 'supplier')?.count, 1);
  assert.equal(summary.rows.find((r) => r.id === 'closeout')?.count, 5);
});
test('handover escapes user text, retains photos and labels unfinished jobs as draft', () => {
  const { d } = fixture();
  const c = starterCloseout(d.id, '<script>bad</script>');
  c.care = '<img onerror=bad>';
  const html = handoverDocument(d, c);
  assert.ok(html.includes('DRAFT'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>bad'));
  assert.ok(html.includes('&lt;img'));
});
