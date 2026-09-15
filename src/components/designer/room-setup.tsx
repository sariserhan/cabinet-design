'use client';
import { useMemo, useState } from 'react';
import { setupKitchen, type RoomOpening } from '@/designer/setup';
import { polishedSample } from '@/designer/sample';
import type { Design } from '@/designer/model';
import { MiniPlan } from './workflow-tools';
export function RoomSetup({
  onStart,
  onClose,
}: {
  onStart: (d: Design, mode?: '2d' | 'render') => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1),
    [width, setWidth] = useState(192),
    [depth, setDepth] = useState(180),
    [height, setHeight] = useState(96);
  const [openings, setOpenings] = useState<RoomOpening[]>([]),
    [kind, setKind] = useState<'door' | 'window'>('door'),
    [wall, setWall] = useState<RoomOpening['wall']>('south'),
    [offset, setOffset] = useState(48),
    [openingWidth, setOpeningWidth] = useState(36),
    [layout, setLayout] = useState('L-shaped'),
    [error, setError] = useState('');
  const preview = useMemo(() => {
    try {
      return {
        design: setupKitchen(
          width,
          depth,
          height,
          step === 3 ? layout : 'empty',
          openings,
        ),
        error: '',
      };
    } catch (e) {
      return { design: null, error: (e as Error).message };
    }
  }, [width, depth, height, layout, openings, step]);
  return (
    <section className="start-guide" aria-label="Start a kitchen">
      <h2>Set up your kitchen · {step} / 3</h2>
      <p>
        Measure the room, place openings, then choose a starter layout. You can
        undo starting a new design.
      </p>
      <button onClick={() => onStart(polishedSample(), 'render')}>
        Explore sample kitchen
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          if (step < 3) setStep(step + 1);
          else if (preview.design) onStart(preview.design, '2d');
        }}
      >
        {step === 1 && (
          <>
            <h3>Room measurements</h3>
            <div className="designer-row">
              {(
                [
                  ['width', width, setWidth],
                  ['depth', depth, setDepth],
                  ['ceiling height', height, setHeight],
                ] as const
              ).map(([name, value, set]) => (
                <label key={name}>
                  {name} (in)
                  <input
                    aria-label={`Starting ${name}`}
                    type="number"
                    required
                    min={name === 'ceiling height' ? 84 : 48}
                    max={name === 'ceiling height' ? 240 : 600}
                    step="0.25"
                    value={value}
                    onChange={(e) => {
                      set(Number(e.target.value));
                      setOpenings([]);
                    }}
                  />
                </label>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Doors & windows</h3>
            <p>
              Offsets are measured from the left for north/south walls and from
              the top for east/west walls. Windows start 44 inches above the
              floor.
            </p>
            <div className="designer-row">
              <label>
                Opening
                <select
                  aria-label="Setup opening type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </select>
              </label>
              <label>
                Wall
                <select
                  aria-label="Setup opening wall"
                  value={wall}
                  onChange={(e) => setWall(e.target.value as typeof wall)}
                >
                  {['north', 'east', 'south', 'west'].map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <label>
                Offset (in)
                <input
                  aria-label="Setup opening offset"
                  type="number"
                  min="0"
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                />
              </label>
              <label>
                Width (in)
                <input
                  aria-label="Setup opening width"
                  type="number"
                  min="12"
                  max="120"
                  value={openingWidth}
                  onChange={(e) => setOpeningWidth(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const span =
                    wall === 'north' || wall === 'south' ? width : depth;
                  if (
                    !Number.isFinite(offset) ||
                    offset < 0 ||
                    openingWidth < 12 ||
                    offset + openingWidth > span
                  ) {
                    setError('Opening must fit within its wall.');
                    return;
                  }
                  if (
                    openings.some(
                      (o) =>
                        o.wall === wall &&
                        offset < o.offset + o.width &&
                        offset + openingWidth > o.offset,
                    )
                  ) {
                    setError('Openings on the same wall must not overlap.');
                    return;
                  }
                  setOpenings([
                    ...openings,
                    { kind, wall, offset, width: openingWidth },
                  ]);
                  setError('');
                }}
              >
                Add opening
              </button>
            </div>
            <ul>
              {openings.map((o, i) => (
                <li key={i}>
                  {o.kind} · {o.wall} · {o.width}″ at {o.offset}″{' '}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenings(openings.filter((_, n) => n !== i))
                    }
                  >
                    Remove opening {i + 1}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {step === 3 && (
          <>
            <h3>Choose a starter layout</h3>
            <div className="layout-choices">
              {['L-shaped', 'U-shaped', 'Island', 'empty'].map((l) => (
                <button
                  type="button"
                  key={l}
                  aria-pressed={layout === l}
                  onClick={() => setLayout(l)}
                >
                  {l === 'empty' ? 'Empty room' : l}
                </button>
              ))}
            </div>
            <p>
              Starter cabinets use demo dimensions. Add appliances from the
              library and review layout checks before presenting.
            </p>
          </>
        )}
        {preview.design && (
          <div className="setup-preview">
            <MiniPlan design={preview.design} />
          </div>
        )}
        {(error || preview.error) && (
          <p role="alert">{error || preview.error}</p>
        )}
        <div className="designer-row">
          {step > 1 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="submit" disabled={step === 3 && !preview.design}>
            {step === 3 ? 'Create room & start designing' : 'Next setup step'}
          </button>
        </div>
      </form>
      <button onClick={onClose}>Continue current design</button>
    </section>
  );
}
