import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  publicCatalogs,
  filterPublicProducts,
  type PublicCatalog,
  publicSourceLink,
} from '../../src/designer/public-catalogs';
import {
  canPlace,
  fromProduct,
  newDesign,
  designSchema,
} from '../../src/designer/model';
import {
  priceRequest,
  parsePriceBook,
  supplierQuote,
} from '../../src/designer/supplier-pricing';
import { parseDrop } from '../../src/designer/drop';
const books = publicCatalogs.map(
  (c) =>
    JSON.parse(
      readFileSync(`public/catalogs/${c.series.toLowerCase()}.json`, 'utf8'),
    ) as PublicCatalog,
);
function required<T>(value: T | undefined): T {
  assert.ok(value !== undefined);
  return value;
}
test('public catalogs pin exact sources and unique identities, dimensions stay evidence-backed', () => {
  const ids = new Set<string>();
  for (const b of books) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(b.catalog.sourcePath))
        .digest('hex'),
      b.catalog.sha256,
    );
    assert.equal(b.products.length, b.catalog.productCount);
    assert.equal(b.products.filter(canPlace).length, b.catalog.placeableCount);
    for (const p of b.products) {
      assert.ok(!ids.has(p._id));
      ids.add(p._id);
      assert.ok(p.pageNumber > 0 && p.pageNumber <= b.catalog.pageCount);
      assert.equal(p.reviewStatus, 'unreviewed');
      if (canPlace(p)) assert.notEqual(p.dimensionStatus, 'unresolved');
    }
  }
});
test('series searches and exact source-page links retain distinct identical SKUs', () => {
  const found = books.map(
    (b) =>
      filterPublicProducts(b.products, 'MC303021', 'wall_cabinet').records[0],
  );
  assert.ok(found[1] && found[2]);
  assert.notEqual(found[1]._id, found[2]._id);
  assert.equal(found[1].width, 30);
  assert.equal(found[1].height, 30);
  assert.equal(found[1].depth, 21);
  assert.equal(
    publicSourceLink({
      recordId: found[1]._id,
      versionId: required(books[1]).catalog.id,
    }),
    '/api/public-catalog-source?series=illume#page=37',
  );
  assert.equal(
    publicSourceLink({ recordId: 'ordinary', versionId: 'ordinary' }),
    null,
  );
  assert.equal(
    filterPublicProducts(required(books[0]).products, 'nonexistent', '').total,
    0,
  );
});
test('unresolved widths cannot be placed and source notes survive drag and save', () => {
  const b = required(books[1]),
    unknown = b.products.find((p) => p.sku === 'W0930');
  assert.ok(unknown);
  assert.equal(canPlace(unknown), false);
  assert.throws(() => fromProduct(unknown, b.catalog.id));
  const p = b.products.find((p) => p.sku === 'WBC2730');
  assert.ok(p);
  const drop = parseDrop(
    JSON.stringify({ kind: 'product', versionId: b.catalog.id, product: p }),
  );
  assert.ok(drop && drop.kind === 'product');
  const item = fromProduct(drop.product, drop.versionId);
  assert.match(item.note ?? '', /filler/);
  assert.equal(
    designSchema.parse({ ...newDesign(), items: [item] }).items[0]?.recordId,
    p._id,
  );
});
test('same SKU and dimensions from different series cannot share supplier prices', () => {
  const d = newDesign();
  d.items = books
    .slice(1)
    .map((b) =>
      fromProduct(
        required(b.products.find((p) => p.sku === 'MC303021')),
        b.catalog.id,
      ),
    );
  const request = priceRequest(d);
  assert.equal(request.lines.length, 2);
  const book = parsePriceBook(
    JSON.stringify({
      ...request,
      supplier: 'Synthetic',
      reference: 'test',
      validUntil: '2099-01-01',
      lines: [{ ...request.lines[0], unitPrice: 100 }],
    }),
  );
  const quote = supplierQuote(d, book);
  assert.equal(quote.missing.length, 1);
  assert.equal(quote.total, null);
  const legacy = parsePriceBook(
    JSON.stringify({
      ...book,
      lines: book.lines.map((l) => ({ ...l, configuration: 'standard' })),
    }),
  );
  assert.equal(supplierQuote(d, legacy).missing.length, 2);
});
