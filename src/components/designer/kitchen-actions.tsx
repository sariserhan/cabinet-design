'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import {
  switchLayout,
  completeRuns,
  appliancePackage,
  cornerOption,
} from '@/designer/kitchen-actions';
import { MiniPlan } from './workflow-tools';
export function KitchenActions({
  design,
  ids,
  onChange,
}: {
  design: Design;
  ids: string[];
  onChange: (d: Design) => void;
}) {
  const [layout, setLayout] = useState('L-shaped'),
    [preview, setPreview] = useState<Design | null>(null),
    [error, setError] = useState(''),
    [corner, setCorner] = useState<'NW' | 'NE' | 'SW' | 'SE'>('NW'),
    [style, setStyle] = useState<'diagonal' | 'blind_left' | 'blind_right'>(
      'diagonal',
    );
  function apply(action: () => Design) {
    try {
      onChange(action());
      setError('');
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <details className="kitchen-actions">
      <summary>Build your kitchen faster</summary>
      <div className="kitchen-action-grid">
        <section>
          <h3>Change layout</h3>
          <select
            aria-label="Quick layout"
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value);
              setPreview(null);
            }}
          >
            {['L-shaped', 'U-shaped', 'Island'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button
            onClick={() => {
              try {
                setPreview(switchLayout(design, layout));
                setError('');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Preview layout change
          </button>
          <p>
            Replaces furniture with starter cabinets. Keeps the room, doors,
            windows and partitions. Undo restores the previous arrangement.
          </p>
          {preview && (
            <>
              <MiniPlan design={preview} />
              <button onClick={() => apply(() => switchLayout(design, layout))}>
                Apply layout change
              </button>
            </>
          )}
        </section>
        <section>
          <h3>Finish cabinet runs</h3>
          <p>
            Select base cabinets, then add matching countertops and exposed end
            panels with a four-inch built-in toe kick. Existing parts are kept.
          </p>
          <button onClick={() => apply(() => completeRuns(design, ids))}>
            Complete selected cabinets
          </button>
          <h3>Appliance package</h3>
          <p>
            Add missing fridge, range, hood, dishwasher and sink using generic
            demo dimensions. Open floor positions are a starting point; adjust
            placement and review installation checks.
          </p>
          <button onClick={() => apply(() => appliancePackage(design))}>
            Add appliance package
          </button>
        </section>
        <section>
          <h3>Corner options</h3>
          <svg viewBox="0 0 100 70" aria-label="Corner placement guide">
            <path
              d="M5 65 V5 H95"
              fill="none"
              stroke="#48626c"
              strokeWidth="5"
            />
            <path
              d={
                style === 'diagonal'
                  ? 'M8 8H58V33L33 58H8Z'
                  : style === 'blind_left'
                    ? 'M8 8H85V35H8Z'
                    : 'M8 8H35V62H8Z'
              }
              fill="#c8ad81"
              stroke="#586f76"
            />
            <text x="45" y="62" fontSize="9">
              36 × 36″
            </text>
          </svg>
          <label>
            Position
            <select
              aria-label="Corner position"
              value={corner}
              onChange={(e) => setCorner(e.target.value as typeof corner)}
            >
              {(['NW', 'NE', 'SW', 'SE'] as const).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Configuration
            <select
              aria-label="Corner configuration"
              value={style}
              onChange={(e) => setStyle(e.target.value as typeof style)}
            >
              <option value="diagonal">Diagonal front</option>
              <option value="blind_left">Blind left</option>
              <option value="blind_right">Blind right</option>
            </select>
          </label>
          <p>
            Reserve 36 × 36 inches. The guide shows the upper-left orientation;
            placement rotates it for your chosen corner.
          </p>
          <button
            onClick={() => apply(() => cornerOption(design, style, corner))}
          >
            Place corner cabinet
          </button>
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
