'use client';
import type { Cabinet, Design } from '@/designer/model';
import { clearanceDefaults } from '@/designer/model';
import {
  demoUnitPrice,
  money,
  quoteDefaults,
  quoteDocument,
  quoteTotals,
} from '@/designer/quote';
import { useEffect, useState } from 'react';
export function OptionNumber({
  label,
  value,
  onChange,
  min = 0,
  max = 600,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="designer-numeric">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step="0.5"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (text.trim() && Number.isFinite(n) && n >= min && n <= max)
            onChange(n);
          else setText(String(value));
        }}
      />
    </label>
  );
}
export function DesignOptions({
  design,
  onChange,
}: {
  design: Design;
  onChange: (next: Design) => void;
}) {
  const appearance = design.appearance ?? {
    countertop: 'quartz',
    lighting: 'daylight',
  };
  return (
    <details className="demo-options">
      <summary>Architecture & materials</summary>
      <label className="designer-numeric">
        <span>Ceiling shape</span>
        <select
          aria-label="Ceiling shape"
          value={
            design.room.ceiling?.kind === 'vault'
              ? 'vault'
              : (design.room.ceiling?.axis ?? 'flat')
          }
          onChange={(e) =>
            onChange({
              ...design,
              room: {
                ...design.room,
                ceiling:
                  e.target.value === 'flat'
                    ? undefined
                    : {
                        axis:
                          e.target.value === 'vault'
                            ? 'x'
                            : (e.target.value as 'x' | 'y'),
                        kind: e.target.value === 'vault' ? 'vault' : 'slope',
                        endHeight:
                          design.room.ceiling?.endHeight ??
                          design.room.height + 24,
                      },
              },
            })
          }
        >
          <option value="flat">Flat</option>
          <option value="vault">Vaulted (ridge along depth)</option>
          <option value="x">Slope along width</option>
          <option value="y">Slope along depth</option>
        </select>
      </label>
      {design.room.ceiling && (
        <OptionNumber
          label={
            design.room.ceiling.kind === 'vault'
              ? 'Vault peak height (in)'
              : 'Far-end ceiling height (in)'
          }
          min={36}
          value={design.room.ceiling.endHeight}
          onChange={(endHeight) =>
            onChange({
              ...design,
              room: {
                ...design.room,
                ceiling: {
                  ...design.room.ceiling,
                  axis: design.room.ceiling?.axis ?? 'x',
                  endHeight,
                },
              },
            })
          }
        />
      )}
      <p className="designer-muted">
        Room ceiling height sets the near end. Add columns, beams and partition
        walls from Objects. Rotate objects to any angle.
      </p>
      <label className="designer-numeric">
        <span>Countertop pattern</span>
        <select
          aria-label="Countertop pattern"
          value={appearance.countertop}
          onChange={(e) =>
            onChange({
              ...design,
              appearance: {
                ...appearance,
                countertop: e.target.value as typeof appearance.countertop,
              },
            })
          }
        >
          {['quartz', 'marble', 'granite'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="designer-numeric">
        <span>Lighting</span>
        <select
          aria-label="Lighting"
          value={appearance.lighting}
          onChange={(e) =>
            onChange({
              ...design,
              appearance: {
                ...appearance,
                lighting: e.target.value as typeof appearance.lighting,
              },
            })
          }
        >
          {['daylight', 'warm', 'studio'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
    </details>
  );
}
export function ItemOptions({
  item,
  onChange,
}: {
  item: Cabinet;
  onChange: (patch: Partial<Cabinet>) => void;
}) {
  const details = item.details ?? {
    shelves: 2,
    toeKick: 4,
    molding: false,
    interior: 'shelves',
  };
  const clear = item.clearance ?? clearanceDefaults(item);
  return (
    <details className="demo-options">
      <summary>Detailing, clearances & price</summary>
      {item.kind !== 'door' && item.kind !== 'window' && (
        <OptionNumber
          label="Rotation (degrees)"
          value={item.rotation}
          max={359}
          onChange={(rotation) => onChange({ rotation })}
        />
      )}
      {['cabinet', 'custom_cabinet', 'island', 'corner'].includes(
        item.kind,
      ) && (
        <>
          {item.kind === 'corner' && (
            <label className="designer-numeric">
              <span>Corner configuration</span>
              <select
                aria-label="Corner configuration"
                value={item.details?.corner ?? 'diagonal'}
                onChange={(e) =>
                  onChange({
                    details: {
                      ...details,
                      corner: e.target.value as
                        'diagonal' | 'blind_left' | 'blind_right',
                    },
                  })
                }
              >
                <option value="diagonal">Diagonal front</option>
                <option value="blind_left">Blind left</option>
                <option value="blind_right">Blind right</option>
              </select>
            </label>
          )}
          <OptionNumber
            label="Interior shelves / trays"
            max={8}
            value={details.shelves}
            onChange={(shelves) =>
              onChange({
                details: { ...details, shelves: Math.round(shelves) },
              })
            }
          />
          <OptionNumber
            label="Toe kick height (in)"
            max={Math.min(12, item.height - 1)}
            value={details.toeKick}
            onChange={(toeKick) =>
              onChange({ details: { ...details, toeKick } })
            }
          />
          <label className="designer-numeric">
            <span>Interior</span>
            <select
              aria-label="Cabinet interior"
              value={details.interior}
              onChange={(e) =>
                onChange({
                  details: {
                    ...details,
                    interior: e.target.value as typeof details.interior,
                  },
                })
              }
            >
              <option value="shelves">Shelves</option>
              <option value="pullouts">Pull-out trays</option>
              <option value="lazy_susan">Lazy Susan</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={details.molding}
              onChange={(e) =>
                onChange({ details: { ...details, molding: e.target.checked } })
              }
            />{' '}
            Crown molding
          </label>
        </>
      )}
      {Object.entries(clear).map(([key, value]) => (
        <OptionNumber
          key={key}
          label={`${key.charAt(0).toUpperCase() + key.slice(1)} clearance (in)`}
          value={value}
          max={key === 'side' || key === 'rear' ? 24 : 120}
          onChange={(value) =>
            onChange({ clearance: { ...clear, [key]: value } })
          }
        />
      ))}
      <p className="designer-muted">
        Conservative demo envelopes, not manufacturer installation
        specifications. Enter the clearances for your chosen appliance. Zero
        disables that check.
      </p>
      <OptionNumber
        label="Demo unit price (USD)"
        value={demoUnitPrice(item)}
        max={1000000}
        onChange={(demoPrice) => onChange({ demoPrice })}
      />
      <button
        disabled={item.demoPrice === undefined}
        onClick={() => onChange({ demoPrice: undefined })}
      >
        Reset demo price
      </button>
    </details>
  );
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function QuotePanel({
  design,
  onChange,
}: {
  design: Design;
  onChange: (next: Design) => void;
}) {
  const q = { ...quoteDefaults, ...design.quote },
    totals = quoteTotals(design);
  return (
    <section className="demo-quote">
      <h2>Quote & demo orders</h2>
      <p>
        <strong>DEMO PRICING · USD</strong> — illustrative estimates, not
        manufacturer prices.
      </p>
      <label>
        Customer / project reference
        <input
          aria-label="Quote customer"
          maxLength={200}
          value={q.customer}
          onChange={(e) =>
            onChange({ ...design, quote: { ...q, customer: e.target.value } })
          }
        />
      </label>
      <div className="quote-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Dimensions</th>
              <th>Demo unit price</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.sku}</td>
                <td>{line.description}</td>
                <td>{money(line.unitCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="designer-muted">
        Each placement is one unit. Select an item to override its demo price.
        Accessories placed separately are priced separately.
      </p>
      <div className="quote-settings">
        {(['discount', 'tax', 'installation', 'delivery'] as const).map(
          (key) => (
            <OptionNumber
              key={key}
              label={`${key.charAt(0).toUpperCase() + key.slice(1)} ${key === 'tax' || key === 'discount' ? '(%)' : '(USD)'}`}
              value={q[key]}
              max={key === 'tax' || key === 'discount' ? 100 : 1000000}
              onChange={(value) =>
                onChange({ ...design, quote: { ...q, [key]: value } })
              }
            />
          ),
        )}
      </div>
      <p>
        Merchandise {money(totals.subtotal)} · Discount −
        {money(totals.discount)} · Tax {money(totals.tax)} · Installation{' '}
        {money(totals.installation)} · Delivery {money(totals.delivery)}
      </p>
      <h3>Demo total: {money(totals.total)}</h3>
      <p className="designer-muted">
        Tax is applied to discounted merchandise only. No payment is collected
        and no supplier order is placed.
      </p>
      <div className="designer-row">
        <button
          onClick={() => download(quoteDocument(design), 'demo-quote.json')}
        >
          Export quote
        </button>
        <button onClick={() => window.print()}>Print quote / PDF</button>
        <button
          disabled={!design.items.length || (design.orders?.length ?? 0) >= 20}
          onClick={() => {
            const order = {
              id: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
              createdAt: new Date().toISOString(),
              customer: q.customer,
              total: totals.total,
              snapshot: JSON.stringify(quoteDocument(design)),
            };
            onChange({ ...design, orders: [...(design.orders ?? []), order] });
          }}
        >
          Create demo order
        </button>
      </div>
      <h3>Saved demo orders</h3>
      <p className="designer-muted">
        Saved with this design in this browser. Order snapshots keep the prices
        and quantities at creation time.
      </p>
      {(design.orders ?? []).map((order) => (
        <div key={order.id} className="demo-order">
          <strong>{order.id}</strong> ·{' '}
          {new Date(order.createdAt).toLocaleDateString()} ·{' '}
          {money(order.total)} · {order.customer}
          <button
            onClick={() =>
              download(
                {
                  ...order,
                  status: 'Demo only — not submitted',
                  quote: JSON.parse(order.snapshot),
                },
                `${order.id}.json`,
              )
            }
          >
            Download order
          </button>
        </div>
      ))}
    </section>
  );
}
