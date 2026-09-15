import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesign,
  fromObject,
  normalizeOpenings,
  partitionPanels,
  placementCollision,
  parseDesign,
  wallPanels,
  warnings,
} from '../../src/designer/model';
import {
  roomEdges,
  roomOutline,
  wallSegments,
  ceilingAt,
  ceilingRegions,
  area,
} from '../../src/designer/room';
import { polishedSample } from '../../src/designer/sample';
import {
  panelParts,
  panelCsv,
  partsDxf,
  planDxf,
} from '../../src/designer/fabrication';
import {
  installationIssues,
  installationDefaults,
} from '../../src/designer/installation';

test('curved walls preserve parent indexes and sample a quadratic bow', () => {
  const d = newDesign();
  d.room.curves = [{ wall: 2, bow: 12 }];
  const edges = roomEdges(d.room),
    edge = edges[2];
  assert.ok(edge);
  assert.equal(edge.index, 2);
  assert.equal(edge.points.length, 33);
  assert.ok(edge.length > 144);
  assert.equal(edge.points[16]?.y, 108);
  assert.equal(wallSegments(d.room).length, 35);
  assert.ok(area(roomOutline(d.room)) < 144 * 120);
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  d.room.curves = [{ wall: 0, bow: -12 }];
  assert.throws(() => parseDesign(JSON.stringify(d)));
});
test('vault ceiling has exact peak and split wall profiles', () => {
  const d = newDesign();
  d.room.ceiling = { axis: 'x', kind: 'vault', endHeight: 144, ridge: 0.4 };
  assert.equal(ceilingAt(d.room, 0, 0), 96);
  assert.equal(ceilingAt(d.room, 57.6, 0), 144);
  assert.equal(ceilingAt(d.room, 144, 0), 96);
  const regions = ceilingRegions(d.room);
  assert.equal(regions.length, 2);
  assert.ok(
    Math.abs(regions.reduce((s, p) => s + Math.abs(area(p)), 0) - 144 * 120) <
      1e-6,
  );
  const edge = roomEdges(d.room)[0];
  assert.ok(edge);
  const panels = wallPanels(d, edge);
  assert.ok(
    panels.flat().some((p) => Math.abs(p.x - 57.6) < 1e-6 && p.y === 144),
  );
  for (const p of panels.flat())
    assert.ok(p.y <= ceilingAt(d.room, p.x, 0) + 1e-7);
});
test('partition openings follow host moves and rotations and leave a real cutout', () => {
  const d = newDesign(),
    host = { ...fromObject('partition'), x: 30, y: 30, width: 90, height: 96 };
  const child = {
    ...fromObject('door'),
    opening: { hostId: host.id, offset: 20, sill: 0 },
    width: 30,
    height: 80,
  };
  d.items = [host, child];
  const first = normalizeOpenings(d),
    door = first.items[1];
  assert.ok(door);
  assert.equal(door.x, 50);
  assert.equal(placementCollision(host, door), false);
  assert.equal(
    partitionPanels(host, first.items).reduce(
      (n, p) => n + p.width * p.height,
      0,
    ),
    90 * 96 - 30 * 80,
  );
  d.items[0] = { ...host, x: 50, rotation: 90 };
  const moved = normalizeOpenings(d).items[1];
  assert.ok(moved);
  assert.equal(moved.rotation, 90);
  assert.equal(moved.y, 50);
  d.items = [child];
  assert.ok(installationIssues(d).some((i) => i.id.endsWith('host')));
});
test('sample round-trips, has no geometry conflicts, and does not masquerade as a supplier catalog', () => {
  const d = polishedSample();
  assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  assert.equal(d.items.length, 24);
  assert.equal(
    warnings(d).filter((i) => !i.id.startsWith('install-')).length,
    0,
  );
  assert.ok(
    d.items
      .filter((i) => i.kind === 'custom_cabinet')
      .every((i) => i.versionId === 'demo-objects'),
  );
  assert.ok(panelParts(d).parts.length > 0);
});
test('custom part dimensions use stock thickness and exclude catalog internals', () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('custom_cabinet'),
      width: 24,
      depth: 24,
      height: 34.5,
      details: { shelves: 2, toeKick: 4, molding: false, interior: 'shelves' },
    },
  ];
  const result = panelParts(d);
  assert.equal(result.parts.find((p) => p.part === 'Side')?.height, 30.5);
  assert.equal(
    result.parts.find((p) => p.part === 'Top / bottom')?.width,
    22.5,
  );
  assert.equal(result.parts.find((p) => p.part === 'Applied back')?.width, 24);
  assert.ok(panelCsv(d).includes('571.5'));
  assert.ok(partsDxf(d).includes('LWPOLYLINE'));
  assert.ok(planDxf(d).includes('$INSUNITS\n70\n4'));
  d.items[0] = { ...(d.items[0] as (typeof d.items)[number]), kind: 'cabinet' };
  assert.equal(panelParts(d).parts.length, 0);
});
test('manufacturer profile cannot pass missing or mismatched site services', () => {
  const d = newDesign();
  d.items = [
    {
      ...fromObject('dishwasher'),
      installation: {
        ...installationDefaults,
        profile: 'bosch-shp65cm5n',
        voltage: 240,
        circuitAmps: 10,
        water: 'none',
        drainRise: 20,
        waterPressure: 8,
      },
    },
  ];
  const issues = installationIssues(d);
  for (const suffix of [
    'voltage',
    'circuit',
    'pressure',
    'loop',
    'water',
    'drain',
    'dimensions',
  ])
    assert.ok(
      issues.some((i) => i.id.endsWith(suffix)),
      suffix,
    );
});
