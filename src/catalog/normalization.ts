/** Exact inch parsing; ambiguous ranges, mixed units and malformed fractions remain errors. */
export function parseInches(input: string): number {
  const fractions: Record<string, string> = {
    '¼': '1/4',
    '½': '1/2',
    '¾': '3/4',
    '⅛': '1/8',
    '⅜': '3/8',
    '⅝': '5/8',
    '⅞': '7/8',
  };
  let s = input
    .trim()
    .replace(/(?:inches|inch|in\.?|["″])$/i, '')
    .trim();
  s = s
    .replace(/(\d)([¼½¾⅛⅜⅝⅞])/g, '$1 $2')
    .replace(/[¼½¾⅛⅜⅝⅞]/g, (c) => fractions[c] ?? c);
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const match = s.match(/^(?:(\d+)[ -])?(\d+)\s*\/\s*(\d+)$/);
  if (!match) throw new Error('Unambiguous inch value required');
  const denominator = Number(match[3]),
    numerator = Number(match[2]);
  if (!denominator || numerator >= denominator)
    throw new Error('Invalid fractional inch value');
  return Number(match[1] ?? 0) + numerator / denominator;
}
export function normalizeSku(raw: string) {
  const value = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!value || !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(value))
    throw new Error('SKU includes unresolved symbols or invalid characters');
  return value;
}
const categories: Record<string, string> = {
  'wall cabinets': 'wall_cabinet',
  'base cabinets': 'base_cabinet',
  'tall cabinets': 'tall_cabinet',
  panels: 'panel',
  fillers: 'filler',
  moldings: 'molding',
  mouldings: 'molding',
  accessories: 'accessory',
  hardware: 'hardware',
};
export function normalizeCategory(raw: string) {
  return categories[raw.trim().toLowerCase()] ?? 'other';
}
