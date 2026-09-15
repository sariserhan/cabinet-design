'use client';
import { useState } from 'react';
import {
  measuredDesign,
  surveyIssues,
  toInches,
  fromInches,
  utilityPoint,
} from '@/designer/measurements';
import { surveySchema, type Survey } from '@/designer/measurement-schema';
import { itemPolygon, type Design } from '@/designer/model';
import { downloadJson } from './business-tools';
const walls = ['north', 'east', 'south', 'west'] as const;
const blank: Survey = {
  measuredBy: '',
  measuredAt: '',
  originalUnit: 'in',
  north: 192,
  south: 192,
  east: 180,
  west: 180,
  height: 96,
  openings: [],
  utilities: [],
  notes: '',
  confirmed: true,
};
export function MeasurementWizard({
  design,
  onApply,
}: {
  design: Design;
  onApply: (d: Design) => void;
}) {
  const [active, setActive] = useState(false),
    [step, setStep] = useState(1),
    [survey, setSurvey] = useState<Survey>(design.measurements ?? blank),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const [opening, setOpening] = useState({
    kind: 'door' as 'door' | 'window',
    wall: 'south' as Survey['openings'][number]['wall'],
    offset: 12,
    width: 36,
    height: 80,
    sill: 0,
  });
  const [utility, setUtility] = useState({
    kind: 'water' as Survey['utilities'][number]['kind'],
    wall: 'north' as Survey['utilities'][number]['wall'],
    offset: 48,
    height: 24,
    notes: '',
  });
  const unit = survey.originalUnit;
  const numeric = (
    label: string,
    value: number,
    update: (n: number) => void,
  ) => (
    <label key={label}>
      {label} ({unit})
      <input
        aria-label={label}
        type="number"
        step="any"
        value={fromInches(value, unit)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) {
            update(toInches(n, unit));
            setConfirmed(false);
          }
        }}
      />
    </label>
  );
  const issues = surveyIssues(survey);
  let preview: Design | null = null;
  try {
    preview = measuredDesign({
      ...survey,
      measuredBy: survey.measuredBy || 'Preview',
    });
  } catch {
    /* Issues appear below. */
  }
  return (
    <details className="business-panel">
      <summary>Guided room measurements</summary>
      <p>
        Record each wall, opening and utility before placing cabinets. This
        wizard creates a rectangular room; use Room shape for angled or
        irregular walls. Offsets run left to right on north/south walls and top
        to bottom on east/west walls.
      </p>
      {!active && (
        <>
          <button
            onClick={() => {
              setActive(true);
              setStep(1);
              setConfirmed(false);
              setSurvey(
                design.measurements ?? {
                  ...blank,
                  north: design.room.width,
                  south: design.room.width,
                  east: design.room.depth,
                  west: design.room.depth,
                  height: design.room.height,
                },
              );
            }}
          >
            Start measurement survey
          </button>
          {design.measurements && (
            <>
              <p>
                Measured by {design.measurements.measuredBy} ·{' '}
                {design.measurements.openings.length} openings ·{' '}
                {design.measurements.utilities.length} utilities. Survey records
                remain as measured even if you later edit the layout.
              </p>
              <button
                onClick={() =>
                  downloadJson(design.measurements, 'room-measurements.json')
                }
              >
                Export measurement record
              </button>
              <UtilityPlan design={design} survey={design.measurements} />
            </>
          )}
        </>
      )}
      {active && (
        <>
          <h3>
            Step {step} of 4 ·{' '}
            {
              [
                'Room & units',
                'Doors & windows',
                'Utility locations',
                'Check & create',
              ][step - 1]
            }
          </h3>
          {step === 1 && (
            <>
              <label>
                Measured by
                <input
                  aria-label="Measured by"
                  maxLength={120}
                  value={survey.measuredBy}
                  onChange={(e) =>
                    setSurvey({ ...survey, measuredBy: e.target.value })
                  }
                />
              </label>
              <label>
                Measurement units
                <select
                  aria-label="Measurement units"
                  value={unit}
                  onChange={(e) =>
                    setSurvey({
                      ...survey,
                      originalUnit: e.target.value as Survey['originalUnit'],
                    })
                  }
                >
                  <option value="in">Inches</option>
                  <option value="cm">Centimeters</option>
                  <option value="mm">Millimeters</option>
                </select>
              </label>
              <div className="business-grid">
                {([...walls, 'height'] as const).map((field) =>
                  numeric(
                    field === 'height'
                      ? 'Measured ceiling height'
                      : `Measured ${field} wall`,
                    survey[field],
                    (n) => setSurvey({ ...survey, [field]: n }),
                  ),
                )}
              </div>
              <p>
                Measure wall-to-wall above the baseboard. Record the lowest
                ceiling height. Opposite walls must agree within ½ inch for this
                rectangular-room workflow; north and east dimensions define the
                drawing.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <label>
                Opening type
                <select
                  aria-label="Measured opening type"
                  value={opening.kind}
                  onChange={(e) =>
                    setOpening({
                      ...opening,
                      kind: e.target.value as 'door' | 'window',
                      sill: e.target.value === 'door' ? 0 : 36,
                      height: e.target.value === 'door' ? 80 : 36,
                    })
                  }
                >
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </select>
              </label>
              <label>
                Wall
                <select
                  aria-label="Measured opening wall"
                  value={opening.wall}
                  onChange={(e) =>
                    setOpening({
                      ...opening,
                      wall: e.target.value as typeof opening.wall,
                    })
                  }
                >
                  {walls.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <div className="business-grid">
                {(['offset', 'width', 'height', 'sill'] as const).map((f) =>
                  numeric(`Opening ${f}`, opening[f], (n) =>
                    setOpening({ ...opening, [f]: n }),
                  ),
                )}
              </div>
              <button
                onClick={() => {
                  if (survey.openings.length >= 30) {
                    setError('Up to 30 openings.');
                    return;
                  }
                  setSurvey({
                    ...survey,
                    openings: [
                      ...survey.openings,
                      { ...opening, id: crypto.randomUUID() },
                    ],
                  });
                  setError('');
                  setConfirmed(false);
                }}
              >
                Add measured opening
              </button>
              {survey.openings.map((o, index) => (
                <p key={o.id}>
                  {index + 1}. {o.kind} · {o.wall} · {fromInches(o.width, unit)}{' '}
                  {unit}
                  <button
                    onClick={() =>
                      setSurvey({
                        ...survey,
                        openings: survey.openings.filter((i) => i.id !== o.id),
                      })
                    }
                  >
                    Remove opening {index + 1}
                  </button>
                </p>
              ))}
            </>
          )}
          {step === 3 && (
            <>
              <p>
                Record existing connection locations only. Notes can include
                outlet type, pipe size or vent diameter; a qualified installer
                must verify suitability.
              </p>
              <label>
                Utility type
                <select
                  aria-label="Measured utility type"
                  value={utility.kind}
                  onChange={(e) =>
                    setUtility({
                      ...utility,
                      kind: e.target.value as typeof utility.kind,
                    })
                  }
                >
                  {['water', 'drain', 'electric', 'gas', 'vent'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Utility wall
                <select
                  aria-label="Measured utility wall"
                  value={utility.wall}
                  onChange={(e) =>
                    setUtility({
                      ...utility,
                      wall: e.target.value as typeof utility.wall,
                    })
                  }
                >
                  {walls.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <div className="business-grid">
                {(['offset', 'height'] as const).map((f) =>
                  numeric(`Utility ${f}`, utility[f], (n) =>
                    setUtility({ ...utility, [f]: n }),
                  ),
                )}
              </div>
              <label>
                Utility notes
                <input
                  aria-label="Utility notes"
                  maxLength={500}
                  value={utility.notes}
                  onChange={(e) =>
                    setUtility({ ...utility, notes: e.target.value })
                  }
                />
              </label>
              <button
                onClick={() => {
                  if (survey.utilities.length >= 30) {
                    setError('Up to 30 utilities.');
                    return;
                  }
                  setSurvey({
                    ...survey,
                    utilities: [
                      ...survey.utilities,
                      { ...utility, id: crypto.randomUUID() },
                    ],
                  });
                  setConfirmed(false);
                }}
              >
                Add utility location
              </button>
              {survey.utilities.map((u, index) => (
                <p key={u.id}>
                  {index + 1}. {u.kind} · {u.wall} ·{' '}
                  {fromInches(u.offset, unit)} {unit} from corner ·{' '}
                  {fromInches(u.height, unit)} {unit} high
                  <button
                    onClick={() =>
                      setSurvey({
                        ...survey,
                        utilities: survey.utilities.filter(
                          (i) => i.id !== u.id,
                        ),
                      })
                    }
                  >
                    Remove utility {index + 1}
                  </button>
                </p>
              ))}
            </>
          )}
          {step === 4 && (
            <>
              <label>
                Survey notes
                <textarea
                  aria-label="Survey notes"
                  maxLength={2000}
                  value={survey.notes}
                  onChange={(e) => {
                    setSurvey({ ...survey, notes: e.target.value });
                    setConfirmed(false);
                  }}
                />
              </label>
              {preview && <UtilityPlan design={preview} survey={survey} />}
              <p>
                {survey.openings.length} openings · {survey.utilities.length}{' '}
                utilities. Creating the measured room starts a new design. Undo
                restores your previous kitchen.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                I checked these measurements against the room.
              </label>
            </>
          )}
          {issues.map((issue, index) => (
            <p role="alert" key={index}>
              {issue}
            </p>
          ))}
          {error && <p role="alert">{error}</p>}
          <div className="designer-row">
            {step > 1 && (
              <button
                onClick={() => {
                  setStep(step - 1);
                  setConfirmed(false);
                }}
              >
                Previous measurement step
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={() => {
                  setStep(step + 1);
                  setError('');
                }}
              >
                Next measurement step
              </button>
            ) : (
              <button
                disabled={!confirmed || issues.length > 0}
                onClick={() => {
                  try {
                    const parsed = surveySchema.parse({
                      ...survey,
                      measuredAt: new Date().toISOString(),
                    });
                    onApply(measuredDesign(parsed));
                    setActive(false);
                    setError('');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Create measured room
              </button>
            )}
            <button onClick={() => setActive(false)}>Cancel survey</button>
          </div>
        </>
      )}
    </details>
  );
}
function UtilityPlan({ survey }: { design: Design; survey: Survey }) {
  const snapshot = measuredDesign({
    ...survey,
    measuredBy: survey.measuredBy || 'Preview',
  });
  return (
    <div className="measurement-plan">
      <svg
        aria-label="Measured room and utility positions"
        viewBox={`-8 -8 ${survey.north + 16} ${survey.east + 16}`}
      >
        <rect
          width={survey.north}
          height={survey.east}
          fill="#f1f4ef"
          stroke="#637e72"
        />
        {snapshot.items.map((item) => (
          <polygon
            key={item.id}
            points={itemPolygon(item)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill="#9dc4cc"
            stroke="#315c61"
          />
        ))}
        {survey.utilities.map((u, index) => {
          const p = utilityPoint(survey, u);
          return (
            <g key={u.id}>
              <circle cx={p.x} cy={p.y} r="4" fill="#b35e1d" />
              <text
                x={p.x}
                y={p.y}
                fontSize="4"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <ul>
        {survey.utilities.map((u, index) => (
          <li key={u.id}>
            {index + 1}. {u.kind} · {u.wall} ·{' '}
            {fromInches(u.height, survey.originalUnit)} {survey.originalUnit}{' '}
            high · {u.notes}
          </li>
        ))}
      </ul>
    </div>
  );
}
