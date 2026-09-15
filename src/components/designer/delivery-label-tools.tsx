'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import { type Purchase, emptyPurchasing } from '@/designer/purchasing';
import {
  emptyCloseout,
  fieldPackage,
  parseCloseout,
} from '@/designer/closeout';
import { downloadJson } from './business-tools';
import { downloadHtml } from './closeout-tools';
export function DeliveryLabelTools({
  purchase,
  design,
  ownerId,
}: {
  purchase: Purchase;
  design: Design;
  ownerId: string;
}) {
  const [base, setBase] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <details>
      <summary>QR delivery labels</summary>
      <p>
        Print one label per ordered item. Scanning opens its ordered location,
        downloaded delivery record and project installation checklist. The
        receiving device needs a field package containing this draft; the QR
        itself contains only identifiers.
      </p>
      <label>
        Public app address
        <input
          aria-label="QR app address"
          value={base}
          placeholder="Leave blank to use this app’s address"
          onChange={(e) => setBase(e.target.value)}
        />
      </label>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { deliveryLabelDocument } =
              await import('@/designer/delivery-labels');
            downloadHtml(
              await deliveryLabelDocument(
                purchase,
                base.trim() || location.origin,
              ),
              'delivery-qr-labels.html',
            );
            setMessage(
              'QR labels exported. Print at 100% scale. Use a reachable hosted address for scanning on another device.',
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Export printable QR labels
      </button>
      <button
        onClick={() => {
          try {
            const raw = localStorage.getItem(
              `kitchen-closeout:${ownerId}:${design.id}`,
            );
            const closeout = raw
              ? parseCloseout(raw, design.id, true)
              : emptyCloseout(design.id);
            downloadJson(
              fieldPackage(design, closeout, {
                ...emptyPurchasing(design.id),
                purchases: [purchase],
              }),
              'delivery-label-field-package.json',
            );
            setMessage(
              'Field package exported for this draft. Import it on the receiving device.',
            );
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Export field package for these labels
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
