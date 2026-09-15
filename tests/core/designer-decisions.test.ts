import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromObject,
  designSchema,
  parseDesign,
  type Design,
} from '../../src/designer/model';
import {
  pricedProposals,
  changeImpact,
  storageRecommendations,
  explainedChecks,
  type CatalogChoice,
} from '../../src/designer/design-decisions';
import {
  priceRequest,
  parsePriceBook,
  itemConfiguration,
} from '../../src/designer/supplier-pricing';
import {
  defaultStorageProfile,
  siteTasksSchema,
} from '../../src/designer/decision-schema';
import {
  handoffPackage,
  parseHandoff,
  siteReport,
  mergeSiteReport,
} from '../../src/designer/installer-handoff';
function fixture() {
  const item = {
    ...fromObject('custom_cabinet'),
    id: 'cabinet',
    sku: 'B24',
    x: 12,
    y: 0,
    width: 24,
    depth: 24,
    height: 34.5,
    frontStyle: 'auto' as const,
  };
  const design: Design = { ...newDesign(), items: [item] };
  const base = priceRequest(design).lines[0];
  if (!base) throw Error('Fixture needs item');
  const book = parsePriceBook(
    JSON.stringify({
      supplier: 'Synthetic test',
      reference: 'Test fixture only',
      currency: 'USD',
      validUntil: '2099-01-01',
      lines: [
        { ...base, unitPrice: 500 },
        { ...base, finish: 'linen', unitPrice: 300 },
        {
          ...base,
          configuration: itemConfiguration({ ...item, frontStyle: 'drawers' }),
          unitPrice: 650,
        },
      ],
    }),
  );
  return { item, design, book };
}
const settings = { preserveDrawers: true, protectedIds: [] };
test('priced proposals provide distinct cost and storage tiers without changing geometry or mutating input', () => {
  const { design, book } = fixture(),
    before = JSON.stringify(design);
  const result = pricedProposals(design, book, [], {
    ...settings,
    target: 35000,
  });
  assert.equal(result.proposals.length, 3);
  assert.deepEqual(
    result.proposals.map((p) => p.total),
    [30000, 50000, 65000],
  );
  assert.equal(result.achieved, true);
  assert.equal(result.budgetTotal, 30000);
  assert.equal(JSON.stringify(design), before);
  for (const p of result.proposals) {
    assert.equal(p.design.items[0]?.id, 'cabinet');
    assert.equal(p.design.items[0]?.x, 12);
    assert.equal(p.design.items[0]?.width, 24);
  }
});
test('budget respects protected items, locked assemblies and drawer retention and reports unreachable targets', () => {
  const { design, book, item } = fixture();
  assert.equal(
    pricedProposals(design, book, [], {
      ...settings,
      protectedIds: [item.id],
      target: 10000,
    }).budgetTotal,
    50000,
  );
  assert.equal(
    pricedProposals(
      { ...design, items: [{ ...item, locked: true }] },
      book,
      [],
      { ...settings, target: 10000 },
    ).achieved,
    false,
  );
  const drawers = { ...item, frontStyle: 'drawers' as const };
  assert.equal(
    pricedProposals({ ...design, items: [drawers] }, book, [], settings)
      .budgetTotal,
    65000,
  );
  assert.equal(
    pricedProposals({ ...design, items: [drawers] }, book, [], {
      ...settings,
      preserveDrawers: false,
    }).budgetTotal,
    30000,
  );
  const locked = {
    ...item,
    id: 'locked',
    x: 50,
    assemblyId: 'a',
    locked: true,
  };
  assert.equal(
    pricedProposals(
      { ...design, items: [{ ...item, assemblyId: 'a' }, locked] },
      book,
      [],
      settings,
    ).budgetTotal,
    100000,
  );
});
test('alternate SKUs require matching human-verified catalog facts and retain their new provenance', () => {
  const { design, book, item } = fixture();
  const placed = {
    ...item,
    kind: 'cabinet' as const,
    recordId: 'old',
    versionId: 'v',
  };
  const line = book.lines[0];
  if (!line) throw Error('Missing fixture');
  book.lines.push({ ...line, sku: 'LOW24', unitPrice: 200 });
  const record: CatalogChoice = {
    _id: 'new',
    sku: 'LOW24',
    versionId: 'v',
    category: item.category,
    width: 24,
    depth: 24,
    height: 34.5,
    pageNumber: 7,
    reviewStatus: 'approved',
    truthVerified: true,
    blockers: [],
  };
  const d = { ...design, items: [placed] };
  const valid = pricedProposals(d, book, [record], settings).budget.items[0];
  assert.equal(valid?.sku, 'LOW24');
  assert.equal(valid?.recordId, 'new');
  assert.equal(valid?.pageNumber, 7);
  for (const bad of [
    { ...record, truthVerified: false },
    { ...record, blockers: ['unknown'] },
    { ...record, versionId: 'other' },
    { ...record, width: 25 },
    { ...record, category: 'different' },
  ])
    assert.notEqual(
      pricedProposals(d, book, [bad], settings).budget.items[0]?.sku,
      'LOW24',
    );
});
test('expired, incomplete and malicious configurations cannot produce an orderable proposal', () => {
  const { design, book } = fixture();
  assert.throws(
    () =>
      pricedProposals(
        design,
        { ...book, validUntil: '2000-01-01' },
        [],
        settings,
      ),
    /current/,
  );
  assert.throws(
    () => pricedProposals(design, { ...book, lines: [] }, [], settings),
    /current/,
  );
  const line = book.lines[0];
  if (!line) throw Error('Missing fixture');
  book.lines.push({
    ...line,
    configuration: '{"x":500,"frontStyle":"drawers"}',
    unitPrice: 1,
  });
  assert.equal(pricedProposals(design, book, [], settings).budgetTotal, 30000);
});
test('change impact identifies linked worktops, price gaps, geometric conflicts and resolved warnings', () => {
  const { design, item, book } = fixture();
  const top = {
    ...fromObject('countertop'),
    id: 'top',
    x: 12,
    y: 0,
    width: 24,
    depth: 24,
    elevation: 34.5,
  };
  const before = { ...design, items: [item, top] },
    after = {
      ...before,
      items: [{ ...item, x: 140, frontStyle: 'glass' as const }, top],
    };
  const impact = changeImpact(before, after, book);
  assert.deepEqual(impact.changed, ['cabinet']);
  assert(impact.affected.includes('top'));
  assert(impact.added.some((w) => w.id === 'outside-cabinet'));
  assert(impact.missingPrices.includes('B24'));
  assert.equal(impact.quoteAfter, null);
  assert.equal(impact.needsReview, true);
  assert(
    changeImpact(after, before).resolved.some(
      (w) => w.id === 'outside-cabinet',
    ),
  );
});
test('storage planning explains household assumptions and persists through legacy-compatible design serialization', () => {
  const { design } = fixture();
  const profile = {
    ...defaultStorageProfile,
    household: 6,
    cookware: 'extensive' as const,
    reach: 'low' as const,
    pantry: 'bulk' as const,
  };
  const d = designSchema.parse({ ...design, storageProfile: profile });
  const recommendations = storageRecommendations(d, profile);
  assert(recommendations.some((r) => r.reason.includes('144')));
  assert(recommendations.some((r) => r.reason.includes('36 in')));
  assert.deepEqual(parseDesign(JSON.stringify(d)).storageProfile, profile);
  assert.equal(parseDesign(JSON.stringify(design)).storageProfile, undefined);
});
test('explanations distinguish geometry from source-backed installation profiles', () => {
  const { design, item } = fixture();
  const checks = explainedChecks({ ...design, items: [{ ...item, x: 145 }] });
  assert(
    checks.some((c) => c.basis.includes('geometry') && c.sources.length === 0),
  );
  const appliance = {
    ...fromObject('dishwasher'),
    installation: {
      profile: 'bosch-shp65cm5n',
      voltage: 0,
      circuitAmps: 0,
      water: 'unknown' as const,
      drain: false,
      vent: 'unknown' as const,
      ductDiameter: 0,
      notes: '',
    },
  };
  assert(
    explainedChecks({ ...design, items: [appliance] }).some((c) =>
      c.sources.some((s) => s.href.includes('bosch-home.com')),
    ),
  );
});
test('installer handoffs round trip and site reports merge only against unchanged source geometry and tasks', () => {
  const { design } = fixture();
  const handoff = parseHandoff(JSON.stringify(handoffPackage(design)));
  const tasks = [
    {
      id: 'task',
      wall: 0,
      title: 'Check wall',
      notes: 'Outlet moved',
      status: 'open' as const,
      assignee: 'Installer',
      updatedAt: '2026-09-15',
    },
  ];
  const text = JSON.stringify(
    siteReport(handoff.design, { ...handoff.design, siteTasks: tasks }),
  );
  const merged = mergeSiteReport(design, text);
  assert.deepEqual(merged.items, design.items);
  assert.deepEqual(merged.siteTasks, tasks);
  assert.throws(
    () =>
      mergeSiteReport(
        { ...design, room: { ...design.room, width: 150 } },
        text,
      ),
    /changed/,
  );
  assert.throws(
    () => mergeSiteReport({ ...design, siteTasks: tasks }, text),
    /tasks changed/,
  );
  assert.throws(
    () => mergeSiteReport({ ...design, id: 'other' }, text),
    /changed/,
  );
  const reordered = JSON.parse(JSON.stringify(design)) as Design;
  reordered.room = { ...design.room };
  assert.deepEqual(mergeSiteReport(reordered, text).siteTasks, tasks);
});
test('site records reject duplicate identifiers, executable photos and excessive attachments', () => {
  const task = {
    id: 'a',
    wall: 0,
    title: 'Question',
    notes: '',
    assignee: '',
    status: 'open',
    updatedAt: 'now',
  };
  assert.equal(siteTasksSchema.safeParse([task, task]).success, false);
  assert.equal(
    siteTasksSchema.safeParse([
      { ...task, photo: 'data:image/svg+xml,<svg onload="alert(1)"/>' },
    ]).success,
    false,
  );
  assert.equal(
    siteTasksSchema.safeParse(
      Array.from({ length: 5 }, (_, i) => ({
        ...task,
        id: String(i),
        photo: 'data:image/jpeg;base64,AAAA',
      })),
    ).success,
    false,
  );
});

test('client comparison renders complete totals, escapes supplied text, and rejects expired proposals', async () => {
  const { proposalDocument } =
    await import('../../src/designer/proposal-document');
  const { design, book } = fixture();
  book.supplier = '<script>alert(1)</script>';
  const proposals = pricedProposals(design, book, [], settings).proposals;
  const html = proposalDocument(proposals, book, 2);
  assert(html.includes('$300.00'));
  assert(html.includes('$650.00'));
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
  assert.throws(
    () => proposalDocument(proposals, { ...book, validUntil: '2000-01-01' }, 2),
    /current/,
  );
});
