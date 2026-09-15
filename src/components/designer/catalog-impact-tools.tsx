'use client';
import { useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { type Design, parseDesign } from '@/designer/model';
import { type Operations } from '@/designer/project-operations';
import {
  type CatalogSnapshot,
  parseCatalogSnapshot,
  catalogImpact,
} from '@/designer/catalog-impact';
import { downloadJson } from './business-tools';
export function CatalogImpactTools({
  design,
  value,
  onChange,
  onLocate,
}: {
  design: Design;
  value: Operations;
  onChange: (v: Operations) => void;
  onLocate: (id: string) => void;
}) {
  const client = useConvex(),
    [before, setBefore] = useState<CatalogSnapshot | null>(
      value.catalog?.before ?? null,
    ),
    [after, setAfter] = useState<CatalogSnapshot | null>(
      value.catalog?.after ?? null,
    ),
    [projects, setProjects] = useState<Design[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  let result: ReturnType<typeof catalogImpact> | null = null,
    error = '';
  try {
    if (before && after)
      result = catalogImpact(before, after, [
        design,
        ...projects.filter((d) => d.id !== design.id),
      ]);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <details className="business-panel support-panel">
      <summary>Catalog update impact</summary>
      <p>
        Compare two documented snapshots of the same manufacturer/catalog
        series. Items are matched to the earlier version ID and exact SKU.
        Reports flag dimensions and recorded compatibility changes without
        changing designs. Snapshot contents need source review; missing entries
        in partial snapshots are not treated as discontinued products.
      </p>
      <div className="business-grid">
        {(['before', 'after'] as const).map((which) => (
          <label key={which}>
            {which === 'before'
              ? 'Earlier catalog snapshot'
              : 'Updated catalog snapshot'}
            <input
              aria-label={`${which} catalog snapshot`}
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  if (f.size > 600000) throw Error('Snapshot exceeds 600 KB.');
                  const s = parseCatalogSnapshot(await f.text());
                  if (which === 'before') setBefore(s);
                  else setAfter(s);
                  setMessage(
                    'Snapshot loaded for comparison. Save the pair to retain it.',
                  );
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            />
          </label>
        ))}
      </div>
      <button
        disabled={!before || !after || !!error}
        onClick={() => {
          try {
            if (before && after) {
              onChange({ ...value, catalog: { before, after } });
              setMessage('Catalog comparison saved.');
            }
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Save catalog comparison
      </button>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const summaries = await client.query(api.projects.list, {});
            const loaded: Design[] = [];
            for (const p of summaries) {
              const record = await client.query(api.projects.get, {
                projectId: p._id,
              });
              loaded.push(parseDesign(record.designJson));
            }
            setProjects(loaded);
            setMessage(
              `Loaded ${loaded.length} cloud projects. Reload after cloud edits; current unsaved design is always included.`,
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Loading projects…' : 'Scan saved cloud projects'}
      </button>
      <button
        onClick={() =>
          downloadJson(
            {
              format: 'kitchen-catalog-snapshot-v1',
              catalogKey: 'MANUFACTURER / SERIES',
              versionId: 'EARLIER_CATALOG_VERSION_ID',
              revision: 'SOURCE_REVISION',
              source: 'Manufacturer document and page reference',
              complete: false,
              products: [
                {
                  sku: 'EXAMPLE-SKU',
                  width: 24,
                  depth: 24,
                  height: 34.5,
                  compatibility: 'Documented constraints or rule revision',
                },
              ],
            },
            'catalog-snapshot-template.json',
          )
        }
      >
        Download snapshot template
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            {result.changes.length} changed SKUs · {result.affected.length}{' '}
            affected items · {result.scannedProjects} projects scanned
          </p>
          <p>
            {before?.revision} → {after?.revision}. Sources: {before?.source} →{' '}
            {after?.source}
          </p>
          {result.changes.map((c) => (
            <article className="purchase-card" key={c.sku}>
              <h4>
                {c.sku}: {c.fields.join(', ')}
              </h4>
              <p>
                Earlier: {c.before.width} × {c.before.depth} × {c.before.height}{' '}
                in · {c.before.compatibility}
              </p>
              <p>
                Updated:{' '}
                {c.after
                  ? `${c.after.width} × ${c.after.depth} × ${c.after.height} in · ${c.after.compatibility}`
                  : c.fields[0]}
              </p>
              {result.affected
                .filter((a) => a.sku === c.sku)
                .map((a) => (
                  <p key={`${a.projectId}:${a.itemId}`}>
                    {a.project} ({a.projectId.slice(0, 8)}) ·{' '}
                    {a.itemId.slice(0, 8)} — review {a.fields.join(', ')}{' '}
                    {a.projectId === design.id && (
                      <button onClick={() => onLocate(a.itemId)}>
                        Locate {a.sku}
                      </button>
                    )}
                  </p>
                ))}
            </article>
          ))}
          <button
            onClick={() =>
              downloadJson(
                {
                  format: 'kitchen-catalog-impact-v1',
                  createdAt: new Date().toISOString(),
                  ...result,
                },
                'catalog-update-impact.json',
              )
            }
          >
            Export catalog impact report
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
