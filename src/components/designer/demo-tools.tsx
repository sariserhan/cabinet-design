'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { type Design } from '@/designer/model';
import { MaterialSwatches } from './refinement-tools';
import { RoomSetup } from './room-setup';
import { isPreparedSample } from '@/designer/demo-gallery';
import { zipFiles } from '@/designer/presentation-bundle';
import { money, quoteTotals } from '@/designer/quote';
import { MiniPlan } from './workflow-tools';
const RenderView = dynamic(() => import('./render-view'), { ssr: false });
export const materialPresets = [
  { name: 'Warm oak', finish: 'oak', countertop: 'quartz', lighting: 'warm' },
  {
    name: 'Soft white',
    finish: 'linen',
    countertop: 'marble',
    lighting: 'daylight',
  },
  {
    name: 'Dark modern',
    finish: 'slate',
    countertop: 'granite',
    lighting: 'studio',
  },
] as const;
export function MaterialPresets({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  const appearance = (patch: Partial<NonNullable<Design['appearance']>>) =>
    onChange({
      ...design,
      appearance: {
        countertop: 'quartz',
        lighting: 'daylight',
        ...design.appearance,
        ...patch,
      },
    });
  return (
    <section className="render-styling">
      <MaterialSwatches design={design} onChange={onChange} />
      <h3>Render styling</h3>
      <label>
        Pendant brightness {design.appearance?.pendantLevel ?? 100}%
        <input
          aria-label="Pendant brightness"
          type="range"
          min="0"
          max="100"
          step="10"
          value={design.appearance?.pendantLevel ?? 100}
          onChange={(e) => appearance({ pendantLevel: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          aria-label="Under-cabinet lights"
          type="checkbox"
          checked={!!design.appearance?.underCabinet}
          onChange={(e) => appearance({ underCabinet: e.target.checked })}
        />
        Under-cabinet lights
      </label>
      <label>
        <input
          aria-label="Show outlets"
          type="checkbox"
          checked={
            design.appearance?.outlets ?? design.appearance?.staging ?? false
          }
          onChange={(e) => appearance({ outlets: e.target.checked })}
        />
        Show decorative outlets
      </label>
      <label>
        Faucet finish
        <select
          aria-label="Faucet finish"
          value={design.appearance?.faucet ?? 'steel'}
          onChange={(e) =>
            appearance({
              faucet: e.target.value as 'steel' | 'brass' | 'black',
            })
          }
        >
          <option value="steel">Brushed steel</option>
          <option value="brass">Satin brass</option>
          <option value="black">Matte black</option>
        </select>
      </label>
      <div
        className={`accessory-preview faucet-${design.appearance?.faucet ?? 'steel'}`}
        aria-label="Faucet finish preview"
      >
        <svg viewBox="0 0 120 50" role="img" aria-label="Faucet silhouette">
          <path
            d="M45 45V17Q45 5 60 5T75 17V24"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          />
          <path d="M35 46H60" stroke="currentColor" strokeWidth="4" />
        </svg>
      </div>
      <label>
        Handle style
        <select
          aria-label="Handle style"
          value={design.appearance?.handleStyle ?? 'bar'}
          onChange={(e) =>
            appearance({
              handleStyle: e.target.value as 'bar' | 'knob' | 'none',
            })
          }
        >
          <option value="bar">Bar pulls</option>
          <option value="knob">Round knobs</option>
          <option value="none">Handle-free</option>
        </select>
      </label>
      <p>
        Preview choices in Render. Daylight and warm lighting provide
        day/evening comparisons.
      </p>
      <label>
        Flooring
        <select
          aria-label="Flooring material"
          value={design.appearance?.flooring ?? 'oak'}
          onChange={(e) =>
            appearance({
              flooring: e.target.value as 'oak' | 'walnut' | 'tile' | 'slate',
            })
          }
        >
          <option value="oak">Light oak planks</option>
          <option value="walnut">Dark walnut planks</option>
          <option value="tile">Porcelain tile</option>
          <option value="slate">Slate tile</option>
        </select>
      </label>
      <p className="designer-muted">
        Flooring and backsplash are visual demo finishes; supply and
        installation are not included in the estimate.
      </p>
      <label>
        Wall-run backsplash
        <select
          aria-label="Backsplash style"
          value={design.appearance?.backsplash ?? 'none'}
          onChange={(e) =>
            onChange({
              ...design,
              appearance: {
                countertop: 'quartz',
                lighting: 'daylight',
                ...design.appearance,
                backsplash: e.target.value as
                  'none' | 'subway' | 'slab' | 'mosaic' | 'stacked',
              },
            })
          }
        >
          <option value="none">None</option>
          <option value="subway">Ivory subway tile</option>
          <option value="slab">Matching stone slab</option>
          <option value="mosaic">Sage mosaic tile</option>
          <option value="stacked">Sand stacked tile</option>
        </select>
      </label>
      <label>
        Cabinet hardware
        <select
          aria-label="Hardware finish"
          value={design.appearance?.hardware ?? 'steel'}
          onChange={(e) =>
            onChange({
              ...design,
              appearance: {
                countertop: 'quartz',
                lighting: 'daylight',
                ...design.appearance,
                hardware: e.target.value as 'steel' | 'brass' | 'black',
              },
            })
          }
        >
          <option value="steel">Brushed steel</option>
          <option value="brass">Satin brass</option>
          <option value="black">Matte black</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={design.appearance?.pendants ?? false}
          onChange={(e) =>
            onChange({
              ...design,
              appearance: {
                countertop: 'quartz',
                lighting: 'daylight',
                ...design.appearance,
                pendants: e.target.checked,
              },
            })
          }
        />{' '}
        Island pendant lights
      </label>
      <div className="designer-row">
        {(['daylight', 'warm', 'studio'] as const).map((l) => (
          <button
            key={l}
            aria-pressed={design.appearance?.lighting === l}
            onClick={() =>
              onChange({
                ...design,
                appearance: {
                  countertop: 'quartz',
                  ...design.appearance,
                  lighting: l,
                },
              })
            }
          >
            {l} lighting
          </button>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={design.appearance?.staging ?? false}
          onChange={(e) =>
            onChange({
              ...design,
              appearance: {
                countertop: 'quartz',
                lighting: 'daylight',
                ...design.appearance,
                staging: e.target.checked,
              },
            })
          }
        />{' '}
        Kitchen styling: stools, outlets & accessories
      </label>
      <h3>Coordinated styles</h3>
      <div className="designer-row">
        {materialPresets.map((p) => (
          <button
            key={p.name}
            className="material-style-card"
            aria-label={p.name}
            onClick={() =>
              onChange({
                ...design,
                finish: p.finish,
                appearance: {
                  ...design.appearance,
                  countertop: p.countertop,
                  lighting: p.lighting,
                },
              })
            }
            aria-pressed={
              design.finish === p.finish &&
              design.appearance?.countertop === p.countertop &&
              design.appearance?.lighting === p.lighting
            }
          >
            <span
              aria-hidden="true"
              className={`material-swatch swatch-${p.finish}`}
            />
            <strong>{p.name}</strong>
            <span>
              {p.countertop} countertop · {p.lighting}
            </span>
          </button>
        ))}
      </div>
      <p className="designer-muted">
        Updates the kitchen defaults; individual material overrides remain. Undo
        restores your previous choices.
      </p>
    </section>
  );
}
export const StartGuide = RoomSetup;
export function ShortcutHelp() {
  return (
    <details className="shortcut-help">
      <summary>Controls & keyboard help</summary>
      <p>
        Drag to move an item. Shift-click selects multiple items. Use the Pan
        tool to move the plan and the zoom controls to adjust scale.
      </p>
      <p>
        Focus an item with Tab, then use arrow keys to move it; Shift + arrow
        moves 6 inches. Enter or Space selects it. Use Rotate, Flip, Duplicate,
        Delete and Undo in the toolbar. Escape exits presentation mode.
      </p>
      <p>
        If an item cannot be added, read the message above the workspace. Move
        existing objects, enlarge the room, or use a smaller object. Red
        outlines and Layout checks explain overlaps after placement.
      </p>
    </details>
  );
}
export function ClientPresentation({ design }: { design: Design }) {
  const [captures, setCaptures] = useState<{ url: string; name: string }[]>([]);
  useEffect(() => {
    if (!isPreparedSample(design)) return;
    let active = true;
    fetch(`/demo/${design.sampleKey}.png`)
      .then((r) => {
        if (!r.ok) throw Error('Preview missing');
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }),
      )
      .then((url) => {
        if (active) setCaptures([{ url, name: `${design.name} overview` }]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [design]);
  const [viewName, setViewName] = useState('Kitchen overview'),
    [client, setClient] = useState(design.quote?.customer ?? ''),
    [notes, setNotes] = useState(''),
    [preview, setPreview] = useState(false);
  const packageRef = useRef<HTMLElement>(null);
  const [bundleError, setBundleError] = useState('');
  function downloadBundle() {
    try {
      const article = packageRef.current;
      if (!article) return;
      const encode = (s: string) => new TextEncoder().encode(s);
      const html =
        '<!doctype html><html><head><meta charset="utf-8"><title>Kitchen presentation</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px;color:#243e49}img,svg{max-width:100%;height:auto}svg{max-height:550px}table{border-collapse:collapse;width:100%}td{padding:8px;border-bottom:1px solid #ddd}figure{margin:20px 0}dt{font-weight:bold}dd{margin-bottom:12px}@media print{.client-sheet{break-before:page}}</style></head><body>' +
        article.outerHTML +
        '</body></html>';
      const files = [
        { name: 'presentation.html', data: encode(html) },
        { name: 'design.json', data: encode(JSON.stringify(design, null, 2)) },
        {
          name: 'floor-plan.svg',
          data: encode(
            (article.querySelector('svg')?.outerHTML ?? '').replace(
              '<svg',
              '<svg xmlns="http://www.w3.org/2000/svg"',
            ),
          ),
        },
        ...captures.map((c, i) => ({
          name: `render-${i + 1}.png`,
          data: Uint8Array.from(atob(c.url.split(',')[1] ?? ''), (v) =>
            v.charCodeAt(0),
          ),
        })),
      ];
      const csv = [
        ['DEMO PRICING — NOT A MANUFACTURER QUOTE'],
        ['SKU', 'Description', 'Price'],
        ...quoteTotals(design).lines.map((l) => [
          l.sku,
          l.description,
          money(l.unitCents),
        ]),
        ['Total', '', money(quoteTotals(design).total)],
      ]
        .map((row) =>
          row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(','),
        )
        .join('\r\n');
      files.push({ name: 'demo-quote.csv', data: encode(csv) });
      const archive = zipFiles(files),
        url = URL.createObjectURL(
          new Blob([new Uint8Array(archive)], { type: 'application/zip' }),
        ),
        link = document.createElement('a');
      link.href = url;
      link.download = 'kitchen-presentation.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBundleError('');
    } catch {
      setBundleError(
        'The package could not be downloaded. Try again with fewer captured views.',
      );
    }
  }
  const totals = quoteTotals(design);
  return (
    <section className="client-presentation">
      <div className={`client-editor ${preview ? 'previewing' : ''}`}>
        <h2>Client presentation</h2>
        <p>
          Unchanged gallery samples include a prepared overview. After editing,
          orbit to a useful view and capture it. Add up to three views, then
          choose Save as PDF in the print dialog. Captures are kept only while
          this presentation is open.
        </p>
        <div className="proposal-fields">
          <label>
            Client name
            <input
              aria-label="Presentation client name"
              value={client}
              maxLength={200}
              onChange={(e) => setClient(e.target.value)}
            />
          </label>
          <label>
            Project notes
            <textarea
              aria-label="Presentation project notes"
              value={notes}
              maxLength={3000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label>
            Next view name
            <input
              aria-label="Presentation view name"
              value={viewName}
              maxLength={100}
              onChange={(e) => setViewName(e.target.value)}
            />
          </label>
          <p>
            Client details and captured views stay in this presentation until
            you leave or change the design.
          </p>
        </div>
        <RenderView
          design={design}
          onChange={() => {}}
          onCapture={(url) =>
            setCaptures((c) =>
              [
                ...c,
                { url, name: viewName.trim() || `Perspective ${c.length + 1}` },
              ].slice(-3),
            )
          }
        />
        <div className="capture-list">
          {captures.map((c, i) => (
            <label key={i}>
              View {i + 1}
              <input
                aria-label={`Captured view ${i + 1} name`}
                value={c.name}
                maxLength={100}
                onChange={(e) =>
                  setCaptures((rows) =>
                    rows.map((r, n) =>
                      n === i ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
              />
              <button
                onClick={() =>
                  setCaptures((rows) => rows.filter((_, n) => n !== i))
                }
              >
                Remove view {i + 1}
              </button>
            </label>
          ))}
        </div>
        <div className="designer-row">
          <button
            disabled={!captures.length}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? 'Edit presentation' : 'Preview proposal'}
          </button>
          <button disabled={!captures.length} onClick={() => window.print()}>
            Print client presentation / PDF
          </button>
          <button disabled={!captures.length} onClick={() => setCaptures([])}>
            Clear captured views
          </button>
        </div>
        <button disabled={!captures.length} onClick={downloadBundle}>
          Download presentation package
        </button>
        <p>
          ZIP includes a presentation you can open in a browser, render PNGs, a
          floor plan, demo quote and editable design. Extract it and open
          presentation.html.
        </p>
        {bundleError && <p role="alert">{bundleError}</p>}
        <p role="status">{captures.length} of 3 views captured</p>
      </div>
      <article
        ref={packageRef}
        className="client-package"
        aria-label="Client PDF preview"
      >
        <section className="client-sheet">
          <h1>{design.name}</h1>
          <p>{client || 'Kitchen design proposal'}</p>
          <p>Concept presentation · {new Date().toLocaleDateString()}</p>
          {captures.map((capture, i) => (
            <figure key={i}>
              <img
                src={capture.url}
                alt={capture.name || `Kitchen perspective ${i + 1}`}
              />
              <figcaption>{capture.name || `Perspective ${i + 1}`}</figcaption>
            </figure>
          ))}
          {notes && <p className="proposal-notes">{notes}</p>}
          {!captures.length && (
            <p>Capture a render above to complete the presentation.</p>
          )}
        </section>
        <section className="client-sheet">
          <h2>Plan & material selections</h2>
          <MiniPlan design={design} />
          <p>
            {design.room.width} × {design.room.depth} in · ceiling{' '}
            {design.room.height} in · {design.items.length} items
          </p>
          <p>
            Cabinet finish: {design.finish} · Countertop:{' '}
            {design.appearance?.countertop ?? 'quartz'} · Lighting:{' '}
            {design.appearance?.lighting ?? 'daylight'}
          </p>
          {design.items.some((i) => i.finish || i.countertop) && (
            <>
              <h3>Individual material selections</h3>
              <ul>
                {design.items
                  .filter((i) => i.finish || i.countertop)
                  .map((i) => (
                    <li key={i.id}>
                      {i.sku} · object {design.items.indexOf(i) + 1}:{' '}
                      {i.finish ? `finish ${i.finish}` : ''}
                      {i.finish && i.countertop ? ' · ' : ''}
                      {i.countertop ? `countertop ${i.countertop}` : ''}
                    </li>
                  ))}
              </ul>
            </>
          )}
          <h2>Demo estimate</h2>
          <p>DEMO PRICING — NOT A MANUFACTURER QUOTE</p>
          <table>
            <tbody>
              {totals.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.sku}</td>
                  <td>{l.description}</td>
                  <td>{money(l.unitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl>
            {(
              [
                'subtotal',
                'discount',
                'tax',
                'installation',
                'delivery',
                'total',
              ] as const
            ).map((k) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{money(totals[k])}</dd>
              </div>
            ))}
          </dl>
          <p>
            Illustrative materials and pricing. Dimensions and installation
            requirements need site and product verification.
          </p>
        </section>
      </article>
    </section>
  );
}

export function DemoWalkthrough({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const steps = [
    [
      'Explore the sample',
      'The sample is ready. Orbit the kitchen to show the overall layout.',
    ],
    [
      'Change the style',
      'Choose a coordinated style in Materials, then try an individual cabinet finish.',
    ],
    [
      'Move a cabinet',
      'Drag the selected cabinet in the plan. Watch the alignment guides and conflict outline; Undo restores it.',
    ],
    [
      'Compare alternatives',
      'Save the current design as an alternative, change it, then enable linked rendered views to compare.',
    ],
    [
      'Export the proposal',
      'Capture and name a view, enter the client details, preview the proposal, then print to PDF.',
    ],
  ];
  return (
    <section className="demo-walkthrough" aria-label="Demo walkthrough">
      <div>
        <strong>
          Demo walkthrough · {step + 1} / {steps.length} · {steps[step]?.[0]}
        </strong>
        <p>{steps[step]?.[1]}</p>
      </div>
      <div className="designer-row">
        <button disabled={step === 0} onClick={() => onStep(step - 1)}>
          Previous step
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => onStep(step + 1)}>Next step</button>
        ) : (
          <button onClick={onClose}>Finish walkthrough</button>
        )}
        <button onClick={onClose}>Close walkthrough</button>
      </div>
    </section>
  );
}
