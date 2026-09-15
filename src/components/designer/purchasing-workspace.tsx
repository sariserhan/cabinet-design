'use client';
import { SupplierConfirmations } from './supplier-confirmations';
import { projectDataChanged } from '@/designer/local-project-events';
import { compactPhoto } from './compact-photo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { type Design, parseDesign } from '@/designer/model';
import { parsePriceBook } from '@/designer/supplier-pricing';
import { reviewContent } from '@/designer/project-workflow';
import {
  approvalFromReview,
  deliverySummary,
  designSnapshot,
  emptyPurchasing,
  makeChange,
  makePurchase,
  parsePurchasing,
  purchaseChecks,
  purchaseLines,
  scopeDifference,
  supplyDesign,
  type Purchasing,
  type Receipt,
} from '@/designer/purchasing';
import { purchaseDocument } from '@/designer/purchase-document';
import { downloadJson } from './business-tools';
import { MiniPlan } from './workflow-tools';

const dollars = (c: number | null) =>
  c === null
    ? 'Not fully priced'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(c / 100);
export function PurchasingWorkspace(props: {
  design: Design;
  ownerId: string;
  onLocate: (id: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="business-panel purchasing-panel"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>Orders, changes & deliveries</summary>
      {opened && <PurchasingTools {...props} />}
    </details>
  );
}
function PurchasingTools({
  design,
  ownerId,
  onLocate,
}: {
  design: Design;
  ownerId: string;
  onLocate: (id: string) => void;
}) {
  const client = useConvex(),
    books = useQuery(api.supplierPricing.list, {});
  const stored =
    books?.find((b) => b._id === design.supplierBookId) ??
    (!design.supplierBookId ? books?.[0] : undefined);
  const book = useMemo(
    () => (stored ? parsePriceBook(stored.priceBookJson) : undefined),
    [stored],
  );
  const key = `kitchen-purchasing:${ownerId}:${design.id}`;
  const [data, setData] = useState<Purchasing>(() =>
    emptyPurchasing(design.id),
  );
  const savedRaw = useRef<string | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const currentDesign = useRef(design);
  currentDesign.current = design;
  const [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('changes'),
    [link, setLink] = useState(''),
    [reason, setReason] = useState(''),
    [number, setNumber] = useState('PO-001'),
    [note, setNote] = useState(''),
    [selected, setSelected] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      savedRaw.current = raw;
      if (raw) setData(parsePurchasing(raw, design.id, true));
      setLoaded(true);
    } catch (e) {
      setMessage(
        `Could not load purchasing records: ${(e as Error).message}. Export the stored backup before replacing it.`,
      );
    }
  }, [key, design.id]);
  function save(next: Purchasing) {
    const raw = JSON.stringify(next);
    const checked = parsePurchasing(raw, design.id, true);
    if (localStorage.getItem(key) !== savedRaw.current)
      throw Error(
        'Purchasing records changed in another tab. Close and reopen this panel before editing.',
      );
    localStorage.setItem(key, raw);
    savedRaw.current = raw;
    latest.current = checked;
    setData(checked);
    setMessage('Purchasing records saved in this browser.');
    projectDataChanged();
  }
  function act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function verify(
    target: 'baseline' | 'change' | 'purchase',
    id?: string,
  ) {
    if (busy) return;
    setBusy(true);
    const initial = latest.current;
    const snapshot =
      target === 'baseline'
        ? designSnapshot(design)
        : target === 'change'
          ? initial.changes.find((c) => c.id === id)?.after
          : initial.purchases.find((p) => p.id === id)?.designJson;
    try {
      if (!snapshot) throw Error('Select a snapshot first.');
      const token = link.trim().split('#').pop() ?? '';
      if (!/^[a-f0-9]{64}$/.test(token))
        throw Error('Paste a complete client review link.');
      const review = await client.query(api.projects.getReview, { token });
      const approval = approvalFromReview(review, parseDesign(snapshot));
      if (
        latest.current !== initial ||
        (target === 'baseline' &&
          reviewContent(currentDesign.current) !==
            reviewContent(parseDesign(snapshot)))
      )
        throw Error('Project changed during verification; try again.');
      save(
        target === 'baseline'
          ? { ...initial, baseline: { designJson: snapshot, approval } }
          : target === 'change'
            ? {
                ...initial,
                changes: initial.changes.map((c) =>
                  c.id === id ? { ...c, approval } : c,
                ),
              }
            : {
                ...initial,
                purchases: initial.purchases.map((p) =>
                  p.id === id ? { ...p, approval } : p,
                ),
              },
      );
      setMessage('Exact snapshot approval verified. Names are self-reported.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const approved =
    data.baseline &&
    reviewContent(parseDesign(data.baseline.designJson)) ===
      reviewContent(design)
      ? data.baseline.approval
      : data.changes.find(
          (c) =>
            c.approval &&
            reviewContent(parseDesign(c.after)) === reviewContent(design),
        )?.approval;
  const purchase =
    data.purchases.find((p) => p.id === selected) ?? data.purchases[0];
  function receipt(itemId: string, patch: Partial<Receipt>) {
    if (!purchase) return;
    const active = latest.current.purchases.find((p) => p.id === purchase.id);
    if (!active) return;
    const existing = active.receipts.find((r) => r.itemId === itemId);
    const next = {
      itemId,
      status: 'pending' as const,
      note: '',
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    save({
      ...latest.current,
      purchases: latest.current.purchases.map((p) =>
        p.id === active.id
          ? {
              ...p,
              receipts: [
                ...p.receipts.filter((r) => r.itemId !== itemId),
                next,
              ],
            }
          : p,
      ),
    });
  }
  return (
    <section aria-label="Purchasing workspace">
      <p>
        Prepare supplier drafts, explain approved-scope changes, and reconcile
        deliveries. Records stay in this browser; export a separate purchasing
        backup. Up to 10 change orders and 10 purchase drafts.
      </p>
      <div className="designer-row">
        <button
          onClick={() =>
            act(() => {
              const raw = localStorage.getItem(key);
              downloadJson(
                raw ? JSON.parse(raw) : data,
                'purchasing-backup.json',
              );
            })
          }
        >
          Export purchasing backup
        </button>
        <label>
          Import purchasing backup
          <input
            type="file"
            accept=".json"
            aria-label="Import purchasing backup"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 3500000) throw Error('File exceeds 3.5 MB.');
                const next = parsePurchasing(await file.text(), design.id);
                save(next);
                setLoaded(true);
                setMessage(
                  'Backup imported. Reverify approvals with active review links.',
                );
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
        </label>
      </div>
      <p>
        Import replaces this project’s purchasing records. Export your current
        backup first.
      </p>
      <label>
        Approval review link
        <input
          aria-label="Purchasing approval link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste a client review link"
        />
      </label>
      <p>
        Approval checks the exact design revision, not supplier price
        acceptance. To request approval, create a review link in Cloud projects
        & client reviews and share it with your client.
      </p>
      <div
        className="designer-row"
        role="tablist"
        aria-label="Purchasing sections"
      >
        {[
          ['changes', 'Change orders'],
          ['orders', 'Purchase drafts'],
          ['delivery', 'Deliveries'],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value ?? 'changes')}
          >
            {label}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
      <fieldset disabled={!loaded || busy}>
        {tab === 'changes' && (
          <div>
            <h3>Change orders</h3>
            {data.baselineReference && (
              <p>
                Imported baseline retained as an unverified reference.{' '}
                <button
                  onClick={() =>
                    downloadJson(
                      parseDesign(data.baselineReference ?? ''),
                      'unverified-baseline-design.json',
                    )
                  }
                >
                  Export baseline reference
                </button>
              </p>
            )}
            <p>
              {data.baseline
                ? `Baseline: approved revision ${data.baseline.approval.revision}`
                : 'Start by verifying approval of the current design. Then edit the design and record the change.'}
            </p>
            <button onClick={() => void verify('baseline')}>
              Use approved current design as baseline
            </button>
            <label>
              Change-order reason
              <textarea
                aria-label="Change-order reason"
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              disabled={
                !data.baseline || !reason.trim() || data.changes.length >= 10
              }
              onClick={() =>
                act(() => {
                  if (!data.baseline) return;
                  save({
                    ...data,
                    changes: [
                      makeChange(
                        parseDesign(data.baseline.designJson),
                        design,
                        reason,
                        book,
                      ),
                      ...data.changes,
                    ],
                  });
                  setReason('');
                })
              }
            >
              Record change order
            </button>
            {data.changes.map((c) => {
              const before = parseDesign(c.before),
                after = parseDesign(c.after),
                delta = scopeDifference(before, after, c.book);
              return (
                <article className="purchase-card" key={c.id}>
                  <h4>{c.reason}</h4>
                  <p>
                    {new Date(c.createdAt).toLocaleString()} ·{' '}
                    {c.approval
                      ? `Approved revision ${c.approval.revision}`
                      : 'Awaiting revised-scope approval'}
                  </p>
                  <div className="purchase-plan-grid">
                    <div>
                      Before
                      <MiniPlan design={before} />
                    </div>
                    <div>
                      After
                      <MiniPlan design={after} />
                    </div>
                  </div>
                  <p>
                    Both snapshots priced with the captured supplier list:{' '}
                    {dollars(delta.beforeTotal)} → {dollars(delta.afterTotal)} ·
                    Difference {dollars(delta.delta)}. Expired prices produce no
                    total.
                  </p>
                  <p>
                    {delta.roomChanged && 'Room changed. '}
                    {delta.finishesChanged && 'Materials changed. '}
                    {delta.quoteChanged && 'Customer quote settings changed.'}
                  </p>
                  <ul>
                    {delta.changes.map((r) => (
                      <li key={r.id}>
                        {r.before?.sku ?? 'Added'} → {r.after?.sku ?? 'Removed'}{' '}
                        · {r.before?.finish ?? '—'} → {r.after?.finish ?? '—'} ·{' '}
                        {dollars(r.before?.unitCents ?? null)} →{' '}
                        {dollars(r.after?.unitCents ?? null)}
                        <details>
                          <summary>Exact product specifications</summary>
                          <pre>
                            {JSON.stringify(
                              { before: r.before, after: r.after },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => void verify('change', c.id)}>
                    Verify revised approval
                  </button>
                  <button
                    onClick={() =>
                      downloadJson(
                        {
                          format: 'kitchen-change-order-v1',
                          ...c,
                          difference: delta,
                        },
                        'change-order.json',
                      )
                    }
                  >
                    Export change order
                  </button>
                  {c.approval && (
                    <button
                      onClick={() =>
                        act(() =>
                          save({
                            ...data,
                            baseline: {
                              designJson: c.after,
                              approval: c.approval as NonNullable<
                                typeof c.approval
                              >,
                            },
                          }),
                        )
                      }
                    >
                      Use approved revision as next baseline
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {tab === 'orders' && (
          <div>
            <h3>Prepare a purchase-order draft</h3>
            <p>
              Quantities group identical SKU, finish, configuration and
              dimensions. Door and window room openings are excluded. Drafts are
              never sent automatically.
            </p>
            <ul>
              {purchaseChecks(design, book, approved).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="business-grid">
              <label>
                Purchase number
                <input
                  aria-label="Purchase number"
                  maxLength={80}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </label>
              <label>
                Supplier questions / instructions
                <textarea
                  aria-label="Supplier instructions"
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
            <button
              disabled={
                !number.trim() ||
                !supplyDesign(design).items.length ||
                data.purchases.length >= 10
              }
              onClick={() =>
                act(() => {
                  const p = makePurchase(design, number, note, book, approved);
                  save({ ...data, purchases: [p, ...data.purchases] });
                  setSelected(p.id);
                })
              }
            >
              Create purchase draft
            </button>
          </div>
        )}
        {tab !== 'changes' && (
          <div>
            <label>
              Purchase draft
              <select
                aria-label="Purchase draft"
                value={purchase?.id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="" disabled>
                  Select a draft
                </option>
                {data.purchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} · {new Date(p.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {!purchase && (
              <p>Create a purchase draft to begin delivery tracking.</p>
            )}
            {purchase && (
              <article className="purchase-card">
                <SupplierConfirmations
                  purchase={purchase}
                  onChange={(confirmation) =>
                    act(() =>
                      save({
                        ...data,
                        purchases: data.purchases.map((p) =>
                          p.id === purchase.id ? { ...p, confirmation } : p,
                        ),
                      }),
                    )
                  }
                />
                <h3>{purchase.number} · immutable draft</h3>
                <p>
                  {reviewContent(parseDesign(purchase.designJson)) ===
                  reviewContent(design)
                    ? 'Matches current design.'
                    : 'Current design differs from this draft; delivery tracking uses the original item snapshot.'}
                </p>
                {tab === 'orders' ? (
                  <>
                    <ul>
                      {purchaseChecks(
                        parseDesign(purchase.designJson),
                        purchase.book,
                        purchase.approval,
                      ).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <div className="purchase-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Product / specification</th>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Line</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchaseLines(
                            parseDesign(purchase.designJson),
                            purchase.book,
                          ).map((l) => (
                            <tr key={l.id}>
                              <td>
                                {l.sku}
                                <small>
                                  {l.finish} · {l.width}×{l.depth}×{l.height} in
                                </small>
                                <small>{l.configuration}</small>
                              </td>
                              <td>{l.quantity}</td>
                              <td>{dollars(l.unitCents)}</td>
                              <td>{dollars(l.lineCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={() => void verify('purchase', purchase.id)}
                    >
                      Verify draft approval
                    </button>
                    <button
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([purchaseDocument(purchase)], {
                            type: 'text/html',
                          }),
                        );
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'purchase-order-draft.html';
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      Export printable purchase draft
                    </button>
                    <button
                      onClick={() =>
                        downloadJson(purchase, 'purchase-draft.json')
                      }
                    >
                      Export purchase data
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      {Object.entries(deliverySummary(purchase))
                        .map(([status, count]) => `${count} ${status}`)
                        .join(' · ')}
                    </p>
                    <p>
                      Each row represents one physical item. Record damage or
                      shortages and attach up to four compact photos per draft.
                    </p>
                    {supplyDesign(parseDesign(purchase.designJson)).items.map(
                      (item, index) => {
                        const r = purchase.receipts.find(
                          (r) => r.itemId === item.id,
                        );
                        return (
                          <div className="purchase-card" key={item.id}>
                            <h4>
                              {index + 1}. {item.sku} · {item.width}×
                              {item.depth}×{item.height} in
                            </h4>
                            <small>Item {item.id}</small>
                            <label>
                              Delivery status
                              <select
                                aria-label={`Delivery status ${index + 1}`}
                                value={r?.status ?? 'pending'}
                                onChange={(e) =>
                                  act(() =>
                                    receipt(item.id, {
                                      status: e.target
                                        .value as Receipt['status'],
                                    }),
                                  )
                                }
                              >
                                {[
                                  'pending',
                                  'received',
                                  'missing',
                                  'damaged',
                                ].map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Delivery note
                              <textarea
                                aria-label={`Delivery note ${index + 1}`}
                                maxLength={1000}
                                value={r?.note ?? ''}
                                onChange={(e) =>
                                  act(() =>
                                    receipt(item.id, { note: e.target.value }),
                                  )
                                }
                              />
                            </label>
                            <label>
                              Damage / delivery photo
                              <input
                                type="file"
                                accept="image/*"
                                aria-label={`Delivery photo ${index + 1}`}
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!f) return;
                                  const source = latest.current;
                                  try {
                                    const photo = await compactPhoto(f);
                                    if (latest.current !== source)
                                      throw Error(
                                        'Records changed while processing the photo. Try again.',
                                      );
                                    receipt(item.id, { photo });
                                  } catch (e) {
                                    setMessage((e as Error).message);
                                  }
                                }}
                              />
                            </label>
                            {r?.photo && (
                              <>
                                <img
                                  src={r.photo}
                                  alt={`Delivery evidence for ${item.sku}`}
                                  width="200"
                                />
                                <button
                                  onClick={() =>
                                    act(() => {
                                      const { photo, ...rest } = r;
                                      void photo;
                                      save({
                                        ...data,
                                        purchases: data.purchases.map((p) =>
                                          p.id === purchase.id
                                            ? {
                                                ...p,
                                                receipts: p.receipts.map((r) =>
                                                  r.itemId === item.id
                                                    ? rest
                                                    : r,
                                                ),
                                              }
                                            : p,
                                        ),
                                      });
                                    })
                                  }
                                >
                                  Remove photo
                                </button>
                              </>
                            )}
                            {design.items.some((i) => i.id === item.id) && (
                              <button onClick={() => onLocate(item.id)}>
                                Locate in current design
                              </button>
                            )}
                          </div>
                        );
                      },
                    )}
                    <button
                      onClick={() =>
                        downloadJson(
                          {
                            format: 'kitchen-delivery-report-v1',
                            purchase,
                            summary: deliverySummary(purchase),
                          },
                          'delivery-report.json',
                        )
                      }
                    >
                      Export delivery report
                    </button>
                  </>
                )}
              </article>
            )}
          </div>
        )}
      </fieldset>
    </section>
  );
}
