import type { Design } from './model';
import { supplierQuote, type PriceBook } from './supplier-pricing';
import { money } from './quote';
export type QuoteBrand = {
  company: string;
  contact: string;
  number: string;
  terms: string;
  validUntil: string;
  logo?: string;
};
const escape = (text: unknown) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  );
export function supplierQuoteHtml(
  design: Design,
  book: PriceBook,
  brand: QuoteBrand,
  revision: number,
  now = Date.now(),
) {
  const quote = supplierQuote(design, book, now);
  if (quote.total === null)
    throw Error(
      'A complete, current supplier quote is required for PDF export.',
    );
  const expiry = brand.validUntil || book.validUntil;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
    !Number.isFinite(Date.parse(expiry)) ||
    new Date(expiry).toISOString().slice(0, 10) !== expiry ||
    expiry > book.validUntil ||
    Date.parse(expiry) + 86400000 <= now
  )
    throw Error(
      'Quote expiry must be current and no later than the supplier price expiry.',
    );
  const grouped = new Map<
    string,
    { line: (typeof quote.lines)[number]; quantity: number }
  >();
  for (const line of quote.lines) {
    const key = JSON.stringify([
      line.sku,
      line.finish,
      line.configuration,
      line.width,
      line.depth,
      line.height,
      line.unitCents,
    ]);
    const previous = grouped.get(key);
    if (previous) previous.quantity++;
    else grouped.set(key, { line, quantity: 1 });
  }
  const logo =
    brand.logo &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(brand.logo)
      ? `<img class="logo" alt="Company logo" src="${brand.logo}">`
      : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(brand.number || design.name)} — Supplier quote</title><style>
  *{box-sizing:border-box}body{font:14px/1.5 system-ui,sans-serif;color:#233b35;max-width:1000px;margin:32px auto;padding:24px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #245d50;padding-bottom:24px}h1{font-size:32px;margin:0}h2{font-size:18px}p{margin:6px 0}.muted{color:#52685f}.logo{max-width:200px;max-height:90px;object-fit:contain}.meta{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:25px 0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;border-bottom:1px solid #ccd8d1;padding:9px 5px;vertical-align:top}.amount{text-align:right;white-space:nowrap}.totals{margin:24px 0 24px auto;width:320px;max-width:100%}.totals div{display:flex;justify-content:space-between;padding:5px}.grand{font-size:20px;font-weight:bold;border-top:2px solid #245d50}.terms{white-space:pre-wrap;overflow-wrap:anywhere}.controls{background:#eff5f1;padding:14px;margin-bottom:25px}button{padding:10px 18px;cursor:pointer}small{display:block;overflow-wrap:anywhere}.signature{margin-top:30px;color:#52685f}@page{size:A4;margin:15mm}@media print{body{margin:0;padding:0;max-width:none}.controls{display:none}thead{display:table-header-group}tr,.totals,header{break-inside:avoid}h2{break-after:avoid}a{color:inherit;text-decoration:none}}
  </style></head><body><div class="controls"><button onclick="window.print()">Print / save PDF</button> Choose “Save as PDF” in your print dialog.</div><header><div>${logo}<h1>${escape(brand.company || 'Kitchen Studio')}</h1><p class="terms">${escape(brand.contact)}</p></div><div><h2>SUPPLIER-PRICED QUOTE</h2><p>${escape(brand.number || design.id.slice(0, 8))}</p><p>Issued ${new Date(now).toISOString().slice(0, 10)}</p><p>Valid through ${escape(expiry)}</p></div></header><section class="meta"><div><strong>Prepared for</strong><p>${escape(design.quote?.customer || 'Client')}</p><p>${escape(design.name)}</p></div><div><strong>Supplier</strong><p>${escape(book.supplier)}</p><p class="muted">${escape(book.reference)}</p><p>Price list revision ${revision} · ${book.currency}</p></div></section><table><thead><tr><th>SKU / configuration</th><th>Finish</th><th>Dimensions (in)</th><th>Qty</th><th class="amount">Unit</th><th class="amount">Amount</th></tr></thead><tbody>${[...grouped.values()].map(({ line, quantity }) => `<tr><td>${escape(line.sku)}${line.configuration === 'standard' ? '' : `<small>${escape(line.configuration)}</small>`}</td><td>${escape(line.finish)}</td><td>${line.width} × ${line.depth} × ${line.height}</td><td>${quantity}</td><td class="amount">${money(line.unitCents ?? 0)}</td><td class="amount">${money((line.unitCents ?? 0) * quantity)}</td></tr>`).join('')}</tbody></table><section class="totals">${[
    ['Items', quote.subtotal],
    ['Discount', -quote.discount],
    ['Tax', quote.tax],
    ['Installation', quote.installation],
    ['Delivery', quote.delivery],
  ]
    .map(
      ([label, value]) =>
        `<div><span>${label}</span><span>${money(Number(value))}</span></div>`,
    )
    .join(
      '',
    )}<div class="grand"><span>Total (USD)</span><span>${money(quote.total)}</span></div></section><h2>Terms & notes</h2><p class="terms">${escape(brand.terms)}</p><p class="muted">Installation and delivery are entered by the designer. Tax applies to discounted items. Confirm product configuration, availability and final site dimensions before ordering.</p><p class="signature">Prepared by ${escape(brand.company || 'Kitchen Studio')} · ${escape(design.name)}</p></body></html>`;
}
