import manifest from './public-catalog-manifest.json';
import type { Product, Cabinet } from './model';
export const publicCatalogs = manifest;
export type PublicProduct = Product & {
  family: string;
  sourceNote?: string | undefined;
  dimensionStatus: string;
  reviewStatus: string;
};
export type PublicCatalog = {
  catalog: (typeof manifest)[number];
  products: PublicProduct[];
};
export function isPublicRecord(id: string) {
  return id.startsWith('public-');
}
export function publicSourceLink(
  item: Pick<Cabinet, 'versionId' | 'recordId'>,
) {
  const source = manifest.find((c) => c.id === item.versionId);
  if (!source) return null;
  const page = Number(item.recordId.match(/:p(\d+):/)?.[1]);
  return `/api/public-catalog-source?series=${source.series.toLowerCase()}${page >= 1 && page <= source.pageCount ? `#page=${page}` : ''}`;
}
export function filterPublicProducts(
  products: PublicProduct[],
  query: string,
  category: string,
  offset = 0,
) {
  const q = query.trim().toLowerCase();
  const matches = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!q || `${p.sku} ${p.family}`.toLowerCase().includes(q)),
  );
  return {
    total: matches.length,
    records: matches.slice(offset, offset + 100),
  };
}
