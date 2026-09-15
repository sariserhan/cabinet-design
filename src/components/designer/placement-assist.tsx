'use client';
import type { Design } from '@/designer/model';
import { alignUpper, fillerSuggestions } from '@/designer/placement-assist';
export function PlacementAssist({
  design,
  selected,
  onChange,
}: {
  design: Design;
  selected: string | null;
  onChange: (d: Design) => void;
}) {
  const fillers = fillerSuggestions(design),
    upper = design.items.find(
      (i) =>
        i.id === selected &&
        i.elevation >= 40 &&
        ['cabinet', 'custom_cabinet'].includes(i.kind),
    );
  return (
    <details className="placement-assist">
      <summary>
        Placement suggestions {fillers.length ? `· ${fillers.length} gaps` : ''}
      </summary>
      <p>
        Snapping joins nearby cabinet edges. Select an upper cabinet to align it
        over the nearest base with the same rotation.
      </p>
      {upper && (
        <button onClick={() => onChange(alignUpper(design, upper.id))}>
          Align upper over base
        </button>
      )}
      {fillers.length ? (
        <ul>
          {fillers.slice(0, 12).map((f) => (
            <li key={f.id}>
              {f.width.toFixed(2)}″ gap · {f.elevation ? 'upper' : 'base'} run{' '}
              <button
                onClick={() =>
                  onChange({
                    ...design,
                    items: [...design.items, { ...f, id: crypto.randomUUID() }],
                  })
                }
              >
                Add {f.width.toFixed(2)} inch filler
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No narrow gaps found between aligned cabinets. Suggestions cover 0.5–6
          inch gaps in straight runs.
        </p>
      )}
    </details>
  );
}
