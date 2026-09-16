'use client';
import { useRef, useState } from 'react';
import type { Design } from '@/designer/model';
import { applyImportedPlan, readPlanDxf } from '@/designer/plan-import';
import type { ImportedPlan } from '@/designer/plan-import';
import { lengthLabel, unitsOf } from '@/designer/units';

/**
 * Reading the room out of an architect's DXF.
 *
 * The file is read, described, and only applied when the person says so:
 * an import that silently replaced the room would be the wrong way round
 * for a drawing nobody in this app produced.
 */
export function PlanImport({
  design,
  onApply,
}: {
  design: Design;
  onApply: (next: Design) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportedPlan | null>(null);
  const [error, setError] = useState('');
  const units = unitsOf(design);
  return (
    <section className="plan-import" aria-label="Import a plan">
      <h3>Start from a DXF plan</h3>
      <p className="designer-muted">
        Reads the room outline from a drawing, in the units the file states.
        Nothing else in the file is read: furniture, text and title blocks
        belong to whoever drew them. What is already placed stays where it is.
      </p>
      <input
        ref={file}
        type="file"
        accept=".dxf,application/dxf,text/plain"
        aria-label="Plan DXF file"
        onChange={async (event) => {
          const chosen = event.target.files?.[0];
          if (!chosen) return;
          setError('');
          setPlan(null);
          try {
            setPlan(readPlanDxf(await chosen.text()));
          } catch (e) {
            setError(
              e instanceof Error ? e.message : 'That file could not be read.',
            );
          } finally {
            if (file.current) file.current.value = '';
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      {plan && (
        <div className="plan-import-result">
          <p>
            <strong>
              {lengthLabel(plan.width, units)} ×{' '}
              {lengthLabel(plan.depth, units)}
            </strong>{' '}
            · {plan.outline.length} corners · read {plan.read.polylines}{' '}
            outlines and {plan.read.lines} lines
            {plan.units === 'unknown' ? '' : ` · file units ${plan.units}`}
          </p>
          {plan.notes.map((note) => (
            <p key={note} className="designer-muted">
              {note}
            </p>
          ))}
          <button
            className="designer-primary"
            onClick={() => {
              onApply(applyImportedPlan(design, plan));
              setPlan(null);
            }}
          >
            Use this room
          </button>
        </div>
      )}
    </section>
  );
}
