import { canonicalJson } from './canonical';
import type { RecordData } from './record-data';
export function crossSourceConflicts(records: RecordData[]) {
  const findings: {
    entityId: string;
    code: 'unresolved_conflict' | 'ambiguous_footnote_scope';
    detail: string;
  }[] = [];
  const products = records.filter((r) => r.kind === 'product');
  const facts = new Map<string, string>();
  for (const r of records) {
    if (r.kind !== 'footnote' || r.data.reviewStatus === 'rejected') continue;
    const key = r.data.sku + ':' + r.data.field;
    const parsed: unknown = JSON.parse(r.data.valueJson);
    const value = canonicalJson(parsed);
    const previous = facts.get(key);
    if (previous !== undefined && previous !== value)
      findings.push({
        entityId: r.data.id,
        code: 'unresolved_conflict',
        detail: 'Footnotes disagree for ' + key,
      });
    facts.set(key, value);
    const product = products.find(
      (p) =>
        p.kind === 'product' &&
        p.data.fields.sku?.state === 'known' &&
        p.data.fields.sku.value === r.data.sku,
    );
    if (product?.kind === 'product') {
      const field = product.data.fields[r.data.field];
      if (
        field?.state === 'known' &&
        ['string', 'number', 'boolean'].includes(typeof parsed) &&
        canonicalJson(field.value) !== value
      )
        findings.push({
          entityId: product.data.id,
          code: 'unresolved_conflict',
          detail:
            'Product field conflicts with a source-linked footnote: ' + key,
        });
    }
  }
  return findings;
}
export function sourceMarkers(text: string, sku: string): string[] {
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...text.matchAll(
      new RegExp('([*♦†‡•●]+)\\s*' + escaped + '(?=\\s|$)', 'g'),
    ),
  ].map((m) => m[1] ?? '');
}
