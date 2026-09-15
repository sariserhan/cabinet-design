import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, type Design } from '../../src/designer/model';
import {
  emptyJobWorkflow,
  jobFingerprint,
  measurementRows,
  orderRows,
  releaseIssues,
  approvedRevision,
  revisionDiff,
  optionComparison,
  parseJobWorkflow,
  installerPackage,
  pilotSummary,
  customerComparisonHtml,
  type JobWorkflow,
} from '../../src/designer/job-workflow';
import {
  collectProjectBackup,
  restoreProjectCopy,
} from '../../src/designer/project-backup';
const at = '2026-09-15T12:00:00.000Z';
function design(): Design {
  const d = newDesign();
  d.finish = 'linen';
  d.items = [{ ...fromObject('custom_cabinet'), x: 0, y: 0 }];
  return d;
}
function verified(d: Design) {
  const v = emptyJobWorkflow(d.id);
  v.measurements = measurementRows(d).map((r) => ({
    key: r.key,
    basis: r.basis,
    by: 'Site reviewer',
    at,
    note: 'Synthetic test observation',
    status: 'verified',
  }));
  v.checks = orderRows(d).map((r) => ({
    key: r.key,
    basis: r.basis,
    by: 'Dealer',
    at,
    note: 'Synthetic specification reference',
    status: 'verified',
  }));
  v.revisions = [
    {
      id: 'r1',
      title: 'Revision A',
      reason: 'Initial review',
      at,
      design: structuredClone(d),
      approval: {
        customer: 'Sample customer',
        recordedBy: 'Dealer',
        reference: 'Synthetic approval test',
        at,
      },
    },
  ];
  return v;
}
test('release checks require current measurements, exact product review and sign-off', () => {
  const d = design(),
    v = verified(d);
  assert.equal(releaseIssues(d, v).length, 0);
  assert.ok(approvedRevision(d, v));
  const foreign = { ...d, id: 'another-project' };
  assert.equal(approvedRevision(foreign, v), undefined);
  assert.throws(() => installerPackage(foreign, v, 'QA'));
  v.checks[0] = {
    ...(v.checks[0] as JobWorkflow['checks'][number]),
    status: 'needs_change',
  };
  assert.ok(releaseIssues(d, v).some((s) => s.includes('Fillers')));
  assert.throws(() => installerPackage(d, v, 'Dealer', true));
});
test('room, product, finish and quote changes invalidate sign-off and release checks', () => {
  const d = design(),
    v = verified(d);
  for (const mutate of [
    (n: Design) => (n.room.width += 1),
    (n: Design) => {
      const i = n.items[0];
      if (i) i.width += 1;
    },
    (n: Design) => (n.finish = 'slate'),
    (n: Design) =>
      (n.quote = {
        customer: 'Changed',
        tax: 0,
        discount: 0,
        installation: 100,
        delivery: 0,
      }),
  ]) {
    const n = structuredClone(d);
    mutate(n);
    assert.equal(approvedRevision(n, v), undefined);
    assert.ok(releaseIssues(n, v).length > 0);
    assert.ok(revisionDiff(d, n).length > 0);
  }
  const unchanged = structuredClone(d);
  unchanged.views = [];
  assert.equal(jobFingerprint(unchanged), jobFingerprint(d));
});
test('wall evidence remains current for unchanged walls and becomes stale after dimension edits', () => {
  const d = design(),
    before = measurementRows(d),
    n = structuredClone(d);
  n.room.width += 10;
  const after = measurementRows(n);
  assert.notEqual(
    before.find((r) => r.key === 'wall:0')?.basis,
    after.find((r) => r.key === 'wall:0')?.basis,
  );
  assert.equal(
    before.find((r) => r.key === 'services')?.basis,
    after.find((r) => r.key === 'services')?.basis,
  );
});
test('untrusted records cannot import release attestations; duplicate and foreign snapshots fail', () => {
  const d = design(),
    v = verified(d);
  const imported = parseJobWorkflow(JSON.stringify(v), d.id);
  assert.equal(imported.checks.length, v.checks.length);
  assert.ok(imported.checks.every((e) => e.status === 'unverified'));
  assert.equal(imported.measurements.length, v.measurements.length);
  assert.equal(imported.measurements[0]?.note, v.measurements[0]?.note);
  assert.equal(imported.revisions[0]?.approval, undefined);
  assert.ok(
    parseJobWorkflow(JSON.stringify(v), d.id, true).revisions[0]?.approval,
  );
  assert.throws(() => parseJobWorkflow(JSON.stringify(v), 'wrong'));
  assert.throws(() =>
    parseJobWorkflow(
      JSON.stringify({ ...v, revisions: [...v.revisions, ...v.revisions] }),
      d.id,
    ),
  );
});
test('complete backup restores options and history under a new ID without imported approvals', () => {
  const d = design(),
    v = verified(d);
  v.options = [
    { tier: 'Good', scope: 'Cabinets only', design: structuredClone(d) },
  ];
  const b = collectProjectBackup(
    {
      getItem: (key) =>
        key === `kitchen-job:owner:${d.id}` ? JSON.stringify(v) : null,
    },
    'owner',
    d,
  );
  assert.ok(b.job?.revisions[0]?.approval);
  const copy = restoreProjectCopy(b, 'restored');
  assert.equal(copy.job?.designId, 'restored');
  assert.equal(copy.job?.options[0]?.design.id, 'restored');
  assert.equal(copy.job?.revisions[0]?.design.id, 'restored');
  assert.equal(copy.job?.revisions[0]?.approval, undefined);
});
test('customer comparisons preserve option geometry and escape printable content', () => {
  const d = design(),
    v = emptyJobWorkflow(d.id),
    better = structuredClone(d);
  better.finish = 'oak';
  v.options = [
    { tier: 'Good', scope: '<script>alert(1)</script>', design: d },
    { tier: 'Better', scope: 'Oak finish', design: better },
  ];
  const rows = optionComparison(v);
  assert.ok((rows[1]?.delta ?? 0) > 0);
  assert.ok(rows[1]?.changes.some((c) => c.field === 'finish'));
  const html = customerComparisonHtml(v);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('not supplier quotations'));
});
test('installer ZIP content shares references and includes notes, drawings, item list and records', () => {
  const d = design(),
    v = verified(d),
    files = installerPackage(d, v, 'QA', true);
  assert.deepEqual(Object.keys(files).sort(), [
    'design.json',
    'drawings.html',
    'index.html',
    'items.csv',
    'job-records.json',
    'site-checklist.html',
  ]);
  assert.ok(files['index.html'].includes('Reviewed coordination package'));
  assert.ok(files['drawings.html'].includes('I001'));
  assert.ok(files['site-checklist.html'].includes('Installation checklist'));
  assert.ok(
    files['site-checklist.html'].includes('Synthetic test observation'),
  );
});
test('pilot reports keep rehearsal and old-revision evidence separate from real current results', () => {
  const d = design(),
    v = emptyJobWorkflow(d.id);
  v.pilot.observations = [
    {
      id: 'p',
      task: 'dealer-measure',
      participant: 'QA',
      kind: 'rehearsal',
      fingerprint: jobFingerprint(d),
      minutes: 10,
      result: 'pass',
      note: 'Rehearsal',
      at,
      resolution: '',
    },
  ];
  assert.equal(pilotSummary(v, jobFingerprint(d))[0]?.result, 'pass');
  v.pilot.kind = 'real';
  assert.equal(pilotSummary(v, jobFingerprint(d))[0]?.result, 'not tested');
  v.pilot.kind = 'rehearsal';
  d.finish = 'oak';
  assert.equal(pilotSummary(v, jobFingerprint(d))[0]?.result, 'not tested');
});
