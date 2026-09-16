'use client';
import { useEffect, useRef, useState } from 'react';
import type { Design } from '@/designer/model';
import {
  tradeNames,
  type Trade,
  type TradeInput,
  type Trades,
  emptyTrades,
  parseTrades,
  tradesSchema,
  estimateTrade,
  roomTakeoff,
  tradeFingerprint,
  tradeIsCurrent,
  combinedTradeTotal,
  tradeCsv,
  tradeHtml,
  slabCutCsv,
} from '@/designer/trade-estimates';
import { projectDataChanged } from '@/designer/local-project-events';
import { downloadJson } from './business-tools';
import { TradeMaterialPicker } from './trade-material-picker';
export function TradeWorkspaces({
  design,
  ownerId,
}: {
  design: Design;
  ownerId: string;
}) {
  const [value, setValue] = useState<Trades>(() => emptyTrades(design.id)),
    [active, setActive] = useState<Trade>('countertops'),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(''),
    [conflict, setConflict] = useState(false);
  const key = `kitchen-trades:${ownerId}:${design.id}`,
    lastRaw = useRef<string | null>(null);
  function reload() {
    try {
      const raw = localStorage.getItem(key);
      setValue(raw ? parseTrades(raw, design.id) : emptyTrades(design.id));
      lastRaw.current = raw;
      setConflict(false);
      setReady(true);
      setMessage('Trade settings loaded.');
    } catch (e) {
      setMessage((e as Error).message);
      setReady(false);
    }
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setValue(raw ? parseTrades(raw, design.id) : emptyTrades(design.id));
      lastRaw.current = raw;
      setReady(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
    const changed = () => {
      try {
        if (localStorage.getItem(key) !== lastRaw.current) setConflict(true);
      } catch {
        setConflict(true);
      }
    };
    window.addEventListener('storage', changed);
    window.addEventListener('kitchen-project-data', changed);
    return () => {
      window.removeEventListener('storage', changed);
      window.removeEventListener('kitchen-project-data', changed);
    };
  }, [key, design.id]);
  const state = value.trades[active],
    input = state.input,
    room = roomTakeoff(design);
  function patch(changes: Partial<TradeInput>) {
    setValue((v) => ({
      ...v,
      trades: {
        ...v.trades,
        [active]: {
          ...v.trades[active],
          input: { ...v.trades[active].input, ...changes },
        },
      },
    }));
  }
  let result: ReturnType<typeof estimateTrade> | undefined,
    error = '';
  try {
    result = estimateTrade(design, active, input);
  } catch {
    error =
      'Check quantities: coverage, slab sizes and tile sizes must be greater than zero.';
  }
  const current = tradeIsCurrent(design, state);
  let combined: ReturnType<typeof combinedTradeTotal> | undefined;
  try {
    combined = combinedTradeTotal(design, value);
  } catch {
    /* Incomplete editing input. */
  }
  const currency = (c: number | null | undefined) =>
    c == null
      ? 'Not priced'
      : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  function save() {
    try {
      if (!ready || conflict || localStorage.getItem(key) !== lastRaw.current)
        throw Error(
          'Trade settings changed in another tab. Reload before saving.',
        );
      const next = tradesSchema.parse(value),
        r = estimateTrade(design, active, next.trades[active].input);
      next.trades[active].saved = {
        designFingerprint: tradeFingerprint(design),
        inputFingerprint: tradeFingerprint(input),
        createdAt: new Date().toISOString(),
        result: r,
      };
      const raw = JSON.stringify(tradesSchema.parse(next));
      localStorage.setItem(key, raw);
      lastRaw.current = raw;
      setValue(next);
      projectDataChanged();
      setMessage(
        `${tradeNames[active]} estimate saved${r.totalCents === null ? ' as an unpriced draft' : ''}.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function download(text: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const number = (field: keyof TradeInput, label: string, nullable = false) => (
    <label key={field}>
      {label}
      <input
        aria-label={label}
        type="number"
        min="0"
        step="any"
        value={typeof input[field] === 'number' ? input[field] : ''}
        onChange={(e) =>
          patch({
            [field]:
              e.target.value === ''
                ? nullable
                  ? null
                  : 0
                : Number(e.target.value),
          })
        }
      />
    </label>
  );
  /**
   * Offers a deduction the design can derive, without applying it: whether the
   * floor runs under the cabinets, or a wall is really painted behind them, is
   * a job decision the estimate should not quietly make.
   */
  const suggestion = () => {
    const found = result?.suggestedDeduction;
    if (!found) return null;
    const rounded = Math.round(found.area * 100) / 100;
    const applied = Math.abs(input.deduction - found.area) < 0.01;
    return (
      <p className="trade-suggestion">
        This design accounts for <strong>{rounded} sq ft</strong> of{' '}
        {found.label}.{' '}
        {applied ? (
          'The entered deduction matches it.'
        ) : (
          <button type="button" onClick={() => patch({ deduction: rounded })}>
            Use {rounded} sq ft as the deduction
          </button>
        )}
        {found.ambiguous
          ? ' A selected side has more than one wall segment, so this covers every segment on that side. Check it first.'
          : ''}
      </p>
    );
  };
  const text = (
    field: 'product' | 'supplier' | 'reference' | 'edgeProfile',
    label: string,
  ) => (
    <label key={field}>
      {label}
      <input
        aria-label={label}
        value={input[field]}
        maxLength={field === 'reference' ? 500 : 160}
        onChange={(e) => patch({ [field]: e.target.value })}
      />
    </label>
  );
  return (
    <details className="studio-support trade-workspaces">
      <summary>
        Trade workspaces · countertops, flooring, painting & tile
      </summary>
      <div className="trade-content">
        <h2>Trade quantities & estimates</h2>
        <p>
          Use the current room and countertop model, or enter measured areas.
          Default sizes, coverage and waste are editable planning assumptions.
          Rates are your own USD prices; taxes are excluded.
        </p>
        <nav aria-label="Trade workspaces" className="trade-tabs">
          {(Object.keys(tradeNames) as Trade[]).map((t) => (
            <button
              key={t}
              aria-pressed={active === t}
              onClick={() => setActive(t)}
            >
              {tradeNames[t]}
            </button>
          ))}
        </nav>
        <p role="status">{message}</p>
        {conflict && (
          <p role="alert">
            Trade settings changed elsewhere. Reload to use the latest saved
            settings; this replaces your unsaved edits.
          </p>
        )}
        <div className="designer-row">
          <button onClick={reload}>Reload trade settings</button>
          <button
            disabled={!ready}
            onClick={() => downloadJson(value, 'trade-settings.json')}
          >
            Export trade settings
          </button>
          <label>
            Import trade settings
            <input
              aria-label="Import trade settings"
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const incoming = parseTrades(await f.text(), design.id);
                  for (const s of Object.values(incoming.trades))
                    delete s.saved;
                  setValue(incoming);
                  setMessage(
                    'Settings imported as drafts. Save each estimate against the current design.',
                  );
                } catch (error) {
                  setMessage((error as Error).message);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="trade-status">
          <strong>
            {current
              ? 'Saved estimate matches this design'
              : state.saved
                ? 'Design or settings changed — recalculate and save'
                : 'Unsaved estimate draft'}
          </strong>{' '}
          · Design {tradeFingerprint(design)}
        </p>
        <label className="trade-check">
          <input
            type="checkbox"
            checked={input.included}
            onChange={(e) => patch({ included: e.target.checked })}
          />{' '}
          Include {tradeNames[active]} in combined estimate
        </label>
        <TradeMaterialPicker
          key={active}
          trade={active}
          input={input}
          onChange={patch}
        />
        {active === 'tile' && input.areaSource === 'zones' && (
          <label>
            Tile application
            <select
              value={input.tileApplication ?? 'wall'}
              onChange={(e) =>
                patch({ tileApplication: e.target.value as 'wall' | 'floor' })
              }
            >
              <option value="wall">Wall / backsplash</option>
              <option value="floor">Floor</option>
            </select>
          </label>
        )}
        <div className="trade-fields">
          {text('product', 'Material / product')}
          {text('supplier', 'Trade supplier')}
          {text('reference', 'Price source / reference')}
          {number(
            'materialPrice',
            `Material price per ${active === 'countertops' ? 'slab' : active === 'painting' ? 'gallon' : 'box'} (USD)`,
            true,
          )}
          {number('laborRate', 'Installation labor per sq ft (USD)', true)}
          {number('prepRate', 'Preparation per sq ft (USD)')}
          {number('extraCost', 'Other allowance (USD)')}
        </div>
        {(active === 'flooring' || active === 'tile') && (
          <>
            <h3>Measured areas</h3>
            <label>
              Area source
              <select
                aria-label="Trade area source"
                value={input.areaSource}
                onChange={(e) =>
                  patch({
                    areaSource: e.target.value as TradeInput['areaSource'],
                  })
                }
              >
                <option value="room">
                  Current room floor ({room.floor.toFixed(2)} sq ft)
                </option>
                <option value="zones">
                  Measured rectangles / backsplash areas
                </option>
              </select>
            </label>
            {input.areaSource === 'zones' && (
              <>
                <p>
                  Enter non-overlapping rectangles. Length and width/height are
                  in inches.
                </p>
                {input.zones.map((z, i) => (
                  <div className="trade-zone" key={z.id}>
                    <label>
                      Area name
                      <input
                        aria-label={`Area ${i + 1} name`}
                        value={z.name}
                        maxLength={100}
                        onChange={(e) =>
                          patch({
                            zones: input.zones.map((q) =>
                              q.id === z.id
                                ? { ...q, name: e.target.value }
                                : q,
                            ),
                          })
                        }
                      />
                    </label>
                    {(['length', 'width'] as const).map((k) => (
                      <label key={k}>
                        {k === 'length' ? 'Length' : 'Width / height'} (in)
                        <input
                          aria-label={`Area ${i + 1} ${k} (in)`}
                          type="number"
                          min="0"
                          value={z[k]}
                          onChange={(e) =>
                            patch({
                              zones: input.zones.map((q) =>
                                q.id === z.id
                                  ? { ...q, [k]: Number(e.target.value) }
                                  : q,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    <span>{((z.length * z.width) / 144).toFixed(2)} sq ft</span>
                    <button
                      aria-label={`Remove area ${i + 1}`}
                      onClick={() =>
                        patch({
                          zones: input.zones.filter((q) => q.id !== z.id),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  disabled={input.zones.length >= 40}
                  onClick={() =>
                    patch({
                      zones: [
                        ...input.zones,
                        {
                          id: crypto.randomUUID(),
                          name: `Area ${input.zones.length + 1}`,
                          length: 0,
                          width: 0,
                        },
                      ],
                    })
                  }
                >
                  Add measured area
                </button>
              </>
            )}
            <div className="trade-fields">
              {number('deduction', 'Excluded area / openings (sq ft)')}
              {suggestion()}
              {number('waste', 'Waste allowance (%)')}
              <label>
                Laying pattern
                <select
                  aria-label="Laying pattern"
                  value={input.direction}
                  onChange={(e) =>
                    patch({
                      direction: e.target.value as TradeInput['direction'],
                    })
                  }
                >
                  {['lengthwise', 'crosswise', 'diagonal', 'herringbone'].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </label>
              {active === 'flooring' ? (
                number('boxCoverage', 'Coverage per flooring box (sq ft)')
              ) : (
                <>
                  {number('tileWidth', 'Tile width (in)')}
                  {number('tileHeight', 'Tile height (in)')}
                  {number('tilesPerBox', 'Tiles per box')}
                  {number('groutCoverage', 'Grout coverage per bag (sq ft)')}
                  {number('groutPrice', 'Grout price per bag (USD)')}
                  {number(
                    'adhesiveCoverage',
                    'Adhesive coverage per bag (sq ft)',
                  )}
                  {number('adhesivePrice', 'Adhesive price per bag (USD)')}
                </>
              )}
              {number(
                'transitionLength',
                active === 'tile'
                  ? 'Tile edge trim (linear ft)'
                  : 'Transitions (linear ft)',
              )}
              {number(
                'transitionRate',
                active === 'tile'
                  ? 'Tile trim price per linear ft (USD)'
                  : 'Transition price per linear ft (USD)',
              )}
            </div>
          </>
        )}
        {active === 'painting' && (
          <>
            <h3>Paintable surfaces</h3>
            <p>
              Suggested opening area: {room.openings.toFixed(2)} sq ft. Review
              which openings belong to selected walls and enter the applicable
              deduction below. Cabinet-covered areas and partitions need
              separate measurements.
            </p>
            <div className="trade-wall-list">
              {room.walls.map((w) => (
                <label className="trade-check" key={w.index}>
                  <input
                    type="checkbox"
                    checked={
                      input.wallIndices === null ||
                      input.wallIndices.includes(w.index)
                    }
                    onChange={(e) => {
                      const ids =
                        input.wallIndices ?? room.walls.map((x) => x.index);
                      patch({
                        wallIndices: e.target.checked
                          ? [...new Set([...ids, w.index])]
                          : ids.filter((x) => x !== w.index),
                      });
                    }}
                  />
                  {w.label} · {w.area.toFixed(2)} sq ft
                </label>
              ))}
            </div>
            <label className="trade-check">
              <input
                type="checkbox"
                checked={input.includeCeiling}
                onChange={(e) => patch({ includeCeiling: e.target.checked })}
              />{' '}
              Include ceiling · {room.ceiling.toFixed(2)} sq ft
            </label>
            <div className="trade-fields">
              {number('deduction', 'Excluded paint area / openings (sq ft)')}
              {suggestion()}
              {number('coats', 'Finish coats')}
              {number('coverage', 'Paint coverage per gallon per coat (sq ft)')}
              {number('waste', 'Paint allowance (%)')}
              {number('primerCoats', 'Primer coats')}
              {number('primerCoverage', 'Primer coverage per gallon (sq ft)')}
              {number('primerPrice', 'Primer price per gallon (USD)')}
            </div>
          </>
        )}
        {active === 'countertops' && (
          <>
            <h3>Countertop pieces & slab layout</h3>
            <p>
              Uses countertop objects in the design. Dimensions are in inches.
              Split counts propose equal-width pieces; verify seams, cutouts and
              grain direction with the fabricator.
            </p>
            <div className="trade-fields">
              {number('slabWidth', 'Slab width (in)')}
              {number('slabDepth', 'Slab depth (in)')}
              {number('kerf', 'Saw kerf (in)')}
              {number('edgeTrim', 'Slab edge trim (in)')}
              {text('edgeProfile', 'Finished edge profile')}
              {number('edgeLength', 'Exposed finished edge (linear ft)')}
              {number('edgeRate', 'Edge finishing per linear ft (USD)')}
              {number('seamRate', 'Fabrication per seam (USD)')}
              {number('extraCutouts', 'Additional cutouts')}
              {number('cutoutRate', 'Fabrication per cutout (USD)')}
            </div>
            <label className="trade-check">
              <input
                type="checkbox"
                checked={input.allowRotation}
                onChange={(e) => patch({ allowRotation: e.target.checked })}
              />{' '}
              Allow 90° piece rotation (confirm veining)
            </label>
            {design.items
              .filter((i) => i.kind === 'countertop')
              .map((i, n) => (
                <label className="trade-piece" key={i.id}>
                  {i.sku} · {i.width} × {i.depth} in · {i.id.slice(0, 6)}
                  <span>
                    Equal-width pieces
                    <input
                      type="number"
                      aria-label={`Countertop ${n + 1} split count`}
                      min="1"
                      max="8"
                      step="1"
                      value={
                        input.splits.find((p) => p.id === i.id)?.count ?? 1
                      }
                      onChange={(e) =>
                        patch({
                          splits: [
                            ...input.splits.filter((p) => p.id !== i.id),
                            { id: i.id, count: Number(e.target.value) },
                          ],
                        })
                      }
                    />
                  </span>
                </label>
              ))}
            {result && result.slabCount > 0 && (
              <div className="trade-slabs">
                {Array.from(
                  { length: Math.min(result.slabCount, 12) },
                  (_, n) => (
                    <figure key={n}>
                      <figcaption>
                        Slab {n + 1} · {input.slabWidth} × {input.slabDepth} in
                      </figcaption>
                      <svg
                        role="img"
                        aria-label={`Slab ${n + 1} layout`}
                        viewBox={`0 0 ${input.slabWidth} ${input.slabDepth}`}
                      >
                        <rect
                          width={input.slabWidth}
                          height={input.slabDepth}
                          fill="#f0eee8"
                          stroke="#667d79"
                        />
                        {result.pieces
                          .filter((p) => p.slab === n)
                          .map((p, i) => (
                            <g key={p.id}>
                              <title>
                                {p.label} · {p.width} × {p.depth} in
                              </title>
                              <rect
                                x={p.x}
                                y={p.y}
                                width={p.width}
                                height={p.depth}
                                fill={i % 2 ? '#c4d9ce' : '#b8cad7'}
                                stroke="#365652"
                                strokeWidth=".2"
                              />
                              <text
                                x={p.x + 1}
                                y={p.y + Math.min(p.depth / 2, 5)}
                                fontSize="2.5"
                              >
                                {p.width.toFixed(1)} × {p.depth.toFixed(1)}
                              </text>
                            </g>
                          ))}
                      </svg>
                    </figure>
                  ),
                )}
              </div>
            )}
            {result && result.slabCount > 12 && (
              <p>Preview shows first 12 slabs; quantities include all slabs.</p>
            )}
          </>
        )}
        <label className="trade-notes">
          Scope, preparation & exclusions
          <textarea
            aria-label="Trade scope notes"
            value={input.notes}
            maxLength={3000}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {result && (
          <>
            <div className="trade-metrics">
              <p>
                Gross area<strong>{result.grossArea.toFixed(2)} sq ft</strong>
              </p>
              <p>
                Net work area<strong>{result.netArea.toFixed(2)} sq ft</strong>
              </p>
              <p>
                Purchase quantity
                <strong>
                  {result.purchaseQuantity} {result.purchaseUnit}
                </strong>
              </p>
              <p>
                Trade estimate · before tax
                <strong>{currency(result.totalCents)}</strong>
              </p>
            </div>
            <div className="trade-table">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.label}>
                      <td>{l.label}</td>
                      <td>
                        {l.quantity.toFixed(2)} {l.unit}
                      </td>
                      <td>{currency(l.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.issues.map((x) => (
              <p key={x}>{x}</p>
            ))}
            <details>
              <summary>Calculation assumptions</summary>
              <ul>
                {result.assumptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
          </>
        )}
        <div className="designer-row">
          <button disabled={!ready || conflict || !!error} onClick={save}>
            Save {tradeNames[active]} estimate
          </button>
          <button
            disabled={!current || !!error || conflict}
            onClick={() =>
              download(
                tradeHtml(design, active, input),
                `${active}-estimate.html`,
                'text/html',
              )
            }
          >
            Export trade estimate / PDF
          </button>
          <button
            disabled={!current || !!error || conflict}
            onClick={() =>
              download(
                tradeCsv(design, active, input),
                `${active}-quantities.csv`,
                'text/csv',
              )
            }
          >
            Export trade quantities CSV
          </button>
          {active === 'countertops' && (
            <button
              disabled={
                !current || !!error || conflict || !!result?.issues.length
              }
              onClick={() =>
                download(
                  slabCutCsv(design, input),
                  'countertop-cut-list.csv',
                  'text/csv',
                )
              }
            >
              Export slab cut list CSV
            </button>
          )}
        </div>
        <p>
          <strong>
            Combined selected trades: {currency(combined?.totalCents)}
          </strong>
          {!!combined?.pending.length &&
            ` · Save/reprice: ${combined.pending.map((t) => tradeNames[t]).join(', ')}`}
          . Cabinet supplier quote is separate; check for overlapping labor
          charges.
        </p>
        <p className="designer-muted">
          Settings save in this browser and are included in complete project
          backups. Ordinary cloud design saves do not sync trade settings. These
          are estimates for trade review, not installation or fabrication
          approval.
        </p>
      </div>
    </details>
  );
}
