'use client';
import { ReplacementComparison } from './replacement-comparison';
import { type Purchase, purchaseLines } from '@/designer/purchasing';
import { parseDesign } from '@/designer/model';
import {
  emptyConfirmation,
  type SupplierConfirmation,
} from '@/designer/supplier-confirmation';
export function SupplierConfirmations({
  purchase,
  onChange,
}: {
  purchase: Purchase;
  onChange: (c: SupplierConfirmation) => void;
}) {
  const confirmation = purchase.confirmation ?? emptyConfirmation(),
    lines = purchaseLines(parseDesign(purchase.designJson), purchase.book);
  function updateLine(
    id: string,
    patch: Partial<SupplierConfirmation['lines'][number]>,
  ) {
    const current = confirmation.lines.find((l) => l.lineId === id) ?? {
      lineId: id,
      confirmedQuantity: 0,
      leadDays: 0,
      expectedDelivery: '',
      substituteSku: '',
      substitution: 'none' as const,
      note: '',
    };
    onChange({
      ...confirmation,
      lines: [
        ...confirmation.lines.filter((l) => l.lineId !== id),
        { ...current, ...patch },
      ],
    });
  }
  return (
    <details className="supplier-confirmations">
      <summary>Supplier confirmations & lead times</summary>
      <p>
        Record the supplier’s response to this draft. Quantities and
        substitutions are manual records; accepted substitutions still need a
        revised design and client approval before procurement.
      </p>
      <p>
        Enter a supplier reference and confirmation date for quantities to count
        as confirmed in the project overview.
      </p>
      <div className="business-grid">
        <label>
          Supplier reference
          <input
            aria-label="Supplier confirmation reference"
            maxLength={160}
            value={confirmation.reference}
            onChange={(e) =>
              onChange({ ...confirmation, reference: e.target.value })
            }
          />
        </label>
        <label>
          Supplier contact
          <input
            aria-label="Supplier confirmation contact"
            maxLength={200}
            value={confirmation.contact}
            onChange={(e) =>
              onChange({ ...confirmation, contact: e.target.value })
            }
          />
        </label>
        <label>
          Confirmation date
          <input
            aria-label="Supplier confirmation date"
            type="date"
            value={confirmation.confirmedOn}
            onChange={(e) =>
              onChange({ ...confirmation, confirmedOn: e.target.value })
            }
          />
        </label>
      </div>
      {lines.map((line, index) => {
        const c = confirmation.lines.find((c) => c.lineId === line.id);
        return (
          <section className="purchase-card" key={line.id}>
            <h4>
              {line.sku} · {line.finish} · {line.quantity} ordered
            </h4>
            <div className="business-grid">
              <label>
                Confirmed quantity
                <input
                  aria-label={`Confirmed quantity ${index + 1}`}
                  type="number"
                  min={0}
                  max={line.quantity}
                  value={c?.confirmedQuantity ?? 0}
                  onChange={(e) =>
                    updateLine(line.id, {
                      confirmedQuantity: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Lead time (days)
                <input
                  aria-label={`Lead time ${index + 1}`}
                  type="number"
                  min={0}
                  max={730}
                  value={c?.leadDays ?? 0}
                  onChange={(e) =>
                    updateLine(line.id, { leadDays: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Expected delivery
                <input
                  aria-label={`Expected delivery ${index + 1}`}
                  type="date"
                  value={c?.expectedDelivery ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, { expectedDelivery: e.target.value })
                  }
                />
              </label>
              <label>
                Proposed substitute SKU
                <input
                  aria-label={`Substitute SKU ${index + 1}`}
                  maxLength={100}
                  value={c?.substituteSku ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, { substituteSku: e.target.value })
                  }
                />
              </label>
              <label>
                Substitution decision
                <select
                  aria-label={`Substitution decision ${index + 1}`}
                  value={c?.substitution ?? 'none'}
                  onChange={(e) =>
                    updateLine(line.id, {
                      substitution: e.target.value as
                        'none' | 'proposed' | 'accepted' | 'rejected',
                    })
                  }
                >
                  <option value="none">No substitution</option>
                  <option value="proposed">Proposed — needs review</option>
                  <option value="accepted">
                    Accepted by project team — revise design
                  </option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label>
                Supplier line notes
                <textarea
                  aria-label={`Supplier line notes ${index + 1}`}
                  maxLength={2000}
                  value={c?.note ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, { note: e.target.value })
                  }
                />
              </label>
            </div>
            <ReplacementComparison
              key={`${purchase.id}:${line.id}`}
              purchase={purchase}
              lineId={line.id}
              sku={c?.substituteSku ?? ''}
              value={c?.replacement}
              onSave={(replacement) =>
                updateLine(line.id, {
                  replacement,
                  substituteSku: replacement.sku,
                })
              }
            />
          </section>
        );
      })}
    </details>
  );
}
