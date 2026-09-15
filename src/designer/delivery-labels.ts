import QRCode from 'qrcode';
import { type Purchase, supplyDesign } from './purchasing';
import { parseDesign } from './model';
export function deliveryLabelUrl(
  base: string,
  designId: string,
  purchaseId: string,
  itemId: string,
) {
  const url = new URL(base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error('Use an HTTP(S) app address without credentials.');
  url.pathname = '/field/index.html';
  url.search = '';
  url.hash = new URLSearchParams({
    project: designId,
    purchase: purchaseId,
    item: itemId,
  }).toString();
  return url.toString();
}
const escape = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
export async function deliveryLabelDocument(p: Purchase, base: string) {
  const d = parseDesign(p.designJson);
  const labels = await Promise.all(
    supplyDesign(d).items.map(async (item, index) => {
      const url = deliveryLabelUrl(base, d.id, p.id, item.id);
      const svg = await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 4,
        width: 220,
      });
      return `<article><div class="qr">${svg}</div><section><h2>${index + 1}. ${escape(item.sku)}</h2><p>${escape(d.name)} · ${escape(p.number)}</p><p>${item.width}×${item.depth}×${item.height} in<br>Ordered location: X ${item.x}, Y ${item.y}, elevation ${item.elevation} in</p><small>Item ${escape(item.id)}</small><a href="${escape(url)}">Open item record</a></section></article>`;
    }),
  );
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Delivery labels ${escape(p.number)}</title><style>body{font:14px system-ui;margin:24px;color:#163629}article{display:flex;align-items:center;gap:16px;border:1px dashed #526c5c;padding:12px;margin:12px 0;break-inside:avoid}h2{font-size:19px}.qr{width:180px;flex-shrink:0}.qr svg{width:100%;height:auto}small,a{display:block;overflow-wrap:anywhere} @media print{button,.instructions{display:none}article{height:58mm}.qr{width:45mm}}</style><h1>Delivery labels · ${escape(p.number)}</h1><p class="instructions">Print at 100% scale. Scan with the device camera. Import an up-to-date field package on that device to view the matching order snapshot, delivery record and project installation checklist. The QR contains opaque project/order/item identifiers, not customer details. Links use ${escape(new URL(base).origin)}; localhost links work only on the same device.</p><button onclick="window.print()">Print labels</button>${labels.join('')}</html>`;
}
