import type { Design } from './model';
import { localToWorld } from './model';
import { cabinetRuns } from './trim-runs';
import { lengthLabel, type Units } from './units';
import type { LightingFixture, LightingPlan } from './lighting-schema';

/**
 * The lighting plan, read rather than guessed.
 *
 * Everything here is arithmetic on what the designer placed: how much
 * light each circuit draws, whether its driver can carry it, and what the
 * electrician's schedule says. Nothing in it certifies an installation -
 * loads are what the fittings claim, not what a circuit is rated for, and
 * that is a question for the person who signs the work off.
 */
export function planOf(design: Design): LightingPlan {
  return design.lighting ?? { fixtures: [], circuits: [] };
}

/** A strip's draw is per foot of it; a fitting's is per fitting. */
export function fixtureWatts(fixture: LightingFixture) {
  const strip = fixture.length !== undefined && fixture.length > 0;
  return Math.round(
    strip ? (fixture.watts * (fixture.length ?? 0)) / 12 : fixture.watts,
  );
}

/** Continuous lighting is loaded to 80% of its driver, not to 100%. */
export const DRIVER_HEADROOM = 0.8;

/**
 * Each circuit with its fixtures, its load and what that load needs.
 *
 * The 80% is the rule a wholesaler applies when sizing an LED driver: a
 * strip runs for hours at a time, and a driver held at its rating runs hot
 * and dies early. A circuit without a driver is sized rather than failed,
 * because at plan stage the number is the useful part.
 */
export function lightingCircuits(design: Design) {
  const { fixtures, circuits } = planOf(design);
  return circuits.map((circuit) => {
    const on = fixtures.filter((f) => f.circuit === circuit.id);
    const load = on.reduce((total, f) => total + fixtureWatts(f), 0);
    const needs = Math.ceil(load / DRIVER_HEADROOM);
    return {
      circuit,
      fixtures: on,
      load,
      /** The smallest driver that carries this load with its headroom. */
      needs,
      over:
        circuit.driverWatts !== undefined &&
        load > circuit.driverWatts * DRIVER_HEADROOM,
    };
  });
}

/** What is wrong with the plan, in the words an electrician would use. */
export function lightingWarnings(design: Design) {
  const { fixtures, circuits } = planOf(design);
  const out: string[] = [];
  const known = new Set(circuits.map((c) => c.id));
  const loose = fixtures.filter((f) => !f.circuit || !known.has(f.circuit));
  if (loose.length)
    out.push(
      `${loose.length} fitting${loose.length === 1 ? '' : 's'} on no circuit: nothing switches ${loose.length === 1 ? 'it' : 'them'}.`,
    );
  for (const entry of lightingCircuits(design)) {
    const { circuit, load, needs } = entry;
    if (!entry.fixtures.length) {
      out.push(`${circuit.name} has no fittings on it.`);
      continue;
    }
    if (circuit.switchWall === undefined)
      out.push(`${circuit.name} has no switch position.`);
    if (entry.over)
      out.push(
        `${circuit.name} draws ${load}W, past 80% of its ${circuit.driverWatts}W driver. It needs ${needs}W or more.`,
      );
    if (circuit.dimmed && circuit.voltage === 120)
      out.push(
        `${circuit.name} is dimmed at line voltage; the fittings and the dimmer have to be a matched pair.`,
      );
  }
  return out;
}

/** One row per circuit, for the sheet the electrician is handed. */
export function lightingSchedule(design: Design, units: Units = 'in') {
  return lightingCircuits(design).map(({ circuit, fixtures, load, needs }) => {
    const runs = fixtures.filter((f) => (f.length ?? 0) > 0);
    const feet = runs.reduce((total, f) => total + (f.length ?? 0), 0);
    return {
      name: circuit.name,
      voltage: `${circuit.voltage}V`,
      fittings: fixtures.length,
      run: feet ? lengthLabel(feet, units) : '—',
      load: `${load}W`,
      driver: circuit.driverWatts ? `${circuit.driverWatts}W` : `${needs}W min`,
      control: circuit.dimmed ? 'Dimmed' : 'Switched',
      switch:
        circuit.switchWall && circuit.switchOffset !== undefined
          ? `${circuit.switchWall} wall, ${lengthLabel(circuit.switchOffset, units)}`
          : 'not placed',
    };
  });
}

/**
 * Where under-cabinet light would go if someone said yes.
 *
 * Read off the wall cabinets themselves: a strip runs the length of a run
 * of uppers, set back from its front edge and stopping an inch short at
 * each end, which is where a fitter puts it. Offered rather than placed -
 * the designer decides whether the run is lit.
 */
export function suggestedUnderCabinet(design: Design): LightingFixture[] {
  return cabinetRuns(design, 'light_rail').flatMap((run, index) => {
    const first = run[0],
      last = run[run.length - 1];
    if (!first || !last) return [];
    const length = last.end - first.start - 2;
    if (length < 6) return [];
    // An inch in from the end of the run, an inch back from the front.
    const start = localToWorld(first.item, 1, first.item.depth - 1);
    return [
      {
        id: `under-${index + 1}`,
        kind: 'under_cabinet' as const,
        x: Math.round(start.x * 100) / 100,
        y: Math.round(start.y * 100) / 100,
        length: Math.round(length * 100) / 100,
        rotation: first.item.rotation,
        elevation: first.item.elevation,
        // 4.4W per foot is a mid-output tape; the designer can change it.
        watts: 4.4,
        note: `Under ${run.length} wall cabinet${run.length === 1 ? '' : 's'}`,
      },
    ];
  });
}

/** The plan with these fittings added, each on the given circuit. */
export function addFixtures(
  design: Design,
  fixtures: LightingFixture[],
  circuit?: string,
): Design {
  const plan = planOf(design);
  return {
    ...design,
    lighting: {
      ...plan,
      fixtures: [
        ...plan.fixtures,
        ...fixtures.map((f) => ({
          ...f,
          id: crypto.randomUUID(),
          circuit: circuit ?? f.circuit,
        })),
      ],
    },
  };
}
