'use client';
import { useState } from 'react';
import { type Design, warnings } from '@/designer/model';
import { type ProjectBackup } from '@/designer/project-backup';
import { workflowStages } from '@/designer/project-operations';
import { suggestedMoves } from '@/designer/layout-fixes';
import { canonical } from '@/designer/installer-handoff';
import { MiniPlan } from './workflow-tools';
export function GuidedWorkspace({
  bundle,
  onOpen,
}: {
  bundle: ProjectBackup;
  onOpen: (label: string) => void;
}) {
  const rows = workflowStages(bundle),
    [selected, setSelected] = useState('Measure');
  const row = rows.find((r) => r.name === selected) ?? rows[0];
  if (!row) return null;
  return (
    <section
      className="business-panel support-panel"
      aria-label="Guided project workspace"
    >
      <h3>Project workspace</h3>
      <p>
        Choose a stage to see its tools and outstanding work. Counts are
        recorded checks, not certification.
      </p>
      <nav className="workflow-stages" aria-label="Guided workflow stages">
        {rows.map((r) => (
          <button
            key={r.name}
            aria-pressed={r.name === selected}
            onClick={() => setSelected(r.name)}
          >
            {r.name}
            <small>{r.count} outstanding</small>
          </button>
        ))}
      </nav>
      <h4>{row.name}</h4>
      <p>{row.detail}</p>
      <div className="designer-row">
        {row.tools.map((t) => (
          <button key={t} onClick={() => onOpen(t)}>
            {t === 'canvas' ? 'Open design canvas' : t}
          </button>
        ))}
      </div>
    </section>
  );
}
export function SuggestedFixes({
  design,
  onApply,
}: {
  design: Design;
  onApply: (d: Design) => void;
}) {
  const [issue, setIssue] = useState(''),
    [preview, setPreview] = useState<{
      before: string;
      fix: ReturnType<typeof suggestedMoves>[number];
    } | null>(null),
    [message, setMessage] = useState('');
  const issues = warnings(design);
  const stale = !!preview && preview.before !== canonical(design);
  return (
    <details className="business-panel support-panel">
      <summary>Suggested layout fixes</summary>
      <p>
        Preview a translation for an overlap or an item outside the room. Linked
        assemblies move together. Locked objects stay fixed. Dimensions and
        measured service positions stay as recorded; review installation and
        client approval after moving.
      </p>
      <label>
        Layout warning
        <select
          aria-label="Fix warning"
          value={issue}
          onChange={(e) => {
            setIssue(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">Choose a warning</option>
          {issues.map((w) => (
            <option value={w.id} key={w.id}>
              {w.message}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!issue}
        onClick={() => {
          const fixes = suggestedMoves(design, issue);
          setPreview(
            fixes[0] ? { before: canonical(design), fix: fixes[0] } : null,
          );
          setMessage(
            fixes.length
              ? 'Preview ready for review.'
              : 'No supported safe move found. Adjust the layout manually.',
          );
        }}
      >
        Find a suggested move
      </button>
      {preview && (
        <article className="purchase-card">
          <h4>{preview.fix.label}</h4>
          <p>
            {preview.fix.resolved} warning(s) resolved; no new modeled warnings.{' '}
            {stale ? 'Design changed. Generate a fresh preview.' : ''}
          </p>
          <div className="business-grid">
            <div>
              Current
              <MiniPlan design={design} />
            </div>
            <div>
              Proposed
              <MiniPlan design={preview.fix.design} />
            </div>
          </div>
          <button
            disabled={stale}
            onClick={() => {
              if (preview.before !== canonical(design)) {
                setMessage('Design changed. Generate a fresh preview.');
                return;
              }
              onApply(preview.fix.design);
              setPreview(null);
              setMessage(
                'Move applied. Use Undo to restore the previous design.',
              );
            }}
          >
            Apply suggested move
          </button>
        </article>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
