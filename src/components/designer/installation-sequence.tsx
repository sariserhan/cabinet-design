'use client';
import { useState } from 'react';
import { type ProjectBackup } from '@/designer/project-backup';
import {
  type Operations,
  sequenceStatus,
  sequenceTaskSchema,
} from '@/designer/project-operations';
import { parseDesign, isOpening } from '@/designer/model';
import { downloadJson } from './business-tools';
export function InstallationSequence({
  bundle,
  value,
  onChange,
}: {
  bundle: ProjectBackup;
  value: Operations;
  onChange: (v: Operations) => void;
}) {
  const [purchaseId, setPurchaseId] = useState(''),
    [message, setMessage] = useState('');
  const p = bundle.purchasing.purchases.find((p) => p.id === purchaseId);
  const items = p
    ? parseDesign(p.designJson).items.filter((i) => !isOpening(i))
    : [];
  const save = (next: Operations) => {
    try {
      onChange(next);
      setMessage('Installation sequence saved.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <details className="business-panel support-panel">
      <summary>Installation sequence</summary>
      <p>
        Connect work to deliveries, site findings and prerequisite tasks. Ready
        means the selected prerequisites are satisfied; installers must assess
        actual site conditions. Completed work is flagged for recheck if a
        prerequisite changes.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          try {
            const task = sequenceTaskSchema.parse({
              id: crypto.randomUUID(),
              title: f.get('title'),
              assignee: f.get('assignee'),
              planned: f.get('planned'),
              done: false,
              purchaseId,
              itemIds: f.getAll('items'),
              siteIds: f.getAll('sites'),
              dependsOn: f.getAll('dependencies'),
            });
            onChange({ ...value, sequence: [...value.sequence, task] });
            form.reset();
            setPurchaseId('');
            setMessage('Installation task added.');
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <div className="business-grid">
          <label>
            Task
            <input
              name="title"
              aria-label="Installation task title"
              required
              maxLength={160}
            />
          </label>
          <label>
            Assigned to
            <input
              name="assignee"
              aria-label="Installation task assignee"
              maxLength={120}
            />
          </label>
          <label>
            Planned date
            <input
              type="date"
              name="planned"
              aria-label="Installation task date"
            />
          </label>
          <label>
            Purchase draft
            <select
              aria-label="Installation purchase"
              value={purchaseId}
              onChange={(e) => setPurchaseId(e.target.value)}
            >
              <option value="">No delivery dependencies</option>
              {bundle.purchasing.purchases.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.number}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Required deliveries</legend>
          {items.length ? (
            items.map((i) => (
              <label key={i.id}>
                <input type="checkbox" name="items" value={i.id} />
                {i.sku} · {i.id.slice(0, 8)}
              </label>
            ))
          ) : (
            <p>Select a purchase draft to choose items.</p>
          )}
        </fieldset>
        <fieldset>
          <legend>Required site resolutions</legend>
          {bundle.design.siteTasks?.map((t) => (
            <label key={t.id}>
              <input type="checkbox" name="sites" value={t.id} />
              {t.title}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Finish these tasks first</legend>
          {value.sequence.map((t) => (
            <label key={t.id}>
              <input type="checkbox" name="dependencies" value={t.id} />
              {t.title}
            </label>
          ))}
        </fieldset>
        <button disabled={value.sequence.length >= 60}>
          Add installation task
        </button>
      </form>
      {value.sequence.map((t) => {
        const result = sequenceStatus(t, value, bundle);
        return (
          <article className="purchase-card" key={t.id}>
            <h4>
              {t.title} — {result.status}
            </h4>
            <p>
              {result.overdue ? 'Overdue · ' : ''}
              {result.expected
                ? `Latest recorded delivery: ${result.expected}`
                : ''}
            </p>
            {result.blockers.length > 0 && (
              <ul>
                {result.blockers.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            <div className="business-grid">
              <label>
                Assigned to
                <input
                  aria-label={`Sequence assignee: ${t.title}`}
                  value={t.assignee}
                  maxLength={120}
                  onChange={(e) =>
                    save({
                      ...value,
                      sequence: value.sequence.map((x) =>
                        x.id === t.id ? { ...x, assignee: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Planned date
                <input
                  aria-label={`Sequence date: ${t.title}`}
                  type="date"
                  value={t.planned}
                  onChange={(e) =>
                    save({
                      ...value,
                      sequence: value.sequence.map((x) =>
                        x.id === t.id ? { ...x, planned: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
            </div>
            <button
              disabled={!t.done && result.blockers.length > 0}
              onClick={() =>
                save({
                  ...value,
                  sequence: value.sequence.map((x) =>
                    x.id === t.id ? { ...x, done: !x.done } : x,
                  ),
                })
              }
            >
              {t.done ? 'Reopen' : 'Complete'} {t.title}
            </button>
            <button
              disabled={value.sequence.some((x) => x.dependsOn.includes(t.id))}
              onClick={() =>
                save({
                  ...value,
                  sequence: value.sequence.filter((x) => x.id !== t.id),
                })
              }
            >
              Remove {t.title}
            </button>
          </article>
        );
      })}
      <button
        onClick={() =>
          downloadJson(
            {
              format: 'kitchen-installation-sequence-v1',
              designId: bundle.design.id,
              exportedAt: new Date().toISOString(),
              tasks: value.sequence.map((t) => ({
                ...t,
                ...sequenceStatus(t, value, bundle),
              })),
            },
            'installation-sequence.json',
          )
        }
      >
        Export installation sequence
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
