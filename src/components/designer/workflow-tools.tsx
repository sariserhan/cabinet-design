'use client';
import { BudgetComparison } from './studio-panels';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { CameraView } from './render-view';
const RenderView = dynamic(() => import('./render-view'), { ssr: false });
import type { Design } from '@/designer/model';
import { itemPolygon } from '@/designer/model';
import { roomOutline } from '@/designer/room';
import { alignSelection } from '@/designer/editing';
import { money, quoteTotals } from '@/designer/quote';
export function SelectionTools({
  design,
  ids,
  onIds,
  onChange,
}: {
  design: Design;
  ids: string[];
  onIds: (ids: string[]) => void;
  onChange: (design: Design) => void;
}) {
  return (
    <details className="selection-tools">
      <summary>
        Multiple selection ·{' '}
        {ids.filter((id) => design.items.some((i) => i.id === id)).length}
      </summary>
      <p>
        Shift-click items in the plan, or select below. Assemblies move together
        during alignment.
      </p>
      <div className="selection-list">
        {design.items
          .filter((i) => !i.opening && i.kind !== 'door' && i.kind !== 'window')
          .map((i, n) => (
            <label key={i.id}>
              <input
                type="checkbox"
                checked={ids.includes(i.id)}
                onChange={(e) =>
                  onIds(
                    e.target.checked
                      ? [...ids, i.id]
                      : ids.filter((id) => id !== i.id),
                  )
                }
              />
              {n + 1}. {i.sku}
            </label>
          ))}
      </div>
      <div className="designer-row">
        {(
          ['left', 'right', 'top', 'bottom', 'horizontal', 'vertical'] as const
        ).map((action) => (
          <button
            key={action}
            disabled={ids.length < 2}
            onClick={() => onChange(alignSelection(design, ids, action))}
          >
            {action === 'horizontal' || action === 'vertical'
              ? `Distribute ${action}`
              : `Align ${action}`}
          </button>
        ))}
        <button onClick={() => onIds([])}>Clear selection</button>
      </div>
      <p>
        Distribution needs enough space between the outermost items. Undo
        reverses an alignment.
      </p>
    </details>
  );
}
export function MiniPlan({ design }: { design: Design }) {
  return (
    <svg
      aria-label={`${design.name} comparison plan`}
      viewBox={`-5 -5 ${design.room.width + 10} ${design.room.depth + 10}`}
    >
      <polygon
        points={roomOutline(design.room)
          .map((p) => `${p.x},${p.y}`)
          .join(' ')}
        fill="#f5f6f2"
        stroke="#526b75"
      />
      {design.items
        .filter((i) => !i.hidden)
        .map((item) => (
          <polygon
            key={item.id}
            points={itemPolygon(item)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill={item.elevation > 40 ? '#b7d6e0' : '#c9ad83'}
            fillOpacity=".7"
            stroke="#5a707a"
            strokeWidth=".5"
          />
        ))}
    </svg>
  );
}
export function CompareOptions({
  before,
  onSnapshot,
  design,
  saved,
  onDuplicate,
  onOpen,
}: {
  design: Design;
  saved: Design[];
  before?: Design | null;
  onSnapshot?: () => void;
  onDuplicate: (name: string) => void;
  onOpen: (design: Design) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [rendered, setRendered] = useState(false);
  const [original, setOriginal] = useState(true);
  const size = Math.max(
    design.room.width,
    design.room.depth,
    design.room.height,
  );
  const target: [number, number, number] = [
    design.room.width / 2,
    design.room.height * 0.22,
    design.room.depth / 2,
  ];
  const [camera, setCamera] = useState<CameraView>({
    target,
    position: [
      target[0] + size * 1.1,
      target[1] + size,
      target[2] + size * 1.3,
    ],
  });
  const [choice, setChoice] = useState(''),
    [name, setName] = useState('Option B');
  const options = saved.filter((d) => d.id !== design.id),
    reference =
      original && before
        ? before
        : (options.find((d) => d.id === choice) ?? options[0]);
  return (
    <section
      className={`compare-options ${fullscreen ? 'comparison-fullscreen' : ''}`}
    >
      <h2>Design alternatives</h2>
      <button
        onClick={() => {
          setFullscreen(!fullscreen);
          if (!fullscreen) setRendered(true);
        }}
      >
        {fullscreen
          ? 'Exit full-screen comparison · Esc'
          : 'Full-screen comparison'}
      </button>
      <div className="designer-row">
        <button
          aria-pressed={original}
          disabled={!before}
          onClick={() => setOriginal(true)}
        >
          Before / after
        </button>
        <button aria-pressed={!original} onClick={() => setOriginal(false)}>
          Saved alternatives
        </button>
        <button onClick={onSnapshot}>Use current design as before</button>
      </div>
      <p>
        {original && before
          ? 'Before is a separate saved snapshot. Your edits do not change it. Both rendered views use matching camera angles.'
          : 'Compare independent saved designs.'}
      </p>
      {!(original && before) && (
        <>
          <p>
            Create an independent copy; layouts, materials and demo prices can
            then diverge. Orders are kept with their original design.
          </p>
          <div className="designer-row">
            <input
              aria-label="Alternative name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              disabled={!name.trim()}
              onClick={() => onDuplicate(name.trim())}
            >
              Save current & create alternative
            </button>
          </div>
          <label>
            Compare with
            <select
              aria-label="Compare saved design"
              value={reference?.id ?? ''}
              onChange={(e) => {
                setChoice(e.target.value);
                setOriginal(false);
              }}
            >
              <option value="">Choose saved option</option>
              {options.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        <input
          type="checkbox"
          checked={rendered}
          onChange={(e) => setRendered(e.target.checked)}
        />{' '}
        Compare rendered views · linked cameras
      </label>
      {rendered && (
        <p>
          Orbit either view; both cameras match when you release the pointer.
        </p>
      )}
      {reference && <BudgetComparison before={reference} design={design} />}
      <div className="comparison-grid">
        {[design, reference].map((d, i) =>
          d ? (
            <article key={`${i}:${d.id}`}>
              <h3>
                {i === 0 ? 'Current: ' : original && before ? 'Before: ' : ''}
                {d.name}
              </h3>
              {rendered ? (
                <RenderView
                  design={d}
                  onChange={() => {}}
                  cameraView={camera}
                  onCamera={setCamera}
                />
              ) : (
                <MiniPlan design={d} />
              )}
              <p>
                {d.items.length} items · {d.room.width} × {d.room.depth}″ ·{' '}
                {d.finish}
              </p>
              <strong>Demo price: {money(quoteTotals(d).total)}</strong>
              {i === 1 && (
                <button onClick={() => onOpen(d)}>Open this option</button>
              )}
            </article>
          ) : (
            <p key="empty">Save an alternative to compare two layouts.</p>
          ),
        )}
      </div>
      {reference && (
        <p className="compare-difference">
          Current minus saved:{' '}
          {money(quoteTotals(design).total - quoteTotals(reference).total)} ·{' '}
          {design.items.length - reference.items.length} item difference
        </p>
      )}
    </section>
  );
}
