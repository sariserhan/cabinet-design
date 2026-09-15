import test from 'node:test';
import assert from 'node:assert/strict';
import { fromObject, newDesign, parseDesign } from '../../src/designer/model';
import {
  parseCsv,
  inferColumns,
  spreadsheetPriceBook,
  priceRequestCsv,
} from '../../src/designer/spreadsheet-pricing';
import { supplierQuoteHtml } from '../../src/designer/quote-print';
import {
  parsePriceBook,
  priceRequest,
  supplierQuote,
} from '../../src/designer/supplier-pricing';
import {
  measuredDesign,
  toInches,
  fromInches,
  utilityPoint,
} from '../../src/designer/measurements';
import type { Survey } from '../../src/designer/measurement-schema';
const survey: Survey = {
  measuredBy: 'QA',
  measuredAt: '2026-09-15',
  originalUnit: 'cm',
  north: 192,
  south: 192,
  east: 180,
  west: 180,
  height: 96,
  openings: [
    {
      id: 'door-1',
      kind: 'door',
      wall: 'south',
      offset: 12,
      width: 36,
      height: 80,
      sill: 0,
    },
  ],
  utilities: [
    {
      id: 'utility-1',
      kind: 'water',
      wall: 'east',
      offset: 48,
      height: 24,
      notes: 'Existing connection',
    },
  ],
  notes: 'Test survey',
  confirmed: true,
};
test('CSV parser preserves quoted delimiters and newlines, maps headers and rejects ambiguous or missing numbers', () => {
  const rows = parseCsv(
    'Code,Color,Width,Depth,Height,Price\r\n"A,1",linen,24,24,34.5,"$1,200.50"\r\n',
  );
  const book = spreadsheetPriceBook(rows, inferColumns(rows[0] ?? []), {
    supplier: 'Test',
    reference: 'QA',
    validUntil: '2030-01-01',
  });
  assert.equal(book.lines[0]?.sku, 'A,1');
  assert.equal(book.lines[0]?.unitPrice, 1200.5);
  assert.deepEqual(parseCsv('a,b\n"x\ny","a""b"'), [
    ['a', 'b'],
    ['x\ny', 'a"b'],
  ]);
  assert.throws(() => parseCsv('a,b\n"bad'), /Unclosed/);
  assert.throws(
    () =>
      spreadsheetPriceBook(
        [rows[0] ?? [], ['A', 'linen', '', '24', '34.5', '100']],
        inferColumns(rows[0] ?? []),
        { supplier: 'Test', reference: 'QA', validUntil: '2030-01-01' },
      ),
    /Row 2/,
  );
  assert.throws(
    () =>
      spreadsheetPriceBook(
        rows,
        { ...inferColumns(rows[0] ?? []), depth: 2 },
        { supplier: 'Test', reference: 'QA', validUntil: '2030-01-01' },
      ),
    /different column/,
  );
  const metric = spreadsheetPriceBook(
    [rows[0] ?? [], ['A', 'linen', '60.96', '60.96', '87.63', '100']],
    inferColumns(rows[0] ?? []),
    { supplier: 'Test', reference: 'QA', validUntil: '2030-01-01' },
    'cm',
  );
  assert.equal(metric.lines[0]?.width, 24);
});
test('CSV request round trips configurations and escapes spreadsheet formulas', () => {
  const design = {
    ...newDesign(),
    items: [
      {
        ...fromObject('custom_cabinet'),
        sku: '=danger',
        details: {
          shelves: 2,
          toeKick: 4,
          molding: false,
          interior: 'shelves' as const,
        },
      },
    ],
  };
  const rows = parseCsv(priceRequestCsv(design));
  assert.equal(rows[1]?.[0], "'=danger");
  assert.match(rows[1]?.[6] ?? '', /shelves/);
  assert.equal(rows[1]?.[5], '');
});
test('supplier PDF groups quantities, escapes text, matches quote totals and rejects incomplete or expired quotes', () => {
  const item = fromObject('custom_cabinet'),
    design = {
      ...newDesign(),
      name: 'Kitchen <script>bad</script>',
      items: [item, { ...item, id: 'second' }],
    };
  const request = priceRequest(design);
  const book = parsePriceBook(
    JSON.stringify({
      ...request,
      supplier: 'Test & supplier',
      reference: 'Price sheet',
      validUntil: '2030-01-01',
      lines: request.lines.map((l) => ({ ...l, unitPrice: 123.45 })),
    }),
  );
  const brand = {
    company: 'Company',
    contact: 'Details',
    number: 'Q1',
    terms: 'Deposit subject to agreement',
    validUntil: '2029-12-31',
  };
  const html = supplierQuoteHtml(
    design,
    book,
    brand,
    3,
    Date.parse('2029-01-01'),
  );
  assert.match(html, /<td>2<\/td>/);
  assert.match(html, /\$246.90/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<script>bad'));
  assert.equal(
    supplierQuote(design, book, Date.parse('2029-01-01')).total,
    24690,
  );
  assert.throws(
    () =>
      supplierQuoteHtml(
        design,
        book,
        { ...brand, validUntil: '2031-01-01' },
        3,
        Date.parse('2029-01-01'),
      ),
    /expiry/,
  );
  assert.throws(
    () =>
      supplierQuoteHtml(
        { ...design, items: [{ ...item, width: 37 }] },
        book,
        brand,
        3,
        Date.parse('2029-01-01'),
      ),
    /complete/,
  );
});
test('measured rooms retain survey and utility positions through design serialization', () => {
  const design = measuredDesign(survey),
    roundTrip = parseDesign(JSON.stringify(design));
  assert.equal(roundTrip.items[0]?.width, 36);
  assert.deepEqual(roundTrip.measurements, survey);
  assert.deepEqual(
    utilityPoint(
      survey,
      survey.utilities[0] ?? {
        id: 'u',
        kind: 'water',
        wall: 'east',
        offset: 48,
        height: 24,
        notes: '',
      },
    ),
    { x: 192, y: 48 },
  );
  assert.equal(toInches(254, 'mm'), 10);
  assert.equal(fromInches(10, 'cm'), 25.4);
  assert.throws(
    () => measuredDesign({ ...survey, south: 190 }),
    /Opposite walls/,
  );
  assert.throws(
    () =>
      measuredDesign({
        ...survey,
        openings: [
          {
            ...survey.openings[0],
            id: 'bad',
            kind: 'window',
            wall: 'north',
            offset: 180,
            width: 36,
            height: 36,
            sill: 80,
          },
        ],
      }),
    /past the wall/,
  );
  assert.throws(() =>
    measuredDesign({
      ...survey,
      utilities: [
        {
          id: 'bad',
          kind: 'water',
          wall: 'east',
          offset: 999,
          height: 24,
          notes: '',
        },
      ],
    }),
  );
  assert.throws(
    () =>
      measuredDesign({
        ...survey,
        openings: [
          ...survey.openings,
          {
            ...survey.openings[0],
            id: 'door-2',
            kind: 'door',
            wall: 'south',
            offset: 12,
            width: 36,
            height: 80,
            sill: 0,
          },
        ],
      }),
    /overlap/,
  );
});
