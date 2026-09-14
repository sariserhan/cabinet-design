import { canonicalJson, contentHash } from './canonical';
import type { BenchmarkPage } from './cases';
import { executeBenchmarkCase } from './cases';
import { recordEvidence, type RecordData } from './record-data';
export type BenchmarkRow = {
  payload: RecordData;
  truthVerified: boolean;
  blockers: string[];
};
function ratio(n: number, d: number) {
  return d ? n / d : 0;
}
function factValue(f: unknown): unknown {
  if (f === undefined) return null;
  if (f && typeof f === 'object' && 'state' in f) {
    const a = f as { state: string; value?: unknown; reason?: string };
    return a.state === 'known'
      ? { state: a.state, value: a.value }
      : { state: a.state };
  }
  return f;
}
function meaning(record: RecordData): unknown {
  if (record.kind === 'registry')
    return {
      name: factValue(record.data.name),
      attributes: Object.fromEntries(
        Object.entries(record.data.attributes).map(([k, v]) => [
          k,
          factValue(v),
        ]),
      ),
      productIds: record.data.productIds.map((p) => p.value).sort(),
    };
  if (record.kind === 'product')
    return Object.fromEntries(
      Object.entries(record.data.fields).map(([k, v]) => [k, factValue(v)]),
    );
  if (record.kind === 'footnote')
    return {
      sku: record.data.sku,
      field: record.data.field,
      symbol: record.data.symbol,
      value: JSON.parse(record.data.valueJson),
    };
  if (record.kind === 'case') return JSON.parse(record.data.expectationJson);
  function strip(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([k]) =>
              ![
                'catalogVersionId',
                'provenance',
                'confidence',
                'reviewStatus',
              ].includes(k),
          )
          .map(([k, v]) => [k, strip(v)]),
      );
    return value;
  }
  const { id, ...data } = record.data;
  void id;
  return strip(data);
}
function key(record: RecordData) {
  if (record.kind === 'product') {
    const sku = record.data.fields.sku;
    return 'product:' + (sku?.state === 'known' ? sku.value : record.data.id);
  }
  if (record.kind === 'footnote')
    return [
      'footnote',
      record.data.sku,
      record.data.field,
      record.data.symbol,
    ].join(':');
  if (record.kind === 'rule')
    return (
      'rule:' +
      record.data.sourceText.replace(/\s+/g, ' ').trim() +
      ':' +
      contentHash({
        scope: {
          kind: record.data.scope.kind,
          targets: record.data.scope.targets.map((t) => t.value).sort(),
        },
        target:
          record.data.modelingStatus === 'modeled' &&
          'target' in record.data.constraint
            ? record.data.constraint.target.id.value
            : null,
        type:
          record.data.modelingStatus === 'modeled'
            ? record.data.constraint.type
            : 'unmodeled',
        field:
          record.data.modelingStatus === 'modeled' &&
          'field' in record.data.constraint
            ? record.data.constraint.field
            : null,
        when:
          record.data.modelingStatus === 'modeled'
            ? (record.data.when ?? null)
            : null,
        pages: [
          ...new Set(recordEvidence(record).map((e) => e.pageNumber)),
        ].sort((a, b) => a - b),
      })
    );
  return record.data.id;
}
export function measureBenchmark(
  candidate: BenchmarkRow[],
  truth: BenchmarkRow[],
  pages: BenchmarkPage[] = [],
) {
  candidate = candidate.filter((r) => r.payload.kind !== 'registry');
  truth = truth.filter((r) => r.payload.kind !== 'registry');
  const verified = truth.every((r) => r.truthVerified);
  const expected = new Map(truth.map((r) => [key(r.payload), r]));
  const actual = new Map(candidate.map((r) => [key(r.payload), r]));
  const counts = {
    products: 0,
    fields: 0,
    dimensions: 0,
    categories: 0,
    rules: 0,
    footnotes: 0,
    sources: 0,
    cases: 0,
  };
  const correct = { ...counts };
  for (const [id, t] of expected) {
    const p = t.payload;
    const got = actual.get(id);
    if (p.kind === 'product') {
      counts.products++;
      if (got?.payload.kind === 'product') correct.products++;
      for (const [name, f] of Object.entries(p.data.fields)) {
        counts.fields++;
        const match =
          got?.payload.kind === 'product' &&
          canonicalJson(factValue(got.payload.data.fields[name])) ===
            canonicalJson(factValue(f));
        if (match) correct.fields++;
        if (name.endsWith('In')) {
          counts.dimensions++;
          if (match) correct.dimensions++;
        }
        if (name === 'normalizedCategory') {
          counts.categories++;
          if (match) correct.categories++;
        }
      }
    } else if (p.kind === 'rule') {
      counts.rules++;
      if (
        got &&
        canonicalJson(meaning(p)) === canonicalJson(meaning(got.payload))
      )
        correct.rules++;
    } else if (p.kind === 'footnote') {
      counts.footnotes++;
      if (
        got &&
        canonicalJson(meaning(p)) === canonicalJson(meaning(got.payload))
      )
        correct.footnotes++;
    } else if (p.kind === 'case') {
      counts.cases++;
      if (
        executeBenchmarkCase(
          JSON.parse(p.data.expectationJson),
          candidate.map((r) => r.payload),
          pages,
        ).passed
      )
        correct.cases++;
    }
    for (const e of recordEvidence(p)) {
      counts.sources++;
      if (
        got &&
        recordEvidence(got.payload).some(
          (a) =>
            a.documentSha256 === e.documentSha256 &&
            a.pageNumber === e.pageNumber &&
            (!e.sourceText || a.sourceText === e.sourceText),
        )
      )
        correct.sources++;
    }
  }
  const found = candidate.filter((r) => r.payload.kind === 'product').length;
  const rulesFound = candidate.filter((r) => r.payload.kind === 'rule').length;
  const metrics = {
    skuPrecision: ratio(correct.products, found),
    skuRecall: ratio(correct.products, counts.products),
    fieldAccuracy: ratio(correct.fields, counts.fields),
    dimensionAccuracy: ratio(correct.dimensions, counts.dimensions),
    categoryAccuracy: ratio(correct.categories, counts.categories),
    sourceAccuracy: ratio(correct.sources, counts.sources),
    rulePrecision: ratio(correct.rules, rulesFound),
    ruleRecall: ratio(correct.rules, counts.rules),
    footnoteAccuracy: ratio(correct.footnotes, counts.footnotes),
    blockingCasesAccuracy: ratio(correct.cases, counts.cases),
    reviewFraction: ratio(
      candidate.filter((r) => r.payload.data.reviewStatus === 'unreviewed')
        .length,
      candidate.length,
    ),
  };
  const unique =
    expected.size === truth.length && actual.size === candidate.length;
  const sufficient =
    unique &&
    counts.products >= 150 &&
    counts.products <= 200 &&
    counts.rules >= 30 &&
    counts.footnotes >= 30 &&
    counts.cases >= 5;
  const productsPass = metrics.skuPrecision >= 0.99 && metrics.skuRecall === 1;
  const fieldsPass =
    metrics.dimensionAccuracy === 1 &&
    metrics.categoryAccuracy >= 0.97 &&
    metrics.sourceAccuracy >= 0.99;
  const rulesPass = metrics.rulePrecision >= 0.9 && metrics.ruleRecall >= 0.9;
  const footnotesPass =
    metrics.footnoteAccuracy === 1 && metrics.blockingCasesAccuracy === 1;
  return {
    truthVerified: verified,
    sufficient,
    unique,
    counts,
    correct,
    metrics,
    productsPass,
    fieldsPass,
    rulesPass,
    footnotesPass,
    passed:
      verified &&
      sufficient &&
      productsPass &&
      fieldsPass &&
      rulesPass &&
      footnotesPass,
    reliabilityClaimSupported: false,
  };
}
export function diffRecords(before: RecordData[], after: RecordData[]) {
  const a = new Map(before.map((r) => [key(r), r])),
    b = new Map(after.map((r) => [key(r), r]));
  return {
    added: [...b.keys()].filter((k) => !a.has(k)).sort(),
    removed: [...a.keys()].filter((k) => !b.has(k)).sort(),
    changed: [...b.keys()]
      .filter((k) =>
        (() => {
          const left = a.get(k),
            right = b.get(k);
          return (
            left &&
            right &&
            canonicalJson(meaning(left)) !== canonicalJson(meaning(right))
          );
        })(),
      )
      .sort(),
  };
}
