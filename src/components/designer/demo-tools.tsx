'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { newDesign, type Design } from '@/designer/model';
import { polishedSample } from '@/designer/sample';
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
  return (
    <section>
      <h3>Coordinated styles</h3>
      <div className="designer-row">
        {materialPresets.map((p) => (
          <button
            key={p.name}
            onClick={() =>
              onChange({
                ...design,
                finish: p.finish,
                appearance: { countertop: p.countertop, lighting: p.lighting },
              })
            }
            aria-pressed={
              design.finish === p.finish &&
              design.appearance?.countertop === p.countertop &&
              design.appearance?.lighting === p.lighting
            }
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="designer-muted">
        Updates cabinet finish, countertop pattern and lighting together. Undo
        restores your previous choices.
      </p>
    </section>
  );
}
export function StartGuide({
  onStart,
  onClose,
}: {
  onStart: (d: Design) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(144),
    [depth, setDepth] = useState(120),
    [height, setHeight] = useState(96);
  return (
    <section className="start-guide" aria-label="Start a kitchen">
      <h2>Start your kitchen</h2>
      <p>
        Explore the furnished sample, or set up a room and add objects from the
        library. Starting a room is undoable.
      </p>
      <button
        className="designer-primary"
        onClick={() => onStart(polishedSample())}
      >
        Explore sample kitchen
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = newDesign();
          onStart({ ...d, room: { ...d.room, width, depth, height } });
        }}
      >
        <h3>Use your room dimensions</h3>
        <div className="designer-row">
          {(
            [
              ['Width', width, setWidth],
              ['Depth', depth, setDepth],
              ['Ceiling height', height, setHeight],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label}>
              {label} (in)
              <input
                aria-label={`Starting ${label.toLowerCase()}`}
                type="number"
                required
                min={label === 'Ceiling height' ? 60 : 48}
                max={label === 'Ceiling height' ? 240 : 600}
                step="0.25"
                value={value}
                onChange={(e) => set(Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <button type="submit">Create room & start designing</button>
      </form>
      <button onClick={onClose}>Continue current design</button>
    </section>
  );
}
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
  const [captures, setCaptures] = useState<string[]>([]);
  const totals = quoteTotals(design);
  return (
    <section className="client-presentation">
      <div className="client-editor">
        <h2>Client presentation</h2>
        <p>
          Orbit to a useful view and capture it. Add up to three views, then
          choose Save as PDF in the print dialog. Captures are kept only while
          this presentation is open.
        </p>
        <RenderView
          design={design}
          onChange={() => {}}
          onCapture={(url) => setCaptures((c) => [...c, url].slice(-3))}
        />
        <div className="designer-row">
          <button disabled={!captures.length} onClick={() => window.print()}>
            Print client presentation / PDF
          </button>
          <button disabled={!captures.length} onClick={() => setCaptures([])}>
            Clear captured views
          </button>
        </div>
        <p role="status">{captures.length} of 3 views captured</p>
      </div>
      <article className="client-package" aria-label="Client PDF preview">
        <section className="client-sheet">
          <h1>{design.name}</h1>
          <p>{design.quote?.customer || 'Kitchen design proposal'}</p>
          <p>Concept presentation · {new Date().toLocaleDateString()}</p>
          {captures.map((url, i) => (
            <figure key={i}>
              <img src={url} alt={`Kitchen perspective ${i + 1}`} />
              <figcaption>Perspective {i + 1}</figcaption>
            </figure>
          ))}
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
