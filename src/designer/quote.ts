import type { Cabinet, Design } from './model';
export const quoteDefaults = {
  customer: '',
  tax: 0,
  installation: 0,
  delivery: 0,
  discount: 0,
};
export function demoUnitPrice(item: Cabinet) {
  if (item.demoPrice !== undefined) return item.demoPrice;
  const prices: Partial<Record<Cabinet['kind'], number>> = {
    refrigerator: 1800,
    range: 1100,
    dishwasher: 650,
    washing_machine: 850,
    sink: 300,
    door: 250,
    window: 450,
    island: 1400,
    corner: 900,
    column: 180,
    beam: 220,
    partition: 200,
  };
  if (prices[item.kind] !== undefined) return prices[item.kind] ?? 0;
  if (item.kind === 'countertop')
    return Math.round(((item.width * item.depth) / 144) * 65);
  if (['filler', 'trim', 'molding', 'toe_kick'].includes(item.kind))
    return Math.round(25 + item.width * 1.5);
  return Math.round(
    150 +
      item.width * 12 +
      item.height * 3 +
      (item.details?.molding ? 60 : 0) +
      (item.details?.shelves ?? 2) * 15 +
      (item.details?.interior === 'pullouts'
        ? 180
        : item.details?.interior === 'lazy_susan'
          ? 150
          : 0),
  );
}
export function quoteTotals(design: Design) {
  const settings = { ...quoteDefaults, ...design.quote };
  const cents = (n: number) => Math.round(n * 100);
  const lines = design.items.map((item) => ({
    id: item.id,
    sku: item.sku,
    description: `${item.width} × ${item.depth} × ${item.height} in`,
    unitCents: cents(demoUnitPrice(item)),
  }));
  const subtotal = lines.reduce((sum, l) => sum + l.unitCents, 0),
    discount = Math.round((subtotal * settings.discount) / 100),
    tax = Math.round(((subtotal - discount) * settings.tax) / 100),
    installation = cents(settings.installation),
    delivery = cents(settings.delivery);
  return {
    lines,
    subtotal,
    discount,
    tax,
    installation,
    delivery,
    total: subtotal - discount + tax + installation + delivery,
  };
}
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  );
export function quoteDocument(design: Design) {
  return {
    label: 'DEMO PRICING — NOT A MANUFACTURER QUOTE',
    currency: 'USD',
    design: design.name,
    customer: design.quote?.customer ?? '',
    settings: { ...quoteDefaults, ...design.quote },
    specification: {
      room: design.room,
      finish: design.finish,
      appearance: design.appearance,
      items: design.items,
    },
    amountsIn: 'cents',
    ...quoteTotals(design),
    notes:
      'Illustrative prices. Tax applies to discounted merchandise only. No payment collected or supplier order placed.',
  };
}
