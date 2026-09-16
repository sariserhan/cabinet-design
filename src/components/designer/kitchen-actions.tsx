'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import {
  switchLayout,
  completeRuns,
  appliancePackage,
  cornerOption,
} from '@/designer/kitchen-actions';
import { WallRunBuilder } from './demo-readiness';
import { MiniPlan } from './workflow-tools';
import { applyTrimRuns, trimSummary } from '@/designer/trim-runs';
import type { TrimKind } from '@/designer/trim-runs';
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
    ),
    [trim, setTrim] = useState<TrimKind>('crown');
  const summary = trimSummary(design, trim);
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
      <WallRunBuilder design={design} onChange={onChange} />
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
          <h3>Trim along the runs</h3>
          <p>
            One length per run rather than one per cabinet, mitred where two
            runs meet. {summary.runs} run{summary.runs === 1 ? '' : 's'},{' '}
            {Math.round(summary.length)}
            &quot; in total, {summary.mitres} mitre
            {summary.mitres === 1 ? '' : 's'}. Adding it again replaces what
            this tool added before.
          </p>
          <div className="designer-row">
            <select
              aria-label="Trim to run"
              value={trim}
              onChange={(e) => setTrim(e.target.value as TrimKind)}
            >
              <option value="crown">Crown, on top of the wall cabinets</option>
              <option value="light_rail">
                Light rail, under the wall cabinets
              </option>
              <option value="toe_kick">Toe kick, at the floor</option>
            </select>
            <button onClick={() => apply(() => applyTrimRuns(design, trim))}>
              Add to runs
            </button>
          </div>
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
