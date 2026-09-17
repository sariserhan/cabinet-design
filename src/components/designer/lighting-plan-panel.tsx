'use client';
import type { Design } from '@/designer/model';
import {
  addFixtures,
  lightingCircuits,
  lightingSchedule,
  lightingWarnings,
  planOf,
  suggestedUnderCabinet,
} from '@/designer/lighting-plan';
import { unitsOf } from '@/designer/units';

/** Same shape the other panels take; declared here to stay standalone. */
type Commit = (
  change: (current: Design) => Design,
  protectPlacement?: boolean,
) => void;

const WALLS = ['north', 'east', 'south', 'west'] as const;

/**
 * The lighting, as something to hand over rather than something to look at.
 *
 * Until now light in this app was a render preset. An electrician cannot
 * work from a preset: they need the fittings, where they go, what they
 * draw, which switch turns them on and what drives them. This places
 * circuits and fittings, adds up the load and prints the schedule with the
 * rest of the drawing set.
 */
export function LightingPlanPanel({
  design,
  commit,
}: {
  design: Design;
  commit: Commit;
}) {
  const plan = planOf(design);
  const units = unitsOf(design);
  const circuits = lightingCircuits(design);
  const warnings = lightingWarnings(design);
  const suggestions = suggestedUnderCabinet(design);
  const placed = plan.fixtures.filter((f) => f.kind === 'under_cabinet').length;
  const change = (next: (p: typeof plan) => typeof plan) =>
    commit((d) => ({ ...d, lighting: next(planOf(d)) }));
  return (
    <section className="lighting-plan">
      <h3>Lighting plan</h3>
      <p>
        Fittings and circuits for the electrician. A first-fix layout, not a
        certified electrical design: loads are what the fittings draw, and the
        circuit they go on is for the person who signs the work off.
      </p>
      <div className="designer-row">
        <button
          onClick={() =>
            change((p) => ({
              ...p,
              circuits: [
                ...p.circuits,
                {
                  id: crypto.randomUUID(),
                  name: `Circuit ${p.circuits.length + 1}`,
                  dimmed: false,
                  voltage: 24 as const,
                },
              ],
            }))
          }
        >
          Add circuit
        </button>
        <button
          disabled={!suggestions.length}
          onClick={() =>
            commit((d) =>
              addFixtures(
                d,
                suggestedUnderCabinet(d),
                planOf(d).circuits[0]?.id,
              ),
            )
          }
          title="One strip under each run of wall cabinets, on the first circuit"
        >
          Add under-cabinet runs ({suggestions.length})
        </button>
        {placed > 0 && (
          <button
            onClick={() =>
              change((p) => ({
                ...p,
                fixtures: p.fixtures.filter((f) => f.kind !== 'under_cabinet'),
              }))
            }
          >
            Remove under-cabinet runs
          </button>
        )}
      </div>
      {circuits.map(({ circuit, fixtures, load, needs, over }) => (
        <div className="lighting-circuit designer-row" key={circuit.id}>
          <label>
            Name
            <input
              value={circuit.name}
              onChange={(e) =>
                change((p) => ({
                  ...p,
                  circuits: p.circuits.map((c) =>
                    c.id === circuit.id ? { ...c, name: e.target.value } : c,
                  ),
                }))
              }
            />
          </label>
          <label>
            Switch wall
            <select
              aria-label={`Switch wall for ${circuit.name}`}
              value={circuit.switchWall ?? ''}
              onChange={(e) =>
                change((p) => ({
                  ...p,
                  circuits: p.circuits.map((c) =>
                    c.id === circuit.id
                      ? {
                          ...c,
                          switchWall:
                            (e.target.value as (typeof WALLS)[number]) ||
                            undefined,
                          switchOffset: c.switchOffset ?? 36,
                        }
                      : c,
                  ),
                }))
              }
            >
              <option value="">Not placed</option>
              {WALLS.map((wall) => (
                <option key={wall} value={wall}>
                  {wall}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={circuit.dimmed}
              onChange={(e) =>
                change((p) => ({
                  ...p,
                  circuits: p.circuits.map((c) =>
                    c.id === circuit.id
                      ? { ...c, dimmed: e.target.checked }
                      : c,
                  ),
                }))
              }
            />{' '}
            Dimmed
          </label>
          <span data-testid="circuit-load">
            {fixtures.length} fitting{fixtures.length === 1 ? '' : 's'} · {load}
            W · driver {circuit.driverWatts ?? needs}W
            {over ? ' (too small)' : ''}
          </span>
          <button
            onClick={() =>
              change((p) => ({
                fixtures: p.fixtures.filter((f) => f.circuit !== circuit.id),
                circuits: p.circuits.filter((c) => c.id !== circuit.id),
              }))
            }
          >
            Remove
          </button>
        </div>
      ))}
      {warnings.length > 0 && (
        <ul className="lighting-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {circuits.length > 0 && (
        <table className="lighting-schedule">
          <thead>
            <tr>
              <th>Circuit</th>
              <th>Fittings</th>
              <th>Run</th>
              <th>Load</th>
              <th>Driver</th>
              <th>Control</th>
              <th>Switch</th>
            </tr>
          </thead>
          <tbody>
            {lightingSchedule(design, units).map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.fittings}</td>
                <td>{row.run}</td>
                <td>{row.load}</td>
                <td>{row.driver}</td>
                <td>{row.control}</td>
                <td>{row.switch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
