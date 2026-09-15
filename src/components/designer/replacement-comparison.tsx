'use client';
import { useState } from 'react';
import { type Purchase } from '@/designer/purchasing';
import {
  replacementSchema,
  type Replacement,
} from '@/designer/replacement-schema';
import { compareReplacement } from '@/designer/substitution-comparison';
import { MiniPlan } from './workflow-tools';
import { downloadJson } from './business-tools';
export function ReplacementComparison({
  purchase,
  lineId,
  sku,
  value,
  onSave,
}: {
  purchase: Purchase;
  lineId: string;
  sku: string;
  value: Replacement | undefined;
  onSave: (r: Replacement) => void;
}) {
  const [message, setMessage] = useState('');
  const result = value ? compareReplacement(purchase, lineId, value) : null;
  return (
    <details>
      <summary>Compare replacement specifications</summary>
      <p>
        Enter the supplier’s proposed specifications. This comparison preserves
        the original order and design. The plan models replacement dimensions
        only; hardware/configuration changes need a documented compatibility
        review.
      </p>
      <form
        key={value ? JSON.stringify(value) : sku}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const price = String(f.get('unitPrice') ?? '');
            const next = replacementSchema.parse({
              sku: f.get('sku'),
              width: Number(f.get('width')),
              depth: Number(f.get('depth')),
              height: Number(f.get('height')),
              finish: f.get('finish'),
              configuration: f.get('configuration'),
              reference: f.get('reference'),
              ...(price !== '' ? { unitPrice: Number(price) } : {}),
            });
            onSave(next);
            setMessage(
              'Replacement submitted. Check the purchasing save status below.',
            );
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <div className="business-grid">
          <label>
            Replacement SKU
            <input
              name="sku"
              aria-label={`Replacement SKU ${lineId}`}
              required
              maxLength={100}
              defaultValue={value?.sku ?? sku}
            />
          </label>
          {(['width', 'depth', 'height'] as const).map((key) => (
            <label key={key}>
              Replacement {key} (in)
              <input
                name={key}
                aria-label={`Replacement ${key} ${lineId}`}
                type="number"
                required
                min="0.01"
                max="600"
                step="any"
                defaultValue={value?.[key] ?? ''}
              />
            </label>
          ))}
          <label>
            Replacement finish
            <input
              name="finish"
              aria-label={`Replacement finish ${lineId}`}
              required
              maxLength={100}
              defaultValue={value?.finish ?? ''}
            />
          </label>
          <label>
            Replacement configuration
            <input
              name="configuration"
              aria-label={`Replacement configuration ${lineId}`}
              required
              maxLength={2000}
              defaultValue={value?.configuration ?? ''}
            />
          </label>
          <label>
            Proposed unit price (USD)
            <input
              name="unitPrice"
              aria-label={`Replacement price ${lineId}`}
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              defaultValue={value?.unitPrice ?? ''}
            />
          </label>
          <label>
            Supplier specification reference
            <input
              name="reference"
              aria-label={`Replacement reference ${lineId}`}
              required
              maxLength={1000}
              defaultValue={value?.reference ?? ''}
            />
          </label>
        </div>
        <button>Save replacement comparison</button>
      </form>
      <p role="status">{message}</p>
      {result && (
        <section className="purchase-card">
          <div className="purchase-table">
            <table>
              <thead>
                <tr>
                  <th>Specification</th>
                  <th>Original draft</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(([label, before, after]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{before}</td>
                    <td>{after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {result.line.quantity} units · Product-price difference:{' '}
            {result.delta === null
              ? 'Not fully priced'
              : new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(result.delta / 100)}
            . Uses captured original prices and supplier-entered replacement
            prices; excludes tax and services.
          </p>
          <div className="purchase-plan-grid">
            <div>
              Original
              <MiniPlan design={result.before} />
            </div>
            <div>
              Proposed dimensions
              <MiniPlan
                design={result.after}
                highlightedIds={result.line.itemIds}
              />
            </div>
          </div>
          <p>
            Affected neighbors and dependencies:{' '}
            {result.affected.map((i) => i.sku).join(', ') ||
              'None identified within the modeled neighborhood.'}
          </p>
          <ul>
            {result.impact.added.map((w) => (
              <li key={w.id + w.message}>{w.message}</li>
            ))}
          </ul>
          {result.configurationChanged && (
            <p>
              Configuration changed. Geometry alone cannot establish
              compatibility.
            </p>
          )}
          <p>
            Source: {value?.reference}. Obtain revised-scope approval before
            changing an order.
          </p>
          <button
            onClick={() =>
              downloadJson(
                {
                  format: 'kitchen-substitution-comparison-v1',
                  purchaseId: purchase.id,
                  lineId,
                  replacement: value,
                  comparison: result,
                },
                'supplier-substitution-comparison.json',
              )
            }
          >
            Export substitution comparison
          </button>
        </section>
      )}
    </details>
  );
}
