'use client';
import { projectDataChanged } from '@/designer/local-project-events';
import { useEffect, useMemo, useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { type Design, parseDesign } from '@/designer/model';
import { type CatalogChoice } from '@/designer/design-decisions';
import { parsePriceBook } from '@/designer/supplier-pricing';
import {
  stages,
  projectReadiness,
  createMilestone,
  milestoneChanges,
  milestoneSchema,
  parseMilestones,
  type Milestone,
  type Stage,
} from '@/designer/project-workflow';
import { money } from '@/designer/quote';
import { MiniPlan } from './workflow-tools';
import { downloadJson } from './business-tools';

export function ProjectWorkflow({
  design,
  ownerId,
  onNavigate,
  onLocate,
}: {
  design: Design;
  ownerId: string;
  onNavigate: (stage: Stage, target?: 'selections') => void;
  onLocate: (id: string) => void;
}) {
  const client = useConvex(),
    books = useQuery(api.supplierPricing.list, {});
  const stored =
    books?.find((b) => b._id === design.supplierBookId) ??
    (!design.supplierBookId ? books?.[0] : undefined);
  const book = useMemo(
    () => (stored ? parsePriceBook(stored.priceBookJson) : undefined),
    [stored],
  );
  const [stage, setStage] = useState<Stage>('Measure'),
    [entries, setEntries] = useState<Milestone[]>([]),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState('');
  const [title, setTitle] = useState(''),
    [reason, setReason] = useState(''),
    [selected, setSelected] = useState(''),
    [reviewLink, setReviewLink] = useState(''),
    [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<{
      key: string;
      rows: CatalogChoice[];
    } | null>(null),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(() => Date.now());
  const key = `kitchen-project-history:${ownerId}:${design.id}`;
  const idsKey = JSON.stringify([
    ...new Set(
      design.items
        .filter((i) => i.kind === 'cabinet' && i.recordId)
        .map((i) => i.recordId),
    ),
  ]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setEntries(parseMilestones(saved, design.id, true));
    } catch {
      setMessage(
        'Saved history could not be read. Export the current design before creating new milestones.',
      );
    }
    setLoaded(true);
  }, [key, design.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all(
      (JSON.parse(idsKey) as string[]).map(async (id) => {
        try {
          return (
            JSON.parse(
              await client.query(api.workspace.record, {
                recordId: id as Id<'records'>,
              }),
            ) as { record: CatalogChoice }
          ).record;
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (active)
        setCatalog({
          key: idsKey,
          rows: rows.filter((r): r is CatalogChoice => r !== null),
        });
    });
    return () => {
      active = false;
    };
  }, [idsKey, client, refresh]);
  function save(next: Milestone[]) {
    try {
      const entries = next.slice(0, 8);
      const raw = JSON.stringify({
        format: 'kitchen-milestones-v1',
        designId: design.id,
        entries,
      });
      parseMilestones(raw, design.id, true);
      localStorage.setItem(key, raw);
      setEntries(entries);
      projectDataChanged();
      setMessage(
        'Revision history saved in this browser. Export it for backup.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  const approved = entries.find((e) => e.approval);
  const readiness = projectReadiness(
    design,
    book,
    catalog?.key === idsKey ? catalog.rows : undefined,
    approved,
    now,
  );
  const entry = entries.find((e) => e.id === selected) ?? entries[0];
  const comparison = entry ? milestoneChanges(entry, design, book) : null;
  return (
    <section className="project-workflow" aria-label="Guided project workflow">
      <header>
        <div>
          <p>YOUR PROJECT</p>
          <h2>From measurement to installation</h2>
        </div>
        <strong>
          {readiness.remaining === 0
            ? 'All recorded steps complete'
            : `${readiness.remaining} readiness items need attention`}
        </strong>
      </header>
      <nav className="workflow-stages" aria-label="Project stages">
        {readiness.stages.map((s, index) => (
          <button
            key={s.stage}
            aria-pressed={stage === s.stage}
            onClick={() => setStage(s.stage)}
          >
            <span>{index + 1}</span>
            <strong>{s.stage}</strong>
            <small>{s.done ? 'Complete' : `${s.remaining} to check`}</small>
          </button>
        ))}
      </nav>
      <div className="workflow-current">
        <h3>{stage}</h3>
        {readiness.rows
          .filter((r) => r.stage === stage)
          .map((r) => (
            <p key={r.id}>
              <span aria-label={r.done ? 'Complete' : 'Needs attention'}>
                {r.done ? '✓' : '○'}
              </span>{' '}
              {r.message}
            </p>
          ))}
        <button onClick={() => onNavigate(stage)}>
          Open {stage.toLowerCase()} tools
        </button>
        {stage === 'Present' && (
          <button onClick={() => onNavigate(stage, 'selections')}>
            Compare client selections
          </button>
        )}
        <button
          onClick={() =>
            setStage(
              stages[(stages.indexOf(stage) + 1) % stages.length] ?? 'Measure',
            )
          }
        >
          Next stage
        </button>
      </div>
      <details>
        <summary>Project readiness checklist</summary>
        <p>
          This checklist reports recorded evidence and unresolved work. It does
          not certify installation or current manufacturer availability.
        </p>
        <button
          onClick={() => {
            setCatalog(null);
            setRefresh((n) => n + 1);
            setNow(Date.now());
          }}
        >
          Refresh readiness
        </button>
        <ul className="readiness-list">
          {readiness.rows.map((r) => (
            <li key={r.id}>
              <strong>
                {r.done ? '✓' : '○'} {r.stage}
              </strong>
              <p>{r.message}</p>
              <button onClick={() => onNavigate(r.stage)}>Review {r.id}</button>
              {r.itemIds.length > 0 && (
                <button onClick={() => onLocate(r.itemIds[0] ?? '')}>
                  Locate first affected item
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={() =>
            downloadJson(
              {
                design: design.name,
                checkedAt: new Date().toISOString(),
                rows: readiness.rows,
              },
              'project-readiness.json',
            )
          }
        >
          Export readiness checklist
        </button>
      </details>
      <details id="visual-revision-history">
        <summary>Visual revision history</summary>
        <p>
          Record meaningful milestones with a reason. Keep up to eight snapshots
          per project in this browser; export the history to back it up. Prices
          are captured only when complete and current.
        </p>
        <div className="business-grid">
          <label>
            Milestone name
            <input
              aria-label="Milestone name"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Reason for this revision
            <textarea
              aria-label="Revision reason"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
        <button
          disabled={!loaded || !title.trim() || !reason.trim()}
          onClick={() => {
            try {
              const next = createMilestone(
                design,
                title,
                reason,
                book,
                stored?.revision,
              );
              save([next, ...entries]);
              setSelected(next.id);
              setTitle('');
              setReason('');
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        >
          Record revision milestone
        </button>
        <details>
          <summary>Capture client-approved revision</summary>
          <p>
            Paste an active review link that has an approval. We read the exact
            shared snapshot and approval activity. Names are self-reported, as
            in the review workflow. The original quote total is not available
            from the review snapshot.
          </p>
          <label>
            Approved review link
            <input
              aria-label="Approved review link"
              value={reviewLink}
              onChange={(e) => setReviewLink(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !reviewLink.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const token = reviewLink.trim().match(/[a-f0-9]{64}$/)?.[0];
                if (!token) throw Error('Paste a valid review link.');
                const review = await client.query(api.projects.getReview, {
                  token,
                });
                if (!review)
                  throw Error('Review is unavailable, expired or revoked.');
                const snapshot = parseDesign(review.designJson);
                if (snapshot.id !== design.id)
                  throw Error('This review belongs to another design.');
                const names = review.comments
                  .filter((c) => c.kind === 'approval')
                  .map((c) => c.name);
                if (!names.length)
                  throw Error('This revision has no client approval.');
                const entry = milestoneSchema.parse({
                  ...createMilestone(
                    snapshot,
                    `Approved revision ${review.revision}`,
                    'Client approval captured from an active review link.',
                  ),
                  approval: {
                    revision: review.revision,
                    names,
                    capturedAt: new Date().toISOString(),
                  },
                });
                save([entry, ...entries]);
                setSelected(entry.id);
                setReviewLink('');
                setMessage(`Captured approved revision ${review.revision}.`);
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Capture approved snapshot
          </button>
        </details>
        {!!entries.length && (
          <>
            <label>
              Compare from milestone
              <select
                aria-label="Compare from milestone"
                value={entry?.id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {new Date(e.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {entry && comparison && (
              <article className="decision-preview">
                <h3>{entry.title} → Current design</h3>
                <p>
                  <strong>Reason:</strong> {entry.reason}
                </p>
                {entry.approval && (
                  <p>
                    Captured approval for revision {entry.approval.revision} by{' '}
                    {entry.approval.names.join(', ')}.
                  </p>
                )}
                <div className="business-grid">
                  <div>
                    <h4>Milestone</h4>
                    <MiniPlan
                      design={comparison.before}
                      highlightedIds={comparison.impact.affected}
                    />
                  </div>
                  <div>
                    <h4>Current</h4>
                    <MiniPlan
                      design={design}
                      highlightedIds={comparison.impact.affected}
                    />
                  </div>
                </div>
                <p>
                  {comparison.impact.changed.length} item changes ·{' '}
                  {comparison.impact.added.length} new checks ·{' '}
                  {comparison.impact.resolved.length} resolved checks
                </p>
                {comparison.impact.roomChanged && <p>Room geometry changed.</p>}
                {comparison.impact.finishChanged && (
                  <p>Global finish or room materials changed.</p>
                )}
                {entry.price && (
                  <p>
                    Captured quote: {money(entry.price.total)} from{' '}
                    {entry.price.supplier}, list revision {entry.price.revision}
                    , valid through {entry.price.validUntil}.
                  </p>
                )}
                {entry.price && comparison.impact.quoteAfter !== null && (
                  <p>
                    Current total versus captured quote:{' '}
                    {money(comparison.impact.quoteAfter - entry.price.total)}.
                  </p>
                )}
                <p>
                  {comparison.impact.quoteBefore !== null &&
                  comparison.impact.quoteAfter !== null
                    ? `Repriced using the selected current supplier list: ${money(comparison.impact.quoteBefore)} → ${money(comparison.impact.quoteAfter)} (${money(comparison.impact.quoteAfter - comparison.impact.quoteBefore)} difference).`
                    : 'Price comparison needs complete, current prices for both configurations.'}
                </p>
                {comparison.rows.map((row) => (
                  <p key={row.id}>
                    <strong>{row.sku}:</strong> {row.changes.join(' · ')}{' '}
                    <button onClick={() => onLocate(row.id)}>
                      Locate item
                    </button>
                  </p>
                ))}
              </article>
            )}
          </>
        )}
        <div className="designer-row">
          <button
            disabled={!entries.length}
            onClick={() =>
              downloadJson(
                {
                  format: 'kitchen-milestones-v1',
                  designId: design.id,
                  entries,
                },
                'kitchen-revision-history.json',
              )
            }
          >
            Export revision history
          </button>
          <label>
            Import revision history
            <input
              aria-label="Import revision history"
              type="file"
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 900000)
                    throw Error('History file is too large.');
                  const imported = parseMilestones(
                    await file.text(),
                    design.id,
                  );
                  const unique = [
                    ...entries,
                    ...imported.filter(
                      (i) => !entries.some((e) => e.id === i.id),
                    ),
                  ].sort(
                    (a, b) =>
                      (Date.parse(b.createdAt) || 0) -
                      (Date.parse(a.createdAt) || 0),
                  );
                  save(unique);
                  setMessage(
                    'History imported; the eight most recent milestones are retained. Imported approval claims are not trusted; recapture the review link to verify them.',
                  );
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            />
          </label>
        </div>
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
