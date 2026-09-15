'use client';
import { useState } from 'react';
import { type Design } from '@/designer/model';
import { previewEverydayEdit } from '@/designer/everyday-editing';
import { canonical } from '@/designer/installer-handoff';
import { MiniPlan } from './workflow-tools';
export function EverydayEditing({
  design,
  selectedIds,
  onApply,
  onLocate,
}: {
  design: Design;
  selectedIds: string[];
  onApply: (d: Design) => void;
  onLocate: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [x, setX] = useState('0'),
    [y, setY] = useState('0'),
    [count, setCount] = useState('1'),
    [gap, setGap] = useState('0'),
    [direction, setDirection] = useState<'right' | 'left' | 'down' | 'up'>(
      'right',
    ),
    [finish, setFinish] = useState<Design['finish']>('oak'),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<{
      source: string;
      selection: string;
      result: ReturnType<typeof previewEverydayEdit>;
    } | null>(null);
  const source = canonical(design),
    selection = canonical([...selectedIds].sort()),
    stale =
      preview && (preview.source !== source || preview.selection !== selection);
  function prepare(request: Parameters<typeof previewEverydayEdit>[2]) {
    try {
      setPreview({
        source,
        selection,
        result: previewEverydayEdit(design, selectedIds, request),
      });
      setMessage('Review the proposed edit before applying.');
    } catch (e) {
      setPreview(null);
      setMessage((e as Error).message);
    }
  }
  return (
    <details className="business-panel support-panel everyday-editing">
      <summary>Quick edits · move, repeat & finish</summary>
      <div className="quick-find">
        <label>
          Find an item
          <input
            aria-label="Find placed item"
            placeholder="SKU or item note"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {query && (
          <div className="designer-row">
            {design.items
              .filter((i) =>
                `${i.sku} ${i.note ?? ''}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((i, n) => (
                <button key={i.id} onClick={() => onLocate(i.id)}>
                  {i.sku} · {i.id.slice(0, 8)}
                  <span className="sr-only"> result {n + 1}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <p>
        {selectedIds.length} selected. Linked items move together; dimensions
        stay unchanged. Repeated copies get new identities and need fresh
        service measurements.
      </p>
      <div className="everyday-grid">
        <section>
          <h4>Move by an exact distance</h4>
          <label>
            X offset (in)
            <input
              aria-label="Move X offset"
              type="number"
              step="0.125"
              value={x}
              onChange={(e) => {
                setX(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Y offset (in)
            <input
              aria-label="Move Y offset"
              type="number"
              step="0.125"
              value={y}
              onChange={(e) => {
                setY(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <button
            disabled={!selectedIds.length}
            onClick={() =>
              prepare({ kind: 'move', x: Number(x), y: Number(y) })
            }
          >
            Preview move
          </button>
        </section>
        <section>
          <h4>Repeat a cabinet or assembly</h4>
          <label>
            Direction
            <select
              aria-label="Repeat direction"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as typeof direction);
                setPreview(null);
              }}
            >
              {['right', 'left', 'down', 'up'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Additional copies
            <input
              aria-label="Repeat copies"
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Gap between copies (in)
            <input
              aria-label="Repeat gap"
              type="number"
              min={0}
              max={120}
              step="0.125"
              value={gap}
              onChange={(e) => {
                setGap(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <button
            disabled={!selectedIds.length}
            onClick={() =>
              prepare({
                kind: 'repeat',
                direction,
                count: Number(count),
                gap: Number(gap),
              })
            }
          >
            Preview repeated run
          </button>
        </section>
        <section>
          <h4>Finish selected cabinetry</h4>
          <label>
            Finish
            <select
              aria-label="Selection finish"
              value={finish}
              onChange={(e) => {
                setFinish(e.target.value as typeof finish);
                setPreview(null);
              }}
            >
              {['linen', 'oak', 'slate'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <p>
            Available appearance choices do not establish manufacturer
            availability or supplier pricing.
          </p>
          <button
            disabled={!selectedIds.length}
            onClick={() => prepare({ kind: 'finish', finish })}
          >
            Preview selection finish
          </button>
        </section>
      </div>
      {preview && (
        <article className="purchase-card">
          <h4>Edit preview</h4>
          <p>
            {preview.result.members} existing items in scope ·{' '}
            {preview.result.addedItems} new items
          </p>
          <MiniPlan design={preview.result.design} />
          {preview.result.added.map((w) => (
            <p key={w.id}>{w.message}</p>
          ))}
          {stale && <p>Design or selection changed. Generate a new preview.</p>}
          <button
            disabled={!!stale || preview.result.blocked}
            onClick={() => {
              if (
                preview.source !== canonical(design) ||
                preview.selection !== canonical([...selectedIds].sort())
              )
                return;
              onApply(preview.result.design);
              setPreview(null);
              setMessage(
                'Edit applied as one change. Use Undo to restore the previous design.',
              );
            }}
          >
            Apply quick edit
          </button>
          <button onClick={() => setPreview(null)}>Discard preview</button>
        </article>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
