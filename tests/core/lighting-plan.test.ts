import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, fromObject, parseDesign } from '../../src/designer/model';
import { drawingPackageHtml } from '../../src/designer/drawing-package';
import {
  lightingCircuits,
  lightingSchedule,
  lightingWarnings,
  suggestedUnderCabinet,
  addFixtures,
  fixtureWatts,
} from '../../src/designer/lighting-plan';

/** A run of three wall cabinets over a run of bases. */
function kitchen() {
  const d = newDesign();
  d.items = [
    ...[0, 30, 60].map((x) => ({
      ...fromObject('custom_cabinet'),
      x,
      y: 0,
      width: 30,
      depth: 12,
      height: 30,
      elevation: 54,
    })),
    ...[0, 30].map((x) => ({
      ...fromObject('custom_cabinet'),
      x,
      y: 0,
      width: 30,
    })),
  ];
  return d;
}

test('a strip draws by the foot and a fitting by the fitting', () => {
  assert.equal(
    fixtureWatts({
      id: 'a',
      kind: 'under_cabinet',
      x: 0,
      y: 0,
      length: 60,
      rotation: 0,
      elevation: 54,
      watts: 4.4,
    }),
    22,
  );
  assert.equal(
    fixtureWatts({
      id: 'b',
      kind: 'downlight',
      x: 0,
      y: 0,
      rotation: 0,
      elevation: 96,
      watts: 9,
    }),
    9,
  );
});

test('under-cabinet runs are read off the wall cabinets, one per run', () => {
  const d = kitchen();
  const suggested = suggestedUnderCabinet(d);
  assert.equal(suggested.length, 1);
  const [strip] = suggested;
  assert.ok(strip);
  // Three 30in cabinets, less an inch at each end.
  assert.equal(strip.length, 88);
  assert.equal(strip.elevation, 54);
  assert.equal(strip.kind, 'under_cabinet');

  // A gap in the uppers is two runs, because a strip does not bridge one.
  const split = kitchen();
  split.items = split.items.filter((i) => i.x !== 30 || i.elevation < 30);
  assert.equal(suggestedUnderCabinet(split).length, 2);
});

test('a circuit reports its load, the driver it needs and what is wrong', () => {
  let d = kitchen();
  d = {
    ...d,
    lighting: {
      fixtures: [],
      circuits: [
        {
          id: 'c1',
          name: 'Under-cabinet',
          dimmed: true,
          voltage: 24,
          driverWatts: 30,
        },
      ],
    },
  };
  d = addFixtures(d, suggestedUnderCabinet(d), 'c1');
  const [entry] = lightingCircuits(d);
  assert.ok(entry);
  // 88 inches of 4.4W/ft tape is 32W, which a 30W driver cannot carry at
  // the 80% a continuous load is held to.
  assert.equal(entry.load, 32);
  assert.equal(entry.needs, 40);
  assert.equal(entry.over, true);
  const warnings = lightingWarnings(d);
  assert.ok(warnings.some((w) => w.includes('past 80%')));
  assert.ok(warnings.some((w) => w.includes('no switch position')));

  // A fitting on no circuit is nothing anybody can switch.
  const loose = addFixtures(d, suggestedUnderCabinet(d));
  assert.ok(lightingWarnings(loose).some((w) => w.includes('on no circuit')));
});

test('the schedule names the switch, the control and the driver', () => {
  let d = kitchen();
  d = {
    ...d,
    lighting: {
      fixtures: [],
      circuits: [
        {
          id: 'c1',
          name: 'Under-cabinet',
          dimmed: false,
          voltage: 24,
          driverWatts: 60,
          switchWall: 'north',
          switchOffset: 36,
        },
      ],
    },
  };
  d = addFixtures(d, suggestedUnderCabinet(d), 'c1');
  const [row] = lightingSchedule(d);
  assert.ok(row);
  assert.equal(row.fittings, 1);
  assert.equal(row.load, '32W');
  assert.equal(row.driver, '60W');
  assert.equal(row.control, 'Switched');
  assert.equal(row.switch, 'north wall, 36"');
  // Millimetres where the project is worked in them.
  assert.equal(lightingSchedule(d, 'mm')[0]?.switch, 'north wall, 914 mm');
  assert.equal(lightingWarnings(d).length, 0);

  // And the whole plan survives being saved and read back.
  assert.doesNotThrow(() => parseDesign(JSON.stringify(d)));
});

test('the lighting schedule reaches the drawing set, and says what it is not', () => {
  let d = kitchen();
  d = {
    ...d,
    lighting: {
      fixtures: [],
      circuits: [
        {
          id: 'c1',
          name: 'Under-cabinet',
          dimmed: true,
          voltage: 24,
          driverWatts: 60,
          switchWall: 'north',
          switchOffset: 36,
        },
      ],
    },
  };
  d = addFixtures(d, suggestedUnderCabinet(d), 'c1');
  const html = drawingPackageHtml(d, {
    company: 'Studio',
    client: 'Client',
    reference: 'REF-1',
    revision: 'A',
    preparedBy: 'Designer',
    date: '2026-09-17',
    purpose: 'Installation coordination',
    unit: 'in',
    scale: 48,
    notes: '',
  });
  assert.ok(html.includes('L01 · Lighting schedule'));
  assert.ok(html.includes('32W'));
  assert.ok(html.includes('north wall'));
  assert.ok(html.includes('Dimmed'));
  // The sheet has to disclaim what it is, like every other one here.
  assert.ok(html.includes('not a certified electrical design'));

  // A design with no lighting plan does not get an empty sheet.
  const bare = drawingPackageHtml(kitchen(), {
    company: 'Studio',
    client: 'Client',
    reference: 'REF-1',
    revision: 'A',
    preparedBy: 'Designer',
    date: '2026-09-17',
    purpose: 'Installation coordination',
    unit: 'in',
    scale: 48,
    notes: '',
  });
  assert.equal(bare.includes('L01 · Lighting schedule'), false);
});
