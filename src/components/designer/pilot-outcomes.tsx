'use client';
import { useState } from 'react';
import {
  type Operations,
  pilotEntrySchema,
  pilotTotals,
  stages,
} from '@/designer/project-operations';
import { downloadJson } from './business-tools';
export function PilotOutcomes({
  value,
  onChange,
}: {
  value: Operations;
  onChange: (v: Operations) => void;
}) {
  const [message, setMessage] = useState(''),
    totals = pilotTotals(value);
  const save = (v: Operations) => {
    try {
      onChange(v);
      setMessage('Pilot record saved.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <details className="business-panel support-panel">
      <summary>Pilot outcomes</summary>
      <p>
        Log observed work and feedback. Work minutes exclude rework, which is
        counted separately. A baseline is your comparison estimate; a difference
        alone does not prove the product caused savings.
      </p>
      <div className="business-grid">
        <label>
          Pilot name
          <input
            aria-label="Pilot name"
            maxLength={160}
            value={value.pilot.name}
            onChange={(e) =>
              save({
                ...value,
                pilot: { ...value.pilot, name: e.target.value },
              })
            }
          />
        </label>
        <label>
          Project evidence
          <select
            aria-label="Pilot evidence type"
            value={value.pilot.kind}
            onChange={(e) =>
              save({
                ...value,
                pilot: {
                  ...value.pilot,
                  kind: e.target.value as 'synthetic' | 'real',
                },
              })
            }
          >
            <option value="synthetic">Synthetic rehearsal</option>
            <option value="real">Real project observations</option>
          </select>
        </label>
        <label>
          Comparison baseline (minutes)
          <input
            aria-label="Pilot baseline minutes"
            type="number"
            min={0}
            max={1000000}
            value={value.pilot.baselineMinutes}
            onChange={(e) =>
              save({
                ...value,
                pilot: {
                  ...value.pilot,
                  baselineMinutes: Number(e.target.value),
                },
              })
            }
          />
        </label>
      </div>
      <p>
        <strong>{totals.totalMinutes} total minutes</strong> · {totals.rework}{' '}
        rework · {totals.quoteRevisions} quote revisions · {totals.issues}{' '}
        installation issues
      </p>
      <p>
        {totals.difference === null
          ? 'No comparison baseline recorded.'
          : `${totals.difference} minutes below entered baseline (negative means above).`}{' '}
        {value.pilot.kind === 'synthetic'
          ? 'Synthetic results are not field-pilot evidence.'
          : 'Real-project classification is self-reported.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          try {
            const entry = pilotEntrySchema.parse({
              id: crypto.randomUUID(),
              date: f.get('date'),
              stage: f.get('stage'),
              minutes: Number(f.get('minutes')),
              reworkMinutes: Number(f.get('rework')),
              quoteRevisions: Number(f.get('revisions')),
              issues: Number(f.get('issues')),
              note: f.get('note'),
            });
            onChange({
              ...value,
              pilot: {
                ...value.pilot,
                entries: [...value.pilot.entries, entry],
              },
            });
            form.reset();
            setMessage('Pilot observation added.');
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <div className="business-grid">
          <label>
            Date
            <input
              name="date"
              type="date"
              aria-label="Pilot observation date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            Stage
            <select name="stage" aria-label="Pilot stage">
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {[
            ['minutes', 'Work minutes'],
            ['rework', 'Rework minutes'],
            ['revisions', 'Quote revisions'],
            ['issues', 'Installation issues'],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                aria-label={label}
                name={name}
                type="number"
                min={0}
                max={name === 'minutes' || name === 'rework' ? 100000 : 1000}
                defaultValue={0}
              />
            </label>
          ))}
          <label>
            Observation and improvement
            <textarea
              aria-label="Pilot observation"
              name="note"
              required
              maxLength={2000}
            />
          </label>
        </div>
        <button disabled={value.pilot.entries.length >= 200}>
          Add pilot observation
        </button>
      </form>
      {value.pilot.entries.map((e) => (
        <article className="purchase-card" key={e.id}>
          <h4>
            {e.stage} · {e.date}
          </h4>
          <p>
            {e.minutes} work minutes + {e.reworkMinutes} rework minutes
          </p>
          <p>{e.note}</p>
          <button
            onClick={() =>
              save({
                ...value,
                pilot: {
                  ...value.pilot,
                  entries: value.pilot.entries.filter((x) => x.id !== e.id),
                },
              })
            }
          >
            Remove observation {e.date} {e.stage}
          </button>
        </article>
      ))}
      <button
        onClick={() =>
          downloadJson(
            {
              format: 'kitchen-pilot-outcomes-v1',
              designId: value.designId,
              ...value.pilot,
              totals,
            },
            'pilot-outcomes.json',
          )
        }
      >
        Export pilot outcomes
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
