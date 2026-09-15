'use client';
import { SpreadsheetImport } from './spreadsheet-import';
import { QuoteDocument } from './quote-document';
import { priceRequestCsv } from '@/designer/spreadsheet-pricing';
import type { PriceBook } from '@/designer/supplier-pricing';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { type Design } from '@/designer/model';
import { layoutAlternatives } from '@/designer/layout-alternatives';
import {
  parsePriceBook,
  priceRequest,
  supplierQuote,
} from '@/designer/supplier-pricing';
import { money } from '@/designer/quote';
import { MiniPlan } from './workflow-tools';

export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AlternativeLayouts({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  const [result, setResult] = useState<{
    source: string;
    options: ReturnType<typeof layoutAlternatives>;
  } | null>(null);
  const [error, setError] = useState('');
  const valid = result?.source === JSON.stringify(design) ? result : null;
  return (
    <details className="business-panel">
      <summary>Alternative layouts</summary>
      <p>
        Compare up to three arrangements of your existing cabinets. Sizes,
        finishes and quantities stay the same. Locked objects, appliances,
        openings and assemblies containing sinks stay in place.
      </p>
      <button
        onClick={() => {
          try {
            setResult({
              source: JSON.stringify(design),
              options: layoutAlternatives(design),
            });
            setError('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Generate layout alternatives
      </button>
      {error && <p role="alert">{error}</p>}
      {valid && (
        <>
          <p>
            {valid.options.length} feasible alternatives found. Review
            circulation and installation requirements before use.
          </p>
          <div className="business-grid">
            {valid.options.map((option) => (
              <article key={option.name}>
                <h3>{option.name}</h3>
                <MiniPlan design={option.design} />
                <p>
                  {option.moved} parts moved · {option.warnings} layout warnings
                </p>
                <button
                  onClick={() => {
                    onChange(option.design);
                    setResult(null);
                  }}
                >
                  Apply {option.name}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {result && !valid && <p>Design changed. Generate fresh alternatives.</p>}
    </details>
  );
}
export function SupplierQuotes({
  design,
  onChange,
  expanded = false,
}: {
  design: Design;
  expanded?: boolean;
  onChange: (d: Design) => void;
}) {
  const books = useQuery(api.supplierPricing.list, {}),
    save = useMutation(api.supplierPricing.save);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [replace, setReplace] = useState(false);
  const stored =
    books?.find((b) => b._id === design.supplierBookId) ?? books?.[0];
  async function saveBook(parsed: PriceBook) {
    setBusy(true);
    try {
      const result = await save({
        priceBookJson: JSON.stringify(parsed),
        ...(replace && stored
          ? { priceBookId: stored._id, expectedRevision: stored.revision }
          : { createNew: true }),
      });
      onChange({ ...design, supplierBookId: result.priceBookId });
      setMessage('Supplier prices saved to your account.');
    } finally {
      setBusy(false);
    }
  }
  const book = useMemo(
    () => (stored ? parsePriceBook(stored.priceBookJson) : null),
    [stored],
  );
  const quote = useMemo(
    () => (book ? supplierQuote(design, book) : null),
    [book, design],
  );
  return (
    <details className="business-panel" open={expanded || undefined}>
      <summary>Supplier quotes</summary>
      <p>
        Import a supplier-confirmed USD price list. Prices match SKU, finish and
        exact dimensions. Download a request, have the supplier fill unit prices
        and source details, then import it.
      </p>
      <label>
        Selected supplier
        <select
          aria-label="Selected supplier"
          value={stored?._id ?? ''}
          onChange={(e) =>
            onChange({ ...design, supplierBookId: e.target.value })
          }
        >
          <option value="" disabled>
            Choose supplier
          </option>
          {books?.map((b) => (
            <option key={b._id} value={b._id}>
              {parsePriceBook(b.priceBookJson).supplier} · revision {b.revision}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />{' '}
        Replace selected supplier prices on import (otherwise add another
        supplier)
      </label>
      <SpreadsheetImport
        disabled={busy || books === undefined}
        onSave={saveBook}
      />
      <div className="designer-row">
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([priceRequestCsv(design)], { type: 'text/csv' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'supplier-price-request.csv';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download CSV price request
        </button>
        <button
          onClick={() =>
            downloadJson(priceRequest(design), 'supplier-price-request.json')
          }
        >
          Download price request
        </button>
        <label>
          Import supplier prices (JSON)
          <input
            aria-label="Import supplier prices"
            type="file"
            accept=".json,application/json"
            disabled={busy || books === undefined}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              try {
                if (file.size > 400000)
                  throw Error('Price list must be smaller than 400 KB.');
                const parsed = parsePriceBook(await file.text());
                await saveBook(parsed);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {!!books?.length && (
        <details>
          <summary>Compare supplier totals</summary>
          <p>
            Totals use the same design quantities, discount, tax, installation
            and delivery. Incomplete or expired lists have no final total.
          </p>
          <div className="business-table">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Priced items</th>
                  <th>Total (USD)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => {
                  const q = supplierQuote(
                    design,
                    parsePriceBook(b.priceBookJson),
                  );
                  return (
                    <tr key={b._id}>
                      <td>{q.supplier}</td>
                      <td>
                        {q.lines.length - q.missing.length}/{q.lines.length}
                      </td>
                      <td>
                        {q.expired
                          ? 'Expired'
                          : q.total === null
                            ? 'Incomplete'
                            : money(q.total)}
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            onChange({ ...design, supplierBookId: b._id })
                          }
                        >
                          Use {q.supplier}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {book && stored && (
        <QuoteDocument
          design={design}
          book={book}
          revision={stored.revision}
          onChange={onChange}
        />
      )}
      {quote && (
        <>
          <h3>{quote.supplier}</h3>
          <p>
            Source: {quote.reference} · Valid through {quote.validUntil} ·{' '}
            {quote.currency}
          </p>
          {quote.expired && (
            <p role="alert">
              This price list has expired. Import a current list before issuing
              a quote.
            </p>
          )}
          <div className="business-table">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Finish</th>
                  <th>Dimensions (in)</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.sku}</td>
                    <td>{line.finish}</td>
                    <td>
                      {line.width} × {line.depth} × {line.height}
                    </td>
                    <td>
                      {line.unitCents === null
                        ? 'Needs supplier price'
                        : money(line.unitCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="designer-row">
            {(['installation', 'delivery', 'discount', 'tax'] as const).map(
              (field) => (
                <label key={field}>
                  {field}{' '}
                  {field === 'tax' || field === 'discount' ? '(%)' : '(USD)'}
                  <input
                    aria-label={`Supplier ${field}`}
                    type="number"
                    min="0"
                    max={
                      field === 'tax' || field === 'discount' ? 100 : 1000000
                    }
                    value={design.quote?.[field] ?? 0}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (
                        Number.isFinite(value) &&
                        value >= 0 &&
                        value <=
                          (field === 'tax' || field === 'discount'
                            ? 100
                            : 1000000)
                      )
                        onChange({
                          ...design,
                          quote: {
                            customer: '',
                            tax: 0,
                            installation: 0,
                            delivery: 0,
                            discount: 0,
                            ...design.quote,
                            [field]: value,
                          },
                        });
                    }}
                  />
                </label>
              ),
            )}
          </div>
          <p>
            Installation and delivery are your entered charges. Tax applies to
            discounted items.
          </p>
          <p>
            {quote.missing.length
              ? `${quote.missing.length} items need prices. Priced items subtotal: ${money(quote.subtotal)}.`
              : `Items: ${money(quote.subtotal)} · Discount: ${money(quote.discount)} · Tax: ${money(quote.tax)}`}
          </p>
          <strong>
            {quote.total === null
              ? 'Quote incomplete — no final total'
              : `Quote total: ${money(quote.total)}`}
          </strong>
          <div>
            <button
              disabled={quote.total === null}
              onClick={() => {
                const fresh = book ? supplierQuote(design, book) : null;
                if (!fresh || fresh.total === null) {
                  setMessage(
                    'Prices are missing or expired. Refresh the supplier list before exporting.',
                  );
                  return;
                }
                downloadJson(
                  {
                    label: 'Supplier-priced estimate',
                    design: design.name,
                    createdAt: new Date().toISOString(),
                    priceBookRevision: stored?.revision,
                    ...fresh,
                    notes:
                      'Prices supplied by the imported source. Installation and delivery entered by the designer. Confirm availability and configuration with supplier before ordering.',
                  },
                  'supplier-quote.json',
                );
              }}
            >
              Export supplier quote
            </button>
          </div>
        </>
      )}
      {!book && (
        <p>
          No supplier price list yet. Demo pricing remains available separately
          under Quote / order.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
