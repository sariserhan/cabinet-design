'use client';
import { setActiveDrop } from '@/designer/drop';
import { useEffect, useState } from 'react';
import {
  publicCatalogs,
  filterPublicProducts,
  type PublicCatalog,
  type PublicProduct,
} from '@/designer/public-catalogs';
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
  const [source, setSource] = useState('workspace');
  const [placeableOnly, setPlaceableOnly] = useState(false);
  const [loaded, setLoaded] = useState<PublicCatalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const selectedCatalog = publicCatalogs.find((c) => c.id === source);
  useEffect(() => {
    if (!selectedCatalog) return;
    const controller = new AbortController();
    setLoadError('');
    void fetch(`/catalogs/${selectedCatalog.series.toLowerCase()}.json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Catalog could not be loaded');
        return response.json() as Promise<PublicCatalog>;
      })
      .then((data) => {
        if (data.catalog.id !== selectedCatalog.id)
          throw new Error('Catalog version mismatch');
        if (!controller.signal.aborted) setLoaded(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Catalog could not be loaded',
          );
      });
    return () => controller.abort();
  }, [selectedCatalog]);
  const activeVersionId = selectedCatalog?.id ?? version?._id;
  const raw = useQuery(
    api.workspace.browseCatalog,
    version && !selectedCatalog
      ? {
          versionId: version._id,
          query,
          category: category || undefined,
          offset,
        }
      : 'skip',
  );
  const workspaceResult = raw
    ? (JSON.parse(raw) as { total: number; records: RecordListRow[] })
    : undefined;
  const result:
    { total: number; records: (Product & { family?: string })[] } | undefined =
    selectedCatalog
      ? loaded?.catalog.id === selectedCatalog.id
        ? filterPublicProducts(
            placeableOnly ? loaded.products.filter(canPlace) : loaded.products,
            query,
            category,
            offset,
          )
        : undefined
      : workspaceResult;
  return (
    <section className="designer-library" aria-label="Cabinet library">
      <h2>Cabinet library</h2>
      <label>
        Catalog source
        <select
          aria-label="Catalog source"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setOffset(0);
            setQuery('');
            setCategory(e.target.value === 'workspace' ? 'base_cabinet' : '');
          }}
        >
          <option value="workspace">My workspace catalog</option>
          {publicCatalogs.map((c) => (
            <option key={c.id} value={c.id}>
              Fabuwood {c.series} · {c.productCount} reference entries
            </option>
          ))}
        </select>
      </label>
      {selectedCatalog && (
        <div className="public-catalog-notice">
          <strong>{selectedCatalog.series} · February 2026 draft</strong>
          <p>
            {selectedCatalog.productCount} entries ·{' '}
            {selectedCatalog.placeableCount} placeable drafts. Verify before
            ordering.
          </p>
          <details>
            <summary>Source status & coverage</summary>
            <p>
              {selectedCatalog.freshness} Includes accessories, samples and
              modification codes. Extraction completeness, finish availability
              and compatibility remain unverified.
            </p>
          </details>
          <a
            href={`/api/public-catalog-source?series=${selectedCatalog.series.toLowerCase()}`}
            target="_blank"
            rel="noreferrer"
          >
            Open pinned specification book
          </a>
        </div>
      )}
      {!selectedCatalog && (
        <p className="designer-muted">
          {version
            ? `${version.label} · ${version.status === 'published' ? 'published catalog' : 'draft catalog — verify before ordering'}`
            : 'Choose a manufacturer catalog to begin'}
        </p>
      )}
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
        <option value="vanity">Vanities</option>
        <option value="accessory">Accessories & other codes</option>
        <option value="panel">Panels</option>
        <option value="filler">Fillers</option>
        <option value="molding">Moldings</option>
        <option value="hood">Hoods</option>
        <option value="">All products</option>
      </select>
      {selectedCatalog && (
        <label className="catalog-placeable-filter">
          <input
            type="checkbox"
            checked={placeableOnly}
            onChange={(e) => {
              setPlaceableOnly(e.target.checked);
              setOffset(0);
            }}
          />{' '}
          Placeable cabinets only
        </label>
      )}
      <div className="library-results">
        {loadError && selectedCatalog ? (
          <p role="alert">{loadError}. Choose another catalog and retry.</p>
        ) : !activeVersionId ? (
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
                  if (!activeVersionId || !canPlace(p)) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(
                    'application/x-kitchen-item',
                    JSON.stringify({
                      kind: 'product',
                      product: {
                        _id: p._id,
                        sku: p.sku,
                        category: p.category,
                        width: p.width,
                        depth: p.depth,
                        height: p.height,
                        pageNumber: p.pageNumber,
                        sourceNote: p.sourceNote,
                      },
                      versionId: activeVersionId,
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
                  {selectedCatalog && (
                    <>
                      <a
                        href={`/api/public-catalog-source?series=${selectedCatalog.series.toLowerCase()}#page=${p.pageNumber}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source · PDF page {p.pageNumber}
                      </a>
                      {(p as PublicProduct).sourceNote && (
                        <small>{(p as PublicProduct).sourceNote}</small>
                      )}
                    </>
                  )}
                  <button
                    disabled={!canPlace(p)}
                    onClick={() => activeVersionId && onAdd(p, activeVersionId)}
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
