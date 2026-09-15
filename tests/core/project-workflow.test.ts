import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromObject,
  type Design,
  parseDesign,
} from '../../src/designer/model';
import { measuredDesign } from '../../src/designer/measurements';
import {
  projectReadiness,
  measurementStatus,
  createMilestone,
  parseMilestones,
  milestoneChanges,
  reviewContent,
} from '../../src/designer/project-workflow';
import {
  starterBoard,
  selectionPackage,
  selectionResponse,
  mergeSelectionResponse,
  applySelection,
  parseSelectionPackage,
} from '../../src/designer/selection-board';
import {
  inspectSiteReport,
  resolveSiteReport,
  siteReport,
  canonical,
} from '../../src/designer/installer-handoff';
import {
  priceRequest,
  parsePriceBook,
} from '../../src/designer/supplier-pricing';
import type { CatalogChoice } from '../../src/designer/design-decisions';
function fixture() {
  const survey = {
    measuredBy: 'QA survey',
    measuredAt: '2026-09-15',
    originalUnit: 'in' as const,
    north: 144,
    south: 144,
    east: 120,
    west: 120,
    height: 96,
    openings: [],
    utilities: [],
    notes: 'Synthetic test dimensions',
    confirmed: true as const,
  };
  const d = measuredDesign(survey);
  const item = {
    ...fromObject('custom_cabinet'),
    id: 'one',
    kind: 'cabinet' as const,
    recordId: 'record',
    versionId: 'version',
    sku: 'B24',
    width: 24,
    depth: 24,
    height: 34.5,
    x: 12,
    y: 0,
  };
  const design: Design = { ...d, items: [item] };
  const book = parsePriceBook(
    JSON.stringify({
      ...priceRequest(design),
      supplier: 'Test supplier',
      reference: 'Synthetic test prices',
      validUntil: '2099-01-01',
      lines: priceRequest(design).lines.map((l) => ({ ...l, unitPrice: 500 })),
    }),
  );
  const record: CatalogChoice = {
    _id: 'record',
    versionId: 'version',
    sku: 'B24',
    category: item.category,
    width: 24,
    depth: 24,
    height: 34.5,
    pageNumber: 1,
    reviewStatus: 'approved',
    truthVerified: true,
    blockers: [],
  };
  return { design, book, record };
}
const task = {
  id: 'question',
  wall: 0,
  title: 'Outlet position',
  notes: 'Original',
  status: 'open' as const,
  assignee: 'Installer',
  updatedAt: '2026-09-15',
};
test('readiness is derived from survey, source verification, current prices, actual captured approval and site tasks', () => {
  const { design, book, record } = fixture();
  const d = {
    ...design,
    siteTasks: [{ ...task, status: 'resolved' as const }],
  };
  const approval = {
    ...createMilestone(d, 'Approved', 'Test capture'),
    approval: { revision: 1, names: ['QA'], capturedAt: '2026-09-15' },
  };
  assert.equal(projectReadiness(d, book, [record], approval).remaining, 0);
  assert(projectReadiness(d, undefined, undefined).remaining >= 3);
  assert.equal(
    projectReadiness(
      d,
      { ...book, validUntil: '2000-01-01' },
      [record],
      approval,
    ).rows.find((r) => r.id === 'price')?.done,
    false,
  );
  assert.equal(
    projectReadiness(
      d,
      book,
      [{ ...record, truthVerified: false }],
      approval,
    ).rows.find((r) => r.id === 'catalog')?.done,
    false,
  );
  assert.equal(
    projectReadiness(
      {
        ...d,
        items: [{ ...d.items[0], kind: 'custom_cabinet' }] as Design['items'],
      },
      book,
      [record],
      approval,
    ).rows.find((r) => r.id === 'catalog')?.done,
    false,
  );
});
test('measurement readiness detects changed dimensions, outline, openings and wall availability', () => {
  const { design } = fixture();
  assert.equal(measurementStatus(design), null);
  assert(
    measurementStatus({ ...design, room: { ...design.room, width: 150 } }),
  );
  assert(
    measurementStatus({
      ...design,
      room: { ...design.room, walls: { ...design.room.walls, north: false } },
    }),
  );
  assert(
    measurementStatus({
      ...design,
      items: [...design.items, fromObject('door')],
    }),
  );
  assert(measurementStatus(newDesign()));
});
test('approval follows physical design changes, while site findings and selection favorites do not invalidate it', () => {
  const { design } = fixture();
  assert.equal(
    reviewContent(design),
    reviewContent({
      ...design,
      siteTasks: [task],
      selectionBoard: starterBoard(),
    }),
  );
  assert.notEqual(
    reviewContent(design),
    reviewContent({ ...design, finish: 'slate' }),
  );
  assert.notEqual(
    reviewContent(design),
    reviewContent({
      ...design,
      items: design.items.map((i) => ({ ...i, x: 20 })),
    }),
  );
});
test('milestones capture reason and price and imported files cannot manufacture approval', () => {
  const { design, book } = fixture();
  const entry = createMilestone(
    design,
    'First price',
    'Client requested drawers',
    book,
    3,
  );
  assert.equal(entry.price?.total, 50000);
  assert.equal(entry.reason, 'Client requested drawers');
  assert.throws(() => createMilestone(design, 'First', ''), /small|characters/);
  const approved = {
    ...entry,
    approval: { revision: 2, names: ['Client'], capturedAt: '2026-09-15' },
  };
  const file = JSON.stringify({
    format: 'kitchen-milestones-v1',
    designId: design.id,
    entries: [approved],
  });
  assert.equal(parseMilestones(file, design.id)[0]?.approval, undefined);
  assert.equal(
    parseMilestones(file, design.id, true)[0]?.approval?.revision,
    2,
  );
  assert.throws(() => parseMilestones(file, 'another'), /another/);
  const changed = {
    ...design,
    items: design.items.map((i) => ({ ...i, x: 30, finish: 'linen' as const })),
  };
  const diff = milestoneChanges(entry, changed, book);
  assert.equal(diff.rows.length, 1);
  assert(diff.rows[0]?.changes.some((s) => s.includes('Position')));
  assert(diff.rows[0]?.changes.some((s) => s.includes('Finish')));
});
test('selection board round trips, client preferences merge and applying a look preserves geometry', () => {
  const { design } = fixture();
  const board = starterBoard();
  const d = { ...design, selectionBoard: board };
  const pack = parseSelectionPackage(JSON.stringify(selectionPackage(d)));
  assert.equal(pack.design.selectionBoard?.cards.length, 3);
  const response = {
    ...board,
    clientName: 'QA client',
    cards: board.cards.map((c, i) => ({
      ...c,
      favorite: i === 1,
      reason: i === 1 ? 'Lighter room' : '',
    })),
  };
  const merged = mergeSelectionResponse(
    d,
    JSON.stringify(selectionResponse(d, response)),
  );
  assert.equal(merged.selectionBoard?.cards[1]?.reason, 'Lighter room');
  assert.deepEqual(merged.items, d.items);
  assert.deepEqual(
    parseDesign(JSON.stringify(merged)).selectionBoard,
    response,
  );
  const card = board.cards[1];
  if (!card) throw Error('Missing fixture');
  const applied = applySelection(d, card);
  assert.equal(applied.items[0]?.x, d.items[0]?.x);
  assert.equal(applied.items[0]?.width, d.items[0]?.width);
  assert.equal(applied.items[0]?.finish, 'linen');
  assert.equal(applied.appearance?.countertop, 'marble');
  assert.throws(
    () =>
      mergeSelectionResponse(
        { ...d, selectionBoard: { ...board, cards: board.cards.slice(1) } },
        JSON.stringify(selectionResponse(d, response)),
      ),
    /changed/,
  );
  const tampered = {
    ...response,
    cards: response.cards.map((c) => ({ ...c, cabinet: 'slate' as const })),
  };
  assert.throws(
    () =>
      mergeSelectionResponse(d, JSON.stringify(selectionResponse(d, tampered))),
    /changed/,
  );
});
test('installer three-way merge independently resolves clean edits, conflicts, deletions and copies', () => {
  const { design } = fixture();
  const source = {
    ...design,
    siteTasks: [
      task,
      { ...task, id: 'delete', title: 'Delete question' },
      { ...task, id: 'clean', title: 'Clean question' },
    ],
  };
  const returned = {
    ...source,
    siteTasks: [
      { ...task, notes: 'Installer finding' },
      {
        ...task,
        id: 'clean',
        title: 'Clean question',
        notes: 'Updated cleanly',
      },
    ],
  };
  const text = JSON.stringify(siteReport(source, returned));
  const current = {
    ...source,
    siteTasks: source.siteTasks.map((t) =>
      t.id === 'question' ? { ...t, notes: 'Designer changed this' } : t,
    ),
  };
  const review = inspectSiteReport(current, text);
  assert.equal(review.rows.length, 3);
  assert.equal(review.rows.filter((r) => r.conflict).length, 1);
  const merged = resolveSiteReport(
    current,
    text,
    [
      { id: 'question', choice: 'both' },
      { id: 'delete', choice: 'incoming' },
      { id: 'clean', choice: 'incoming' },
    ],
    false,
    review.source,
  );
  assert.equal(merged.siteTasks?.length, 3);
  assert(merged.siteTasks?.some((t) => t.notes === 'Designer changed this'));
  assert(merged.siteTasks?.some((t) => t.notes === 'Installer finding'));
  assert(!merged.siteTasks?.some((t) => t.id === 'delete'));
  assert.deepEqual(merged.items, current.items);
});
test('stale installer reports require explicit geometry acknowledgement and reject mid-review edits and invalid walls', () => {
  const { design } = fixture();
  const source = { ...design, siteTasks: [task] },
    text = JSON.stringify(
      siteReport(source, {
        ...source,
        siteTasks: [{ ...task, notes: 'Changed' }],
      }),
    );
  const current = { ...source, room: { ...source.room, width: 160 } },
    review = inspectSiteReport(current, text);
  assert.equal(review.geometryChanged, true);
  assert.throws(
    () =>
      resolveSiteReport(
        current,
        text,
        [{ id: task.id, choice: 'incoming' }],
        false,
        review.source,
      ),
    /Confirm wall/,
  );
  assert.throws(
    () =>
      resolveSiteReport(
        { ...current, name: 'New name' },
        text,
        [{ id: task.id, choice: 'incoming' }],
        true,
        review.source,
      ),
    /during review/,
  );
  assert.throws(
    () =>
      resolveSiteReport(
        current,
        text,
        [{ id: task.id, choice: 'incoming', wall: 20 }],
        true,
        review.source,
      ),
    /existing wall/,
  );
  const merged = resolveSiteReport(
    current,
    text,
    [{ id: task.id, choice: 'incoming', wall: 2 }],
    true,
    review.source,
  );
  assert.equal(merged.siteTasks?.[0]?.wall, 2);
  assert.equal(merged.room.width, 160);
  assert.throws(
    () => inspectSiteReport({ ...current, id: 'wrong' }, text),
    /another project/,
  );
  assert.equal(canonical(merged.items), canonical(current.items));
});

test('history reports countertop materials and readiness keeps generic fabricated products unverified', () => {
  const { design, book, record } = fixture();
  const top = { ...fromObject('countertop'), countertop: 'quartz' as const };
  const d = { ...design, items: [top] };
  const entry = createMilestone(d, 'Countertop', 'Initial surface');
  const current = {
    ...d,
    finish: 'linen' as const,
    items: [{ ...top, countertop: 'marble' as const }],
  };
  const diff = milestoneChanges(entry, current);
  assert(diff.rows[0]?.changes.includes('Countertop quartz → marble'));
  assert(!diff.rows[0]?.changes.some((c) => c.includes('oak → linen')));
  assert.equal(
    projectReadiness(d, book, [record]).rows.find((r) => r.id === 'catalog')
      ?.done,
    false,
  );
});
