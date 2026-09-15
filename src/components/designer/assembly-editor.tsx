'use client';
import { useEffect, useState } from 'react';
import type { Cabinet, Design } from '@/designer/model';
import { isOpening } from '@/designer/model';
export function AssemblyEditor({
  design,
  item,
  onChange,
  moveTogether,
  onMoveTogether,
}: {
  design: Design;
  item: Cabinet;
  onChange: (next: Design) => void;
  moveTogether: boolean;
  onMoveTogether: (value: boolean) => void;
}) {
  const [checked, setChecked] = useState<string[]>([item.id]);
  useEffect(() => setChecked([item.id]), [item.id]);
  const members = item.assemblyId
    ? design.items.filter((i) => i.assemblyId === item.assemblyId)
    : [];
  return (
    <details className="assembly-editor">
      <summary>
        {members.length
          ? `Assembly · ${members.length} items`
          : 'Group into an assembly'}
      </summary>
      <p className="designer-muted">
        Group cabinets, countertops, and appliances to move and rotate them
        together. Doors and windows stay on their walls.
      </p>
      <label>
        <input
          type="checkbox"
          checked={moveTogether}
          onChange={(e) => onMoveTogether(e.target.checked)}
        />{' '}
        Move entire assembly
      </label>
      <div className="assembly-list">
        {design.items
          .filter((i) => !isOpening(i))
          .map((i, index) => (
            <label key={i.id}>
              <input
                type="checkbox"
                checked={checked.includes(i.id)}
                onChange={(e) =>
                  setChecked(
                    e.target.checked
                      ? [...checked, i.id]
                      : checked.filter((id) => id !== i.id),
                  )
                }
              />
              {index + 1}. {i.sku} · {i.x}, {i.y}
            </label>
          ))}
      </div>
      <div className="designer-row">
        <button
          disabled={checked.length < 2}
          onClick={() => {
            const existing = new Set(
              design.items
                .filter((i) => checked.includes(i.id) && i.assemblyId)
                .map((i) => i.assemblyId),
            );
            const assemblyId = crypto.randomUUID();
            onChange({
              ...design,
              items: design.items.map((i) =>
                checked.includes(i.id) ||
                (i.assemblyId && existing.has(i.assemblyId))
                  ? { ...i, assemblyId }
                  : i,
              ),
            });
          }}
        >
          Create assembly
        </button>
        <button
          disabled={!item.assemblyId}
          onClick={() =>
            onChange({
              ...design,
              items: design.items.map((i) =>
                i.assemblyId === item.assemblyId
                  ? { ...i, assemblyId: null }
                  : i,
              ),
            })
          }
        >
          Ungroup
        </button>
      </div>
    </details>
  );
}
