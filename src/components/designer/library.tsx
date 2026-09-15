'use client';
import { setActiveDrop } from '@/designer/drop';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { Search, Plus } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { RecordListRow } from '@/lib/workspace-types';
import type { Product } from '@/designer/model';
import { canPlace } from '@/designer/model';
export function CabinetIcon({ wall = false }: { wall?: boolean }) {
  return (
    <svg width="42" height="50" viewBox="0 0 42 50" aria-hidden="true">
      <path
        d={
          wall
            ? 'M5 12 L15 6 L37 12 L27 18 Z M5 12 V36 L27 43 V18 M27 43 L37 35 V12'
            : 'M5 8 L15 3 L37 8 L27 14 Z M5 8 V40 L27 47 V14 M27 47 L37 40 V8'
        }
        fill="#f1ede5"
        stroke="#75828a"
      />
      <path
        d={
          wall
            ? 'M8 16 L24 21 V38 L8 33 Z'
            : 'M8 15 L24 19 V41 L8 36 Z M8 22 L24 26'
        }
        fill="none"
        stroke="#a0a8a8"
      />
    </svg>
  );
}
export function Library({
  version,
  onAdd,
}: {
  version: Doc<'versions'> | undefined;
  onAdd: (product: Product, versionId: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('base_cabinet'),
    [offset, setOffset] = useState(0);
  const raw = useQuery(
    api.workspace.browseCatalog,
    version
      ? {
          versionId: version._id,
          query,
          category: category || undefined,
          offset,
        }
      : 'skip',
  );
  const result = raw
    ? (JSON.parse(raw) as { total: number; records: RecordListRow[] })
    : undefined;
  return (
    <section className="designer-library" aria-label="Cabinet library">
      <h2>Cabinet library</h2>
      <p className="designer-muted">Allure · source-linked products</p>
      <label className="library-search">
        <Search size={15} />
        <input
          aria-label="Search cabinet SKU"
          placeholder="Search SKU…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      <select
        aria-label="Cabinet category"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setOffset(0);
        }}
      >
        <option value="base_cabinet">Base cabinets</option>
        <option value="wall_cabinet">Wall cabinets</option>
        <option value="pantry">Pantry cabinets</option>
        <option value="oven_cabinet">Oven cabinets</option>
        <option value="">All products</option>
      </select>
      <div className="library-results">
        {!version ? (
          <p>Load a catalog in Documents to start placing cabinets.</p>
        ) : !result ? (
          <p>Loading cabinets…</p>
        ) : (
          <>
            <p className="designer-muted">{result.total} products</p>
            {result.records.map((p) => (
              <article
                className="library-product"
                key={p._id}
                draggable={canPlace(p)}
                onDragEnd={() => setActiveDrop(null)}
                onDragStart={(e) => {
                  if (!version || !canPlace(p)) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(
                    'application/x-kitchen-item',
                    JSON.stringify({
                      kind: 'product',
                      product: p,
                      versionId: version._id,
                    }),
                  );
                  setActiveDrop(
                    e.dataTransfer.getData('application/x-kitchen-item'),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <CabinetIcon wall={p.category === 'wall_cabinet'} />
                <div>
                  <strong>{p.sku}</strong>
                  <p>{p.family || p.category.replaceAll('_', ' ')}</p>
                  <small>
                    {p.width ?? '—'} W × {p.depth ?? '—'} D × {p.height ?? '—'}{' '}
                    H (in)
                  </small>
                  <button
                    disabled={!canPlace(p)}
                    onClick={() => version && onAdd(p, version._id)}
                    aria-label={`Add ${p.sku}`}
                  >
                    <Plus size={13} /> Add
                  </button>
                  {!canPlace(p) && (
                    <small className="library-unavailable">
                      {[
                        'base_cabinet',
                        'wall_cabinet',
                        'pantry',
                        'oven_cabinet',
                      ].includes(p.category)
                        ? 'Dimensions unresolved'
                        : 'Not a placeable cabinet'}
                    </small>
                  )}
                </div>
              </article>
            ))}
            {!result.records.length && (
              <p>No matching products. Try another SKU or category.</p>
            )}
            <div className="designer-row">
              <button
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Previous
              </button>
              <button
                disabled={offset + 100 >= result.total}
                onClick={() => setOffset(offset + 100)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
