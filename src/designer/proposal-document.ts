import { itemPolygon, type Design } from './model';
import { roomOutline } from './room';
import { type PriceBook, supplierQuote } from './supplier-pricing';
import { storageSummary } from './design-decisions';
import { money } from './quote';
const escape = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export function proposalDocument(
  options: { name: string; design: Design }[],
  book: PriceBook,
  revision: number,
  now = Date.now(),
) {
  if (!options.length) throw Error('Generate proposals first.');
  const cards = options.map((option) => {
    const quote = supplierQuote(option.design, book, now);
    if (quote.total === null)
      throw Error('All proposals need complete, current supplier prices.');
    const storage = storageSummary(option.design),
      points = (p: { x: number; y: number }[]) =>
        p.map((p) => `${p.x},${p.y}`).join(' ');
    return `<article><h2>${escape(option.name)}</h2><strong class="price">${money(quote.total)}</strong><svg role="img" aria-label="${escape(option.name)} plan" viewBox="-5 -5 ${option.design.room.width + 10} ${option.design.room.depth + 10}"><polygon points="${points(roomOutline(option.design.room))}" fill="#eef3ed" stroke="#456957"/>${option.design.items
      .filter((i) => !i.hidden)
      .map(
        (i) =>
          `<polygon points="${points(itemPolygon(i))}" fill="${i.elevation > 40 ? '#bad5df' : '#cfb38c'}" stroke="#456957" stroke-width=".5"/>`,
      )
      .join(
        '',
      )}</svg><p>${storage.drawerUnits} drawer/pull-out units · ${storage.pantryWidth} in pantry frontage</p><p>Items ${money(quote.subtotal)} · discount ${money(quote.discount)} · tax ${money(quote.tax)} · installation ${money(quote.installation)} · delivery ${money(quote.delivery)}</p><table><thead><tr><th>Item</th><th>Finish / configuration</th><th>Price</th></tr></thead><tbody>${quote.lines.map((line) => `<tr><td>${escape(line.sku)}<small>${line.width} × ${line.depth} × ${line.height} in</small></td><td>${escape(line.finish)}<small>${escape(line.configuration)}</small></td><td>${money(line.unitCents ?? 0)}</td></tr>`).join('')}</tbody></table></article>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kitchen proposal comparison</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#233b35;background:#f4f7f1}main{max-width:1300px;margin:auto;padding:24px}h1{font-size:34px}h2{font-size:21px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px}article{padding:20px;border:1px solid #90ab9a;border-radius:12px;background:white;min-width:0;overflow-wrap:anywhere}.price{font-size:28px}svg{width:100%;max-height:300px;margin:20px 0}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:8px 3px;text-align:left;border-bottom:1px solid #cbd6cf;vertical-align:top}small{display:block;overflow-wrap:anywhere}button{padding:12px 18px;background:#215c49;color:white;border:0;border-radius:8px}@media print{button{display:none}article{break-inside:avoid}.grid{display:block}article{margin-bottom:20px}body{background:white}}</style></head><body><main><header><p>Kitchen Studio · Decision guide</p><h1>${escape(options[0]?.design.name)}</h1><p>Supplier: ${escape(book.supplier)} · Source: ${escape(book.reference)} · Price revision ${revision} · Valid through ${escape(book.validUntil)}</p><p>“Best” prioritizes the household’s storage preference. Compare actual configurations with the supplier. Cabinet front styles and storage planning targets are illustrative.</p><button onclick="window.print()">Print / save PDF</button></header><section class="grid">${cards.join('')}</section><p>Tell your designer which option you prefer. Approval is recorded separately against the final shared design revision.</p></main></body></html>`;
}
