'use client';
import { useEffect, useState } from 'react';
import type { Design } from '@/designer/model';
import { sampleKitchen, sampleStories } from '@/designer/demo-gallery';
import { materialVariant } from '@/designer/render-planning';
import {
  connectCountertops,
  overhang,
  readiness,
} from '@/designer/studio-tools';
import { money, quoteTotals } from '@/designer/quote';
export function SampleGallery({
  onLoad,
  onClose,
}: {
  onLoad: (d: Design) => void;
  onClose: () => void;
}) {
  return (
    <section className="sample-gallery" aria-label="Choose a sample kitchen">
      <h2>Choose a sample kitchen</h2>
      <p>
        Three ready-to-present stories. Each has four camera views, two finish
        alternatives and a downloadable presentation.
      </p>
      <div className="sample-cards">
        {sampleStories.map((s) => {
          const d = sampleKitchen(s.key);
          return (
            <article key={s.key}>
              <img
                src={`/demo/${s.key}.png`}
                alt={`${s.name} rendered preview`}
              />
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <strong>Demo estimate {money(quoteTotals(d).total)}</strong>
              <p>{s.tour}</p>
              <button onClick={() => onLoad(d)}>
                Open {s.name.toLowerCase()}
              </button>
            </article>
          );
        })}
      </div>
      <button onClick={onClose}>Close sample gallery</button>
    </section>
  );
}
export function SampleStory({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  if (!design.sampleKey) return null;
  const story = sampleStories.find((s) => s.key === design.sampleKey);
  return (
    <details className="studio-panel">
      <summary>{story?.name} · three-minute demo</summary>
      <ol>
        <li>Tour the saved viewpoints (45 seconds).</li>
        <li>Try a finish or move the island (60 seconds).</li>
        <li>Compare before/after and the demo estimate (45 seconds).</li>
        <li>Open Client presentation and download the package (30 seconds).</li>
      </ol>
      <div className="designer-row">
        <button
          onClick={() =>
            onChange(
              materialVariant(
                design,
                design.sampleKey === 'apartment' ? 'oak' : 'white',
              ),
            )
          }
        >
          Try {design.sampleKey === 'apartment' ? 'warm oak' : 'light'}{' '}
          alternative
        </button>
        <button
          onClick={() =>
            onChange(
              materialVariant(
                design,
                design.sampleKey === 'premium' ? 'oak' : 'dark',
              ),
            )
          }
        >
          Try {design.sampleKey === 'premium' ? 'warm oak' : 'dark'} alternative
        </button>
      </div>
      <p>
        Finishes affect the demo estimate. Compare options retains your original
        snapshot.
      </p>
    </details>
  );
}
export function ObjectManager({
  design,
  onChange,
  onSelect,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  return (
    <details className="studio-panel">
      <summary>Objects & design notes · {design.items.length}</summary>
      <input
        aria-label="Search placed objects"
        placeholder="Search names, types or notes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p>
        Hidden objects remain in estimates and checks. Locking protects
        position, size and deletion.
      </p>
      <div className="object-manager">
        {design.items
          .filter((i) =>
            `${i.sku} ${i.kind} ${i.note ?? ''}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((i) => {
            const n = design.items.indexOf(i) + 1;
            const patch = (p: Partial<typeof i>) =>
              onChange({
                ...design,
                items: design.items.map((item) =>
                  item.id === i.id ? { ...item, ...p } : item,
                ),
              });
            return (
              <article key={i.id}>
                <button onClick={() => onSelect(i.id)}>
                  {n}. {i.sku}
                </button>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Hide object ${n}`}
                    checked={!!i.hidden}
                    onChange={(e) => patch({ hidden: e.target.checked })}
                  />
                  Hide
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Lock object ${n}`}
                    checked={!!i.locked}
                    onChange={(e) => patch({ locked: e.target.checked })}
                  />
                  Lock
                </label>
                <textarea
                  aria-label={`Note for object ${n}`}
                  maxLength={1000}
                  placeholder="Pin a design note…"
                  value={i.note ?? ''}
                  onChange={(e) => patch({ note: e.target.value })}
                />
              </article>
            );
          })}
      </div>
    </details>
  );
}
export function RoomPhoto({ storageKey }: { storageKey: string }) {
  const [photo, setPhoto] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    try {
      setPhoto(localStorage.getItem(storageKey) ?? '');
    } catch {
      setError('Photo storage is unavailable.');
    }
  }, [storageKey]);
  return (
    <details className="room-photo">
      <summary>Existing room photo</summary>
      <p>
        Reference stays in this browser; it is not uploaded or included in the
        proposal.
      </p>
      <input
        aria-label="Upload room photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (
            file.size > 5_000_000 ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
          ) {
            setError('Choose a JPEG, PNG or WebP under 5 MB.');
            return;
          }
          const url = URL.createObjectURL(file);
          try {
            const img = new Image();
            img.src = url;
            await img.decode();
            const c = document.createElement('canvas'),
              scale = Math.min(1, 1000 / Math.max(img.width, img.height));
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
            const data = c.toDataURL('image/jpeg', 0.8);
            setPhoto(data);
            localStorage.setItem(storageKey, data);
            setError('');
          } catch {
            setError(
              'Could not save the photo. It may be unreadable or browser storage may be full.',
            );
          } finally {
            URL.revokeObjectURL(url);
            e.target.value = '';
          }
        }}
      />
      {photo && (
        <>
          <img src={photo} alt="Existing kitchen reference" />
          <button
            onClick={() => {
              setPhoto('');
              try {
                localStorage.removeItem(storageKey);
              } catch {
                setError('Could not clear stored photo.');
              }
            }}
          >
            Remove room photo
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export function SurfaceEditor({
  design,
  selected,
  ids,
  onChange,
}: {
  design: Design;
  selected: string | null;
  ids: string[];
  onChange: (d: Design) => void;
}) {
  const [amount, setAmount] = useState(1),
    [error, setError] = useState('');
  const item = design.items.find(
    (i) => i.id === selected && ['countertop', 'island'].includes(i.kind),
  );
  const action = (fn: () => Design) => {
    try {
      onChange(fn());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="studio-panel">
      <summary>Countertops & island options</summary>
      <button onClick={() => action(() => connectCountertops(design, ids))}>
        Connect selected countertop sections
      </button>
      <p>
        Select adjoining sections with Shift-click. Connections preserve sink
        cutouts.
      </p>
      {item ? (
        <>
          <label>
            Overhang on every edge (in)
            <input
              aria-label="Countertop overhang"
              type="number"
              min="0"
              max="18"
              step="0.25"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <button
            disabled={
              item.kind !== 'countertop' ||
              !Number.isFinite(amount) ||
              amount < 0 ||
              amount > 18
            }
            onClick={() => action(() => overhang(design, item.id, amount))}
          >
            Apply countertop overhang
          </button>
          <label>
            <input
              aria-label="Waterfall ends"
              type="checkbox"
              checked={!!item.surface?.waterfall}
              onChange={(e) =>
                onChange({
                  ...design,
                  items: design.items.map((i) =>
                    i.id === item.id
                      ? {
                          ...i,
                          surface: {
                            ...i.surface,
                            waterfall: e.target.checked,
                          },
                        }
                      : i,
                  ),
                })
              }
            />
            Waterfall ends
          </label>
          <label>
            Island seating
            <select
              aria-label="Island seating side"
              value={item.surface?.seating ?? 'south'}
              onChange={(e) =>
                onChange({
                  ...design,
                  items: design.items.map((i) =>
                    i.id === item.id
                      ? {
                          ...i,
                          surface: {
                            ...i.surface,
                            seating: e.target.value as
                              'north' | 'south' | 'east' | 'west' | 'none',
                          },
                        }
                      : i,
                  ),
                })
              }
            >
              {['none', 'north', 'south', 'east', 'west'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Storage configuration
            <select
              aria-label="Island storage configuration"
              defaultValue=""
              onChange={(e) =>
                onChange({
                  ...design,
                  items: design.items.map((i) =>
                    (i.id === item.id ||
                      (!!item.assemblyId &&
                        i.assemblyId === item.assemblyId)) &&
                    ['island', 'custom_cabinet', 'cabinet'].includes(i.kind)
                      ? {
                          ...i,
                          frontStyle:
                            e.target.value === 'drawers' ? 'drawers' : 'double',
                          details: {
                            shelves: 2,
                            toeKick: 4,
                            molding: false,
                            interior:
                              e.target.value === 'pullouts'
                                ? 'pullouts'
                                : 'shelves',
                          },
                        }
                      : i,
                  ),
                })
              }
            >
              <option value="">Choose storage</option>
              <option value="shelves">Doors and shelves</option>
              <option value="drawers">Drawer fronts</option>
              <option value="pullouts">Doors and pullouts</option>
            </select>
          </label>
          <p>
            Waterfall ends and seating are visual/demo allowances. Check
            support, access and seating clearances before installation.
          </p>
        </>
      ) : (
        <p>
          Select an island or countertop to edit overhangs, seating and
          waterfall ends.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export function ReadinessCheck({
  design,
  onSelect,
}: {
  design: Design;
  onSelect: (id: string) => void;
}) {
  const issues = readiness(design);
  return (
    <details className="studio-panel">
      <summary>Demo readiness · {issues.length} items to review</summary>
      <p>
        Review missing appliances, unfinished surfaces, design notes and
        existing layout checks. This is not installation certification.
      </p>
      {issues.length ? (
        <ul>
          {issues.slice(0, 40).map((i) => (
            <li key={i.id}>
              {i.itemId ? (
                <button onClick={() => onSelect(i.itemId ?? '')}>
                  {i.message}
                </button>
              ) : (
                i.message
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Ready for the demo: no missing appliance, countertop, note or layout
          flags were found.
        </p>
      )}
    </details>
  );
}
export function BudgetComparison({
  before,
  design,
}: {
  before: Design;
  design: Design;
}) {
  const groups = ['Cabinets', 'Countertops', 'Appliances', 'Other'];
  const totals = (d: Design) => {
    const q = quoteTotals(d);
    return groups.map((g) =>
      q.lines
        .filter((l) => {
          const i = d.items.find((i) => i.id === l.id);
          const group =
            i &&
            ['cabinet', 'custom_cabinet', 'corner', 'island'].includes(i.kind)
              ? 'Cabinets'
              : i?.kind === 'countertop'
                ? 'Countertops'
                : i &&
                    [
                      'range',
                      'hood',
                      'sink',
                      'refrigerator',
                      'dishwasher',
                      'washing_machine',
                    ].includes(i.kind)
                  ? 'Appliances'
                  : 'Other';
          return g === group;
        })
        .reduce((n, l) => n + l.unitCents, 0),
    );
  };
  const a = totals(before),
    b = totals(design);
  return (
    <details className="studio-panel">
      <summary>
        Budget comparison ·{' '}
        {money(quoteTotals(design).total - quoteTotals(before).total)} change
      </summary>
      <p>
        DEMO PRICING. Oak/slate finish allowances and stone rates are
        illustrative; explicit item prices override finish allowances.
        Accessories and lighting are illustrative unless included in an item
        price.
      </p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Before</th>
            <th>Current</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g}>
              <td>{g}</td>
              <td>{money(a[i] ?? 0)}</td>
              <td>{money(b[i] ?? 0)}</td>
              <td>{money((b[i] ?? 0) - (a[i] ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Total including estimate adjustments: {money(quoteTotals(before).total)}{' '}
        → {money(quoteTotals(design).total)}
      </p>
    </details>
  );
}
