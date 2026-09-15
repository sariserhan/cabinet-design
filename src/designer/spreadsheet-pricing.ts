import {
  parsePriceBook,
  priceRequest,
  type PriceBook,
} from './supplier-pricing';
import type { Design } from './model';
export const priceColumns = [
  'sku',
  'finish',
  'width',
  'depth',
  'height',
  'unitPrice',
  'configuration',
] as const;
export type PriceColumn = (typeof priceColumns)[number];
export type ColumnMap = Record<PriceColumn, number>;
export function parseCsv(text: string): string[][] {
  if (text.length > 400000) throw Error('CSV must be under 400 KB.');
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += ch;
      continue;
    }
    if (ch === '"') {
      if (value || closed) throw Error('Malformed CSV quoting.');
      quoted = true;
      continue;
    }
    if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(value);
      value = '';
      closed = false;
      if (ch !== ',') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      }
      continue;
    }
    if (closed && ch?.trim())
      throw Error('Unexpected text after a quoted CSV value.');
    if (!closed) value += ch;
  }
  if (quoted) throw Error('Unclosed CSV quote.');
  row.push(value);
  if (row.some((c) => c.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 1001 || rows.some((r) => r.length > 64))
    throw Error(
      'Use a header row and 1–1000 price rows, with at most 64 columns.',
    );
  return rows;
}
export function inferColumns(headers: string[]): ColumnMap {
  const aliases: Record<PriceColumn, string[]> = {
    sku: ['sku', 'item', 'itemcode', 'productcode', 'code'],
    finish: ['finish', 'color', 'colour'],
    width: ['width', 'widthin'],
    depth: ['depth', 'depthin'],
    height: ['height', 'heightin'],
    unitPrice: ['unitprice', 'price', 'cost', 'unitcost'],
    configuration: ['configuration', 'options'],
  };
  return Object.fromEntries(
    priceColumns.map((field) => [
      field,
      headers.findIndex((h) =>
        aliases[field].includes(h.toLowerCase().replace(/[^a-z]/g, '')),
      ),
    ]),
  ) as ColumnMap;
}
function numeric(text: string, row: number, column: string) {
  const value = text.trim();
  if (!/^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(value))
    throw Error(`Row ${row}: ${column} needs a non-negative decimal number.`);
  return Number(value.replace(/[$,]/g, ''));
}
export function spreadsheetPriceBook(
  rows: string[][],
  mapping: ColumnMap,
  metadata: { supplier: string; reference: string; validUntil: string },
  units: 'in' | 'cm' | 'mm' = 'in',
): PriceBook {
  if (rows.length < 2 || rows.length > 1001)
    throw Error('Use 1–1000 price rows.');
  const required = priceColumns.filter((k) => k !== 'configuration');
  if (required.some((k) => mapping[k] < 0))
    throw Error('Map SKU, finish, all dimensions and unit price.');
  if (new Set(required.map((k) => mapping[k])).size !== required.length)
    throw Error('Each required field needs a different column.');
  const scale = { in: 1, cm: 2.54, mm: 25.4 }[units];
  const lines = rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((row, index) => {
      const cell = (key: PriceColumn) => (row[mapping[key]] ?? '').trim();
      return {
        sku: cell('sku'),
        finish: cell('finish'),
        configuration: cell('configuration') || 'standard',
        width:
          Math.round(
            (numeric(cell('width'), index + 2, 'width') / scale) * 1000000,
          ) / 1000000,
        depth:
          Math.round(
            (numeric(cell('depth'), index + 2, 'depth') / scale) * 1000000,
          ) / 1000000,
        height:
          Math.round(
            (numeric(cell('height'), index + 2, 'height') / scale) * 1000000,
          ) / 1000000,
        unitPrice: numeric(cell('unitPrice'), index + 2, 'unit price'),
      };
    });
  return parsePriceBook(
    JSON.stringify({ ...metadata, currency: 'USD', lines }),
  );
}
export function priceRequestCsv(design: Design) {
  const safe = (value: unknown) => {
    const text = String(value ?? '');
    return (
      '"' +
      (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') +
      '"'
    );
  };
  return [
    priceColumns.join(','),
    ...priceRequest(design).lines.map((line) =>
      priceColumns.map((k) => safe(line[k])).join(','),
    ),
  ].join('\r\n');
}
