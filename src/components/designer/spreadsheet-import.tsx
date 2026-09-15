'use client';
import { useState } from 'react';
import {
  inferColumns,
  parseCsv,
  priceColumns,
  spreadsheetPriceBook,
  type ColumnMap,
} from '@/designer/spreadsheet-pricing';
import type { PriceBook } from '@/designer/supplier-pricing';
export function SpreadsheetImport({
  onSave,
  disabled,
}: {
  onSave: (book: PriceBook) => Promise<void>;
  disabled: boolean;
}) {
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[]>(
      [],
    ),
    [sheet, setSheet] = useState(0),
    [mapping, setMapping] = useState<ColumnMap>(inferColumns([])),
    [supplier, setSupplier] = useState(''),
    [reference, setReference] = useState(''),
    [validUntil, setValidUntil] = useState(''),
    [units, setUnits] = useState<'in' | 'cm' | 'mm'>('in'),
    [message, setMessage] = useState(''),
    [reading, setReading] = useState(false),
    [preview, setPreview] = useState<PriceBook | null>(null);
  const rows = sheets[sheet]?.rows ?? [];
  return (
    <details>
      <summary>Import supplier CSV / Excel</summary>
      <p>
        Choose a CSV or .xlsx file with headers in the first row. Map the
        columns, enter the source and expiry, then review before saving. Prices
        must be USD. Unmapped configurations use “standard”; configured items
        still require matching prices.
      </p>
      <label>
        Supplier spreadsheet
        <input
          aria-label="Supplier spreadsheet"
          type="file"
          accept=".csv,.xlsx"
          disabled={disabled || reading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setReading(true);
            setPreview(null);
            setMessage('');
            setSheets([]);
            try {
              if (file.size > 400000)
                throw Error('Choose a spreadsheet under 400 KB.');
              let parsed: { name: string; rows: string[][] }[];
              if (file.name.toLowerCase().endsWith('.csv'))
                parsed = [
                  { name: file.name, rows: parseCsv(await file.text()) },
                ];
              else if (file.name.toLowerCase().endsWith('.xlsx')) {
                const { default: readExcel } =
                  await import('read-excel-file/browser');
                const workbook = await readExcel(file);
                if (workbook.length > 10)
                  throw Error('Use a workbook with at most 10 sheets.');
                parsed = workbook
                  .map((s) => ({
                    name: s.sheet,
                    rows: s.data.map((row) =>
                      row.map((cell) => (cell == null ? '' : String(cell))),
                    ),
                  }))
                  .filter((s) => s.rows.length > 1);
                if (
                  parsed.some(
                    (s) =>
                      s.rows.length > 1001 ||
                      s.rows.some((row) => row.length > 64),
                  )
                )
                  throw Error(
                    'Use at most 1000 price rows and 64 columns per sheet.',
                  );
              } else throw Error('Choose a CSV or .xlsx file.');
              if (!parsed.length) throw Error('No price rows found.');
              setSheets(parsed);
              setSheet(0);
              setMapping(inferColumns(parsed[0]?.rows[0] ?? []));
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setReading(false);
            }
          }}
        />
      </label>
      {reading && <p>Reading spreadsheet…</p>}
      {!!sheets.length && (
        <>
          <label>
            Worksheet
            <select
              aria-label="Supplier worksheet"
              value={sheet}
              onChange={(e) => {
                const index = Number(e.target.value);
                setSheet(index);
                setMapping(inferColumns(sheets[index]?.rows[0] ?? []));
                setPreview(null);
              }}
            >
              {sheets.map((s, i) => (
                <option key={i} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="business-grid">
            {priceColumns.map((field) => (
              <label key={field}>
                {field}
                <select
                  aria-label={`Map ${field}`}
                  value={mapping[field]}
                  onChange={(e) => {
                    setMapping({ ...mapping, [field]: Number(e.target.value) });
                    setPreview(null);
                  }}
                >
                  <option value={-1}>
                    {field === 'configuration'
                      ? 'Standard configuration'
                      : 'Choose a column'}
                  </option>
                  {rows[0]?.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="business-grid">
            <label>
              Supplier name
              <input
                aria-label="Spreadsheet supplier"
                value={supplier}
                maxLength={160}
                onChange={(e) => {
                  setSupplier(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Price source
              <input
                aria-label="Spreadsheet reference"
                value={reference}
                maxLength={500}
                onChange={(e) => {
                  setReference(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Valid through
              <input
                aria-label="Spreadsheet expiry"
                type="date"
                value={validUntil}
                onChange={(e) => {
                  setValidUntil(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Dimension units
              <select
                aria-label="Spreadsheet dimension units"
                value={units}
                onChange={(e) => {
                  setUnits(e.target.value as typeof units);
                  setPreview(null);
                }}
              >
                <option value="in">Inches</option>
                <option value="cm">Centimeters</option>
                <option value="mm">Millimeters</option>
              </select>
            </label>
          </div>
          <button
            onClick={() => {
              try {
                setPreview(
                  spreadsheetPriceBook(
                    rows,
                    mapping,
                    { supplier, reference, validUntil },
                    units,
                  ),
                );
                setMessage('');
              } catch (e) {
                setPreview(null);
                setMessage((e as Error).message);
              }
            }}
          >
            Preview mapped prices
          </button>
          {preview && (
            <>
              <p>
                {preview.lines.length} validated prices · {preview.supplier} ·
                valid through {preview.validUntil}
              </p>
              <div className="business-table">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Finish</th>
                      <th>Dimensions (in)</th>
                      <th>USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.slice(0, 10).map((line, index) => (
                      <tr key={index}>
                        <td>{line.sku}</td>
                        <td>{line.finish}</td>
                        <td>
                          {line.width} × {line.depth} × {line.height}
                        </td>
                        <td>{line.unitPrice.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>Showing first {Math.min(10, preview.lines.length)} rows.</p>
              <button
                disabled={disabled}
                onClick={async () => {
                  try {
                    await onSave(preview);
                    setPreview(null);
                    setSheets([]);
                    setMessage('Spreadsheet prices saved.');
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Save mapped supplier prices
              </button>
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
