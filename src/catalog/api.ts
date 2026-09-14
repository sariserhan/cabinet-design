import { candidateSchema } from './publication';
import { evaluateRules } from './rules';
import type { EvaluationContext } from './rule-schema';
import { factEvidence } from './evidence';
/** Consumers load an authenticated immutable export, never mutable extraction tables. */
export function openPublishedCatalog(raw: unknown) {
  const input =
    raw && typeof raw === 'object' && 'snapshot' in raw
      ? (raw as { snapshot: unknown }).snapshot
      : raw;
  if (!input || typeof input !== 'object')
    throw new Error('Published snapshot required');
  const {
    publishedAt: _,
    gate: __,
    ...body
  } = input as Record<string, unknown>;
  void _;
  void __;
  const catalog = candidateSchema.parse(body);
  if (catalog.status !== 'published')
    throw new Error('Only published catalogs may serve product consumers');
  const value = (p: (typeof catalog.products)[number], field: string) => {
    const f = p.fields[field];
    return f?.state === 'known' ? f.value : undefined;
  };
  return {
    versionId: catalog.id,
    coverage: structuredClone(catalog.coverage),
    getProductBySku(sku: string) {
      return structuredClone(
        catalog.products.find((p) => value(p, 'sku') === sku) ?? null,
      );
    },
    searchProducts(
      filters: {
        category?: string;
        widthIn?: number;
        heightIn?: number;
        depthIn?: number;
        query?: string;
      } = {},
    ) {
      return structuredClone(
        catalog.products.filter(
          (p) =>
            (!filters.category ||
              value(p, 'normalizedCategory') === filters.category) &&
            (['widthIn', 'heightIn', 'depthIn'] as const).every(
              (f) => filters[f] === undefined || value(p, f) === filters[f],
            ) &&
            (!filters.query ||
              String(value(p, 'sku'))
                .toLowerCase()
                .includes(filters.query.toLowerCase())),
        ),
      );
    },
    getProductSource(sku: string) {
      const p = catalog.products.find((p) => value(p, 'sku') === sku);
      return p
        ? structuredClone(
            Object.fromEntries(
              Object.entries(p.fields).map(([key, f]) => [
                key,
                factEvidence(f),
              ]),
            ),
          )
        : null;
    },
    getApplicableRules(context: Omit<EvaluationContext, 'catalogVersionId'>) {
      const familyIds = context.productId
        ? catalog.registries
            .filter(
              (r) =>
                r.entityKind === 'family' &&
                r.productIds.some((p) => p.value === context.productId),
            )
            .map((r) => r.id)
        : context.familyIds;
      return evaluateRules(catalog.rules, {
        ...context,
        ...(familyIds ? { familyIds } : {}),
        catalogVersionId: catalog.id,
      });
    },
  };
}
