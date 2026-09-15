'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import {
  inspectSiteReport,
  resolveSiteReport,
  type SiteResolution,
} from '@/designer/installer-handoff';
import { roomEdges } from '@/designer/room';
import { MiniPlan } from './workflow-tools';
export function SiteReportMerge({
  design,
  text,
  onChange,
  onClose,
}: {
  design: Design;
  text: string;
  onChange: (d: Design) => void;
  onClose: () => void;
}) {
  const [review, setReview] = useState(() => inspectSiteReport(design, text));
  const [resolutions, setResolutions] = useState<SiteResolution[]>([]),
    [ack, setAck] = useState(false),
    [error, setError] = useState('');
  const set = (id: string, patch: Partial<SiteResolution>) =>
    setResolutions((previous) => [
      ...previous.filter((r) => r.id !== id),
      { id, choice: 'current', ...previous.find((r) => r.id === id), ...patch },
    ]);
  return (
    <section className="decision-preview" aria-label="Resolve installer report">
      <h3>Review installer findings</h3>
      <p>
        {review.rows.length} changed findings ·{' '}
        {review.rows.filter((r) => r.conflict).length} conflicting site notes.
        Choose what to keep for each finding.
      </p>
      {review.geometryChanged && (
        <>
          <p role="alert">
            Room or item geometry changed since this handoff. Check the wall
            assignment for each incoming finding.
          </p>
          <div className="business-grid">
            <div>
              <h4>Original handoff</h4>
              <MiniPlan design={review.before} />
            </div>
            <div>
              <h4>Current design</h4>
              <MiniPlan design={design} />
            </div>
          </div>
          <label>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I checked incoming wall locations against the current plan.
          </label>
        </>
      )}
      {review.rows.map((row) => (
        <article className="decision-card" key={row.id}>
          <h4>
            {row.incoming?.title ?? row.current?.title ?? row.original?.title} ·{' '}
            {row.conflict ? 'Conflict' : 'Installer change'}
          </h4>
          <div className="business-grid">
            {[
              ['Original', row.original],
              ['Current', row.current],
              ['Returned', row.incoming],
            ].map(([label, value]) => {
              const task = value as typeof row.current;
              return (
                <div key={label as string}>
                  <strong>{label as string}</strong>
                  <p>
                    {task
                      ? `Wall ${task.wall + 1} · ${task.status} · ${task.assignee || 'Unassigned'}`
                      : 'Deleted / absent'}
                  </p>
                  <p>{task?.notes}</p>
                  {task?.photo && (
                    <img
                      src={task.photo}
                      alt={`${label as string} site finding`}
                      width={160}
                      style={{ maxWidth: '100%' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <label>
            Resolution
            <select
              aria-label={`Resolution: ${row.incoming?.title ?? row.original?.title}`}
              value={resolutions.find((r) => r.id === row.id)?.choice ?? ''}
              onChange={(e) =>
                set(row.id, {
                  choice: e.target.value as SiteResolution['choice'],
                })
              }
            >
              <option value="" disabled>
                Choose resolution
              </option>
              <option value="current">Keep current</option>
              <option value="incoming">
                Use returned {row.incoming ? 'finding' : 'deletion'}
              </option>
              {row.incoming && (
                <option value="both">Keep current and add returned copy</option>
              )}
            </select>
          </label>
          {row.incoming && (
            <label>
              Incoming wall
              <select
                aria-label={`Incoming wall: ${row.incoming.title}`}
                value={
                  resolutions.find((r) => r.id === row.id)?.wall ??
                  row.incoming.wall
                }
                onChange={(e) => set(row.id, { wall: Number(e.target.value) })}
              >
                {roomEdges(design.room).map((e) => (
                  <option key={e.index} value={e.index}>
                    Wall {e.index + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
      <div className="designer-row">
        <button
          disabled={resolutions.length !== review.rows.length}
          onClick={() => {
            try {
              onChange(
                resolveSiteReport(
                  design,
                  text,
                  resolutions,
                  ack,
                  review.source,
                ),
              );
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Merge selected findings
        </button>
        <button
          onClick={() => {
            try {
              setReview(inspectSiteReport(design, text));
              setResolutions([]);
              setAck(false);
              setError('');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Refresh report comparison
        </button>
        <button onClick={onClose}>Cancel report review</button>
      </div>
    </section>
  );
}
