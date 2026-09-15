'use client';
import { useRef, useState } from 'react';
import { type Design } from '@/designer/model';
import {
  type ProductSupport,
  type ServiceCase,
  type Warranty,
  warrantySchema,
} from '@/designer/product-support';
import { compactPhoto } from './compact-photo';
import { downloadJson } from './business-tools';
export function AftercareTools({
  design,
  value,
  onChange,
}: {
  design: Design;
  value: ProductSupport;
  onChange: (s: ProductSupport) => void;
}) {
  const [message, setMessage] = useState(''),
    [title, setTitle] = useState(''),
    [itemId, setItemId] = useState('');
  const latest = useRef(value);
  latest.current = value;
  function save(next: ProductSupport) {
    try {
      onChange(next);
      setMessage('Aftercare saved in this browser.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function warranty(id: string, patch: Partial<Warranty>) {
    save({
      ...value,
      warranties: value.warranties.map((w) =>
        w.id === id ? { ...w, ...patch } : w,
      ),
    });
  }
  function service(id: string, patch: Partial<ServiceCase>) {
    save({
      ...value,
      cases: value.cases.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }
  return (
    <details className="business-panel support-panel">
      <summary>Aftercare, warranties & service visits</summary>
      <p>
        Record supplied warranty terms, replacement-part references and
        follow-up work. Dates reflect your records; the supplier determines
        actual coverage.
      </p>
      <details>
        <summary>Add warranty record</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            try {
              const record = warrantySchema.parse({
                id: crypto.randomUUID(),
                itemId: f.get('itemId'),
                product: f.get('product'),
                serial: f.get('serial'),
                provider: f.get('provider'),
                contact: f.get('contact'),
                starts: f.get('starts'),
                expires: f.get('expires'),
                terms: f.get('terms'),
                parts: f.get('parts'),
              });
              onChange({ ...value, warranties: [...value.warranties, record] });
              form.reset();
              setMessage('Warranty record added.');
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <div className="business-grid">
            <label>
              Related item
              <select name="itemId" aria-label="Warranty item">
                <option value="">Project-wide</option>
                {design.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sku} · {i.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['product', 'Warranty product'],
              ['serial', 'Serial number'],
              ['provider', 'Warranty provider'],
              ['contact', 'Warranty contact'],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  aria-label={label}
                  required={name === 'product'}
                  maxLength={name === 'contact' ? 500 : 160}
                />
              </label>
            ))}
            <label>
              Warranty starts
              <input name="starts" aria-label="Warranty starts" type="date" />
            </label>
            <label>
              Warranty expires
              <input name="expires" aria-label="Warranty expires" type="date" />
            </label>
            <label>
              Warranty terms
              <textarea
                name="terms"
                aria-label="Warranty terms"
                maxLength={2000}
              />
            </label>
            <label>
              Replacement parts
              <textarea
                name="parts"
                aria-label="Warranty replacement parts"
                maxLength={2000}
              />
            </label>
          </div>
          <button disabled={value.warranties.length >= 100}>
            Save warranty record
          </button>
        </form>
      </details>
      {value.warranties.map((w) => (
        <article className="purchase-card" key={w.id}>
          <h3>{w.product}</h3>
          <p>
            {w.provider} · {w.serial || 'No serial recorded'} ·{' '}
            {w.starts || 'Unknown start'} → {w.expires || 'Unknown expiry'}
          </p>
          <p>{w.contact}</p>
          <p>{w.terms}</p>
          <label>
            Replacement-part references
            <textarea
              aria-label={`Parts for ${w.product}`}
              value={w.parts}
              maxLength={2000}
              onChange={(e) => warranty(w.id, { parts: e.target.value })}
            />
          </label>
        </article>
      ))}
      <h3>Service requests and visits</h3>
      <div className="business-grid">
        <label>
          Service item
          <select
            aria-label="Service item"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Project-wide</option>
            {design.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.sku} · {i.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service request
          <input
            aria-label="Service request title"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </div>
      <button
        disabled={!title.trim() || value.cases.length >= 60}
        onClick={() => {
          save({
            ...value,
            cases: [
              ...value.cases,
              {
                id: crypto.randomUUID(),
                itemId,
                title: title.trim(),
                status: 'open',
                assignee: '',
                visit: '',
                note: '',
                partSku: '',
              },
            ],
          });
          setTitle('');
        }}
      >
        Add service request
      </button>
      {value.cases.map((c) => (
        <article className="purchase-card" key={c.id}>
          <h4>{c.title}</h4>
          <p>
            {design.items.find((i) => i.id === c.itemId)?.sku ??
              (c.itemId ? 'Item no longer in current design' : 'Project-wide')}
          </p>
          <div className="business-grid">
            <label>
              Status
              <select
                aria-label={`Service status: ${c.title}`}
                value={c.status}
                onChange={(e) =>
                  service(c.id, {
                    status: e.target.value as ServiceCase['status'],
                  })
                }
              >
                {['open', 'scheduled', 'waiting_parts', 'resolved'].map(
                  (status) => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Assigned to
              <input
                aria-label={`Service assignee: ${c.title}`}
                maxLength={120}
                value={c.assignee}
                onChange={(e) => service(c.id, { assignee: e.target.value })}
              />
            </label>
            <label>
              Follow-up visit
              <input
                aria-label={`Service visit: ${c.title}`}
                type="date"
                value={c.visit}
                onChange={(e) => service(c.id, { visit: e.target.value })}
              />
            </label>
            <label>
              Replacement part SKU
              <input
                aria-label={`Service part: ${c.title}`}
                maxLength={100}
                value={c.partSku}
                onChange={(e) => service(c.id, { partSku: e.target.value })}
              />
            </label>
            <label>
              Service notes
              <textarea
                aria-label={`Service notes: ${c.title}`}
                maxLength={2000}
                value={c.note}
                onChange={(e) => service(c.id, { note: e.target.value })}
              />
            </label>
            <label>
              Service photo
              <input
                aria-label={`Service photo: ${c.title}`}
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const source = latest.current;
                  try {
                    const photo = await compactPhoto(f);
                    if (source !== latest.current)
                      throw Error(
                        'Service record changed while processing the image. Try again.',
                      );
                    service(c.id, { photo });
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          {c.photo && (
            <img
              src={c.photo}
              alt={`Service evidence: ${c.title}`}
              width={200}
            />
          )}
        </article>
      ))}
      <button
        onClick={() =>
          downloadJson(
            {
              format: 'kitchen-aftercare-v1',
              designId: design.id,
              project: design.name,
              warranties: value.warranties,
              cases: value.cases,
            },
            'aftercare-records.json',
          )
        }
      >
        Export aftercare records
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
