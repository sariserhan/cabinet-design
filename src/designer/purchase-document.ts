import { parseDesign } from './model';
import { type Purchase, purchaseChecks, purchaseLines } from './purchasing';
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
const usd = (c: number | null) =>
  c === null ? 'Unpriced' : `$${(c / 100).toFixed(2)}`;
export function purchaseDocument(p: Purchase) {
  const d = parseDesign(p.designJson),
    checks = purchaseChecks(d, p.book, p.approval);
  const lines = purchaseLines(d, p.book);
  const subtotal = lines.some((l) => l.lineCents === null)
    ? null
    : lines.reduce((sum, l) => sum + (l.lineCents ?? 0), 0);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Purchase draft ${escape(p.number)}</title><style>body{font:15px system-ui;max-width:1050px;margin:40px auto;padding:20px;color:#20382d}table{width:100%;border-collapse:collapse}th,td{padding:10px;border:1px solid #bbc8bf;text-align:left;overflow-wrap:anywhere}small{display:block}pre{white-space:pre-wrap} @media print{button{display:none}}</style><h1>Purchase-order draft ${escape(p.number)}</h1><p>${escape(d.name)} · ${escape(d.quote?.customer)} · ${escape(p.createdAt)}</p><p>Supplier: ${escape(p.book?.supplier ?? 'Unassigned')} · Price reference: ${escape(p.book?.reference ?? 'None')} · Valid through: ${escape(p.book?.validUntil ?? 'Unknown')}</p><strong>DRAFT — not submitted to supplier</strong><p>Confirm availability, manufacturer specifications, shipping, supplier taxes and payment terms before placing an order. Door and window room openings are excluded.</p><h2>Review checks</h2><ul>${checks.map((c) => `<li>${escape(c)}</li>`).join('') || '<li>Recorded checks passed. Supplier confirmation still required.</li>'}</ul><p>${p.approval ? `Design approval captured: revision ${p.approval.revision}, ${escape(p.approval.names.join(', '))}. Names are self-reported; supplier prices are not client price approval.` : 'No verified design approval captured.'}</p><table><thead><tr><th>SKU / specification</th><th>Quantity</th><th>Unit USD</th><th>Line USD</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${escape(l.sku)}<small>${escape(l.finish)} · ${l.width} × ${l.depth} × ${l.height} in</small><small>${escape(l.configuration)}</small><small>Item IDs: ${escape(l.itemIds.join(', '))}</small></td><td>${l.quantity}</td><td>${usd(l.unitCents)}</td><td>${usd(l.lineCents)}</td></tr>`).join('')}</tbody></table><p>Product subtotal: ${usd(subtotal)}${checks.some((c) => c.includes('expired')) ? ' (expired reference prices)' : ''}. Supplier taxes and shipping excluded. Customer quote discounts and installation are not purchase costs.</p><h2>Supplier confirmation record</h2><p>${escape(p.confirmation?.reference ?? 'Not recorded')} · ${escape(p.confirmation?.confirmedOn)} · ${escape(p.confirmation?.contact)}</p>${p.confirmation?.lines.map((c) => `<p>${escape(lines.find((l) => l.id === c.lineId)?.sku ?? c.lineId)}: ${c.confirmedQuantity} confirmed · ${c.leadDays} days · expected ${escape(c.expectedDelivery || 'unknown')} · substitution ${escape(c.substitution)} ${escape(c.substituteSku)}<br>${escape(c.note)}</p>`).join('') ?? ''}<h2>Supplier questions / instructions</h2><pre>${escape(p.supplierNote)}</pre><button onclick="window.print()">Print / save PDF</button></html>`;
}
